package models

import "time"

type UploadAccess struct {
	ID           uint `gorm:"primaryKey"`
	UploadID     uint `gorm:"not null;index:idx_upload_access_upload_id;uniqueIndex:idx_upload_access_pair"`
	AdvertiserID uint `gorm:"not null;index:idx_upload_access_advertiser_id;uniqueIndex:idx_upload_access_pair"`
	ExpiresAt    *time.Time
	CreatedAt    time.Time `gorm:"autoCreateTime"`
}
