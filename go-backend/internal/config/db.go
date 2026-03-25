package config

import (
	"fmt"
	"log"
	"os"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"nba-dashboard/internal/models"
)

// InitDB stellt die Verbindung zur Datenbank her.
func InitDB() *gorm.DB {
	sslMode := strings.TrimSpace(os.Getenv("DB_SSLMODE"))
	if sslMode == "" {
		sslMode = "disable"
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") && sslMode == "disable" {
		log.Fatal("DB_SSLMODE=disable is not allowed when APP_ENV=production")
	}

	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_PORT"),
		sslMode,
	)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	return db
}

// RunAutoMigrate führt Schema-Migrationen im Code-gesteuerten Modus aus.
func RunAutoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&models.User{},
		&models.Upload{},
		&models.UploadAccess{},
		&models.ValidationResult{},
		&models.Campaign{},
		&models.CampaignSyncRun{},
		&models.CampaignOrder{},
		&models.BookingBatch{},
		&models.BookingItem{},
		&models.CSVExport{},
		&models.OutboundJob{},
		&models.AuditEvent{},
		&models.UploadOrderCandidate{},
	); err != nil {
		return fmt.Errorf("failed to migrate tables: %w", err)
	}
	return nil
}
