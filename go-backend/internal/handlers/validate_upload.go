package handlers

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"nba-dashboard/internal/lib"
	"nba-dashboard/internal/models"
	"nba-dashboard/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func HandleValidateUpload(db *gorm.DB) fiber.Handler {
	validationSvc := services.NewValidationService()

	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}

		role, _ := claims["role"].(string)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can validate"})
		}

		id := c.Params("id")
		log.Println("✅ ValidateUpload aufgerufen für UploadID=", id)

		var upload models.Upload
		if err := db.First(&upload, id).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Upload not found"})
		}

		raw, err := lib.ReadUploadAsTable(upload.FilePath)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}

		headerIdx := lib.FindHeaderRow(raw, services.Pflichtfelder)
		rows := lib.TableToMaps(raw, headerIdx)

		campaignId := strings.TrimSpace(c.Query("campaignId"))
		fromDate := "2024-01-01"
		toDate := "2027-05-05"
		if dynamicFrom, dynamicTo, ok := deriveDateRangeFromRows(rows); ok {
			fromDate = dynamicFrom
			toDate = dynamicTo
		}

		var orders []services.ExternalOrder
		useDBCache := isDBValidationCacheEnabled()
		forceRefresh := strings.EqualFold(strings.TrimSpace(c.Query("forceRefresh")), "true") || strings.TrimSpace(c.Query("forceRefresh")) == "1"

		if campaignId != "" && useDBCache {
			if err := upsertUploadOrderCandidates(db, upload.ID, campaignId, rows); err != nil {
				log.Printf("⚠️ UploadOrderCandidates konnten nicht persistiert werden: %v", err)
			}

			campaign, err := ensureCampaignByExternalID(db, campaignId)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":  "Failed to resolve campaign",
					"detail": err.Error(),
				})
			}

			shouldSync := forceRefresh
			if campaign.LastSyncedAt == nil {
				shouldSync = true
			} else {
				syncInterval := time.Duration(campaign.SyncIntervalMins) * time.Minute
				if syncInterval <= 0 {
					syncInterval = 30 * time.Minute
				}
				if time.Since(*campaign.LastSyncedAt) > syncInterval {
					shouldSync = true
				}
			}

			if !shouldSync {
				var existingCount int64
				if err := db.Model(&models.CampaignOrder{}).Where("campaign_id = ?", campaign.ID).Count(&existingCount).Error; err != nil {
					log.Printf("⚠️ campaign_orders count failed: %v", err)
				}
				if existingCount == 0 {
					shouldSync = true
				}
			}

			if shouldSync {
				syncSvc := services.NewCampaignSyncService()
				_, _, syncErr := syncSvc.SyncCampaign(c.Context(), db, &campaign, fromDate, toDate)
				if syncErr != nil {
					log.Printf("⚠️ Campaign-Sync fehlgeschlagen, fallback auf Live-API: %v", syncErr)
				}
			}

			orders, err = loadOrdersForUploadFromDB(db, upload.ID, campaign.ID, fromDate, toDate)
			if err != nil {
				log.Printf("⚠️ DB-Load für campaign_orders fehlgeschlagen, fallback auf Live-API: %v", err)
			} else {
				log.Printf("✅ Orders aus DB-Cache geladen: %d", len(orders))
			}
		}

		if campaignId != "" && len(orders) == 0 {
			baseURL := os.Getenv("NETWORK_API_BASE_URL")
			apiURL := os.Getenv("NETWORK_API_URL")
			if baseURL != "" {
				path := "/6115e2ebc15bf7cffcf39c56dfce109acc702fe1/admin/5/get-orders.json"
				apiURL = baseURL + path + "?condition[period][from]=" + fromDate + "&condition[period][to]=" + toDate + "&condition[paymentstatus]=all&condition[l:status]=open,confirmed,canceled,paidout&condition[l:campaigns]=" + campaignId
			}
			if apiURL != "" {
				ordersSvc := services.NewOrdersService(apiURL)
				orders, err = ordersSvc.GetOrders(c.Context())
				if err != nil {
					log.Printf("❌ Live-API fallback failed: %v", err)
				} else {
					log.Printf("✅ Orders per Live-API geladen (fallback): %d", len(orders))
				}
			}
		}

		if campaignId == "" {
			log.Println("ℹ️ Keine campaignId übergeben – Validierung läuft ohne Order-Abgleich (nur Pflichtfelder/Fallbacks)")
		}

		if orders == nil {
			orders = []services.ExternalOrder{}
		}

		validationCtx := services.ValidationContext{
			CampaignID:        strings.TrimSpace(campaignId),
			ProjectID:         normalizeUintQuery(c.Query("projectId")),
			PublisherID:       normalizeUintQuery(c.Query("publisherId")),
			CommissionGroupID: normalizeUintQuery(c.Query("commissionGroupId")),
			TriggerID:         normalizeUintQuery(c.Query("triggerId")),
		}
		validated := validationSvc.Validate(rows, orders, validationCtx)

		if len(validated) > 0 {
			firstRow := validated[0]
			if statusCell, ok := firstRow.Cells["Status in der uppr Performance Platform"]; ok {
				log.Printf("✅ Handler - Status in erster Zeile gefunden: '%s'", statusCell.Value)
			} else {
				keys := make([]string, 0, len(firstRow.Cells))
				for k := range firstRow.Cells {
					keys = append(keys, k)
				}
				log.Printf("❌ Handler - Status NICHT in erster Zeile! Keys: %v", keys)
			}
		}
		// ✅ Speichere Validierungsergebnisse in der Datenbank
		validationResult := models.ValidationResult{
			UploadID:      upload.ID,
			OrdersCount:   len(orders),
			ValidatedRows: validated,
		}

		// Prüfe ob bereits ein Ergebnis existiert
		var existingResult models.ValidationResult
		if err := db.Where("upload_id = ?", upload.ID).First(&existingResult).Error; err == nil {
			// Update existierendes Ergebnis
			existingResult.OrdersCount = len(orders)
			existingResult.ValidatedRows = validated
			if err := db.Save(&existingResult).Error; err != nil {
				log.Printf("❌ Fehler beim Aktualisieren der Validierungsergebnisse: %v", err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":  "Failed to persist validation result",
					"detail": err.Error(),
				})
			} else {
				log.Printf("✅ Validierungsergebnisse aktualisiert für UploadID=%d", upload.ID)
			}
		} else {
			// Erstelle neues Ergebnis
			if err := db.Create(&validationResult).Error; err != nil {
				log.Printf("❌ Fehler beim Speichern der Validierungsergebnisse: %v", err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":  "Failed to persist validation result",
					"detail": err.Error(),
				})
			} else {
				log.Printf("✅ Validierungsergebnisse gespeichert für UploadID=%d", upload.ID)
			}
		}
		return c.JSON(fiber.Map{
			"uploadId":    upload.ID,
			"ordersCount": len(orders),
			"rows":        validated,
		})
	}
}

