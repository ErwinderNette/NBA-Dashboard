package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
	// Create uploads directory if it doesn't exist
	uploadsDir := "uploads"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Fatal(err)
	}

	// Create Fiber app
	app := fiber.New(fiber.Config{
		BodyLimit: 10 * 1024 * 1024, // 10MB limit
	})

	// Middleware
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:4173,http://localhost:8080",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, DELETE, OPTIONS",
	}))

	// Routes
	app.Post("/api/upload", handleFileUpload)

	// Add new routes
	app.Get("/api/uploads", handleGetUploads)
	app.Get("/api/advertisers", handleGetAdvertisers)
	app.Post("/api/uploads/:id/access", handleGrantAccess)

	// Start server
	log.Fatal(app.Listen(":3001"))
}

func handleFileUpload(c *fiber.Ctx) error {
	// Get file from form
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "No file uploaded",
		})
	}

	// Create unique filename
	filename := filepath.Join("uploads", file.Filename)

	// Save file
	if err := c.SaveFile(file, filename); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save file",
		})
	}

	// Return success response
	return c.JSON(fiber.Map{
		"message":  "File uploaded successfully",
		"filename": file.Filename,
		"path":     filename,
	})
}

// Handle get uploads
func handleGetUploads(c *fiber.Ctx) error {
	// Mock data for now
	uploads := []fiber.Map{
		{
			"id":               1,
			"filename":         "example1.pdf",
			"upload_date":      "2024-03-20T10:00:00Z",
			"file_size":        1024,
			"content_type":     "application/pdf",
			"uploaded_by":      "admin",
			"status":           "pending",
			"advertiser_count": 0,
		},
		{
			"id":               2,
			"filename":         "example2.pdf",
			"upload_date":      "2024-03-20T11:00:00Z",
			"file_size":        2048,
			"content_type":     "application/pdf",
			"uploaded_by":      "admin",
			"status":           "approved",
			"advertiser_count": 1,
		},
	}
	return c.JSON(uploads)
}

// Handle get advertisers
func handleGetAdvertisers(c *fiber.Ctx) error {
	// Mock data for now
	advertisers := []fiber.Map{
		{
			"id":    1,
			"name":  "Sample Advertiser 1",
			"email": "advertiser1@example.com",
		},
		{
			"id":    2,
			"name":  "Sample Advertiser 2",
			"email": "advertiser2@example.com",
		},
	}
	return c.JSON(advertisers)
}

// Handle grant access
func handleGrantAccess(c *fiber.Ctx) error {
	uploadId := c.Params("id")
	var body struct {
		AdvertiserId int    `json:"advertiserId"`
		ExpiresAt    string `json:"expiresAt"`
	}

	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Mock success response
	return c.JSON(fiber.Map{
		"message":      "Access granted successfully",
		"uploadId":     uploadId,
		"advertiserId": body.AdvertiserId,
		"expiresAt":    body.ExpiresAt,
	})
}
