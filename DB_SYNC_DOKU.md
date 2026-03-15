# NBA Dashboard - Datenbank, Cache, Sync und Monitoring

## 1) Zielbild

Diese Doku beschreibt den Datenbank- und Sync-Flow im `go-backend`:

- Externe Netzwerk-API wird nicht bei jedem Dashboard-Call live angefragt.
- Stattdessen werden Kampagnendaten in der DB zwischengespeichert.
- Validierung nutzt primaer DB-Cache (DB-first), Live-API nur als Fallback.
- Nachbuchungs-CSVs werden versioniert gespeichert.
- Monitoring zeigt Scheduler-Status und Sync-Historie.

## 2) Architektur auf einen Blick

### Komponenten

- API Backend (`go-backend/cmd/main.go`)
- PostgreSQL (Hauptspeicher)
- Scheduler (periodische Kampagnen-Synchronisation)
- Campaign Sync Service (API -> DB Upsert)
- Validation Handler (DB-first-Validierung)
- Monitoring Endpoints (Admin-Ueberblick)

### Hauptfluss

1. Scheduler oder manueller Trigger startet Kampagnen-Sync.
2. Orders aus Netzwerk-API werden in `campaign_orders` upserted.
3. Bei Upload-Validierung werden Upload-Zeilen als Kandidaten gespeichert.
4. Abgleich erfolgt gegen `campaign_orders` (Token/SubID/etc.).
5. Ergebnisse werden als Validierung gespeichert.
6. Monitoring zeigt Zustand und Historie.

## 3) Relevante Tabellen

### 3.1 `campaigns`

Enthaelt Kampagnen-Stammdaten und Sync-Konfiguration.

Wichtige Felder:
- `external_campaign_id` (eindeutige externe Kampagnen-ID)
- `is_active`
- `sync_interval_minutes`
- `last_synced_at`

### 3.2 `campaign_sync_runs`

Historie einzelner Sync-Laeufe.

Wichtige Felder:
- `campaign_id`
- `status` (`running`, `success`, `failed`, ...)
- `request_from`, `request_to`
- `fetched_count`, `upserted_count`
- `error_message`
- `started_at`, `finished_at`

### 3.3 `campaign_orders`

Persistenter Cache der externen Orderdaten.

Wichtige Felder:
- `campaign_id`
- `external_order_id` (globaler Schluessel aus externem Netzwerk)
- `order_token`, `sub_id`
- `event_timestamp`
- `status`, `commission`
- `payload` (JSONB, Original-/Detaildaten)

### 3.4 `upload_order_candidates`

Normalisierte Upload-Zeilen fuer den Abgleich.

Wichtige Felder:
- `upload_id`, `row_no`
- `campaign_external_id`
- `order_token`, `sub_id`
- `timestamp_raw`, `commission`
- `raw_row` (JSONB)

### 3.5 Weitere eingefuehrte Tabellen

- Nachbuchungen / CSV / Audit:
  - `booking_batches`
  - `booking_items`
  - `csv_exports`
  - `outbound_jobs`
  - `audit_events`
- Bestehende Kernlogik:
  - `uploads`
  - `validation_results`
  - `users`

## 4) DB-first Validierung (wichtig)

Beim Endpoint `GET /api/uploads/:id/validate`:

1. Upload wird gelesen.
2. Zeilen werden in `upload_order_candidates` upserted.
3. Kampagne wird geladen/angelegt (`campaigns` via `campaignId`).
4. Falls noetig (stale/leer/force), wird Sync angestossen.
5. Orders werden aus `campaign_orders` geladen.
6. Nur wenn nichts Sinnvolles gefunden wird, kommt Live-API-Fallback.
7. Ergebnis wird in `validation_results` gespeichert.

Nutzen:
- schnellere Antwortzeiten,
- weniger externe API-Abhaengigkeit,
- reproduzierbare Validierungsdaten.

## 5) Scheduler (automatisch)

Der Scheduler laeuft beim Backend-Start und synchronisiert aktive Kampagnen automatisch.

Eigenschaften:
- pollt periodisch,
- verarbeitet nur faellige Kampagnen,
- hat Concurrency-Limit,
- verhindert doppelte Parallel-Syncs je Kampagne,
- nutzt Overlap-Fenster fuer sichere Nachlaeufer.

## 6) Wichtige ENV-Variablen