func deriveDateRangeFromRows(rows []map[string]string) (fromDate string, toDate string, ok bool) {
	var latest time.Time
	for _, row := range rows {
		tsRaw := strings.TrimSpace(row["Timestamp"])
		if tsRaw == "" {
			continue
		}
		ts, err := parseUploadTimestamp(tsRaw)
		if err != nil {
			continue
		}
		if latest.IsZero() || ts.After(latest) {
			latest = ts
		}
	}
	if latest.IsZero() {
		return "", "", false
	}

	now := time.Now()
	// 45 Tage Puffer rückwärts reduziert große Responses, lässt aber genug Historie für Nachläufer.
	from := latest.AddDate(0, 0, -45)
	if from.After(now) {
		from = now.AddDate(0, 0, -30)
	}
	// Bis heute + 1 Tag, damit späte Tagesupdates erfasst werden.
	to := now.AddDate(0, 0, 1)
	if to.Before(from) {
		to = from.AddDate(0, 0, 1)
	}

	return from.Format("2006-01-02"), to.Format("2006-01-02"), true
}

func parseUploadTimestamp(s string) (time.Time, error) {
	value := strings.TrimSpace(s)
	layouts := []string{
		"02/01/2006 15:04",
		"02/01/06 15:04",
		"02/01/2006",
		"02/01/06",
		"02.01.2006 15:04",
		"02.01.2006",
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, value); err == nil {
			return t, nil
		}
	}
	return time.Time{}, errors.New("unsupported timestamp format")
}

func normalizeUintQuery(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	n, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return ""
	}
	if n == 0 {
		return ""
	}
	return strconv.FormatUint(n, 10)
}

