package lib

import (
	"encoding/csv"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/xuri/excelize/v2"
)

// ReadUploadAsTable liest CSV/XLSX und gibt [][]string zurück.
func ReadUploadAsTable(path string) ([][]string, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".csv":
		return readCSV(path)
	case ".xlsx", ".xls":
		return readExcel(path)
	default:
		return nil, errors.New("unsupported file type")
	}
}

// WriteUploadTable schreibt [][]string zurück in CSV/XLSX (überschreibt Datei).
func WriteUploadTable(path string, data [][]string) error {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".csv":
		return writeCSV(path, data)
	case ".xlsx", ".xls":
		return writeExcel(path, data)
	default:
		return errors.New("unsupported file type")
	}
}

func readCSV(filePath string) ([][]string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	// zuerst Semikolon
	reader.Comma = ';'
	data, err := reader.ReadAll()

	// fallback auf Komma
	if err != nil || (len(data) > 0 && len(data[0]) == 1 && strings.Contains(data[0][0], ",")) {
		file.Close()
		file, err = os.Open(filePath)
		if err != nil {
			return nil, err
		}
		defer file.Close()

		reader = csv.NewReader(file)
		reader.LazyQuotes = true
		reader.TrimLeadingSpace = true
		reader.Comma = ','
		data, err = reader.ReadAll()
	}

	return data, err
}

func writeCSV(filePath string, data [][]string) error {
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	writer.Comma = ';' // deutsches Standardformat
	defer writer.Flush()

	return writer.WriteAll(data)
}

func readExcel(filePath string) ([][]string, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	return f.GetRows(sheetName)
}

func writeExcel(filePath string, data [][]string) error {
	f := excelize.NewFile()
	defer f.Close()

	sheetName := "Sheet1"
	for i, row := range data {
		for j, cell := range row {
			cellName, _ := excelize.CoordinatesToCellName(j+1, i+1)
			f.SetCellValue(sheetName, cellName, cell)
		}
	}
	return f.SaveAs(filePath)
}
