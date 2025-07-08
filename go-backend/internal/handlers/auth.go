package handlers

import (
	"fmt"
	"nba-dashboard/internal/models"
	"os"
	"time"

	"log"

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
	Token string `json:"token"`
	Role  string `json:"role"`
	Name  string `json:"name"`
	Email string `json:"email"`
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
			Token: token,
			Role:  user.Role,
			Name:  user.Name,
			Email: user.Email,
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
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "devsecret" // Fallback für Entwicklung
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// AddInitialUsers legt drei Default-User an, falls sie noch nicht existieren
func AddInitialUsers(db *gorm.DB) {
	users := []models.User{
		{
			Name:         "Admin",
			Email:        "admin@mail.de",
			Role:         "admin",
			PasswordHash: hashOrPanic("admin"),
		},
		{
			Name:         "Advertiser",
			Email:        "advertiser@mail.de",
			Role:         "advertiser",
			PasswordHash: hashOrPanic("4321"),
		},
		{
			Name:         "Publisher",
			Email:        "publisher@email.de",
			Role:         "publisher",
			PasswordHash: hashOrPanic("1234"),
		},
	}
	for _, u := range users {
		var existing models.User
		if err := db.Where("email = ?", u.Email).First(&existing).Error; err == gorm.ErrRecordNotFound {
			if err := db.Create(&u).Error; err != nil {
				log.Printf("Fehler beim Anlegen von User %s: %v", u.Email, err)
			}
		}
	}
}

func hashOrPanic(pw string) string {
	hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return string(hash)
}

// AuthRequired ist eine Fiber-Middleware, die das JWT prüft
func AuthRequired() fiber.Handler {
	return func(c *fiber.Ctx) error {
		header := c.Get("Authorization")
		if header == "" || len(header) < 8 || header[:7] != "Bearer " {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing or invalid token"})
		}
		tokenStr := header[7:]
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			secret = "devsecret"
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
		fmt.Printf("Token Claims: %#v\n", claims)
		c.Locals("user", claims)
		return c.Next()
	}
}