func isDBValidationCacheEnabled() bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv("VALIDATION_DB_CACHE_ENABLED")))
	if value == "" {
		return true
	}
	return value == "1" || value == "true" || value == "yes"
}

func ensureCampaignByExternalID(db *gorm.DB, externalID string) (models.Campaign, error) {
	var campaign models.Campaign
	err := db.Where("external_campaign_id = ?", externalID).First(&campaign).Error
	if err == nil {
		return campaign, nil
	}
	if err != gorm.ErrRecordNotFound {
		return campaign, err
	}
	campaign = models.Campaign{
		ExternalCampaignID: strings.TrimSpace(externalID),
		Name:               fmt.Sprintf("Campaign %s", strings.TrimSpace(externalID)),
		SyncIntervalMins:   30,
		IsActive:           true,
	}
	return campaign, db.Create(&campaign).Error
}

func upsertUploadOrderCandidates(db *gorm.DB, uploadID uint, campaignID string, rows []map[string]string) error {
	now := time.Now()
	candidates := make([]models.UploadOrderCandidate, 0, len(rows))
	for i, row := range rows {
		orderToken := strings.TrimSpace(row["Ordertoken/OrderID"])
		if orderToken == "" {
			orderToken = strings.TrimSpace(row["Ordertoken/Order ID"])
		}
		if orderToken == "" {
			for key, value := range row {
				if strings.Contains(strings.ToLower(key), "order") && strings.TrimSpace(value) != "" {
					orderToken = strings.TrimSpace(value)
					break
				}
			}
		}

		rawRow := make(map[string]any, len(row))
		for k, v := range row {
			rawRow[k] = v
		}

		candidates = append(candidates, models.UploadOrderCandidate{
			UploadID:           uploadID,
			RowNo:              i + 1,
			CampaignExternalID: strings.TrimSpace(campaignID),
			OrderToken:         orderToken,
			SubID:              strings.TrimSpace(row["SubID"]),
			TimestampRaw:       strings.TrimSpace(row["Timestamp"]),
			Commission:         strings.TrimSpace(row["Höhe der Provision (Optional)"]),
			RawRow:             rawRow,
			LastValidatedAt:    &now,
		})
	}

	if len(candidates) == 0 {
		return nil
	}
	return db.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "upload_id"},
			{Name: "row_no"},
		},
		DoUpdates: clause.AssignmentColumns([]string{
			"campaign_external_id",
			"order_token",
			"sub_id",
			"timestamp_raw",
			"commission",
			"raw_row",
			"last_validated_at",
			"updated_at",
		}),
	}).Create(&candidates).Error
}

func loadOrdersForUploadFromDB(db *gorm.DB, uploadID uint, campaignDBID uint, fromDate string, toDate string) ([]services.ExternalOrder, error) {
	var candidates []models.UploadOrderCandidate
	if err := db.Where("upload_id = ?", uploadID).Find(&candidates).Error; err != nil {
		return nil, err
	}

	tokenSet := map[string]struct{}{}
	subIDSet := map[string]struct{}{}
	for _, c := range candidates {
		if v := strings.TrimSpace(c.OrderToken); v != "" {
			tokenSet[v] = struct{}{}
		}
		if v := strings.TrimSpace(c.SubID); v != "" {
			subIDSet[v] = struct{}{}
		}
	}

	tokens := make([]string, 0, len(tokenSet))
	for k := range tokenSet {
		tokens = append(tokens, k)
	}
	subIDs := make([]string, 0, len(subIDSet))
	for k := range subIDSet {
		subIDs = append(subIDs, k)
	}

	query := db.Model(&models.CampaignOrder{}).Where("campaign_id = ?", campaignDBID)
	if len(tokens) > 0 || len(subIDs) > 0 {
		if len(tokens) > 0 && len(subIDs) > 0 {
			query = query.Where("(order_token IN ? OR sub_id IN ?)", tokens, subIDs)
		} else if len(tokens) > 0 {
			query = query.Where("order_token IN ?", tokens)
		} else {
			query = query.Where("sub_id IN ?", subIDs)
		}
	} else {
		// Fallback: kleines Zeitfenster statt kompletter Kampagnentabelle
		fromTime, fromErr := time.Parse("2006-01-02", strings.TrimSpace(fromDate))
		toTime, toErr := time.Parse("2006-01-02", strings.TrimSpace(toDate))
		if fromErr == nil && toErr == nil {
			query = query.Where("event_timestamp >= ? AND event_timestamp <= ?", fromTime, toTime.Add(24*time.Hour))
		}
	}

	var records []models.CampaignOrder
	if err := query.Find(&records).Error; err != nil {
		return nil, err
	}

	out := make([]services.ExternalOrder, 0, len(records))
	for _, rec := range records {
		timestamp := ""
		if rec.EventTimestamp != nil {
			timestamp = rec.EventTimestamp.Format("2006-01-02 15:04:05")
		}

		order := services.ExternalOrder{
			ExternalOrderID: rec.ExternalOrderID,
			OrderToken:      rec.OrderToken,
			SubID:           rec.SubID,
			Timestamp:       timestamp,
			Status:          rec.Status,
			Commission:      rec.Commission,
		}
		order.ProjectID = payloadMapString(rec.Payload, "project_id")
		order.PublisherID = payloadMapString(rec.Payload, "publisher_id")
		order.CommissionGroupID = payloadMapString(rec.Payload, "commission_group_id")
		order.TriggerID = payloadMapString(rec.Payload, "trigger_id")
		order.CampaignID = payloadMapString(rec.Payload, "campaign_id")
		out = append(out, order)
	}
	return out, nil
}

