package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"nba-dashboard/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type RegisterRequest struct {
	Name        string `json:"name"` // legacy fallback for older clients
	Company     string `json:"company"`
	ContactName string `json:"contact_name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Role        string `json:"role"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

type GoogleAuthRequest struct {
	IDToken string `json:"idToken"`
	Name    string `json:"name"`
}

type CompleteProfileRequest struct {
	Role        string `json:"role"`
	Company     string `json:"company"`
	ContactName string `json:"contact_name"`
}

type googleTokenInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
	Audience      string `json:"aud"`
}

func HandleRegister(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req RegisterRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request payload"})
		}

		email := normalizeEmail(req.Email)
		role := strings.ToLower(strings.TrimSpace(req.Role))
		company := strings.TrimSpace(req.Company)
		if company == "" {
			// Backward compatibility: older clients still post "name".
			company = strings.TrimSpace(req.Name)
		}
		contactName := strings.TrimSpace(req.ContactName)

		if email == "" || company == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company and email are required"})
		}
		if contactName != "" && len(contactName) < 2 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "contact_name must be at least 2 characters"})
		}
		if !isAllowedRegisterRole(role) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "role must be publisher or advertiser"})
		}
		if err := validatePasswordStrength(req.Password); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}

		var existing models.User
		if err := db.Where("email = ?", email).First(&existing).Error; err == nil {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "email already registered"})
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to validate user"})
		}

		passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to secure password"})
		}

		displayName := company
		if contactName != "" {
			displayName = contactName
		}

		user := models.User{
			Name:                displayName,
			Company:             company,
			Email:               email,
			PasswordHash:        string(passwordHash),
			Role:                role,
			AuthProvider:        "local",
			EmailVerified:       false,
			MustCompleteProfile: false,
		}
		if err := db.Create(&user).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create user"})
		}

		token, err := createJWT(user)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
		}

		log.Printf("auth.register success email=%s role=%s", user.Email, user.Role)
		return c.Status(fiber.StatusCreated).JSON(LoginResponse{
			Token:               token,
			Role:                user.Role,
			Name:                user.Name,
			Email:               user.Email,
			MustCompleteProfile: user.MustCompleteProfile,
			AvatarURL:           avatarURLForUser(user),
		})
	}
}

func HandleCompanyOptions(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		type companyRow struct {
			Company string `json:"company"`
		}
		var rows []companyRow
		if err := db.Model(&models.User{}).Select("company").Where("TRIM(company) <> ''").Find(&rows).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load company options"})
		}

		seen := make(map[string]struct{})
		options := make([]string, 0, len(rows))
		for _, row := range rows {
			value := strings.TrimSpace(row.Company)
			if value == "" {
				continue
			}
			key := strings.ToLower(value)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			options = append(options, value)
		}
		sort.Slice(options, func(i, j int) bool {
			return strings.ToLower(options[i]) < strings.ToLower(options[j])
		})

		response := make([]fiber.Map, 0, len(options))
		for _, option := range options {
			response = append(response, fiber.Map{"value": option})
		}
		return c.JSON(response)
	}
}

func HandleForgotPassword(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req ForgotPasswordRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request payload"})
		}

		email := normalizeEmail(req.Email)
		if email == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "email is required"})
		}

		// Always return a neutral response to prevent account enumeration.
		response := fiber.Map{
			"message": "Wenn ein Konto mit dieser E-Mail existiert, wurde ein Link versendet.",
		}

		var user models.User
		if err := db.Where("email = ?", email).First(&user).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return c.JSON(response)
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to process request"})
		}

		rawToken, err := generateSecureToken(32)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate reset token"})
		}
		tokenHash := hashToken(rawToken)
		expiresAt := time.Now().Add(20 * time.Minute)

		// Invalidate previous pending tokens for the user.
		if err := db.Model(&models.PasswordResetToken{}).
			Where("user_id = ? AND used_at IS NULL AND expires_at > ?", user.ID, time.Now()).
			Update("used_at", time.Now()).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to process request"})
		}

		tokenRow := models.PasswordResetToken{
			UserID:    user.ID,
			TokenHash: tokenHash,
			ExpiresAt: expiresAt,
		}
		if err := db.Create(&tokenRow).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to process request"})
		}

		resetURL := buildResetURL(rawToken)
		sendPasswordResetEmail(user.Email, resetURL)
		log.Printf("auth.forgot_password issued email=%s", user.Email)

		return c.JSON(response)
	}
}

