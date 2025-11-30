package lib

import "strings"

// FindHeaderRow findet die plausible Header-Zeile (robust gegen Titelzeilen).
func FindHeaderRow(data [][]string, expected []string) int {
	expectedSet := map[string]struct{}{}
	for _, e := range expected {
		expectedSet[strings.TrimSpace(e)] = struct{}{}
	}

	bestIdx := 0
	bestHits := 0

	for i, row := range data {
		hits := 0
		for _, cell := range row {
			c := strings.TrimSpace(cell)
			if _, ok := expectedSet[c]; ok {
				hits++
			}
		}
		if hits > bestHits {
			bestHits = hits
			bestIdx = i
		}
	}

	return bestIdx
}

// TableToMaps baut aus [][]string + headerIndex -> []map[col]val
func TableToMaps(data [][]string, headerIndex int) []map[string]string {
	if len(data) == 0 || headerIndex >= len(data) {
		return nil
	}

	header := data[headerIndex]
	out := make([]map[string]string, 0, len(data)-headerIndex-1)

	for i := headerIndex + 1; i < len(data); i++ {
		row := data[i]
		m := map[string]string{}

		for j, col := range header {
			col = strings.TrimSpace(col)
			if col == "" {
				continue
			}
			val := ""
			if j < len(row) {
				val = strings.TrimSpace(row[j])
			}
			m[col] = val
		}
		out = append(out, m)
	}

	return out
}
