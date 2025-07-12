package models

import (
	"time"

	"gorm.io/gorm"
)

type Upload struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Filename    string         `gorm:"not null" json:"filename"`
	UploadDate  time.Time      `gorm:"autoCreateTime" json:"upload_date"`
	FileSize    int64          `gorm:"not null" json:"file_size"`
	ContentType string         `gorm:"not null" json:"content_type"`
	UploadedBy  string         `gorm:"not null" json:"uploaded_by"`
	Status      string         `gorm:"default:'pending'" json:"status"`
	FilePath    string         `gorm:"not null" json:"file_path"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
