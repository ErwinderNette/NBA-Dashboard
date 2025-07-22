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
	"github.com/golang-jwt/jwt/v5"
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

	// Migration für UploadAccess nachholen
	db.AutoMigrate(&UploadAccess{})

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
		AllowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
	}))

	// Routes
	app.Post("/api/upload", handlers.AuthRequired(), handleFileUpload)

	// Add new routes
	app.Get("/api/uploads", handlers.AuthRequired(), handleGetUploads)
	app.Get("/api/advertisers", handlers.AuthRequired(), handleGetAdvertisers)
	app.Get("/api/users", handlers.AuthRequired(), handleGetUsers) // NEU
	app.Post("/api/uploads/:id/access", handlers.AuthRequired(), handleGrantAccessDB)
	app.Get("/api/uploads/:id/download", handlers.AuthRequired(), handleDownloadFile)
	app.Patch("/api/uploads/:id/status", handlers.AuthRequired(), handleUpdateUploadStatus)
	app.Delete("/api/uploads/:id", handlers.AuthRequired(), handleDeleteUpload)
	app.Post("/api/uploads/:id/replace", handlers.AuthRequired(), handleReplaceUpload)
	app.Post("/api/uploads/:id/return-to-publisher", handlers.AuthRequired(), handlers.HandleReturnToPublisher(db))

	// Login-Endpoint
	app.Post("/api/login", handlers.HandleLogin(db))

	// Start server
	log.Fatal(app.Listen(":3001"))
}

