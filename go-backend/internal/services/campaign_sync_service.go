package services

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"nba-dashboard/internal/models"

	"gorm.io/gorm"
)

type CampaignSyncService struct{}

func NewCampaignSyncService() *CampaignSyncService {
	return &CampaignSyncService{}
}

func (s *CampaignSyncService) SyncCampaign(ctx context.Context, db *gorm.DB, campaign *models.Campaign, fromDate string, toDate string) (int, int, error) {
	var hasLock bool
	if err := db.WithContext(ctx).Raw("SELECT pg_try_advisory_lock(?)", int64(campaign.ID)).Scan(&hasLock).Error; err != nil {
		return 0, 0, fmt.Errorf("failed to acquire sync lock: %w", err)
	}
	if !hasLock {
		return 0, 0, fmt.Errorf("sync already running for campaign %d", campaign.ID)
	}
	defer func() {
		if err := db.WithContext(ctx).Exec("SELECT pg_advisory_unlock(?)", int64(campaign.ID)).Error; err != nil {
			log.Printf("⚠️ failed to release sync lock: %v", err)
		}
	}()

	run := models.CampaignSyncRun{
		CampaignID: campaign.ID,
		Status:     "running",
	}
	if fromDate != "" {
		if t, err := time.Parse("2006-01-02", fromDate); err == nil {
			run.RequestFrom = &t
		}
	}
	if toDate != "" {
		if t, err := time.Parse("2006-01-02", toDate); err == nil {
			run.RequestTo = &t
		}
	}
	if err := db.Create(&run).Error; err != nil {
		return 0, 0, err
	}

	fetchedCount := 0
	upsertedCount := 0
	finalErr := func(err error) error {
		now := time.Now()
		run.FinishedAt = &now
		run.Status = "failed"
		run.ErrorMessage = err.Error()
		run.FetchedCount = fetchedCount
		run.UpsertedCount = upsertedCount
		if saveErr := db.Save(&run).Error; saveErr != nil {
			log.Printf("❌ failed to save failed sync run: %v", saveErr)
		}
		return err
	}

	apiURL, err := BuildOrdersAPIURL(campaign.ExternalCampaignID, fromDate, toDate)
	if err != nil {
		return fetchedCount, upsertedCount, finalErr(err)
	}

	ordersSvc := NewOrdersService(apiURL)
	orders, err := ordersSvc.GetOrders(ctx)
	if err != nil {
		return fetchedCount, upsertedCount, finalErr(err)
	}
	fetchedCount = len(orders)

	if err := db.Transaction(func(tx *gorm.DB) error {
		for _, o := range orders {
			payload := map[string]any{
				"id":                  strings.TrimSpace(o.ExternalOrderID),
				"ordertoken":          strings.TrimSpace(o.OrderToken),
				"subid":               strings.TrimSpace(o.SubID),
				"timestamp":           strings.TrimSpace(o.Timestamp),
				"status":              o.Status,
				"commission":          strings.TrimSpace(o.Commission),
				"project_id":          strings.TrimSpace(o.ProjectID),
				"publisher_id":        strings.TrimSpace(o.PublisherID),
				"commission_group_id": strings.TrimSpace(o.CommissionGroupID),
				"trigger_id":          strings.TrimSpace(o.TriggerID),
				"campaign_id":         strings.TrimSpace(o.CampaignID),
			}

			eventTimestamp := parseExternalOrderTime(o.Timestamp)

			var existing models.CampaignOrder
			var lookupErr error
			externalID := strings.TrimSpace(o.ExternalOrderID)
			if externalID != "" {
				lookupErr = tx.Where("external_order_id = ?", externalID).First(&existing).Error
			} else {
				lookup := tx.Where("campaign_id = ? AND order_token = ? AND sub_id = ?", campaign.ID, strings.TrimSpace(o.OrderToken), strings.TrimSpace(o.SubID))
				if eventTimestamp != nil {
					lookup = lookup.Where("event_timestamp = ?", *eventTimestamp)
				}
				lookupErr = lookup.First(&existing).Error
			}

			if lookupErr != nil && lookupErr != gorm.ErrRecordNotFound {
				return lookupErr
			}

			if lookupErr == gorm.ErrRecordNotFound {
				record := models.CampaignOrder{
					CampaignID:       campaign.ID,
					ExternalOrderID:  externalID,
					OrderToken:       strings.TrimSpace(o.OrderToken),
					SubID:            strings.TrimSpace(o.SubID),
					EventTimestamp:   eventTimestamp,
					Status:           o.Status,
					Commission:       strings.TrimSpace(o.Commission),
					Payload:          payload,
					SourceLastChange: parseExternalOrderTime(payloadString(payload, "last_change")),
					FirstSeenAt:      time.Now(),
					LastSeenAt:       time.Now(),
				}
				if record.ExternalOrderID == "" {
					record.ExternalOrderID = fmt.Sprintf("fallback:%d:%s:%s:%s", campaign.ID, record.OrderToken, record.SubID, strings.TrimSpace(o.Timestamp))
				}
				if err := tx.Create(&record).Error; err != nil {
					return err
				}
				upsertedCount++
				continue
			}

			existing.CampaignID = campaign.ID
			if externalID != "" {
				existing.ExternalOrderID = externalID
			}
			existing.OrderToken = strings.TrimSpace(o.OrderToken)
			existing.SubID = strings.TrimSpace(o.SubID)
			existing.EventTimestamp = eventTimestamp
			existing.Status = o.Status
			existing.Commission = strings.TrimSpace(o.Commission)
			existing.Payload = payload
			existing.SourceLastChange = parseExternalOrderTime(payloadString(payload, "last_change"))
			existing.LastSeenAt = time.Now()
			if err := tx.Save(&existing).Error; err != nil {
				return err
			}
			upsertedCount++
		}

		now := time.Now()
		campaign.LastSyncedAt = &now
		if err := tx.Save(campaign).Error; err != nil {
			log.Printf("⚠️ failed to update campaign last_synced_at: %v", err)
		}
		return nil
	}); err != nil {
		return fetchedCount, upsertedCount, finalErr(err)
	}

	now := time.Now()

	run.FinishedAt = &now
	run.Status = "success"
	run.ErrorMessage = ""
	run.FetchedCount = fetchedCount
	run.UpsertedCount = upsertedCount
	if err := db.Save(&run).Error; err != nil {
		return fetchedCount, upsertedCount, err
	}

	return fetchedCount, upsertedCount, nil
}

