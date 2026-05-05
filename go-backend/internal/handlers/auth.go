package handlers

import (
	"errors"
	"log"
	"nba-dashboard/internal/models"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// LoginRequest ist das erwartete JSON für den Login
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse ist die Antwort mit JWT
type LoginResponse struct {
	Token               string `json:"token"`
	Role                string `json:"role"`
	Name                string `json:"name"`
	Email               string `json:"email"`
	MustCompleteProfile bool   `json:"must_complete_profile"`
	AvatarURL           string `json:"avatar_url,omitempty"`
}

// HandleLogin verarbeitet den Login-Request
func HandleLogin(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req LoginRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
		}

		var user models.User
		if err := db.Where("email = ?", req.Email).First(&user).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
		}

		token, err := createJWT(user)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate token"})
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

// createJWT erstellt ein JWT für den User
func createJWT(user models.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"role":  user.Role,
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}
	secret, err := getJWTSecret()
	if err != nil {
		return "", err
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// AddInitialUsers legt Default-User an und synchronisiert Partner-Metadaten.
func AddInitialUsers(db *gorm.DB) {
	if !isEnvTrue("SEED_DEFAULT_USERS") {
		log.Println("ℹ️ SEED_DEFAULT_USERS disabled; skipping default user seeding")
		return
	}

	isProduction := strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production")
	syncExisting := isEnvTrue("SEED_SYNC_EXISTING_USERS")
	if isProduction && syncExisting {
		log.Fatal("SEED_SYNC_EXISTING_USERS cannot be enabled in production")
	}

	adminPassword := strings.TrimSpace(os.Getenv("SEED_ADMIN_PASSWORD"))
	advertiserPassword := strings.TrimSpace(os.Getenv("SEED_ADVERTISER_PASSWORD"))
	publisherPassword := strings.TrimSpace(os.Getenv("SEED_PUBLISHER_PASSWORD"))
	if adminPassword == "" || advertiserPassword == "" || publisherPassword == "" {
		log.Println("⚠️ seed passwords not fully configured; skipping default user seeding")
		return
	}

	users := []models.User{
		{
			Name:          "Admin",
			Email:         "admin@mail.de",
			Role:          "admin",
			PasswordHash:  hashOrPanic(adminPassword),
			AuthProvider:  "local",
			EmailVerified: true,
			Company:       "",
		},
		{
			Name:              "NEW Energie",
			Email:             "newenergie@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "NEW Energie",
			CommissionGroupID: 912,
			TriggerID:         6,
		},
		{
			Name:              "eprimo",
			Email:             "eprimo@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "eprimo",
			CommissionGroupID: 394,
			TriggerID:         1,
		},
		{
			Name:              "Ankerkraut",
			Email:             "ankerkraut@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "ankerkraut",
			CommissionGroupID: 681,
			TriggerID:         1,
		},
		{
			Name:              "MAINGAU",
			Email:             "maingau@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "maingau",
			CommissionGroupID: 544,
			TriggerID:         1,
		},
		{
			Name:              "Entega",
			Email:             "entega@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "entega",
			CommissionGroupID: 1122,
			TriggerID:         1,
		},
		{
			Name:              "Enercity",
			Email:             "enercity@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "enercity",
			CommissionGroupID: 1142,
			TriggerID:         1,
		},
		{
			Name:              "Bank of Scotland",
			Email:             "bos@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "bank of scotland",
			CommissionGroupID: 310,
			TriggerID:         1,
		},
		{
			Name:              "Trendtours",
			Email:             "trendtours@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "trendtours",
			CommissionGroupID: 529,
			TriggerID:         1,
		},
		{
			Name:              "Goldgas",
			Email:             "goldgas@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "goldgas",
			CommissionGroupID: 1172,
			TriggerID:         1,
		},
		{
			Name:              "Geld für E-Auto",
			Email:             "geldforauto@advertiser.de",
			Role:              "advertiser",
			PasswordHash:      hashOrPanic(advertiserPassword),
			AuthProvider:      "local",
			EmailVerified:     true,
			Company:           "geld for e-auto",
			CommissionGroupID: 624,
			TriggerID:         1,
		},
		{
			Name:          "Shoop",
			Email:         "shoop@publisher.de",
			Role:          "publisher",
			PasswordHash:  hashOrPanic(publisherPassword),
			AuthProvider:  "local",
			EmailVerified: true,
			Company:       "Shoop",
			ProjectID:     50008,
			PublisherID:   1008,
		},
		{
			Name:          "Tellja",
			Email:         "tellja@publisher.de",
			Role:          "publisher",
			PasswordHash:  hashOrPanic(publisherPassword),
			AuthProvider:  "local",
			EmailVerified: true,
			Company:       "Tellja",
			ProjectID:     5241563,
			PublisherID:   1317,
		},
		{
			Name:          "&Charge",
			Email:         "&charge@publisher.de",
			Role:          "publisher",
			PasswordHash:  hashOrPanic(publisherPassword),
			AuthProvider:  "local",
			EmailVerified: true,
			Company:       "&Charge",
			ProjectID:     3898928,
			PublisherID:   2187,
		},
		{
			Name:          "Trimexa",
			Email:         "trimexa@publisher.de",
			Role:          "publisher",
			PasswordHash:  hashOrPanic(publisherPassword),
			AuthProvider:  "local",
			EmailVerified: true,
			Company:       "Trimexa",
			ProjectID:     232059,
			PublisherID:   1285,
		},
		{
			// Legacy-Publisher bleibt für Rückwärtskompatibilität bestehen.
			Name:          "Publisher",
			Email:         "publisher@email.de",
			Role:          "publisher",
			PasswordHash:  hashOrPanic(publisherPassword),
			AuthProvider:  "local",
			EmailVerified: true,
			Company:       "",
		},
	}
	for _, u := range users {
		var existing models.User
		// Prüfe zuerst, ob der Benutzer bereits existiert
		result := db.Where("email = ?", u.Email).First(&existing)

		if result.Error != nil {
			// Benutzer existiert nicht, erstelle ihn
			if result.Error == gorm.ErrRecordNotFound {
				if err := db.Create(&u).Error; err != nil {
					// Ignoriere "duplicate key" Fehler (kann bei Race Conditions auftreten)
					if !isDuplicateKeyError(err) {
						log.Printf("Fehler beim Anlegen von User %s: %v", u.Email, err)
					}
				} else {
					log.Printf("✓ Benutzer erstellt: %s (%s)", u.Email, u.Role)
				}
			} else {
				log.Printf("Fehler beim Prüfen von User %s: %v", u.Email, result.Error)
			}
		} else if syncExisting {
			// Bestehende User mit Seed-Daten synchronisieren (wichtig für neue Partner-IDs).
			existing.Name = u.Name
			existing.Role = u.Role
			existing.Company = u.Company
			existing.PasswordHash = u.PasswordHash
			existing.AuthProvider = u.AuthProvider
			existing.EmailVerified = u.EmailVerified
			existing.ProjectID = u.ProjectID
			existing.PublisherID = u.PublisherID
			existing.CommissionGroupID = u.CommissionGroupID
			existing.TriggerID = u.TriggerID
			if err := db.Save(&existing).Error; err != nil {
				log.Printf("Fehler beim Aktualisieren von User %s: %v", u.Email, err)
			}
		}
	}

	// Always backfill critical partner metadata for existing seed users.
	// This keeps canonical IDs consistent even when full syncExisting is disabled.
	backfillSeedPartnerMetadata(db)
}

func backfillSeedPartnerMetadata(db *gorm.DB) {
	type partnerMetadata struct {
		Email       string
		ProjectID   uint
		PublisherID uint
	}

	targets := []partnerMetadata{
		{
			Email:       "tellja@publisher.de",
			ProjectID:   5241563,
			PublisherID: 1317,
		},
	}

	for _, target := range targets {
		var user models.User
		if err := db.Where("email = ?", target.Email).First(&user).Error; err != nil {
			if err != gorm.ErrRecordNotFound {
				log.Printf("Fehler beim Laden der Partner-Metadaten für %s: %v", target.Email, err)
			}
			continue
		}

		changed := false
		if target.ProjectID != 0 && user.ProjectID != target.ProjectID {
			user.ProjectID = target.ProjectID
			changed = true
		}
		if target.PublisherID != 0 && user.PublisherID != target.PublisherID {
			user.PublisherID = target.PublisherID
			changed = true
		}
		if !changed {
			continue
		}
		if err := db.Save(&user).Error; err != nil {
			log.Printf("Fehler beim Backfill der Partner-Metadaten für %s: %v", target.Email, err)
			continue
		}
		log.Printf("✓ Partner-Metadaten korrigiert: %s (project_id=%d, publisher_id=%d)", target.Email, user.ProjectID, user.PublisherID)
	}
}

// isDuplicateKeyError prüft, ob es sich um einen "duplicate key" Fehler handelt
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "duplicate key") ||
		strings.Contains(errStr, "23505") ||
		strings.Contains(errStr, "unique constraint")
}

func hashOrPanic(pw string) string {
	hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return string(hash)
}

func getJWTSecret() (string, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return "", errors.New("JWT_SECRET is not configured")
	}
	return secret, nil
}

func isEnvTrue(key string) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

// AuthRequired ist eine Fiber-Middleware, die das JWT prüft
func AuthRequired() fiber.Handler {
	return func(c *fiber.Ctx) error {
		header := c.Get("Authorization")
		if header == "" || len(header) < 8 || header[:7] != "Bearer " {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing or invalid token"})
		}
		tokenStr := header[7:]
		secret, err := getJWTSecret()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Auth service misconfigured"})
		}
		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid or expired token"})
		}

		// **Hier: Claims direkt aus dem Token extrahieren!**
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid user claims"})
		}
		c.Locals("user", claims)
		return c.Next()
	}
}
