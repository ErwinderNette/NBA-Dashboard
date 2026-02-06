package handlers

import (
	"log"
	"os"

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

		apiURL := os.Getenv("NETWORK_API_URL")
		if apiURL == "" {
			log.Println("❌ NETWORK_API_URL ist leer")
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "NETWORK_API_URL nicht gesetzt (.env?)",
			})
		}

		ordersSvc := services.NewOrdersService(apiURL)

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

		orders, err := ordersSvc.GetOrders(c.Context())
		if err != nil {
			log.Println("❌ Network API error:", err)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"error":  "Network API error",
				"detail": err.Error(),
			})
		}

		validated := validationSvc.Validate(rows, orders)

		// Debug: Prüfe ob Status in der ersten Zeile ist
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
			} else {
				log.Printf("✅ Validierungsergebnisse aktualisiert für UploadID=%d", upload.ID)
			}
		} else {
			// Erstelle neues Ergebnis
			if err := db.Create(&validationResult).Error; err != nil {
				log.Printf("❌ Fehler beim Speichern der Validierungsergebnisse: %v", err)
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
			// Keine Validierung gefunden - das ist OK, einfach 404 zurückgeben
			log.Printf("ℹ️ GetValidation - Keine Validierung für UploadID=%s gefunden (das ist OK, wenn noch nicht validiert)", id)
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "No validation found",
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
