package services

import (
	"context"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"nba-dashboard/internal/models"

	"gorm.io/gorm"
)

type CampaignScheduler struct {
	db              *gorm.DB
	syncService     *CampaignSyncService
	pollInterval    time.Duration
	maxConcurrency  int
	initialDelay    time.Duration
	overlapDuration time.Duration

	mu      sync.Mutex
	running map[uint]struct{}
}

type CampaignSchedulerMetrics struct {
	Enabled               bool      `json:"enabled"`
	StartedAt             time.Time `json:"started_at"`
	PollIntervalSeconds   int       `json:"poll_interval_seconds"`
	MaxConcurrency        int       `json:"max_concurrency"`
	OverlapMinutes        int       `json:"overlap_minutes"`
	CurrentRunning        int       `json:"current_running"`
	LastTickAt            time.Time `json:"last_tick_at"`
	LastTickCampaignsSeen int       `json:"last_tick_campaigns_seen"`
	LastTickDueCount      int       `json:"last_tick_due_count"`
	TotalSyncAttempts     int64     `json:"total_sync_attempts"`
	TotalSyncSuccess      int64     `json:"total_sync_success"`
	TotalSyncFailed       int64     `json:"total_sync_failed"`
	LastError             string    `json:"last_error"`
	LastSuccessAt         time.Time `json:"last_success_at"`
}

var (
	schedulerMetricsMu sync.Mutex
	schedulerMetrics   = CampaignSchedulerMetrics{
		Enabled: false,
	}
)

func StartCampaignSyncScheduler(db *gorm.DB) {
	if !isSchedulerEnabled() {
		log.Println("ℹ️ Campaign scheduler disabled via CAMPAIGN_SYNC_SCHEDULER_ENABLED")
		setSchedulerDisabledMetrics()
		return
	}

	s := &CampaignScheduler{
		db:              db,
		syncService:     NewCampaignSyncService(),
		pollInterval:    envDurationSeconds("CAMPAIGN_SYNC_POLL_SECONDS", 60),
		maxConcurrency:  envInt("CAMPAIGN_SYNC_MAX_CONCURRENCY", 2),
		initialDelay:    envDurationSeconds("CAMPAIGN_SYNC_INITIAL_DELAY_SECONDS", 10),
		overlapDuration: envDurationMinutes("CAMPAIGN_SYNC_OVERLAP_MINUTES", 180),
		running:         map[uint]struct{}{},
	}
	if s.maxConcurrency <= 0 {
		s.maxConcurrency = 1
	}
	if s.pollInterval < 15*time.Second {
		s.pollInterval = 15 * time.Second
	}

	go s.run(context.Background())
	log.Printf("✅ Campaign scheduler started (poll=%s, concurrency=%d, overlap=%s)", s.pollInterval, s.maxConcurrency, s.overlapDuration)
	setSchedulerStartupMetrics(s)
}

func (s *CampaignScheduler) run(ctx context.Context) {
	if s.initialDelay > 0 {
		select {
		case <-time.After(s.initialDelay):
		case <-ctx.Done():
			return
		}
	}

	s.tick(ctx)
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *CampaignScheduler) tick(ctx context.Context) {
	now := time.Now()
	var campaigns []models.Campaign
	if err := s.db.Where("is_active = ? AND external_campaign_id <> ''", true).Find(&campaigns).Error; err != nil {
		log.Printf("❌ scheduler failed to load campaigns: %v", err)
		recordSchedulerTick(now, 0, 0)
		recordSchedulerFailure(err.Error())
		return
	}
	if len(campaigns) == 0 {
		recordSchedulerTick(now, 0, 0)
		return
	}

	due := make([]models.Campaign, 0, len(campaigns))
	for _, campaign := range campaigns {
		if !s.isDue(campaign, now) {
			continue
		}
		if s.isRunning(campaign.ID) {
			continue
		}
		due = append(due, campaign)
	}
	if len(due) == 0 {
		recordSchedulerTick(now, len(campaigns), 0)
		return
	}
	recordSchedulerTick(now, len(campaigns), len(due))

	sem := make(chan struct{}, s.maxConcurrency)
	var wg sync.WaitGroup
	for _, c := range due {
		campaign := c
		sem <- struct{}{}
		wg.Add(1)
		s.markRunning(campaign.ID)
		go func() {
			defer wg.Done()
			defer func() {
				<-sem
				s.markDone(campaign.ID)
			}()

			fromDate, toDate := s.syncWindow(campaign, now)
			recordSchedulerAttempt()
			fetched, upserted, err := s.syncService.SyncCampaign(ctx, s.db, &campaign, fromDate, toDate)
			if err != nil {
				log.Printf("❌ scheduler sync failed campaign=%s: %v", campaign.ExternalCampaignID, err)
				recordSchedulerFailure(err.Error())
				return
			}
			log.Printf("✅ scheduler sync campaign=%s fetched=%d upserted=%d", campaign.ExternalCampaignID, fetched, upserted)
			recordSchedulerSuccess()
		}()
	}
	wg.Wait()
}

