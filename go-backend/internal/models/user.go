package models

import (
	"time"

	"gorm.io/gorm"
)

// User repräsentiert einen Benutzer für Authentifizierung
// Felder: ID, Name, Email, PasswordHash, Role, CreatedAt
// GORM übernimmt die Migration

type User struct {
	ID           uint           `gorm:"primaryKey"`
	Name         string         `gorm:"not null"`
	Email        string         `gorm:"uniqueIndex;not null"`
	PasswordHash string         `gorm:"not null"`
	Role         string         `gorm:"not null"` // z.B. "admin", "advertiser", "publisher"
	Company      string         `gorm:"not null;default:''" json:"company"`
	ProjectID         uint           `gorm:"default:0" json:"project_id"`
	PublisherID       uint           `gorm:"default:0" json:"publisher_id"`
	CommissionGroupID uint           `gorm:"default:0" json:"commission_group_id"`
	TriggerID         uint           `gorm:"default:0" json:"trigger_id"`
	CreatedAt    time.Time      `gorm:"autoCreateTime"`
	UpdatedAt    time.Time      `gorm:"autoUpdateTime"`
	DeletedAt    gorm.DeletedAt `gorm:"index"`
}
