package models

import (
	"time"

	"gorm.io/gorm"
)

// ValidationResult speichert die Validierungsergebnisse für einen Upload
type ValidationResult struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	UploadID      uint           `gorm:"not null;uniqueIndex" json:"upload_id"`
	OrdersCount   int            `gorm:"not null" json:"orders_count"`
	ValidatedRows []ValidatedRow `gorm:"type:jsonb" json:"rows"`
	ValidatedAt   time.Time      `gorm:"autoCreateTime" json:"validated_at"`
	CreatedAt     time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

