package models

import (
	"time"

	"gorm.io/gorm"
)

type Upload struct {
	ID          uint           `gorm:"primaryKey"`
	Filename    string         `gorm:"not null"`
	UploadDate  time.Time      `gorm:"autoCreateTime"`
	FileSize    int64          `gorm:"not null"`
	ContentType string         `gorm:"not null"`
	UploadedBy  string         `gorm:"not null"` // User-Email oder User-ID
	Status      string         `gorm:"default:'pending'"`
	FilePath    string         `gorm:"not null"`
	CreatedAt   time.Time      `gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}