func HandleResetPassword(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req ResetPasswordRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request payload"})
		}
		if strings.TrimSpace(req.Token) == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "token is required"})
		}
		if err := validatePasswordStrength(req.NewPassword); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}

		now := time.Now()
		hashedToken := hashToken(req.Token)
		var resetToken models.PasswordResetToken
		if err := db.Where("token_hash = ? AND used_at IS NULL AND expires_at > ?", hashedToken, now).First(&resetToken).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid or expired token"})
		}

		var user models.User
		if err := db.First(&user, resetToken.UserID).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid or expired token"})
		}

		passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to secure password"})
		}

		if err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&user).Updates(map[string]interface{}{
				"password_hash": string(passwordHash),
				"updated_at":    time.Now(),
			}).Error; err != nil {
				return err
			}

			if err := tx.Model(&resetToken).Update("used_at", now).Error; err != nil {
				return err
			}
			return nil
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reset password"})
		}

		log.Printf("auth.reset_password success user_id=%d", user.ID)
		return c.JSON(fiber.Map{"message": "password has been reset"})
	}
}

func HandleGoogleAuth(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req GoogleAuthRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request payload"})
		}
		if strings.TrimSpace(req.IDToken) == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "idToken is required"})
		}

		info, err := verifyGoogleIDToken(req.IDToken)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid google token"})
		}
		email := normalizeEmail(info.Email)
		if email == "" || strings.TrimSpace(info.Sub) == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid google token data"})
		}
		if !strings.EqualFold(strings.TrimSpace(info.EmailVerified), "true") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "google email not verified"})
		}

		var user models.User
		err = db.Where("email = ?", email).First(&user).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			name := strings.TrimSpace(info.Name)
			if name == "" {
				name = strings.TrimSpace(req.Name)
			}
			if name == "" {
				name = "Google User"
			}

			role, mustCompleteProfile := deriveGoogleRole(email)
			sub := strings.TrimSpace(info.Sub)
			user = models.User{
				Name:                name,
				Email:               email,
				PasswordHash:        "",
				Role:                role,
				AuthProvider:        "google",
				ProviderSubject:     &sub,
				EmailVerified:       true,
				MustCompleteProfile: mustCompleteProfile,
			}
			if err := db.Create(&user).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create user"})
			}
		} else if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to process user"})
		} else {
			if user.AuthProvider == "google" && user.ProviderSubject != nil && *user.ProviderSubject != strings.TrimSpace(info.Sub) {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "google account mismatch"})
			}

			updates := map[string]interface{}{
				"email_verified": true,
				"updated_at":     time.Now(),
			}
			if strings.TrimSpace(user.AuthProvider) == "" || user.AuthProvider == "local" {
				updates["auth_provider"] = "google"
			}
			if user.ProviderSubject == nil || strings.TrimSpace(*user.ProviderSubject) == "" {
				updates["provider_subject"] = strings.TrimSpace(info.Sub)
			}
			if isGoogleAdminEmail(email) && user.Role != "admin" {
				updates["role"] = "admin"
			}
			if err := db.Model(&user).Updates(updates).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update user"})
			}
			if err := db.Where("id = ?", user.ID).First(&user).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to refresh user"})
			}
		}

		token, err := createJWT(user)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
		}

		log.Printf("auth.google success email=%s role=%s", user.Email, user.Role)
		return c.JSON(LoginResponse{
			Token:               token,
			Role:                user.Role,
			Name:                user.Name,
			Email:               user.Email,
			MustCompleteProfile: user.MustCompleteProfile,
			AvatarURL:           avatarURLForUser(user),
		})
	}
}

func HandleAuthMe(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		user, err := loadUserFromTokenClaims(c, db)
		if err != nil {
			return respondUserLoadError(c, err)
		}

		return c.JSON(fiber.Map{
			"email":                 user.Email,
			"role":                  user.Role,
			"must_complete_profile": user.MustCompleteProfile,
			"avatar_url":            avatarURLForUser(user),
		})
	}
}

