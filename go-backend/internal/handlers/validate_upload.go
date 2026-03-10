package handlers

import (
	"encoding/json"
	"errors"
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

		const debugLogPath = "/Users/erwinsawitzki/Documents/NBA-Dashboard/.cursor/debug.log"
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

		apiURL := os.Getenv("NETWORK_API_URL")
		baseURL := os.Getenv("NETWORK_API_BASE_URL")
		campaignId := strings.TrimSpace(c.Query("campaignId"))
		fromDate := "2024-01-01"
		toDate := "2027-05-05"
		if dynamicFrom, dynamicTo, ok := deriveDateRangeFromRows(rows); ok {
			fromDate = dynamicFrom
			toDate = dynamicTo
		}

		// Wenn campaignId übergeben wird, Orders-URL aus Basis-URL bauen:
		// admin/5 bleibt fix, nur condition[l:campaigns] ist dynamisch.
		if campaignId != "" && baseURL != "" {
			path := "/6115e2ebc15bf7cffcf39c56dfce109acc702fe1/admin/5/get-orders.json"
			apiURL = baseURL + path + "?condition[period][from]=" + fromDate + "&condition[period][to]=" + toDate + "&condition[paymentstatus]=all&condition[l:status]=open,confirmed,canceled,paidout&condition[l:campaigns]=" + campaignId
		}
		// Wenn Kampagne übergeben wurde, aber keine Netzwerk-URL konfiguriert ist, klaren Fehler liefern.
		if campaignId != "" && apiURL == "" {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Network API is not configured",
				"detail": "Set NETWORK_API_BASE_URL (preferred) or NETWORK_API_URL in go-backend/.env",
			})
		}
		var orders []services.ExternalOrder

		// #region agent log
		if f, err := os.OpenFile(debugLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			entry := map[string]interface{}{
				"location": "validate_upload.go", "message": "Validate started",
				"data": map[string]interface{}{
					"networkApiUrlSet": apiURL != "",
					"uploadId":         c.Params("id"),
					"campaignId":       campaignId,
					"fromDate":         fromDate,
					"toDate":           toDate,
				},
				"hypothesisId": "B",
			}
			if b, e := json.Marshal(entry); e == nil {
				f.Write(append(b, '\n'))
			}
			f.Close()
		}
		// #endregion

		if apiURL != "" {
			log.Printf("🌍 ValidateUpload Network-Call: campaignId=%s from=%s to=%s baseURLSet=%t apiURL=%s", campaignId, fromDate, toDate, baseURL != "", apiURL)
			ordersSvc := services.NewOrdersService(apiURL)
			var err error
			orders, err = ordersSvc.GetOrders(c.Context())
			if err != nil {
				log.Println("❌ Network API error:", err)
				return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
					"error":  "Network API error",
					"detail": err.Error(),
				})
			}
			log.Printf("✅ Orders von API geladen: %d", len(orders))
		} else {
			log.Println("ℹ️ NETWORK_API_URL / NETWORK_API_BASE_URL nicht gesetzt und/oder keine campaignId – Validierung läuft ohne Order-Abgleich (nur Pflichtfelder)")
		}

		// #region agent log
		if f, err := os.OpenFile(debugLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			entry := map[string]interface{}{
				"location": "validate_upload.go", "message": "Orders loaded",
				"data": map[string]interface{}{"ordersCount": len(orders), "fromDate": fromDate, "toDate": toDate},
				"hypothesisId": "B,D",
			}
			if b, e := json.Marshal(entry); e == nil {
				f.Write(append(b, '\n'))
			}
			f.Close()
		}
		// #endregion

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

		// Debug: Prüfe ob Status in der ersten Zeile ist
		var firstStatus string
		if len(validated) > 0 {
			firstRow := validated[0]
			if statusCell, ok := firstRow.Cells["Status in der uppr Performance Platform"]; ok {
				firstStatus = statusCell.Value
				log.Printf("✅ Handler - Status in erster Zeile gefunden: '%s'", statusCell.Value)
			} else {
				keys := make([]string, 0, len(firstRow.Cells))
				for k := range firstRow.Cells {
					keys = append(keys, k)
				}
				log.Printf("❌ Handler - Status NICHT in erster Zeile! Keys: %v", keys)
			}
		}
		// #region agent log
		if f, err := os.OpenFile(debugLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			entry := map[string]interface{}{
				"location": "validate_upload.go", "message": "After Validate",
				"data": map[string]interface{}{"validatedRows": len(validated), "firstRowStatus": firstStatus},
				"hypothesisId": "B,C,E",
			}
			if b, e := json.Marshal(entry); e == nil {
				f.Write(append(b, '\n'))
			}
			f.Close()
		}
		// #endregion

		// ✅ Speichere Validierungsergebnisse in der Datenbank
		validationResult := models.ValidationResult{
			UploadID:      upload.ID,
			OrdersCount:   len(orders),
			ValidatedRows: validated,
		}

		// Prüfe ob bereits ein Ergebnis existiert
		var existingResult models.ValidationResult
		saveOK := false
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
				saveOK = true
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
				saveOK = true
				log.Printf("✅ Validierungsergebnisse gespeichert für UploadID=%d", upload.ID)
			}
		}
		// #region agent log
		if f, err := os.OpenFile(debugLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			entry := map[string]interface{}{
				"location": "validate_upload.go", "message": "DB save result",
				"data": map[string]interface{}{"uploadId": upload.ID, "saveOK": saveOK},
				"hypothesisId": "D,E",
			}
			if b, e := json.Marshal(entry); e == nil {
				f.Write(append(b, '\n'))
			}
			f.Close()
		}
		// #endregion

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
				"uploadId":    upload.ID,
				"ordersCount": 0,
				"rows":        []models.ValidatedRow{},
				"validatedAt": nil,
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
			"uploadId":    validationResult.UploadID,
			"ordersCount": validationResult.OrdersCount,
			"rows":        validationResult.ValidatedRows,
			"validatedAt": validationResult.ValidatedAt,
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