func BuildOrdersAPIURL(campaignExternalID string, fromDate string, toDate string) (string, error) {
	campaignID := strings.TrimSpace(campaignExternalID)
	if campaignID == "260" || campaignID == "122" {
		fromDate = "2025-01-01"
		toDate = "2026-12-31"
	}

	legacyURL := strings.TrimSpace(os.Getenv("NETWORK_API_URL"))
	if legacyURL != "" {
		parsed, err := url.Parse(legacyURL)
		if err != nil {
			return "", fmt.Errorf("NETWORK_API_URL is invalid: %w", err)
		}
		q := parsed.Query()
		if fromDate == "" {
			fromDate = time.Now().AddDate(0, 0, -45).Format("2006-01-02")
		}
		if toDate == "" {
			toDate = time.Now().AddDate(0, 0, 1).Format("2006-01-02")
		}
		q.Set("condition[period][from]", fromDate)
		q.Set("condition[period][to]", toDate)
		q.Set("condition[l:campaigns]", campaignID)
		if q.Get("condition[paymentstatus]") == "" {
			q.Set("condition[paymentstatus]", "all")
		}
		if q.Get("condition[l:status]") == "" {
			q.Set("condition[l:status]", "open,confirmed,canceled,paidout")
		}
		parsed.RawQuery = q.Encode()
		return parsed.String(), nil
	}

	baseURL := strings.TrimSpace(os.Getenv("NETWORK_API_BASE_URL"))
	if baseURL == "" {
		return "", fmt.Errorf("NETWORK_API_BASE_URL is not configured")
	}
	baseURL = strings.TrimRight(baseURL, "/")
	token := strings.TrimSpace(os.Getenv("NETWORK_API_TOKEN"))
	if token == "" {
		return "", fmt.Errorf("NETWORK_API_TOKEN is not configured")
	}
	if fromDate == "" {
		fromDate = time.Now().AddDate(0, 0, -45).Format("2006-01-02")
	}
	if toDate == "" {
		toDate = time.Now().AddDate(0, 0, 1).Format("2006-01-02")
	}
	path := "/" + token + "/admin/5/get-orders.json"
	return baseURL + path + "?condition[period][from]=" + fromDate + "&condition[period][to]=" + toDate + "&condition[paymentstatus]=all&condition[l:status]=open,confirmed,canceled,paidout&condition[l:campaigns]=" + campaignID, nil
}

func parseExternalOrderTime(raw string) *time.Time {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02",
		"02.01.2006",
		"02.01.2006 15:04",
		"02/01/2006",
		"02/01/2006 15:04",
		"02/01/06 15:04",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, value); err == nil {
			return &t
		}
	}
	return nil
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}
