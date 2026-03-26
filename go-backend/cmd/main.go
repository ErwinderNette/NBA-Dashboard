package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"nba-dashboard/internal/config"
	"nba-dashboard/internal/handlers"
	"nba-dashboard/internal/lib"
	"nba-dashboard/internal/models"
	"nba-dashboard/internal/services"

	"gorm.io/gorm"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
)

var db *gorm.DB

func main() {
	// .env laden
	godotenv.Load(".env")
	validateSecurityConfig()

	// Create uploads directory if it doesn't exist
	uploadsDir := "uploads"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(uploadsDir, "avatars"), 0755); err != nil {
		log.Fatal(err)
	}

	// Init DB
	db = config.InitDB()
	if shouldRunAutoMigrate() {
		if err := config.RunAutoMigrate(db); err != nil {
			log.Fatal(err)
		}
	}

	// Lege Default-User an
	handlers.AddInitialUsers(db)
	// Starte Smart-Scheduler für Kampagnen-Sync (DB-Cache statt Live-API pro Request)
	services.StartCampaignSyncScheduler(db)

	// Create Fiber app
	app := fiber.New(fiber.Config{
		BodyLimit:    10 * 1024 * 1024, // 10MB limit
		ErrorHandler: customErrorHandler,
	})

	// Middleware
	app.Use(requestid.New())
	app.Use(recover.New(recover.Config{
		EnableStackTrace: !isProductionEnv(),
	}))
	app.Use(logger.New(loggerConfigFromEnv()))
	app.Use(securityHeadersMiddleware())
	app.Use(rateLimitMiddleware())
	app.Use(cors.New(corsConfigFromEnv()))
	app.Use("/api/auth", authRateLimitMiddleware())

	// Health endpoints for orchestrators and load balancers.
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"status": "ok"})
	})
	app.Get("/ready", func(c *fiber.Ctx) error {
		sqlDB, err := db.DB()
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"status": "not_ready"})
		}
		if err := sqlDB.Ping(); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"status": "not_ready"})
		}
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"status": "ready"})
	})

	// Routes
	app.Post("/api/upload", handlers.AuthRequired(), handleFileUpload)

	// Add new routes
	app.Get("/api/uploads", handlers.AuthRequired(), handleGetUploads)
	app.Get("/api/advertisers", handlers.AuthRequired(), handleGetAdvertisers)
	app.Get("/api/users", handlers.AuthRequired(), handleGetUsers)
	app.Post("/api/users/me/avatar", handlers.AuthRequired(), handlers.HandleUploadAvatar(db))
	app.Get("/api/users/me/avatar", handlers.AuthRequired(), handlers.HandleGetAvatar(db))
	app.Delete("/api/users/me/avatar", handlers.AuthRequired(), handlers.HandleDeleteAvatar(db))
	app.Post("/api/uploads/:id/access", handlers.AuthRequired(), handleGrantAccessDB)
	app.Get("/api/uploads/:id/download", handlers.AuthRequired(), handleDownloadFile)
	app.Patch("/api/uploads/:id/status", handlers.AuthRequired(), handleUpdateUploadStatus)
	app.Delete("/api/uploads/:id", handlers.AuthRequired(), handleDeleteUpload)
	app.Post("/api/uploads/:id/replace", handlers.AuthRequired(), handleReplaceUpload)
	app.Post("/api/uploads/:id/return-to-publisher", handlers.AuthRequired(), handlers.HandleReturnToPublisher(db))
	app.Get("/api/uploads/:id/content", handlers.AuthRequired(), handleGetFileContent)
	app.Post("/api/uploads/:id/content", handlers.AuthRequired(), handleSaveFileContent)

	// ✅ Validation für Admin-Preview
	app.Get("/api/uploads/:id/validate", handlers.AuthRequired(), handlers.HandleValidateUpload(db))
	// ✅ Gespeicherte Validierungsergebnisse laden
	app.Get("/api/uploads/:id/validation", handlers.AuthRequired(), handlers.HandleGetValidation(db))
	// ✅ Alle Validierungsergebnisse auf einmal laden
	app.Get("/api/uploads/validations", handlers.AuthRequired(), handlers.HandleGetAllValidations(db))
	// Nachbuchungen CSV: persistieren + versioniert archivieren
	app.Post("/api/uploads/:id/bookings/csv", handlers.AuthRequired(), handlers.HandleCreateBookingCSVExport(db))
	app.Get("/api/bookings/csv-exports/:exportId/download", handlers.AuthRequired(), handlers.HandleDownloadBookingCSVExport(db))
	// Campaign Sync / Cache Status
	app.Get("/api/campaigns/:campaignId/sync-status", handlers.AuthRequired(), handlers.HandleGetCampaignSyncStatus(db))
	app.Post("/api/campaigns/:campaignId/sync-now", handlers.AuthRequired(), handlers.HandleSyncCampaignNow(db))
	app.Get("/api/campaigns/scheduler/monitoring", handlers.AuthRequired(), handlers.HandleGetSchedulerMonitoring(db))

	// Login-Endpoint
	app.Post("/api/auth/login", handlers.HandleLogin(db))
	app.Post("/api/auth/register", handlers.HandleRegister(db))
	app.Get("/api/auth/company-options", handlers.HandleCompanyOptions(db))
	app.Post("/api/auth/forgot-password", handlers.HandleForgotPassword(db))
	app.Post("/api/auth/reset-password", handlers.HandleResetPassword(db))
	app.Post("/api/auth/google", handlers.HandleGoogleAuth(db))
	app.Get("/api/auth/me", handlers.AuthRequired(), handlers.HandleAuthMe(db))
	app.Post("/api/auth/complete-profile", handlers.AuthRequired(), handlers.HandleCompleteProfile(db))

	// Legacy Login-Endpoint (kept for backward compatibility)
	app.Post("/api/login", handlers.HandleLogin(db))

	serverAddr := ":" + envWithDefault("PORT", "3001")
	go func() {
		if err := app.Listen(serverAddr); err != nil {
			log.Fatalf("server stopped with error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
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
	if err := validateUploadFile(file); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	filename := buildStoredUploadPath(file.Filename)
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

		// 2. Zugewiesene Uploads
		var user models.User
		err2 := db.Where("email = ?", userEmail).First(&user).Error
		var accessUploads []models.Upload

		if err2 == nil {
			var accesses []models.UploadAccess
			db.Where("advertiser_id = ?", user.ID).Find(&accesses)

			var uploadIDs []uint
			for _, a := range accesses {
				uploadIDs = append(uploadIDs, a.UploadID)
			}
			if len(uploadIDs) > 0 {
				db.Where("id IN ?", uploadIDs).Order("created_at desc").Find(&accessUploads)
			}
		}

		// merge ohne Duplikate
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
	var accesses []models.UploadAccess
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
	uploadsWithAdvertiser := make([]UploadWithAdvertiser, 0, len(uploads))
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

	var result []fiber.Map
	for _, a := range advertisers {
		result = append(result, fiber.Map{
			"id":                  a.ID,
			"name":                a.Name,
			"email":               a.Email,
			"company":             a.Company,
			"commission_group_id": a.CommissionGroupID,
			"trigger_id":          a.TriggerID,
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
			"id":                  u.ID,
			"name":                u.Name,
			"email":               u.Email,
			"company":             u.Company,
			"role":                u.Role,
			"project_id":          u.ProjectID,
			"publisher_id":        u.PublisherID,
			"commission_group_id": u.CommissionGroupID,
			"trigger_id":          u.TriggerID,
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
	access := models.UploadAccess{
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
		if upload.UploadedBy == userEmail {
			// ok
		} else if role == "advertiser" {
			var user models.User
			if err := db.Where("email = ?", userEmail).First(&user).Error; err != nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to download this file"})
			}
			var access models.UploadAccess
			if err := db.Where("upload_id = ? AND advertiser_id = ?", upload.ID, user.ID).First(&access).Error; err != nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to download this file"})
			}
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

	if role != "admin" && upload.UploadedBy != userEmail {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to delete this file"})
	}

	if err := os.Remove(upload.FilePath); err != nil && !os.IsNotExist(err) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete file from disk"})
	}

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
		if upload.UploadedBy == userEmail {
			// ok
		} else if role == "advertiser" {
			var user models.User
			if err := db.Where("email = ?", userEmail).First(&user).Error; err != nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to replace this file"})
			}
			var access models.UploadAccess
			if err := db.Where("upload_id = ? AND advertiser_id = ?", upload.ID, user.ID).First(&access).Error; err != nil {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to replace this file"})
			}
		} else {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed to replace this file"})
		}
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No file uploaded"})
	}
	if err := validateUploadFile(file); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	_ = os.Remove(upload.FilePath)

	filename := buildStoredUploadPath(file.Filename)
	if err := c.SaveFile(file, filename); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

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

// Handle get file content
func handleGetFileContent(c *fiber.Ctx) error {
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

	// Berechtigung prüfen
	if role != "admin" {
		if upload.UploadedBy != userEmail {
			if role == "advertiser" {
				var user models.User
				if err := db.Where("email = ?", userEmail).First(&user).Error; err != nil {
					return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
				}
				var access models.UploadAccess
				if err := db.Where("upload_id = ? AND advertiser_id = ?", upload.ID, user.ID).First(&access).Error; err != nil {
					return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
				}
			} else {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
			}
		}
	}

	// ✅ Datei lesen und parsen (shared lib)
	data, err := lib.ReadUploadAsTable(upload.FilePath)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to read file: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"data":     data,
		"filename": upload.Filename,
	})
}

// Handle save file content
func handleSaveFileContent(c *fiber.Ctx) error {
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

	// Berechtigung prüfen
	if role != "admin" {
		if upload.UploadedBy != userEmail {
			if role == "advertiser" {
				var user models.User
				if err := db.Where("email = ?", userEmail).First(&user).Error; err != nil {
					return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
				}
				var access models.UploadAccess
				if err := db.Where("upload_id = ? AND advertiser_id = ?", upload.ID, user.ID).First(&access).Error; err != nil {
					return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
				}
			} else {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Not allowed"})
			}
		}
	}

	// Request Body parsen
	var body struct {
		Data [][]string `json:"data"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// ✅ Datei schreiben (shared lib)
	if err := lib.WriteUploadTable(upload.FilePath, body.Data); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to save file: " + err.Error()})
	}

	// Upload-Metadaten aktualisieren
	upload.LastModifiedBy = userEmail
	upload.UpdatedAt = time.Now()
	if role == "advertiser" {
		upload.Status = "feedback_submitted"
	}
	db.Save(&upload)

	return c.JSON(fiber.Map{"message": "File saved successfully"})
}

func validateSecurityConfig() {
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if appEnv == "production" && jwtSecret == "" {
		log.Fatal("JWT_SECRET must be set when APP_ENV=production")
	}
}

func isProductionEnv() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production")
}

func shouldRunAutoMigrate() bool {
	override := strings.TrimSpace(strings.ToLower(os.Getenv("DB_AUTO_MIGRATE")))
	if override != "" {
		return override == "1" || override == "true" || override == "yes" || override == "on"
	}
	// Safe default: in production migrations are disabled unless explicitly enabled.
	return !strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production")
}

func customErrorHandler(c *fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	message := "Internal server error"

	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) {
		status = fiberErr.Code
		message = fiberErr.Message
	}

	requestID := strings.TrimSpace(c.GetRespHeader(fiber.HeaderXRequestID))
	if requestID == "" {
		if value, ok := c.Locals("requestid").(string); ok {
			requestID = strings.TrimSpace(value)
		}
	}

	return c.Status(status).JSON(fiber.Map{
		"error":      message,
		"request_id": requestID,
	})
}

func loggerConfigFromEnv() logger.Config {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("LOG_FORMAT")), "text") {
		return logger.Config{
			Format:     "[${time}] ${status} - ${method} ${path} (${latency}) rid=${locals:requestid}\n",
			TimeFormat: time.RFC3339,
		}
	}

	return logger.Config{
		Format:     "{\"time\":\"${time}\",\"level\":\"info\",\"request_id\":\"${locals:requestid}\",\"status\":${status},\"latency\":\"${latency}\",\"method\":\"${method}\",\"path\":\"${path}\",\"ip\":\"${ip}\",\"user_agent\":\"${ua}\",\"error\":\"${error}\"}\n",
		TimeFormat: time.RFC3339Nano,
	}
}

func securityHeadersMiddleware() fiber.Handler {
	if !isFeatureEnabled("SECURITY_HEADERS_ENABLED", true) {
		return func(c *fiber.Ctx) error { return c.Next() }
	}

	csp := strings.TrimSpace(os.Getenv("SECURITY_CSP"))
	if csp == "" {
		csp = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';"
	}

	return func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
		c.Set("Content-Security-Policy", csp)

		if isProductionEnv() {
			c.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		return c.Next()
	}
}

func rateLimitMiddleware() fiber.Handler {
	if !isFeatureEnabled("RATE_LIMIT_ENABLED", false) {
		return func(c *fiber.Ctx) error { return c.Next() }
	}

	max := envIntWithDefault("RATE_LIMIT_MAX", 120)
	windowSeconds := envIntWithDefault("RATE_LIMIT_WINDOW_SECONDS", 60)
	if max <= 0 {
		max = 120
	}
	if windowSeconds <= 0 {
		windowSeconds = 60
	}

	return limiter.New(limiter.Config{
		Max:        max,
		Expiration: time.Duration(windowSeconds) * time.Second,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		Next: func(c *fiber.Ctx) bool {
			path := strings.TrimSpace(c.Path())
			if path == "/health" || path == "/ready" {
				return true
			}
			return !strings.HasPrefix(path, "/api")
		},
		LimitReached: func(c *fiber.Ctx) error {
			requestID := strings.TrimSpace(c.GetRespHeader(fiber.HeaderXRequestID))
			if requestID == "" {
				if value, ok := c.Locals("requestid").(string); ok {
					requestID = strings.TrimSpace(value)
				}
			}
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error":      "Rate limit exceeded",
				"request_id": requestID,
			})
		},
	})
}

func corsConfigFromEnv() cors.Config {
	allowOrigins := strings.TrimSpace(os.Getenv("CORS_ALLOW_ORIGINS"))
	base := cors.Config{
		AllowOrigins:     allowOrigins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		AllowCredentials: false,
		MaxAge:           300,
	}

	if isProductionEnv() {
		if allowOrigins == "" {
			log.Fatal("CORS_ALLOW_ORIGINS must be configured when APP_ENV=production")
		}
		return base
	}

	// Development defaults and LAN-friendly behavior.
	// In development we deliberately allow dynamic LAN origins to avoid repeated
	// CORS breakage when local IPs change.
	base.AllowOrigins = "*"
	return base
}

func envWithDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envIntWithDefault(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func isFeatureEnabled(key string, defaultValue bool) bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if raw == "" {
		return defaultValue
	}
	return raw == "1" || raw == "true" || raw == "yes" || raw == "on"
}

func buildStoredUploadPath(originalFilename string) string {
	base := filepath.Base(strings.TrimSpace(originalFilename))
	ext := filepath.Ext(base)
	name := strings.TrimSuffix(base, ext)
	name = regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(name, "-")
	name = strings.Trim(name, "-.")
	if name == "" {
		name = "upload"
	}

	stored := fmt.Sprintf("%s_%d%s", name, time.Now().UnixNano(), ext)
	return filepath.Join("uploads", stored)
}

func authRateLimitMiddleware() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        envIntWithDefault("AUTH_RATE_LIMIT_MAX", 30),
		Expiration: time.Duration(envIntWithDefault("AUTH_RATE_LIMIT_WINDOW_SECONDS", 60)) * time.Second,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Too many authentication attempts. Please try again later.",
			})
		},
	})
}

func validateUploadFile(file *multipart.FileHeader) error {
	if file == nil {
		return errors.New("no file uploaded")
	}

	maxBytes := uploadMaxBytes()
	if file.Size <= 0 {
		return errors.New("uploaded file is empty")
	}
	if file.Size > maxBytes {
		return fmt.Errorf("file too large (max %d bytes)", maxBytes)
	}

	filename := strings.TrimSpace(file.Filename)
	ext := strings.ToLower(filepath.Ext(filename))
	allowedExtensions := allowedUploadExtensions()
	if !slices.Contains(allowedExtensions, ext) {
		return fmt.Errorf("file extension %q is not allowed", ext)
	}

	contentType, err := detectContentType(file)
	if err != nil {
		return fmt.Errorf("failed to inspect file content: %w", err)
	}

	allowedMIMEs := allowedUploadMIMEs()
	if contentType != "" && !slices.Contains(allowedMIMEs, contentType) {
		return fmt.Errorf("file content type %q is not allowed", contentType)
	}
	return nil
}

func detectContentType(file *multipart.FileHeader) (string, error) {
	reader, err := file.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()

	buf := make([]byte, 512)
	n, readErr := reader.Read(buf)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return "", readErr
	}
	if n == 0 {
		return "", nil
	}

	detected := strings.ToLower(strings.TrimSpace(http.DetectContentType(buf[:n])))
	if detected == "" {
		return "", nil
	}

	// Normalize common values with charset so env matching is deterministic.
	mediaType, _, err := mime.ParseMediaType(detected)
	if err == nil && mediaType != "" {
		return strings.ToLower(strings.TrimSpace(mediaType)), nil
	}
	return detected, nil
}

func allowedUploadExtensions() []string {
	raw := strings.TrimSpace(os.Getenv("UPLOAD_ALLOWED_EXTENSIONS"))
	if raw == "" {
		raw = ".csv,.xlsx,.xls"
	}
	out := make([]string, 0, 4)
	for _, part := range strings.Split(raw, ",") {
		val := strings.ToLower(strings.TrimSpace(part))
		if val == "" {
			continue
		}
		if !strings.HasPrefix(val, ".") {
			val = "." + val
		}
		if !slices.Contains(out, val) {
			out = append(out, val)
		}
	}
	return out
}

func allowedUploadMIMEs() []string {
	raw := strings.TrimSpace(os.Getenv("UPLOAD_ALLOWED_MIME_TYPES"))
	if raw == "" {
		raw = strings.Join([]string{
			"text/csv",
			"text/plain",
			"application/csv",
			"application/vnd.ms-excel",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/octet-stream",
			"application/zip",
		}, ",")
	}
	out := make([]string, 0, 8)
	for _, part := range strings.Split(raw, ",") {
		val := strings.ToLower(strings.TrimSpace(part))
		if val == "" {
			continue
		}
		if !slices.Contains(out, val) {
			out = append(out, val)
		}
	}
	return out
}

func uploadMaxBytes() int64 {
	raw := strings.TrimSpace(os.Getenv("UPLOAD_MAX_BYTES"))
	if raw == "" {
		return 10 * 1024 * 1024
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value <= 0 {
		return 10 * 1024 * 1024
	}
	return value
}