func payloadMapString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	raw, ok := payload[key]
	if !ok || raw == nil {
		return ""
	}
	value := strings.TrimSpace(fmt.Sprint(raw))
	if value == "" || value == "<nil>" {
		return ""
	}
	return value
}

// HandleGetValidation lädt gespeicherte Validierungsergebnisse für einen Upload
func HandleGetValidation(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}

		role, _ := claims["role"].(string)
		userEmail, _ := claims["email"].(string)

		id := c.Params("id")
		log.Println("✅ GetValidation aufgerufen für UploadID=", id)

		// Debug: Prüfe ob Upload existiert
		var upload models.Upload
		if err := db.First(&upload, id).Error; err != nil {
			log.Printf("❌ GetValidation - Upload mit ID=%s nicht gefunden", id)
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Upload not found",
			})
		}
		log.Printf("✅ GetValidation - Upload gefunden: ID=%d, Status=%s, UploadedBy=%s", upload.ID, upload.Status, upload.UploadedBy)

		var validationResult models.ValidationResult
		if err := db.Where("upload_id = ?", id).First(&validationResult).Error; err != nil {
			// Keine Validierung gefunden - für das Frontend als normaler Empty-State behandeln.
			log.Printf("ℹ️ GetValidation - Keine Validierung für UploadID=%s gefunden (empty state)", id)
			return c.JSON(fiber.Map{
				"uploadId":      upload.ID,
				"ordersCount":   0,
				"rows":          []models.ValidatedRow{},
				"validatedAt":   nil,
				"hasValidation": false,
			})
		}
		log.Printf("✅ GetValidation - Validierung gefunden für UploadID=%s", id)

		// Berechtigung prüfen: Publisher können nur ihre eigenen Dateien sehen
		if role == "publisher" {
			var upload models.Upload
			if err := db.First(&upload, validationResult.UploadID).Error; err != nil {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Upload not found"})
			}
			if upload.UploadedBy != userEmail {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
			}
		}

		return c.JSON(fiber.Map{
			"uploadId":      validationResult.UploadID,
			"ordersCount":   validationResult.OrdersCount,
			"rows":          validationResult.ValidatedRows,
			"validatedAt":   validationResult.ValidatedAt,
			"hasValidation": true,
		})
	}
}

// HandleGetAllValidations lädt alle Validierungsergebnisse für mehrere Uploads auf einmal
func HandleGetAllValidations(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}

		role, _ := claims["role"].(string)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can view validations"})
		}

		var validationResults []models.ValidationResult
		if err := db.Find(&validationResults).Error; err != nil {
			log.Printf("❌ Fehler beim Laden aller Validierungsergebnisse: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to fetch validations",
			})
		}

		// Konvertiere zu Map: UploadID -> ValidationResult
		resultMap := make(map[uint]fiber.Map)
		for _, vr := range validationResults {
			resultMap[vr.UploadID] = fiber.Map{
				"uploadId":    vr.UploadID,
				"ordersCount": vr.OrdersCount,
				"rows":        vr.ValidatedRows,
				"validatedAt": vr.ValidatedAt,
			}
		}

		return c.JSON(resultMap)
	}
}