func HandleCompleteProfile(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req CompleteProfileRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request payload"})
		}
		role := strings.ToLower(strings.TrimSpace(req.Role))
		if !isAllowedRegisterRole(role) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "role must be publisher or advertiser"})
		}
		company := strings.TrimSpace(req.Company)
		contactName := strings.TrimSpace(req.ContactName)
		if len(company) < 2 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company must be at least 2 characters"})
		}
		if contactName != "" && len(contactName) < 2 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "contact_name must be at least 2 characters"})
		}

		user, err := loadUserFromTokenClaims(c, db)
		if err != nil {
			return respondUserLoadError(c, err)
		}
		if !user.MustCompleteProfile {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "profile is already completed"})
		}

		displayName := company
		if contactName != "" {
			displayName = contactName
		}

		if err := db.Model(&user).Updates(map[string]interface{}{
			"role":                  role,
			"name":                  displayName,
			"company":               company,
			"must_complete_profile": false,
			"updated_at":            time.Now(),
		}).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to complete profile"})
		}
		if err := db.Where("id = ?", user.ID).First(&user).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to refresh user"})
		}

		token, err := createJWT(user)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
		}

		return c.JSON(LoginResponse{
			Token:               token,
			Role:                user.Role,
			Name:                user.Name,
			Email:               user.Email,
			MustCompleteProfile: user.MustCompleteProfile,
			AvatarURL:           avatarURLForUser(user),
		})
	}
}

func verifyGoogleIDToken(idToken string) (*googleTokenInfo, error) {
	endpoint := "https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(strings.TrimSpace(idToken))
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(endpoint)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google token validation failed with status %d", resp.StatusCode)
	}

	var payload googleTokenInfo
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}

	expectedAudience := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID"))
	if expectedAudience != "" && payload.Audience != expectedAudience {
		return nil, errors.New("google token audience mismatch")
	}

	return &payload, nil
}

func validatePasswordStrength(password string) error {
	if len(strings.TrimSpace(password)) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	return nil
}

func generateSecureToken(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashToken(token string) string {
	hash := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(hash[:])
}

func buildResetURL(token string) string {
	baseURL := strings.TrimSpace(os.Getenv("FRONTEND_RESET_URL"))
	if baseURL == "" {
		baseURL = "http://localhost:5173/reset-password"
	}

	separator := "?"
	if strings.Contains(baseURL, "?") {
		separator = "&"
	}
	return baseURL + separator + "token=" + url.QueryEscape(token)
}

func sendPasswordResetEmail(email string, resetURL string) {
	// MVP transport: log-based dispatch. Replace with SMTP/provider integration.
	log.Printf("auth.forgot_password email=%s reset_url=%s", email, resetURL)
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func isAllowedRegisterRole(role string) bool {
	return role == "publisher" || role == "advertiser"
}

func deriveGoogleRole(email string) (string, bool) {
	if isGoogleAdminEmail(email) {
		return "admin", false
	}
	return "pending", true
}

func isGoogleAdminEmail(email string) bool {
	target := normalizeEmail(email)
	if target == "" {
		return false
	}
	configured := strings.Split(os.Getenv("GOOGLE_ADMIN_EMAILS"), ",")
	for _, entry := range configured {
		if normalizeEmail(entry) == target {
			return true
		}
	}
	return false
}

func loadUserFromTokenClaims(c *fiber.Ctx, db *gorm.DB) (models.User, error) {
	var claims map[string]interface{}
	switch v := c.Locals("user").(type) {
	case map[string]interface{}:
		claims = v
	case jwt.MapClaims:
		claims = map[string]interface{}(v)
	default:
		return models.User{}, errors.New("invalid user claims")
	}

	email, _ := claims["email"].(string)
	email = normalizeEmail(email)
	if email == "" {
		return models.User{}, errors.New("invalid user claims")
	}

	var user models.User
	if err := db.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.User{}, errors.New("user not found")
		}
		return models.User{}, err
	}
	return user, nil
}

func respondUserLoadError(c *fiber.Ctx, err error) error {
	if strings.Contains(err.Error(), "invalid user claims") || strings.Contains(err.Error(), "user not found") {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid user claims"})
	}
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load user"})
}
