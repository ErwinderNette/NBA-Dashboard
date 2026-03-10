package services

import (
	"fmt"
	"log"
	"strings"
	"time"

	"nba-dashboard/internal/models"
)

type ValidationService struct{}

func NewValidationService() *ValidationService { return &ValidationService{} }

type ValidationContext struct {
	CampaignID        string
	ProjectID         string
	PublisherID       string
	CommissionGroupID string
	TriggerID         string
}

var Pflichtfelder = []string{
	"Publisher ID",
	"Vollständiger Name des Endkunden",
	"Adresse des Endkunden",
	"E-Mailadresse des Endkunden",
	"Grund der Anfrage",
	"Timestamp",
	"SubID",
	"Ordertoken/OrderID",
}

func (v *ValidationService) Validate(rows []map[string]string, orders []ExternalOrder, ctx ValidationContext) []models.ValidatedRow {
	ordersByToken := map[string]ExternalOrder{} // Jetzt mit vollständigem ExternalOrder
	subidSet := map[string]struct{}{}

	for _, o := range orders {
		if o.OrderToken != "" {
			token := strings.TrimSpace(o.OrderToken)
			ordersByToken[token] = o // Speichere das komplette Order-Objekt
		}
		if o.SubID != "" {
			subidSet[o.SubID] = struct{}{}
		}
	}
	log.Printf("📊 Total Orders: %d, OrderTokens in Map: %d", len(orders), len(ordersByToken))
	log.Printf("📊 CSV Rows zu verarbeiten: %d", len(rows))

	out := make([]models.ValidatedRow, 0, len(rows))

	for i, r := range rows {
		// Debug: Log am Anfang jeder Zeile
		if i < 3 {
			log.Printf("🔍 Verarbeite Row %d (insgesamt %d Zeilen)", i, len(rows))
		}

		cells := map[string]models.ValidatedCell{}
		remarkO, remarkP := "", ""

		// Debug: Log ALL columns for first row to see what's available
		if i == 0 {
			allCols := []string{}
			for k, v := range r {
				allCols = append(allCols, fmt.Sprintf("'%s'='%s'", k, v))
			}
			log.Printf("🔍 Row 0 - ALLE Spalten: %v", allCols)
		}

		// Debug: Log available columns for first 3 rows
		if i < 3 {
			orderCols := []string{}
			for k := range r {
				if strings.Contains(strings.ToLower(k), "order") {
					orderCols = append(orderCols, fmt.Sprintf("'%s'='%s'", k, r[k]))
				}
			}
			log.Printf("🔍 Row %d - Order-Spalten gefunden: %v", i, orderCols)
		}

		for _, col := range Pflichtfelder {
			val := strings.TrimSpace(r[col])
			cell := models.ValidatedCell{Value: val, Status: models.CellOK}

			if val == "" {
				cell.Status = models.CellEmpty
			}

			switch col {
			case "Ordertoken/OrderID":
				// Prüfe ALLE Spaltenvarianten, die "order" im Namen haben
				// Sammle alle möglichen Ordertoken-Werte aus allen relevanten Spalten
				orderTokenCandidates := []string{}

				// Prüfe Standard-Spalte
				if val != "" {
					orderTokenCandidates = append(orderTokenCandidates, val)
				}

				// Prüfe alternative Spaltennamen
				if altVal := strings.TrimSpace(r["Ordertoken/Order ID"]); altVal != "" {
					orderTokenCandidates = append(orderTokenCandidates, altVal)
				}

				// Prüfe ALLE Spalten, die "order" im Namen haben (case-insensitive)
				for colName, colValue := range r {
					colNameLower := strings.ToLower(colName)
					if strings.Contains(colNameLower, "order") &&
						colName != "Ordertoken/OrderID" &&
						colName != "Ordertoken/Order ID" {
						if trimmedVal := strings.TrimSpace(colValue); trimmedVal != "" {
							orderTokenCandidates = append(orderTokenCandidates, trimmedVal)
							// Debug: Log wenn zusätzliche Spalte gefunden wird
							if i < 10 {
								log.Printf("🔍 Row %d - Zusätzliche Order-Spalte gefunden: '%s'='%s'", i, colName, trimmedVal)
							}
						}
					}
				}

				// Verwende den ersten Wert, der in der API gefunden wird
				orderTokenVal := ""
				foundInAPI := false
				for _, candidate := range orderTokenCandidates {
					candidate = strings.TrimSpace(candidate)
					if candidate == "" {
						continue
					}
					if _, ok := ordersByToken[candidate]; ok {
						orderTokenVal = candidate
						foundInAPI = true
						// Debug
						if i < 10 {
							log.Printf("✅ Row %d - OrderToken GEFUNDEN in API: '%s'", i, candidate)
						}
						break
					}
					// Falls noch kein Wert gesetzt wurde, verwende den ersten Kandidaten
					if orderTokenVal == "" {
						orderTokenVal = candidate
					}
				}

				// Debug für ALLE Zeilen mit Werten
				if orderTokenVal != "" && i < 10 {
					if !foundInAPI {
						log.Printf("❌ Row %d - OrderToken NICHT gefunden in API: '%s'", i, orderTokenVal)
					}
				}

				if orderTokenVal == "" {
					cell.Status = models.CellEmpty
					cell.Value = ""
				} else if foundInAPI {
					cell.Value = orderTokenVal
					cell.Status = models.CellOK
					remarkO = "Bereits im Netzwerk"
					remarkP = "weitere Bearbeitung folgt nach Feedback vom Advertiser"
					// Debug: Log was zurückgegeben wird
					if i < 5 {
						log.Printf("🔍 Row %d - Cell zurückgegeben: Value='%s', Status='%s'", i, cell.Value, cell.Status)
					}
				} else {
					cell.Value = orderTokenVal
					cell.Status = models.CellInvalid
					// Debug: Log was zurückgegeben wird
					if i < 5 {
						log.Printf("🔍 Row %d - Cell zurückgegeben: Value='%s', Status='%s'", i, cell.Value, cell.Status)
					}
				}

			case "SubID":
				if val == "" {
					cell.Status = models.CellEmpty
				} else if _, ok := subidSet[val]; ok {
					cell.Status = models.CellOK
					remarkO = "Bereits im Netzwerk"
					remarkP = "weitere Bearbeitung folgt nach Feedback vom Advertiser"
				} else {
					cell.Status = models.CellInvalid
				}

			case "Timestamp":
				if val == "" {
					cell.Status = models.CellEmpty
				} else if !looksLikeDate(val) {
					cell.Status = models.CellInvalid
					cell.Note = "Timestamp nicht lesbar"
				}

				// optionaler Netzwerk-Timestamp-Abgleich, falls Ordertoken existiert
				// Prüfe auch alternative Spaltennamen für Ordertoken (bereits getrimmt)
				tok := strings.TrimSpace(r["Ordertoken/OrderID"])
				if tok == "" {
					if altVal := strings.TrimSpace(r["Ordertoken/Order ID"]); altVal != "" {
						tok = altVal
					}
				}

				if tok != "" {
					if o, ok := ordersByToken[tok]; ok && o.Timestamp != "" {
						if !sameDay(val, o.Timestamp) {
							cell.Status = models.CellInvalid
							cell.Note = "Timestamp passt nicht zum Netzwerk"
						}
					}
				}
			}

			cells[col] = cell
		}

		// Status aus API in Spalte "Status in der uppr Performance Platform" eintragen
		statusColName := "Status in der uppr Performance Platform"
		commissionColName := "Commission aus Netzwerk"

		// Finde das OrderToken für diese Zeile
		// Zuerst aus der bereits validierten Zelle (falls vorhanden)
		orderTokenForStatus := ""
		if orderTokenCell, ok := cells["Ordertoken/OrderID"]; ok && orderTokenCell.Value != "" {
			orderTokenForStatus = orderTokenCell.Value
		}

		// Falls nicht gefunden, hole es direkt aus der CSV-Zeile
		if orderTokenForStatus == "" {
			// Prüfe Standard-Spalte
			if val := strings.TrimSpace(r["Ordertoken/OrderID"]); val != "" {
				if _, ok := ordersByToken[val]; ok {
					orderTokenForStatus = val
				}
			}
		}

		// Falls immer noch nicht gefunden, prüfe alternative Spaltennamen
		if orderTokenForStatus == "" {
			// Prüfe alle Order-Spalten in der CSV
			for colName, colValue := range r {
				colNameLower := strings.ToLower(colName)
				if strings.Contains(colNameLower, "order") {
					if trimmedVal := strings.TrimSpace(colValue); trimmedVal != "" {
						if _, ok := ordersByToken[trimmedVal]; ok {
							orderTokenForStatus = trimmedVal
							break
						}
					}
				}
			}
		}

		// Debug: Log was gefunden wurde
		if i < 5 {
			log.Printf("🔍 Row %d - OrderToken für Status: '%s'", i, orderTokenForStatus)
		}

		// Wenn OrderToken gefunden wurde, hole den Status aus der API
		if orderTokenForStatus != "" {
			if order, ok := ordersByToken[orderTokenForStatus]; ok {
				// Debug
				if i < 5 {
					log.Printf("🔍 Row %d - Order gefunden, Status: %d", i, order.Status)
				}
				if order.Status >= 0 {
					statusText := mapStatusToText(order.Status)
					if statusText != "" {
						cells[statusColName] = models.ValidatedCell{
							Value:  statusText,
							Status: models.CellOK,
						}
						// Debug
						if i < 5 {
							log.Printf("✅ Row %d - Status eingetragen: '%s' (Status: %d)", i, statusText, order.Status)
						}
					} else {
						// Debug
						if i < 5 {
							log.Printf("❌ Row %d - Status-Text ist leer für Status: %d", i, order.Status)
						}
					}
				} else {
					// Debug
					if i < 5 {
						log.Printf("❌ Row %d - Order.Status ist negativ: %d", i, order.Status)
					}
				}

				// Commission API-first bereitstellen (für CSV-Export-Fallbacklogik im Admin-Flow)
				if strings.TrimSpace(order.Commission) != "" {
					cells[commissionColName] = models.ValidatedCell{
						Value:  normalizeCommission(order.Commission),
						Status: models.CellOK,
					}
				}
			} else {
				// Debug
				if i < 5 {
					log.Printf("❌ Row %d - OrderToken nicht in ordersByToken gefunden: '%s'", i, orderTokenForStatus)
				}
			}
		} else {
			// Debug
			if i < 5 {
				log.Printf("❌ Row %d - Kein OrderToken gefunden für Status", i)
			}
		}

		// Fallback: Wenn keine Orders von der API (orders leer), Status aus CSV-Text ableiten
		// (z. B. "Vollständiger Name" enthält "Offen", "Storniert", "Ausgezahlt", "Bestätigt")
		if _, hasStatus := cells[statusColName]; !hasStatus && len(orders) == 0 {
			inferred := inferStatusFromRow(r)
			if inferred != "" {
				cells[statusColName] = models.ValidatedCell{
					Value:  inferred,
					Status: models.CellOK,
				}
			}
		}

		// Commission-Fallback für Zeilen ohne direkten Order-Match:
		// Nutzt API-first aus passenden Orders nach Partner-Parametern und Timestamp pro Zeile.
		inferredCommission := inferCommissionForRow(r, orders, ctx)
		if _, hasCommission := cells[commissionColName]; !hasCommission && inferredCommission != "" {
			cells[commissionColName] = models.ValidatedCell{
				Value:  inferredCommission,
				Status: models.CellOK,
				Note:   "inferred from network (row-based)",
			}
		}

		// Debug: Prüfe ob Status in cells ist
		if i < 5 {
			if statusCell, ok := cells[statusColName]; ok {
				log.Printf("✅ Row %d - Status in cells gefunden: '%s'", i, statusCell.Value)
			} else {
				keys := make([]string, 0, len(cells))
				for k := range cells {
					keys = append(keys, k)
				}
				log.Printf("❌ Row %d - Status NICHT in cells gefunden! Verfügbare Keys: %v", i, keys)
			}
		}

		out = append(out, models.ValidatedRow{
			Index:   i,
			Cells:   cells,
			RemarkO: remarkO,
			RemarkP: remarkP,
		})
	}

	return out
}

