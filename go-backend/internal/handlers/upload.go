package handlers

import (
	"nba-dashboard/internal/models"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// HandleReturnToPublisher setzt den Status eines Uploads auf 'returned_to_publisher'
func HandleReturnToPublisher(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("user").(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}
		role, _ := claims["role"].(string)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can return files to publisher"})
		}

		uploadID := c.Params("id")
		var upload models.Upload
		if err := db.First(&upload, uploadID).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Upload nicht gefunden"})
		}

		// Zusätzliche Prüfung: Nur wenn Status zu einer Advertiser-Bearbeitung passt
		if upload.Status != "assigned" && upload.Status != "feedback" && upload.Status != "feedback_submitted" && upload.Status != "feedback_submitted_advertiser" && upload.Status != "sent_to_publisher_advertiser" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Datei kann nur im passenden Workflow-Status zurückgeschickt werden"})
		}
		var user models.User
		if err := db.Where("email = ?", upload.LastModifiedBy).First(&user).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Letzter Bearbeiter nicht gefunden"})
		}

		isAdvertiserManual := strings.HasPrefix(strings.ToLower(strings.TrimSpace(upload.Filename)), "manual_request_advertiser_")
		if isAdvertiserManual {
			// Sonderfall:
			// 1) Advertiser -> Admin -> Publisher
			if user.Role == "advertiser" {
				upload.Status = "sent_to_publisher_advertiser"
			} else if user.Role == "publisher" {
				// 2) Publisher -> Admin -> Advertiser
				upload.Status = "returned_to_publisher"
			} else {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Ungültiger Bearbeiter für Advertiser-Manuellanfrage"})
			}
		} else {
			switch {
			case user.Role == "advertiser":
				upload.Status = "returned_to_publisher"
			case user.Role == "publisher" && upload.Status == "feedback_submitted":
				// Admin leitet eine Publisher-Rückfrage an den Publisher zurück.
				upload.Status = "returned_to_publisher"
			default:
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Datei kann nur zurückgeschickt werden, wenn sie vom Advertiser bearbeitet wurde oder eine Publisher-Rückfrage vorliegt"})
			}
		}
		if err := db.Save(&upload).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Status konnte nicht aktualisiert werden"})
		}

		return c.JSON(fiber.Map{
			"message": "Upload an Publisher zurückgeschickt",
			"upload":  upload,
		})
	}
}
