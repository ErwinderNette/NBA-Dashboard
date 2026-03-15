package config

import (
	"fmt"
	"log"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"nba-dashboard/internal/models"
)

// InitDB stellt die Verbindung zur Datenbank her und führt Migrationen aus
func InitDB() *gorm.DB {
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_PORT"),
	)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	// Migration
	if err := db.AutoMigrate(
		&models.User{},
		&models.Upload{},
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
		log.Fatalf("failed to migrate tables: %v", err)
	}

	return db
}
