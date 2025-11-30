package models

type CellStatus string

const (
	CellOK      CellStatus = "ok"
	CellInvalid CellStatus = "invalid"
	CellEmpty   CellStatus = "empty"
)

type ValidatedCell struct {
	Value  string     `json:"value"`
	Status CellStatus `json:"status"`
	Note   string     `json:"note,omitempty"`
}

type ValidatedRow struct {
	Index   int                      `json:"index"`
	Cells   map[string]ValidatedCell `json:"cells"`
	RemarkO string                   `json:"remarkO"`
	RemarkP string                   `json:"remarkP"`
}
