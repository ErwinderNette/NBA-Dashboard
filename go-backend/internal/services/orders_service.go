package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type ExternalOrder struct {
	OrderToken string `json:"ordertoken"`
	SubID      string `json:"subid"`
	Timestamp  string `json:"timestamp"`
	Status     int    `json:"status"` // Status: 0=offen, 1=bestätigt, 2=storniert, 3=ausgezahlt
}

type ordersCacheEntry struct {
	orders []ExternalOrder
	expiry time.Time
}

type OrdersService struct {
	apiURL string
	client *http.Client

	mu    sync.Mutex
	cache ordersCacheEntry
	ttl   time.Duration
}

func NewOrdersService(apiURL string) *OrdersService {
	return &OrdersService{
		apiURL: apiURL,
		// ✅ mehr Zeit geben – API kann groß sein
		client: &http.Client{Timeout: 60 * time.Second},
		ttl:    5 * time.Minute,
	}
}

func (s *OrdersService) GetOrders(ctx context.Context) ([]ExternalOrder, error) {
	if s.apiURL == "" {
		return nil, fmt.Errorf("apiURL empty")
	}

	// Cache hit?
	s.mu.Lock()
	if time.Now().Before(s.cache.expiry) && s.cache.orders != nil {
		orders := s.cache.orders
		s.mu.Unlock()
		log.Println("✅ OrdersService Cache hit:", len(orders))
		return orders, nil
	}
	s.mu.Unlock()

	var lastErr error

	// ✅ Retry bei unvollständigem JSON
	for attempt := 1; attempt <= 2; attempt++ {
		log.Printf("🌍 Hole Orders aus API (Attempt %d): %s\n", attempt, s.apiURL)

		req, err := http.NewRequestWithContext(ctx, "GET", s.apiURL, nil)
		if err != nil {
			lastErr = err
			continue
		}

		// ✅ Browser-ähnliche Header + gzip aus
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Accept-Encoding", "identity") // <-- wichtig gegen abgeschnittenes gzip/chunking
		req.Header.Set("Connection", "close")

		resp, err := s.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		bodyBytes, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if err != nil {
			lastErr = fmt.Errorf("read body error: %w", err)
			continue
		}

		log.Println("🌍 API Status:", resp.StatusCode, "BodyBytes:", len(bodyBytes))

		if resp.StatusCode >= 300 {
			preview := string(bodyBytes)
			if len(preview) > 300 {
				preview = preview[:300]
			}
			return nil, fmt.Errorf("network api status %d | body: %s", resp.StatusCode, preview)
		}

		var raw any
		if err := json.Unmarshal(bodyBytes, &raw); err != nil {
			lastErr = fmt.Errorf("json parse error: %w", err)

			// nur bei EOF nochmal versuchen
			if strings.Contains(err.Error(), "unexpected end of JSON input") ||
				strings.Contains(err.Error(), "unexpected EOF") {
				log.Println("⚠️ JSON war unvollständig – retry…")
				continue
			}
			return nil, lastErr
		}

		orders := extractOrdersDeep(raw)
		log.Println("✅ Orders extrahiert:", len(orders))

		// Cache speichern
		s.mu.Lock()
		s.cache = ordersCacheEntry{orders: orders, expiry: time.Now().Add(s.ttl)}
		s.mu.Unlock()

		return orders, nil
	}

	return nil, lastErr
}

// rekursiv durchs JSON laufen
func extractOrdersDeep(v any) []ExternalOrder {
	out := []ExternalOrder{}

	var walk func(any)
	walk = func(x any) {
		switch t := x.(type) {
		case []any:
			for _, it := range t {
				walk(it)
			}
		case map[string]any:
			o := mapToOrderLoose(t)
			if o.OrderToken != "" || o.SubID != "" || o.Timestamp != "" {
				out = append(out, o)
			}
			for _, val := range t {
				walk(val)
			}
		}
	}

	walk(v)
	return dedupeOrders(out)
}

func mapToOrderLoose(m map[string]any) ExternalOrder {
	get := func(keys ...string) string {
		for _, k := range keys {
			if v, ok := m[k]; ok && v != nil {
				s := strings.TrimSpace(fmt.Sprint(v))
				if s != "" && s != "<nil>" {
					return s
				}
			}
		}
		return ""
	}

	getInt := func(keys ...string) int {
		for _, k := range keys {
			if v, ok := m[k]; ok && v != nil {
				// Versuche verschiedene Typen zu konvertieren
				switch val := v.(type) {
				case int:
					return val
				case float64:
					return int(val)
				case string:
					if i, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
						return i
					}
				}
			}
		}
		return -1 // -1 bedeutet "nicht gefunden"
	}

	orderToken := get("ordertoken", "orderToken", "order_token", "orderid", "orderId")
	subID := get("subid", "subId", "sub_id")
	timestamp := get("timestamp", "time", "created_at", "createdAt")
	status := getInt("status")

	// Debug: Log wenn Status gefunden wird
	if status >= 0 && orderToken != "" {
		log.Printf("🔍 OrderToken '%s' - Status extrahiert: %d", orderToken, status)
	}

	return ExternalOrder{
		OrderToken: orderToken,
		SubID:      subID,
		Timestamp:  timestamp,
		Status:     status,
	}
}

func dedupeOrders(in []ExternalOrder) []ExternalOrder {
	seen := map[string]struct{}{}
	out := []ExternalOrder{}
	for _, o := range in {
		key := o.OrderToken + "|" + o.SubID + "|" + o.Timestamp
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, o)
	}
	return out
}
