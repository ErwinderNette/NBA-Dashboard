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

func (v *ValidationService) Validate(rows []map[string]string, orders []ExternalOrder) []models.ValidatedRow {
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
		"2006-01-02 15:04:05",
		"02.01.2006",
		"02.01.2006 15:04",
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