func handleFileUpload(c *fiber.Ctx) error {
	u := c.Locals("user")
	var claims map[string]interface{}
	switch v := u.(type) {
	case map[string]interface{}:
		claims = v
	case jwt.MapClaims:
		claims = map[string]interface{}(v)
	default:
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
		Filename:       file.Filename,
		FileSize:       file.Size,
		ContentType:    file.Header.Get("Content-Type"),
		UploadedBy:     userEmail,
		LastModifiedBy: userEmail,
		Status:         "pending",
		FilePath:       filename,
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
	var claims map[string]interface{}
	switch v := u.(type) {
	case map[string]interface{}:
		claims = v
	case jwt.MapClaims:
		claims = map[string]interface{}(v)
	default:
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
	}
	role := claims["role"].(string)
	userEmail := claims["email"].(string)

	var uploads []models.Upload
	var err error

	if role == "admin" {
		err = db.Order("created_at desc").Find(&uploads).Error
	} else if role == "advertiser" {
		// 1. Eigene Uploads
		var ownUploads []models.Upload
		db.Where("uploaded_by = ?", userEmail).Order("created_at desc").Find(&ownUploads)
		// 2. Zugewiesene Uploads (über UploadAccess)
		// Hole die User-ID (Advertiser-ID) anhand der E-Mail
		var user models.User
		err2 := db.Where("email = ?", userEmail).First(&user).Error
		var accessUploads []models.Upload
		if err2 == nil {
			var accesses []UploadAccess
			db.Where("advertiser_id = ?", user.ID).Find(&accesses)
			var uploadIDs []uint
			for _, a := range accesses {
				uploadIDs = append(uploadIDs, a.UploadID)
			}
			if len(uploadIDs) > 0 {
				db.Where("id IN ?", uploadIDs).Order("created_at desc").Find(&accessUploads)
			}
		}
		// Füge eigene und zugewiesene Uploads zusammen (ohne Duplikate)
		uploadMap := make(map[uint]models.Upload)
		for _, u := range ownUploads {
			uploadMap[u.ID] = u
		}
		for _, u := range accessUploads {
			uploadMap[u.ID] = u
		}
		for _, u := range uploadMap {
			uploads = append(uploads, u)
		}
	} else if role == "publisher" {
		err = db.Where("uploaded_by = ?", userEmail).Order("created_at desc").Find(&uploads).Error
	} else {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch uploads"})
	}

	// Mapping: UploadID -> AdvertiserID (nur letzter Eintrag zählt)
	var accesses []UploadAccess
	db.Find(&accesses)
	m := map[uint]uint{}
	for _, a := range accesses {
		m[a.UploadID] = a.AdvertiserID
	}

	// Hole alle User (für E-Mail)
	var users []models.User
	db.Find(&users)
	userMap := map[uint]string{}
	for _, u := range users {
		userMap[u.ID] = u.Email
	}

	// Baue Response mit assigned_advertiser_email
	type UploadWithAdvertiser struct {
		models.Upload
		AssignedAdvertiserEmail *string `json:"assigned_advertiser_email"`
	}
	var uploadsWithAdvertiser []UploadWithAdvertiser
	for _, u := range uploads {
		var emailPtr *string
		if advID, ok := m[u.ID]; ok {
			if email, ok2 := userMap[advID]; ok2 {
				emailPtr = &email
			}
		}
		uploadsWithAdvertiser = append(uploadsWithAdvertiser, UploadWithAdvertiser{
			Upload:                  u,
			AssignedAdvertiserEmail: emailPtr,
		})
	}
	return c.JSON(uploadsWithAdvertiser)
}

// Handle get advertisers
func handleGetAdvertisers(c *fiber.Ctx) error {
	var advertisers []models.User
	db.Where("role = ?", "advertiser").Find(&advertisers)
	// Mappe auf das gewünschte JSON-Format (id, name, email)
	var result []fiber.Map
	for _, a := range advertisers {
		result = append(result, fiber.Map{
			"id":      a.ID,
			"name":    a.Name,
			"email":   a.Email,
			"company": a.Company,
		})
	}
	return c.JSON(result)
}

// Liefert alle User mit Company
func handleGetUsers(c *fiber.Ctx) error {
	var users []models.User
	db.Find(&users)
	var result []fiber.Map
	for _, u := range users {
		result = append(result, fiber.Map{
			"id":      u.ID,
			"name":    u.Name,
			"email":   u.Email,
			"company": u.Company,
			"role":    u.Role,
		})
	}
	return c.JSON(result)
}

// Handle grant access
func handleGrantAccessDB(c *fiber.Ctx) error {
	u := c.Locals("user")
	var claims map[string]interface{}
	switch v := u.(type) {
	case map[string]interface{}:
		claims = v
	case jwt.MapClaims:
		claims = map[string]interface{}(v)
	default:
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
	}
	role := claims["role"].(string)
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

	// Setze Status auf 'assigned'
	if err := db.Model(&models.Upload{}).Where("id = ?", uploadID).Update("status", "assigned").Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update upload status"})
	}

	return c.JSON(fiber.Map{"message": "Access granted successfully"})
}

func parseUint(s string) uint {
	n, _ := strconv.ParseUint(s, 10, 64)
	return uint(n)
}

func handleDownloadFile(c *fiber.Ctx) error {
	u := c.Locals("user")
	var claims map[string]interface{}
	switch v := u.(type) {
	case map[string]interface{}:
		claims = v
	case jwt.MapClaims:
		claims = map[string]interface{}(v)
	default:
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
	}
	role := claims["role"].(string)
	userEmail := claims["email"].(string)

	id := c.Params("id")
	var upload models.Upload
	if err := db.First(&upload, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "File not found"})
	}

	if role != "admin" {
		// Prüfe, ob der User der Uploader ist
		if upload.UploadedBy == userEmail {
			// darf herunterladen
		} else if role == "advertiser" {
			// Prüfe, ob ein UploadAccess für diesen Advertiser existiert
			var user models.User
			if err := db.Where("email = ?", userEmail).First(&user).Error; err != nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to download this file"})
			}
			var access UploadAccess
			if err := db.Where("upload_id = ? AND advertiser_id = ?", upload.ID, user.ID).First(&access).Error; err != nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to download this file"})
			}
			// Zugriff erlaubt
		} else {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to download this file"})
		}
	}

	return c.Download(upload.FilePath, upload.Filename)
}

