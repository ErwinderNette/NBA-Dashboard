package main

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"nba-dashboard/internal/config"
	"nba-dashboard/internal/handlers"
	"nba-dashboard/internal/models"

	"gorm.io/gorm"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

var db *gorm.DB

// UploadAccess Modell (inline für Demo, besser: in models/upload_access.go)
type UploadAccess struct {
	ID           uint `gorm:"primaryKey"`
	UploadID     uint `gorm:"not null"`
	AdvertiserID uint `gorm:"not null"`
	ExpiresAt    *time.Time
	CreatedAt    time.Time `gorm:"autoCreateTime"`
}

// Migration ergänzen (in main oder config/db.go)
func init() {
	if db != nil {
		db.AutoMigrate(&UploadAccess{})
	}
}

func main() {
	// .env laden
	godotenv.Load(".env")

	// Create uploads directory if it doesn't exist
	uploadsDir := "uploads"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Fatal(err)
	}

	// Init DB (führt auch Migration aus)
	db = config.InitDB()

	// Lege Default-User an
	handlers.AddInitialUsers(db)

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
	app.Post("/api/upload", handlers.AuthRequired(), handleFileUpload)

	// Add new routes
	app.Get("/api/uploads", handlers.AuthRequired(), handleGetUploads)
	app.Get("/api/advertisers", handlers.AuthRequired(), handleGetAdvertisers)
	app.Post("/api/uploads/:id/access", handlers.AuthRequired(), handleGrantAccessDB)
	app.Get("/api/uploads/:id/download", handlers.AuthRequired(), handleDownloadFile)
	app.Patch("/api/uploads/:id/status", handlers.AuthRequired(), handleUpdateUploadStatus)

	// Login-Endpoint
	app.Post("/api/login", handlers.HandleLogin(db))

	// Start server
	log.Fatal(app.Listen(":3001"))
}

func handleFileUpload(c *fiber.Ctx) error {
	u := c.Locals("user")
	claims, ok := u.(map[string]interface{})
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
	}
	userEmail, _ := claims["email"].(string)

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "No file uploaded",
		})
	}

	filename := filepath.Join("uploads", file.Filename)
	if err := c.SaveFile(file, filename); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save file",
		})
	}

	upload := models.Upload{
		Filename:    file.Filename,
		FileSize:    file.Size,
		ContentType: file.Header.Get("Content-Type"),
		UploadedBy:  userEmail,
		Status:      "pending",
		FilePath:    filename,
	}
	if err := db.Create(&upload).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save upload in DB"})
	}

	return c.JSON(fiber.Map{
		"message":  "File uploaded successfully",
		"filename": file.Filename,
		"path":     filename,
		"uploadId": upload.ID,
	})
}

// Handle get uploads
func handleGetUploads(c *fiber.Ctx) error {
	u := c.Locals("user")
	claims, ok := u.(map[string]interface{})
	role, _ := claims["role"].(string)
	userEmail, _ := claims["email"].(string)

	if !ok || role == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
	}

	var uploads []models.Upload
	var err error

	if role == "admin" {
		err = db.Order("created_at desc").Find(&uploads).Error
	} else if role == "advertiser" {
		err = db.Where("uploaded_by = ?", userEmail).Order("created_at desc").Find(&uploads).Error
	} else {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch uploads"})
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
func handleGrantAccessDB(c *fiber.Ctx) error {
	u := c.Locals("user")
	claims := u.(map[string]interface{})
	role, _ := claims["role"].(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can grant access"})
	}

	id := c.Params("id")
	var body struct {
		AdvertiserId uint       `json:"advertiserId"`
		ExpiresAt    *time.Time `json:"expiresAt"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	uploadID := id
	access := UploadAccess{
		UploadID:     parseUint(uploadID),
		AdvertiserID: body.AdvertiserId,
		ExpiresAt:    body.ExpiresAt,
	}
	if err := db.Create(&access).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to grant access"})
	}

	return c.JSON(fiber.Map{"message": "Access granted successfully"})
}

func parseUint(s string) uint {
	n, _ := strconv.ParseUint(s, 10, 64)
	return uint(n)
}

func handleDownloadFile(c *fiber.Ctx) error {
	u := c.Locals("user")
	claims := u.(map[string]interface{})
	role, _ := claims["role"].(string)
	userEmail, _ := claims["email"].(string)

	id := c.Params("id")
	var upload models.Upload
	if err := db.First(&upload, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "File not found"})
	}

	if role != "admin" && upload.UploadedBy != userEmail {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to download this file"})
	}

	return c.Download(upload.FilePath, upload.Filename)
}

func handleUpdateUploadStatus(c *fiber.Ctx) error {
	u := c.Locals("user")
	claims := u.(map[string]interface{})
	role, _ := claims["role"].(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can update status"})
	}

	id := c.Params("id")
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Status != "approved" && body.Status != "rejected" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid status value"})
	}

	if err := db.Model(&models.Upload{}).Where("id = ?", id).Update("status", body.Status).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update status"})
	}

	return c.JSON(fiber.Map{"message": "Status updated successfully"})
}