func normalizeCommission(raw string) string {
	value := strings.TrimSpace(raw)
	value = strings.ReplaceAll(value, ",", ".")
	return value
}

func inferCommissionForRow(row map[string]string, orders []ExternalOrder, ctx ValidationContext) string {
	if len(orders) == 0 {
		return ""
	}

	matchesContext := func(o ExternalOrder, strict bool) bool {
		if strict {
			if ctx.PublisherID != "" && strings.TrimSpace(o.PublisherID) != strings.TrimSpace(ctx.PublisherID) {
				return false
			}
			if ctx.ProjectID != "" && strings.TrimSpace(o.ProjectID) != strings.TrimSpace(ctx.ProjectID) {
				return false
			}
			if ctx.CommissionGroupID != "" && strings.TrimSpace(o.CommissionGroupID) != strings.TrimSpace(ctx.CommissionGroupID) {
				return false
			}
			if ctx.TriggerID != "" && strings.TrimSpace(o.TriggerID) != strings.TrimSpace(ctx.TriggerID) {
				return false
			}
			if ctx.CampaignID != "" && strings.TrimSpace(o.CampaignID) != strings.TrimSpace(ctx.CampaignID) {
				return false
			}
			return true
		}

		// Relaxed match: publisher/project/campaign priorisieren (trigger/commissionGroup optional)
		if ctx.PublisherID != "" && strings.TrimSpace(o.PublisherID) != strings.TrimSpace(ctx.PublisherID) {
			return false
		}
		if ctx.ProjectID != "" && strings.TrimSpace(o.ProjectID) != strings.TrimSpace(ctx.ProjectID) {
			return false
		}
		if ctx.CampaignID != "" && strings.TrimSpace(o.CampaignID) != strings.TrimSpace(ctx.CampaignID) {
			return false
		}
		return true
	}

	collect := func(strict bool) []ExternalOrder {
		candidates := []ExternalOrder{}
		for _, o := range orders {
			commission := normalizeCommission(o.Commission)
			if commission == "" {
				continue
			}
			if !matchesContext(o, strict) {
				continue
			}
			candidates = append(candidates, o)
		}
		return candidates
	}

	candidates := collect(true)
	if len(candidates) == 0 {
		candidates = collect(false)
	}
	if len(candidates) == 0 {
		// Letzter Fallback: alle Orders mit Commission
		for _, o := range orders {
			if normalizeCommission(o.Commission) != "" {
				candidates = append(candidates, o)
			}
		}
	}
	if len(candidates) == 0 {
		return ""
	}

	// 1) Exaktes SubID-Match hat Vorrang
	rowSubID := strings.TrimSpace(row["SubID"])
	if rowSubID != "" {
		for _, o := range candidates {
			if strings.TrimSpace(o.SubID) == rowSubID {
				return normalizeCommission(o.Commission)
			}
		}
	}

	// 2) Timestamp-nahes Matching
	rowTs, rowTsErr := parseFlexibleTime(strings.TrimSpace(row["Timestamp"]))
	if rowTsErr == nil {
		var best *ExternalOrder
		var bestDiff time.Duration
		for i := range candidates {
			o := candidates[i]
			orderTs, err := parseFlexibleTime(strings.TrimSpace(o.Timestamp))
			if err != nil {
				continue
			}
			diff := rowTs.Sub(orderTs)
			if diff < 0 {
				diff = -diff
			}
			// Nur in sinnvollem Zeitfenster berücksichtigen (+/- 14 Tage)
			if diff > (14 * 24 * time.Hour) {
				continue
			}
			if best == nil || diff < bestDiff {
				best = &o
				bestDiff = diff
			}
		}
		if best != nil {
			return normalizeCommission(best.Commission)
		}
	}

	// 3) Fallback: häufigste Commission innerhalb der Kandidaten
	type bucket struct {
		count int
	}
	counts := map[string]bucket{}
	for _, o := range candidates {
		commission := normalizeCommission(o.Commission)
		if commission == "" {
			continue
		}
		b := counts[commission]
		b.count++
		counts[commission] = b
	}
	best := ""
	bestCount := -1
	for c, b := range counts {
		if b.count > bestCount {
			bestCount = b.count
			best = c
		}
	}
	return best
}

