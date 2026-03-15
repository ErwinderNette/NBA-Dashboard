package handlers

import (
	"strings"
	"time"

	"nba-dashboard/internal/models"
	"nba-dashboard/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

func HandleGetCampaignSyncStatus(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}
		role, _ := claims["role"].(string)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can access sync status"})
		}

		externalID := strings.TrimSpace(c.Params("campaignId"))
		if externalID == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "campaignId is required"})
		}

		var campaign models.Campaign
		if err := db.Where("external_campaign_id = ?", externalID).First(&campaign).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Campaign not found"})
		}

		var lastRun models.CampaignSyncRun
		_ = db.Where("campaign_id = ?", campaign.ID).Order("started_at desc").First(&lastRun).Error

		var ordersCount int64
		_ = db.Model(&models.CampaignOrder{}).Where("campaign_id = ?", campaign.ID).Count(&ordersCount).Error

		isStale := true
		if campaign.LastSyncedAt != nil {
			syncInterval := time.Duration(campaign.SyncIntervalMins) * time.Minute
			if syncInterval <= 0 {
				syncInterval = 30 * time.Minute
			}
			isStale = time.Since(*campaign.LastSyncedAt) > syncInterval
		}

		return c.JSON(fiber.Map{
			"campaignId":           campaign.ExternalCampaignID,
			"campaignDbId":         campaign.ID,
			"lastSyncedAt":         campaign.LastSyncedAt,
			"syncIntervalMinutes":  campaign.SyncIntervalMins,
			"isStale":              isStale,
			"ordersCount":          ordersCount,
			"lastRunStatus":        lastRun.Status,
			"lastRunFetchedCount":  lastRun.FetchedCount,
			"lastRunUpsertedCount": lastRun.UpsertedCount,
			"lastRunError":         lastRun.ErrorMessage,
		})
	}
}

func HandleSyncCampaignNow(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}
		role, _ := claims["role"].(string)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can run sync"})
		}

		externalID := strings.TrimSpace(c.Params("campaignId"))
		if externalID == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "campaignId is required"})
		}

		var campaign models.Campaign
		if err := db.Where("external_campaign_id = ?", externalID).First(&campaign).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				campaign = models.Campaign{
					ExternalCampaignID: externalID,
					Name:               "Campaign " + externalID,
					IsActive:           true,
					SyncIntervalMins:   30,
				}
				if err := db.Create(&campaign).Error; err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create campaign"})
				}
			} else {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load campaign"})
			}
		}

		fromDate := strings.TrimSpace(c.Query("fromDate"))
		toDate := strings.TrimSpace(c.Query("toDate"))
		syncSvc := services.NewCampaignSyncService()
		fetched, upserted, err := syncSvc.SyncCampaign(c.Context(), db, &campaign, fromDate, toDate)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"error":  "Campaign sync failed",
				"detail": err.Error(),
			})
		}

		return c.JSON(fiber.Map{
			"campaignId": campaign.ExternalCampaignID,
			"fetched":    fetched,
			"upserted":   upserted,
		})
	}
}

func HandleGetSchedulerMonitoring(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}
		role, _ := claims["role"].(string)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can access scheduler monitoring"})
		}

		metrics := services.GetCampaignSchedulerMetrics()

		var activeCampaigns int64
		_ = db.Model(&models.Campaign{}).Where("is_active = ? AND external_campaign_id <> ''", true).Count(&activeCampaigns).Error

		var recentRuns []models.CampaignSyncRun
		_ = db.Order("started_at desc").Limit(20).Find(&recentRuns).Error

		successCount := int64(0)
		failedCount := int64(0)
		runningCount := int64(0)
		_ = db.Model(&models.CampaignSyncRun{}).Where("status = ?", "success").Count(&successCount).Error
		_ = db.Model(&models.CampaignSyncRun{}).Where("status = ?", "failed").Count(&failedCount).Error
		_ = db.Model(&models.CampaignSyncRun{}).Where("status = ?", "running").Count(&runningCount).Error

		return c.JSON(fiber.Map{
			"scheduler": fiber.Map{
				"enabled":               metrics.Enabled,
				"startedAt":             metrics.StartedAt,
				"pollIntervalSeconds":   metrics.PollIntervalSeconds,
				"maxConcurrency":        metrics.MaxConcurrency,
				"overlapMinutes":        metrics.OverlapMinutes,
				"currentRunning":        metrics.CurrentRunning,
				"lastTickAt":            metrics.LastTickAt,
				"lastTickCampaignsSeen": metrics.LastTickCampaignsSeen,
				"lastTickDueCount":      metrics.LastTickDueCount,
				"totalSyncAttempts":     metrics.TotalSyncAttempts,
				"totalSyncSuccess":      metrics.TotalSyncSuccess,
				"totalSyncFailed":       metrics.TotalSyncFailed,
				"lastError":             metrics.LastError,
				"lastSuccessAt":         metrics.LastSuccessAt,
			},
			"database": fiber.Map{
				"activeCampaigns": activeCampaigns,
				"runsSuccess":     successCount,
				"runsFailed":      failedCount,
				"runsRunning":     runningCount,
				"recentRuns":      recentRuns,
			},
		})
	}
}
