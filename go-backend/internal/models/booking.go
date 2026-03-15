package models

import (
	"time"

	"gorm.io/gorm"
)

type BookingBatch struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	UploadID          uint           `gorm:"not null;index:idx_booking_batch_lookup,priority:1" json:"upload_id"`
	CampaignID        uint           `gorm:"not null;index:idx_booking_batch_lookup,priority:2" json:"campaign_id"`
	CreatedByUserID   uint           `gorm:"not null" json:"created_by_user_id"`
	Source            string         `gorm:"not null;default:'admin'" json:"source"`
	Status            string         `gorm:"not null;default:'pending'" json:"status"`
	CurrentCSVVersion int            `gorm:"not null;default:0" json:"current_csv_version"`
	Payload           map[string]any `gorm:"type:jsonb;serializer:json" json:"payload"`
	CreatedAt         time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
}

type BookingItem struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	BatchID         uint           `gorm:"not null;index;uniqueIndex:idx_booking_item_batch_dedupe,priority:1" json:"batch_id"`
	RowNo           int            `gorm:"not null" json:"row_no"`
	ExternalOrderID string         `gorm:"default:''" json:"external_order_id"`
	OrderToken      string         `gorm:"default:''" json:"ordertoken"`
	SubID           string         `gorm:"default:''" json:"subid"`
	TimestampRaw    string         `gorm:"default:''" json:"timestamp_raw"`
	Commission      string         `gorm:"default:''" json:"commission"`
	NetworkPayload  map[string]any `gorm:"type:jsonb;serializer:json" json:"network_payload"`
	DedupeKey       string         `gorm:"not null;uniqueIndex:idx_booking_item_batch_dedupe,priority:2" json:"dedupe_key"`
	Status          string         `gorm:"not null;default:'pending'" json:"status"`
	CreatedAt       time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

type CSVExport struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	BatchID            uint           `gorm:"not null;uniqueIndex:idx_csv_export_batch_version,priority:1" json:"batch_id"`
	Version            int            `gorm:"not null;uniqueIndex:idx_csv_export_batch_version,priority:2" json:"version"`
	FileName           string         `gorm:"not null" json:"file_name"`
	StoragePath        string         `gorm:"not null" json:"storage_path"`
	SHA256             string         `gorm:"not null;default:''" json:"sha256"`
	SizeBytes          int64          `gorm:"not null;default:0" json:"size_bytes"`
	IsCurrent          bool           `gorm:"not null;default:true;index" json:"is_current"`
	ReplacedByExportID *uint          `json:"replaced_by_export_id"`
	CreatedByUserID    uint           `gorm:"not null" json:"created_by_user_id"`
	CreatedAt          time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt          time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}

type OutboundJob struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	BatchID     uint           `gorm:"not null;index" json:"batch_id"`
	Target      string         `gorm:"not null;index" json:"target"`
	Status      string         `gorm:"not null;default:'pending';index:idx_outbound_job_retry,priority:1" json:"status"`
	Payload     map[string]any `gorm:"type:jsonb;serializer:json" json:"payload"`
	Attempts    int            `gorm:"not null;default:0" json:"attempts"`
	NextRetryAt *time.Time     `gorm:"index:idx_outbound_job_retry,priority:2" json:"next_retry_at"`
	LastError   string         `gorm:"type:text;default:''" json:"last_error"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