// helpers
func looksLikeDate(s string) bool {
	_, err := parseFlexibleTime(s)
	return err == nil
}

func sameDay(a, b string) bool {
	ta, err1 := parseFlexibleTime(a)
	tb, err2 := parseFlexibleTime(b)
	if err1 != nil || err2 != nil {
		return false
	}
	y1, m1, d1 := ta.Date()
	y2, m2, d2 := tb.Date()
	return y1 == y2 && m1 == m2 && d1 == d2
}

func parseFlexibleTime(s string) (time.Time, error) {
	layouts := []string{
		time.RFC3339,
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05",
		"02.01.2006",
		"02.01.2006 15:04",
		"02/01/06",
		"02/01/06 15:04",
		"02/01/2006 15:04",
		"01/02/2006",
	}
	s = strings.TrimSpace(s)
	for _, l := range layouts {
		if t, err := time.Parse(l, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized time format: %s", s)
}

// Status-Mapping Funktion
func mapStatusToText(status int) string {
	switch status {
	case 0:
		return "offen"
	case 1:
		return "bestätigt"
	case 2:
		return "storniert"
	case 3:
		return "ausgezahlt"
	default:
		return ""
	}
}

// inferStatusFromRow leitet aus CSV-Zelltext einen Status ab (Fallback wenn API 0 Orders liefert).
// Sucht in "Vollständiger Name des Endkunden" und allen Zellen nach Stichwörtern.
func inferStatusFromRow(r map[string]string) string {
	nameCol := "Vollständiger Name des Endkunden"
	combined := strings.TrimSpace(r[nameCol])
	for _, v := range r {
		combined += " " + strings.TrimSpace(v)
	}
	lower := strings.ToLower(combined)
	if strings.Contains(lower, "ausgezahlt") {
		return "ausgezahlt"
	}
	if strings.Contains(lower, "storniert") {
		return "storniert"
	}
	if strings.Contains(lower, "bestätigt") {
		return "bestätigt"
	}
	if strings.Contains(lower, "offen") {
		return "offen"
	}
	return ""
}
