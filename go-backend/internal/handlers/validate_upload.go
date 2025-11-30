package handlers

import (
	"encoding/json"
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

		// Debug: Serialisiere zu JSON und prüfe ob Status noch da ist
		jsonBytes, err := json.Marshal(validated)
		if err == nil && len(validated) > 0 {
			var testRows []models.ValidatedRow
			if err := json.Unmarshal(jsonBytes, &testRows); err == nil && len(testRows) > 0 {
				if statusCell, ok := testRows[0].Cells["Status in der uppr Performance Platform"]; ok {
					log.Printf("✅ Handler - Status nach JSON-Serialisierung gefunden: '%s'", statusCell.Value)
				} else {
					keys := make([]string, 0, len(testRows[0].Cells))
					for k := range testRows[0].Cells {
						keys = append(keys, k)
					}
					log.Printf("❌ Handler - Status nach JSON-Serialisierung NICHT gefunden! Keys: %v", keys)
				}
			}
		}

		return c.JSON(fiber.Map{
			"uploadId":    upload.ID,
			"ordersCount": len(orders),
			"rows":        validated,
		})
	}
}
