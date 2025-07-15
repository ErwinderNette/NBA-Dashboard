package handlers

import (
	"nba-dashboard/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// HandleReturnToPublisher setzt den Status eines Uploads auf 'returned_to_publisher'
func HandleReturnToPublisher(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		uploadID := c.Params("id")
		var upload models.Upload
		if err := db.First(&upload, uploadID).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Upload nicht gefunden"})
		}

		// Zusätzliche Prüfung: Nur wenn Status 'assigned' ODER 'feedback' und letzter Bearbeiter Advertiser ist
		if upload.Status != "assigned" && upload.Status != "feedback" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Datei kann nur im Status 'assigned' oder 'feedback' zurückgeschickt werden"})
		}
		var user models.User
		if err := db.Where("email = ?", upload.LastModifiedBy).First(&user).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Letzter Bearbeiter nicht gefunden"})
		}
		if user.Role != "advertiser" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Datei kann nur zurückgeschickt werden, wenn sie vom Advertiser bearbeitet wurde"})
		}

		upload.Status = "returned_to_publisher"
		if err := db.Save(&upload).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Status konnte nicht aktualisiert werden"})
		}

		return c.JSON(fiber.Map{
			"message": "Upload an Publisher zurückgeschickt",
			"upload":  upload,
		})
	}
}
