package models

import (
	"time"

	"gorm.io/gorm"
)

type AuditEvent struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	OccurredAt  time.Time      `gorm:"autoCreateTime;index" json:"occurred_at"`
	ActorUserID *uint          `gorm:"index" json:"actor_user_id"`
	Action      string         `gorm:"not null;index" json:"action"`
	EntityType  string         `gorm:"not null;index:idx_audit_entity_time,priority:1" json:"entity_type"`
	EntityID    string         `gorm:"not null;index:idx_audit_entity_time,priority:2" json:"entity_id"`
	RequestID   string         `gorm:"default:''" json:"request_id"`
	BeforeData  map[string]any `gorm:"type:jsonb;serializer:json" json:"before_data"`
	AfterData   map[string]any `gorm:"type:jsonb;serializer:json" json:"after_data"`
	Metadata    map[string]any `gorm:"type:jsonb;serializer:json" json:"metadata"`
	CreatedAt   time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}
