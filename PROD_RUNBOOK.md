# NBA Dashboard - Production Runbook

Dieses Dokument beschreibt den Betrieb in Produktion fuer Frontend und Backend.

## 1. Ziel

- reproduzierbarer Start und Betrieb
- schnelle Fehlerdiagnose
- klarer Incident-Ablauf
- definierter Recovery- und Rollback-Weg

## 2. Betriebsrelevante Komponenten

- Frontend Build-Artefakt: `dist/`
- Backend Binary: `go-backend/app`
- Datenbank: PostgreSQL
- Persistenter Dateispeicher: `go-backend/uploads/`

## 3. Pflicht-Konfiguration (Backend)

Vor Produktionsstart muessen diese Variablen gesetzt sein:

- `APP_ENV=production`
- `PORT`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `DB_SSLMODE` (nicht `disable` in Produktion)
- `JWT_SECRET` (langes, zufaelliges Secret)
- `CORS_ALLOW_ORIGINS` (explizite Frontend-Origin(s))
- `DB_AUTO_MIGRATE=false`

Empfohlen:

- `LOG_FORMAT=json`
- `SECURITY_HEADERS_ENABLED=true`
- `RATE_LIMIT_ENABLED=true`
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS`
- `UPLOAD_MAX_BYTES`, `UPLOAD_ALLOWED_EXTENSIONS`, `UPLOAD_ALLOWED_MIME_TYPES`

## 4. Start-/Stop-Prozedur

### 4.1 Backend Build und Start

```bash
cd go-backend
go test ./...
go build -o app ./cmd
./app
```

### 4.2 Health und Readiness pruefen

```bash
curl -fsS http://localhost:3001/health
curl -fsS http://localhost:3001/ready
```

Erwartung:

- `/health` liefert `{"status":"ok"}`
- `/ready` liefert `{"status":"ready"}`

### 4.3 Graceful Stop

- Prozess mit `SIGTERM` beenden (kein `kill -9`).
- Das Backend fuehrt einen geordneten Shutdown aus.

## 5. Deploy-Flow (empfohlen)

1. CI auf `main` muss gruen sein.
2. Release-Tag `vX.Y.Z` setzen.
3. Release-Workflow erzeugt Artefakte:
   - `frontend-dist`
   - `backend-binary`
4. Artefakte deployen.
5. Smoke-Tests ausfuehren (siehe Abschnitt 6).
6. Monitoring fuer 15-30 Minuten eng beobachten.

## 6. Smoke-Test nach Deployment

### 6.1 API Basis

```bash
curl -fsS https://<api-host>/health
curl -fsS https://<api-host>/ready
```

### 6.2 Login

```bash
curl -fsS -X POST "https://<api-host>/api/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email>","password":"<admin-password>"}'
```

### 6.3 Auth-Endpunkt

- Token aus Login-Antwort nehmen und einen geschuetzten Endpoint abrufen:

```bash
curl -fsS "https://<api-host>/api/uploads" \
  -H "Authorization: Bearer <token>"
```

## 7. Monitoring und Alerts

Mindestens beobachten:

- Prozess lebt (Container/Service up)
- `/health` und `/ready` verfuegbar
- 5xx-Rate
- Login-Fehlerrate
- Antwortzeiten auf Kernendpunkten
- Datenbank-Erreichbarkeit

Alerts (empfohlen):

- Readiness dauerhaft fehlgeschlagen
- starker Anstieg 5xx
- Login-Fehlerquote stark erhoeht
- hoher Anteil 429 (Rate-Limits)

## 8. Incident-Ablauf

1. Incident erfassen (Zeit, Impact, betroffene Endpunkte).
2. Health/Ready pruefen.
3. Letzte Deployments und Konfigurationsaenderungen pruefen.
4. Logs nach `status>=500` und betroffener Route filtern.
5. DB-Verbindung und Latenz pruefen.
6. Entscheidung:
   - Hotfix
   - Rollback auf letzte stabile Version

## 9. Rollback

Rollback-Kriterien:

- reproduzierbare kritische Fehler im Kernfluss
- Fehlerrate bleibt nach kurzer Stabilisierung hoch

Rollback-Schritte:

1. letzte stabile Backend-Binary ausrollen
2. letztes stabiles Frontend-Artefakt ausrollen
3. Services neu starten
4. Smoke-Tests erneut laufen lassen
5. Incident-Dokumentation aktualisieren

## 10. Backup und Restore (Kurzfassung)

- DB-Backups regelmaessig und versioniert
- Restore-Probe in Staging regelmaessig testen
- Upload-Verzeichnis (`go-backend/uploads/`) ebenfalls sichern

## 11. Betriebsregeln

- keine Secrets im Repository
- keine manuellen Schema-Aenderungen ohne Change-Doku
- keine Produktionstests mit echten Kundendaten ohne Freigabe
- jede Stoerung mit kurzer Postmortem-Notiz abschliessen