Allgemein:
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_PORT`
- `JWT_SECRET`

Netzwerk-API:
- `NETWORK_API_BASE_URL`
- optional `NETWORK_API_URL` (Fallback)

Validierung:
- `VALIDATION_DB_CACHE_ENABLED` (Default: an)

Scheduler:
- `CAMPAIGN_SYNC_SCHEDULER_ENABLED` (Default: an)
- `CAMPAIGN_SYNC_POLL_SECONDS` (Default: 60)
- `CAMPAIGN_SYNC_MAX_CONCURRENCY` (Default: 2)
- `CAMPAIGN_SYNC_INITIAL_DELAY_SECONDS` (Default: 10)
- `CAMPAIGN_SYNC_OVERLAP_MINUTES` (Default: 180)

## 7) Endpoints (Bedienung)

### 7.1 Auth

#### `POST /api/login`

Body:

```json
{
  "email": "admin@mail.de",
  "password": "admin"
}
```

Antwort enthaelt JWT `token`.
Fuer Admin-Endpoints immer `Authorization: Bearer <token>` setzen.

### 7.2 Campaign Sync und Monitoring

#### `GET /api/campaigns/scheduler/monitoring`

Admin-Endpoint mit:
- Runtime-Metriken des Schedulers
- DB-Statistiken
- letzte Sync-Runs

#### `GET /api/campaigns/:campaignId/sync-status`

Status einer einzelnen Kampagne:
- stale/aktuell
- letzter Lauf
- Orders Count etc.

#### `POST /api/campaigns/:campaignId/sync-now`

Manueller Sync-Trigger (sofort).

Optional Query:
- `fromDate=YYYY-MM-DD`
- `toDate=YYYY-MM-DD`

Wichtig: `sync-now` ist `POST`, nicht `GET`.

### 7.3 Validierung

#### `GET /api/uploads/:id/validate?campaignId=122`

Startet Validierung DB-first.

Optional:
- `forceRefresh=true` (erzwingt vorherigen Sync)

### 7.4 CSV und Nachbuchungen

#### `POST /api/uploads/:id/bookings/csv`

Persistiert Nachbuchungsdaten und erzeugt versionierte CSV.

#### `GET /api/bookings/csv-exports/:exportId/download`

Laedt CSV-Export-Datei.

## 8) Postman Schnellablauf

1. Environment anlegen:
   - `baseUrl = http://localhost:3001`
   - `token` leer
2. Login senden (`POST /api/login`)
3. Token in Environment speichern (Tests-Script)
4. Monitoring testen (`GET /api/campaigns/scheduler/monitoring`)
5. Sync manuell triggern (`POST /api/campaigns/122/sync-now`)
6. Monitoring und `sync-status` erneut pruefen

## 9) Monitoring-Ausgabe richtig lesen

Beispiel-Interpretation:

- `enabled: true`: Scheduler laeuft.
- `lastTickAt` gesetzt: Scheduler tickt regelmaessig.
- `activeCampaigns: 0`: keine aktiven Kampagnen vorhanden -> keine Sync-Versuche.
- `totalSyncAttempts > 0`, `runsSuccess > 0`: Syncs laufen erfolgreich.
- `lastError` gesetzt oder `runsFailed > 0`: Fehlerbild analysieren.

## 10) Haeufige Fehler und Loesung

### `404 Cannot GET /api/...`

- Route im laufenden Prozess nicht geladen.
- Backend neu starten.

### `401 Missing or invalid token`

- Kein Bearer-Token oder Token nicht aufgeloest.
- In Postman `{{token}}` pruefen (Quick Look).

### `401 Invalid or expired token`

- Token abgelaufen oder `JWT_SECRET` mismatch.
- Neu einloggen.

### `403`

- Token hat keine Admin-Rolle.

### `405 Method Not Allowed` bei `/sync-now`

- Falsche Methode.
- Muss `POST` sein.

## 11) Betriebscheckliste (Runbook)

Taeglich oder bei Problemen:

1. `GET /api/campaigns/scheduler/monitoring`
2. Pruefen:
   - `enabled == true`
   - `lastTickAt` aktuell
   - `runsFailed` nicht steigend
3. Fuer betroffene Kampagne:
   - `GET /api/campaigns/:id/sync-status`
4. Bei Bedarf:
   - `POST /api/campaigns/:id/sync-now`
5. Danach Monitoring erneut pruefen.

## 12) Ergebnis

Mit diesem Setup ist der Datenfluss:

- stabiler,
- schneller im Dashboard,
- weniger abhaengig von Live-API,
- nachvollziehbar ueber Monitoring und Sync-Historie.
