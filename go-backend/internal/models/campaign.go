package models

import (
	"time"

	"gorm.io/gorm"
)

type Campaign struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	ExternalCampaignID string         `gorm:"not null;uniqueIndex" json:"external_campaign_id"`
	Name               string         `gorm:"not null" json:"name"`
	ProjectID          string         `gorm:"default:''" json:"project_id"`
	PublisherID        string         `gorm:"default:''" json:"publisher_id"`
	CommissionGroupID  string         `gorm:"default:''" json:"commission_group_id"`
	TriggerID          string         `gorm:"default:''" json:"trigger_id"`
	IsActive           bool           `gorm:"not null;default:true" json:"is_active"`
	SyncIntervalMins   int            `gorm:"not null;default:30" json:"sync_interval_minutes"`
	LastSyncedAt       *time.Time     `json:"last_synced_at"`
	CreatedAt          time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt          time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}

type CampaignSyncRun struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	CampaignID    uint           `gorm:"not null;index:idx_campaign_sync_run_time" json:"campaign_id"`
	StartedAt     time.Time      `gorm:"autoCreateTime;index:idx_campaign_sync_run_time,sort:desc" json:"started_at"`
	FinishedAt    *time.Time     `json:"finished_at"`
	Status        string         `gorm:"not null;default:'running'" json:"status"`
	RequestFrom   *time.Time     `json:"request_from"`
	RequestTo     *time.Time     `json:"request_to"`
	FetchedCount  int            `gorm:"not null;default:0" json:"fetched_count"`
	UpsertedCount int            `gorm:"not null;default:0" json:"upserted_count"`
	ErrorMessage  string         `gorm:"type:text;default:''" json:"error_message"`
	CreatedAt     time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

type CampaignOrder struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	CampaignID       uint           `gorm:"not null;index:idx_campaign_order_token,priority:1;index:idx_campaign_order_subid,priority:1" json:"campaign_id"`
	ExternalOrderID  string         `gorm:"not null;uniqueIndex" json:"external_order_id"`
	OrderToken       string         `gorm:"default:'';index:idx_campaign_order_token,priority:2" json:"ordertoken"`
	SubID            string         `gorm:"default:'';index:idx_campaign_order_subid,priority:2" json:"subid"`
	EventTimestamp   *time.Time     `json:"event_timestamp"`
	Status           int            `gorm:"default:-1" json:"status"`
	Commission       string         `gorm:"default:''" json:"commission"`
	Payload          map[string]any `gorm:"type:jsonb;serializer:json" json:"payload"`
	SourceLastChange *time.Time     `json:"source_last_change"`
	FirstSeenAt      time.Time      `gorm:"autoCreateTime" json:"first_seen_at"`
	LastSeenAt       time.Time      `gorm:"autoUpdateTime" json:"last_seen_at"`
	CreatedAt        time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt        time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
}
