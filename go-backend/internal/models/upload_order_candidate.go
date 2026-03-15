package models

import (
	"time"

	"gorm.io/gorm"
)

type UploadOrderCandidate struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	UploadID           uint           `gorm:"not null;uniqueIndex:idx_upload_candidate_row,priority:1;index:idx_upload_candidate_upload" json:"upload_id"`
	RowNo              int            `gorm:"not null;uniqueIndex:idx_upload_candidate_row,priority:2" json:"row_no"`
	CampaignExternalID string         `gorm:"not null;index:idx_upload_candidate_campaign_token,priority:1;index:idx_upload_candidate_campaign_subid,priority:1" json:"campaign_external_id"`
	OrderToken         string         `gorm:"default:'';index:idx_upload_candidate_campaign_token,priority:2" json:"ordertoken"`
	SubID              string         `gorm:"default:'';index:idx_upload_candidate_campaign_subid,priority:2" json:"subid"`
	TimestampRaw       string         `gorm:"default:''" json:"timestamp_raw"`
	Commission         string         `gorm:"default:''" json:"commission"`
	RawRow             map[string]any `gorm:"type:jsonb;serializer:json" json:"raw_row"`
	LastValidatedAt    *time.Time     `json:"last_validated_at"`
	CreatedAt          time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt          time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}
