package handlers

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"nba-dashboard/internal/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

const avatarEndpointPath = "/api/users/me/avatar"

func avatarURLForUser(user models.User) string {
	if strings.TrimSpace(user.AvatarPath) == "" {
		return ""
	}
	return avatarEndpointPath
}

func HandleUploadAvatar(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		user, err := loadUserFromTokenClaims(c, db)
		if err != nil {
			return respondUserLoadError(c, err)
		}

		file, err := c.FormFile("file")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No file uploaded"})
		}
		if err := validateAvatarFile(file); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}

		ext := strings.ToLower(strings.TrimSpace(filepath.Ext(file.Filename)))
		newPath := buildStoredAvatarPath(user.ID, ext)
		oldPath := strings.TrimSpace(user.AvatarPath)

		if err := c.SaveFile(file, newPath); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save avatar"})
		}
		if err := db.Model(&user).Updates(map[string]interface{}{
			"avatar_path": newPath,
			"updated_at":  time.Now(),
		}).Error; err != nil {
			_ = os.Remove(newPath)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update user avatar"})
		}
		if oldPath != "" && oldPath != newPath {
			_ = os.Remove(oldPath)
		}

		return c.JSON(fiber.Map{
			"message":    "Avatar uploaded successfully",
			"avatar_url": avatarEndpointPath,
		})
	}
}

func HandleGetAvatar(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		user, err := loadUserFromTokenClaims(c, db)
		if err != nil {
			return respondUserLoadError(c, err)
		}

		avatarPath := strings.TrimSpace(user.AvatarPath)
		if avatarPath == "" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Avatar not found"})
		}
		if _, err := os.Stat(avatarPath); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Avatar not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load avatar"})
		}

		contentType, err := detectAvatarContentTypeByPath(avatarPath)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to detect avatar type"})
		}
		if contentType != "" {
			c.Set(fiber.HeaderContentType, contentType)
		}
		c.Set(fiber.HeaderCacheControl, "private, max-age=300")
		return c.SendFile(avatarPath)
	}
}

func HandleDeleteAvatar(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		user, err := loadUserFromTokenClaims(c, db)
		if err != nil {
			return respondUserLoadError(c, err)
		}

		avatarPath := strings.TrimSpace(user.AvatarPath)
		if avatarPath != "" {
			_ = os.Remove(avatarPath)
		}
		if err := db.Model(&user).Updates(map[string]interface{}{
			"avatar_path": "",
			"updated_at":  time.Now(),
		}).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to remove avatar"})
		}
		return c.JSON(fiber.Map{
			"message":    "Avatar removed successfully",
			"avatar_url": "",
		})
	}
}

func buildStoredAvatarPath(userID uint, ext string) string {
	safeExt := strings.ToLower(strings.TrimSpace(ext))
	if safeExt == "" {
		safeExt = ".png"
	}
	name := fmt.Sprintf("user_%d_%d%s", userID, time.Now().UnixNano(), safeExt)
	return filepath.Join("uploads", "avatars", name)
}

func validateAvatarFile(file *multipart.FileHeader) error {
	if file == nil {
		return errors.New("no file uploaded")
	}
	if file.Size <= 0 {
		return errors.New("uploaded file is empty")
	}
	if file.Size > avatarMaxBytes() {
		return fmt.Errorf("file too large (max %d bytes)", avatarMaxBytes())
	}

	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(file.Filename)))
	if !stringInSlice(allowedAvatarExtensions(), ext) {
		return fmt.Errorf("file extension %q is not allowed", ext)
	}

	contentType, err := detectAvatarContentType(file)
	if err != nil {
		return fmt.Errorf("failed to inspect file content: %w", err)
	}
	if contentType != "" && !stringInSlice(allowedAvatarMIMEs(), contentType) {
		return fmt.Errorf("file content type %q is not allowed", contentType)
	}
	return nil
}

func detectAvatarContentType(file *multipart.FileHeader) (string, error) {
	reader, err := file.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()

	buf := make([]byte, 512)
	n, readErr := reader.Read(buf)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return "", readErr
	}
	if n == 0 {
		return "", nil
	}
	return normalizeContentType(http.DetectContentType(buf[:n])), nil
}

func detectAvatarContentTypeByPath(path string) (string, error) {
	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(path)))
	if ext != "" {
		detected := normalizeContentType(mime.TypeByExtension(ext))
		if detected != "" {
			return detected, nil
		}
	}

	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	buf := make([]byte, 512)
	n, readErr := f.Read(buf)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return "", readErr
	}
	if n == 0 {
		return "", nil
	}
	return normalizeContentType(http.DetectContentType(buf[:n])), nil
}

func normalizeContentType(contentType string) string {
	detected := strings.ToLower(strings.TrimSpace(contentType))
	if detected == "" {
		return ""
	}
	mediaType, _, err := mime.ParseMediaType(detected)
	if err == nil && mediaType != "" {
		return strings.ToLower(strings.TrimSpace(mediaType))
	}
	return detected
}

func allowedAvatarExtensions() []string {
	raw := strings.TrimSpace(os.Getenv("AVATAR_ALLOWED_EXTENSIONS"))
	if raw == "" {
		raw = ".jpg,.jpeg,.png,.webp"
	}
	values := make([]string, 0, 4)
	for _, part := range strings.Split(raw, ",") {
		item := strings.ToLower(strings.TrimSpace(part))
		if item == "" {
			continue
		}
		if !strings.HasPrefix(item, ".") {
			item = "." + item
		}
		if !stringInSlice(values, item) {
			values = append(values, item)
		}
	}
	return values
}

func allowedAvatarMIMEs() []string {
	raw := strings.TrimSpace(os.Getenv("AVATAR_ALLOWED_MIME_TYPES"))
	if raw == "" {
		raw = "image/jpeg,image/png,image/webp"
	}
	values := make([]string, 0, 3)
	for _, part := range strings.Split(raw, ",") {
		item := normalizeContentType(part)
		if item == "" {
			continue
		}
		if !stringInSlice(values, item) {
			values = append(values, item)
		}
	}
	return values
}

func avatarMaxBytes() int64 {
	raw := strings.TrimSpace(os.Getenv("AVATAR_MAX_BYTES"))
	if raw == "" {
		return 5 * 1024 * 1024
	}
	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || parsed <= 0 {
		return 5 * 1024 * 1024
	}
	return parsed
}

func stringInSlice(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