func handleUpdateUploadStatus(c *fiber.Ctx) error {
	u := c.Locals("user")
	var claims map[string]interface{}
	switch v := u.(type) {
	case map[string]interface{}:
		claims = v
	case jwt.MapClaims:
		claims = map[string]interface{}(v)
	default:
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
	}
	role := claims["role"].(string)

	id := c.Params("id")
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Status != "approved" && body.Status != "rejected" && body.Status != "completed" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid status value"})
	}

	if body.Status == "completed" {
		if role != "publisher" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only publisher can complete uploads"})
		}
	} else {
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only admin can update status"})
		}
	}

	if err := db.Model(&models.Upload{}).Where("id = ?", id).Update("status", body.Status).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update status"})
	}

	return c.JSON(fiber.Map{"message": "Status updated successfully"})
}

// Handle delete upload
func handleDeleteUpload(c *fiber.Ctx) error {
	u := c.Locals("user")
	var claims map[string]interface{}
	switch v := u.(type) {
	case map[string]interface{}:
		claims = v
	case jwt.MapClaims:
		claims = map[string]interface{}(v)
	default:
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
	}
	role := claims["role"].(string)
	userEmail := claims["email"].(string)

	id := c.Params("id")
	var upload models.Upload
	if err := db.First(&upload, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "File not found"})
	}

	// Nur Admin oder Besitzer darf löschen
	if role != "admin" && upload.UploadedBy != userEmail {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to delete this file"})
	}

	// Datei im Dateisystem löschen
	if err := os.Remove(upload.FilePath); err != nil && !os.IsNotExist(err) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete file from disk"})
	}

	// Soft-Delete in DB
	if err := db.Delete(&upload).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete upload in DB"})
	}

	return c.JSON(fiber.Map{"message": "Upload deleted successfully"})
}

func handleReplaceUpload(c *fiber.Ctx) error {
	u := c.Locals("user")
	var claims map[string]interface{}
	switch v := u.(type) {
	case map[string]interface{}:
		claims = v
	case jwt.MapClaims:
		claims = map[string]interface{}(v)
	default:
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
	}
	role := claims["role"].(string)
	userEmail := claims["email"].(string)

	id := c.Params("id")
	var upload models.Upload
	if err := db.First(&upload, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "File not found"})
	}

	if role != "admin" {
		// Prüfe, ob der User der Uploader ist
		if upload.UploadedBy == userEmail {
			// darf ersetzen
		} else if role == "advertiser" {
			// Prüfe, ob ein UploadAccess für diesen Advertiser existiert
			var user models.User
			if err := db.Where("email = ?", userEmail).First(&user).Error; err != nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to replace this file"})
			}
			var access UploadAccess
			if err := db.Where("upload_id = ? AND advertiser_id = ?", upload.ID, user.ID).First(&access).Error; err != nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to replace this file"})
			}
			// Zugriff erlaubt
		} else {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to replace this file"})
		}
	}

	// Datei aus dem Request holen
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No file uploaded"})
	}

	// Alte Datei im Dateisystem löschen (optional, Fehler ignorieren)
	_ = os.Remove(upload.FilePath)

	// Neue Datei speichern
	filename := filepath.Join("uploads", file.Filename)
	if err := c.SaveFile(file, filename); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

	// Upload-Metadaten aktualisieren
	upload.Filename = file.Filename
	upload.FileSize = file.Size
	upload.ContentType = file.Header.Get("Content-Type")
	upload.FilePath = filename
	upload.UpdatedAt = time.Now()
	upload.LastModifiedBy = userEmail
	if role == "advertiser" {
		upload.Status = "feedback_submitted"
	}
	if err := db.Save(&upload).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update upload in DB"})
	}

	return c.JSON(fiber.Map{"message": "File replaced successfully"})
}