func (s *CampaignScheduler) isDue(campaign models.Campaign, now time.Time) bool {
	if campaign.LastSyncedAt == nil {
		return true
	}
	interval := time.Duration(campaign.SyncIntervalMins) * time.Minute
	if interval <= 0 {
		interval = 30 * time.Minute
	}
	return now.Sub(*campaign.LastSyncedAt) >= interval
}

func (s *CampaignScheduler) syncWindow(campaign models.Campaign, now time.Time) (string, string) {
	toDate := now.AddDate(0, 0, 1).Format("2006-01-02")
	if campaign.LastSyncedAt == nil {
		return now.AddDate(0, 0, -45).Format("2006-01-02"), toDate
	}

	from := campaign.LastSyncedAt.Add(-s.overlapDuration)
	maxBackfill := now.AddDate(0, 0, -60)
	if from.Before(maxBackfill) {
		from = maxBackfill
	}
	return from.Format("2006-01-02"), toDate
}

func (s *CampaignScheduler) isRunning(campaignID uint) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.running[campaignID]
	return ok
}

func (s *CampaignScheduler) markRunning(campaignID uint) {
	s.mu.Lock()
	s.running[campaignID] = struct{}{}
	currentRunning := len(s.running)
	s.mu.Unlock()
	setCurrentRunning(currentRunning)
}

func (s *CampaignScheduler) markDone(campaignID uint) {
	s.mu.Lock()
	delete(s.running, campaignID)
	currentRunning := len(s.running)
	s.mu.Unlock()
	setCurrentRunning(currentRunning)
}

func isSchedulerEnabled() bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv("CAMPAIGN_SYNC_SCHEDULER_ENABLED")))
	if value == "" {
		return true
	}
	return value == "1" || value == "true" || value == "yes"
}

func envDurationSeconds(key string, fallback int) time.Duration {
	seconds := envInt(key, fallback)
	if seconds <= 0 {
		seconds = fallback
	}
	return time.Duration(seconds) * time.Second
}

func envDurationMinutes(key string, fallback int) time.Duration {
	minutes := envInt(key, fallback)
	if minutes <= 0 {
		minutes = fallback
	}
	return time.Duration(minutes) * time.Minute
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

func GetCampaignSchedulerMetrics() CampaignSchedulerMetrics {
	schedulerMetricsMu.Lock()
	defer schedulerMetricsMu.Unlock()
	return schedulerMetrics
}

func setSchedulerDisabledMetrics() {
	schedulerMetricsMu.Lock()
	defer schedulerMetricsMu.Unlock()
	schedulerMetrics.Enabled = false
}

func setSchedulerStartupMetrics(s *CampaignScheduler) {
	schedulerMetricsMu.Lock()
	defer schedulerMetricsMu.Unlock()
	schedulerMetrics.Enabled = true
	schedulerMetrics.StartedAt = time.Now()
	schedulerMetrics.PollIntervalSeconds = int(s.pollInterval.Seconds())
	schedulerMetrics.MaxConcurrency = s.maxConcurrency
	schedulerMetrics.OverlapMinutes = int(s.overlapDuration.Minutes())
	schedulerMetrics.CurrentRunning = 0
	schedulerMetrics.LastTickAt = time.Time{}
	schedulerMetrics.LastTickCampaignsSeen = 0
	schedulerMetrics.LastTickDueCount = 0
	schedulerMetrics.TotalSyncAttempts = 0
	schedulerMetrics.TotalSyncSuccess = 0
	schedulerMetrics.TotalSyncFailed = 0
	schedulerMetrics.LastError = ""
	schedulerMetrics.LastSuccessAt = time.Time{}
}

func recordSchedulerTick(at time.Time, campaignsSeen int, dueCount int) {
	schedulerMetricsMu.Lock()
	defer schedulerMetricsMu.Unlock()
	schedulerMetrics.LastTickAt = at
	schedulerMetrics.LastTickCampaignsSeen = campaignsSeen
	schedulerMetrics.LastTickDueCount = dueCount
}

func recordSchedulerAttempt() {
	schedulerMetricsMu.Lock()
	defer schedulerMetricsMu.Unlock()
	schedulerMetrics.TotalSyncAttempts++
}

func recordSchedulerSuccess() {
	schedulerMetricsMu.Lock()
	defer schedulerMetricsMu.Unlock()
	schedulerMetrics.TotalSyncSuccess++
	schedulerMetrics.LastSuccessAt = time.Now()
}

func recordSchedulerFailure(err string) {
	schedulerMetricsMu.Lock()
	defer schedulerMetricsMu.Unlock()
	schedulerMetrics.TotalSyncFailed++
	schedulerMetrics.LastError = strings.TrimSpace(err)
}

func setCurrentRunning(count int) {
	schedulerMetricsMu.Lock()
	defer schedulerMetricsMu.Unlock()
	schedulerMetrics.CurrentRunning = count
}
