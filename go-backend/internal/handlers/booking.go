package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"nba-dashboard/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

type bookingCSVExportRequest struct {
	CampaignID      string              `json:"campaignId"`
	CampaignName    string              `json:"campaignName"`
	Headers         []string            `json:"headers"`
	Records         []map[string]string `json:"records"`
	OverwriteLatest bool                `json:"overwriteLatest"`
}

func HandleCreateBookingCSVExport(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}
		role, _ := claims["role"].(string)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can export booking csv"})
		}

		uploadID, err := strconv.ParseUint(c.Params("id"), 10, 64)
		if err != nil || uploadID == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid upload id"})
		}

		userEmail, _ := claims["email"].(string)
		var actor models.User
		if err := db.Where("email = ?", userEmail).First(&actor).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Actor user not found"})
		}

		var req bookingCSVExportRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
		}
		req.CampaignID = strings.TrimSpace(req.CampaignID)
		req.CampaignName = strings.TrimSpace(req.CampaignName)
		if req.CampaignID == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "campaignId is required"})
		}
		if len(req.Headers) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "headers are required"})
		}
		if len(req.Records) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "records are required"})
		}
		if req.CampaignName == "" {
			req.CampaignName = "campaign"
		}

		var result struct {
			BatchID   uint
			ExportID  uint
			Version   int
			FileName  string
			RowsCount int
		}

		requestID := strings.TrimSpace(c.Get("X-Request-Id"))
		if requestID == "" {
			requestID = strings.TrimSpace(c.Get("X-Request-ID"))
		}

		err = db.Transaction(func(tx *gorm.DB) error {
			var campaign models.Campaign
			if err := tx.Where("external_campaign_id = ?", req.CampaignID).First(&campaign).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					campaign = models.Campaign{
						ExternalCampaignID: req.CampaignID,
						Name:               req.CampaignName,
					}
					if err := tx.Create(&campaign).Error; err != nil {
						return err
					}
				} else {
					return err
				}
			} else if campaign.Name != req.CampaignName && req.CampaignName != "" {
				campaign.Name = req.CampaignName
				if err := tx.Save(&campaign).Error; err != nil {
					return err
				}
			}

			var batch models.BookingBatch
			isOverwrite := false
			if req.OverwriteLatest {
				err := tx.Where("upload_id = ? AND campaign_id = ?", uint(uploadID), campaign.ID).
					Order("created_at desc").
					First(&batch).Error
				if err == nil {
					isOverwrite = true
				} else if err != gorm.ErrRecordNotFound {
					return err
				}
			}
			if !isOverwrite {
				batch = models.BookingBatch{
					UploadID:        uint(uploadID),
					CampaignID:      campaign.ID,
					CreatedByUserID: actor.ID,
					Source:          "admin",
					Status:          "processing",
					Payload: map[string]any{
						"campaignId":   req.CampaignID,
						"campaignName": req.CampaignName,
						"headers":      req.Headers,
						"records":      req.Records,
					},
				}
				if err := tx.Create(&batch).Error; err != nil {
					return err
				}
				if err := createAuditEvent(tx, &actor.ID, "BATCH_CREATED", "booking_batch", batch.ID, requestID, nil, map[string]any{
					"upload_id":   batch.UploadID,
					"campaign_id": batch.CampaignID,
					"rows":        len(req.Records),
				}, nil); err != nil {
					return err
				}
			} else {
				before := map[string]any{
					"current_csv_version": batch.CurrentCSVVersion,
					"status":              batch.Status,
				}
				batch.Status = "processing"
				batch.Payload = map[string]any{
					"campaignId":   req.CampaignID,
					"campaignName": req.CampaignName,
					"headers":      req.Headers,
					"records":      req.Records,
				}
				if err := tx.Save(&batch).Error; err != nil {
					return err
				}
				if err := tx.Unscoped().Where("batch_id = ?", batch.ID).Delete(&models.BookingItem{}).Error; err != nil {
					return err
				}
				if err := createAuditEvent(tx, &actor.ID, "BATCH_OVERWRITTEN", "booking_batch", batch.ID, requestID, before, map[string]any{
					"current_csv_version": batch.CurrentCSVVersion,
					"status":              batch.Status,
					"rows":                len(req.Records),
				}, nil); err != nil {
					return err
				}
			}

			for i, rec := range req.Records {
				dedupeKey := bookingDedupe(req.CampaignID, rec)
				item := models.BookingItem{
					BatchID:         batch.ID,
					RowNo:           i + 1,
					ExternalOrderID: strings.TrimSpace(rec["id"]),
					OrderToken:      strings.TrimSpace(rec["ordertoken"]),
					SubID:           strings.TrimSpace(rec["subid"]),
					TimestampRaw:    strings.TrimSpace(rec["timestamp"]),
					Commission:      strings.TrimSpace(rec["commission"]),
					NetworkPayload:  cloneStringMap(rec),
					DedupeKey:       dedupeKey,
					Status:          "pending",
				}
				if err := tx.Create(&item).Error; err != nil {
					return err
				}
			}

			csvBytes, fileName := buildBookingCSV(req.Headers, req.Records, req.CampaignName)
			archivePath, err := saveBookingCSVArchive(batch.ID, fileName, csvBytes)
			if err != nil {
				return err
			}

			var maxVersion int
			if err := tx.Model(&models.CSVExport{}).Where("batch_id = ?", batch.ID).Select("COALESCE(MAX(version), 0)").Scan(&maxVersion).Error; err != nil {
				return err
			}
			nextVersion := maxVersion + 1
			hash := sha256.Sum256(csvBytes)
			export := models.CSVExport{
				BatchID:         batch.ID,
				Version:         nextVersion,
				FileName:        fileName,
				StoragePath:     archivePath,
				SHA256:          hex.EncodeToString(hash[:]),
				SizeBytes:       int64(len(csvBytes)),
				IsCurrent:       true,
				CreatedByUserID: actor.ID,
			}
			if err := tx.Create(&export).Error; err != nil {
				return err
			}

			if err := tx.Model(&models.CSVExport{}).
				Where("batch_id = ? AND id <> ? AND is_current = true", batch.ID, export.ID).
				Updates(map[string]any{
					"is_current":            false,
					"replaced_by_export_id": export.ID,
				}).Error; err != nil {
				return err
			}

			batch.CurrentCSVVersion = nextVersion
			batch.Status = "sent"
			if err := tx.Save(&batch).Error; err != nil {
				return err
			}

			job := models.OutboundJob{
				BatchID: batch.ID,
				Target:  "csv_archive",
				Status:  "sent",
				Payload: map[string]any{
					"csv_export_id": export.ID,
					"storage_path":  archivePath,
				},
				Attempts: 1,
			}
			if err := tx.Create(&job).Error; err != nil {
				return err
			}

			action := "CSV_EXPORTED"
			if isOverwrite {
				action = "CSV_REPLACED"
			}
			if err := createAuditEvent(tx, &actor.ID, action, "csv_export", export.ID, requestID, nil, map[string]any{
				"batch_id":  batch.ID,
				"version":   export.Version,
				"file_name": export.FileName,
				"rows":      len(req.Records),
			}, map[string]any{
				"campaign_external_id": req.CampaignID,
			}); err != nil {
				return err
			}

			result.BatchID = batch.ID
			result.ExportID = export.ID
			result.Version = export.Version
			result.FileName = export.FileName
			result.RowsCount = len(req.Records)
			return nil
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":  "Failed to persist booking csv export",
				"detail": err.Error(),
			})
		}

		return c.JSON(fiber.Map{
			"batchId":     result.BatchID,
			"csvExportId": result.ExportID,
			"version":     result.Version,
			"fileName":    result.FileName,
			"rowsCount":   result.RowsCount,
		})
	}
}

func HandleDownloadBookingCSVExport(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}
		role, _ := claims["role"].(string)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can download booking csv"})
		}

		exportID, err := strconv.ParseUint(c.Params("exportId"), 10, 64)
		if err != nil || exportID == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid export id"})
		}

		var csvExport models.CSVExport
		if err := db.First(&csvExport, uint(exportID)).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "CSV export not found"})
		}
		return c.Download(csvExport.StoragePath, csvExport.FileName)
	}
}

func createAuditEvent(tx *gorm.DB, actorUserID *uint, action string, entityType string, entityID uint, requestID string, before map[string]any, after map[string]any, metadata map[string]any) error {
	event := models.AuditEvent{
		ActorUserID: actorUserID,
		Action:      action,
		EntityType:  entityType,
		EntityID:    strconv.FormatUint(uint64(entityID), 10),
		RequestID:   requestID,
		BeforeData:  before,
		AfterData:   after,
		Metadata:    metadata,
	}
	return tx.Create(&event).Error
}

func bookingDedupe(campaignID string, rec map[string]string) string {
	base := strings.Join([]string{
		strings.TrimSpace(campaignID),
		strings.TrimSpace(rec["id"]),
		strings.TrimSpace(rec["ordertoken"]),
		strings.TrimSpace(rec["subid"]),
		strings.TrimSpace(rec["timestamp"]),
		strings.TrimSpace(rec["commission"]),
	}, "|")
	sum := sha256.Sum256([]byte(base))
	return hex.EncodeToString(sum[:])
}

func cloneStringMap(in map[string]string) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func buildBookingCSV(headers []string, records []map[string]string, campaignName string) ([]byte, string) {
	sanitize := func(value string) string {
		return strings.TrimSpace(strings.NewReplacer("\r\n", " ", "\n", " ", ";", ",").Replace(value))
	}

	lines := []string{strings.Join(headers, ";")}
	for _, rec := range records {
		row := make([]string, 0, len(headers))
		for _, h := range headers {
			row = append(row, sanitize(rec[h]))
		}
		lines = append(lines, strings.Join(row, ";"))
	}
	content := "\uFEFF" + strings.Join(lines, "\n")
	fileBase := strings.ToLower(campaignName)
	fileBase = strings.Trim(fileBase, " ")
	if fileBase == "" {
		fileBase = "campaign"
	}
	fileBase = sanitizeFilePart(fileBase)
	fileName := fmt.Sprintf("orders-netzwerk.uppr.de-%s-%d.CSV", fileBase, time.Now().Unix())
	return []byte(content), fileName
}

func saveBookingCSVArchive(batchID uint, fileName string, csvBytes []byte) (string, error) {
	baseDir := filepath.Join("uploads", "csv-archive", strconv.FormatUint(uint64(batchID), 10))
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return "", err
	}
	path := filepath.Join(baseDir, fileName)
	if err := os.WriteFile(path, csvBytes, 0644); err != nil {
		return "", err
	}
	return path, nil
}

func sanitizeFilePart(in string) string {
	var b strings.Builder
	for _, r := range in {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			continue
		}
		b.WriteRune('-')
	}
	out := strings.Trim(b.String(), "-")
	for strings.Contains(out, "--") {
		out = strings.ReplaceAll(out, "--", "-")
	}
	if out == "" {
		return "campaign"
	}
	return out
}
