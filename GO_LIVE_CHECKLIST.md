# NBA Dashboard - Go-Live Checkliste

Diese Checkliste dient als formaler Release-Gate fuer Produktion.

## 1. Security und Konfiguration

- [ ] `APP_ENV=production`
- [ ] `JWT_SECRET` gesetzt (lang, zufaellig, nicht versioniert)
- [ ] `CORS_ALLOW_ORIGINS` auf echte Frontend-Domain(s) gesetzt
- [ ] `DB_SSLMODE` fuer Produktion korrekt gesetzt (nicht `disable`)
- [ ] `DB_AUTO_MIGRATE=false`
- [ ] keine `.env`-Dateien oder Secrets im Commit
- [ ] Upload-Grenzen gesetzt (`UPLOAD_MAX_BYTES`, Typ-Whitelist)
- [ ] `RATE_LIMIT_ENABLED=true` bewertet und gesetzt

## 2. Build und Qualitaetsgates

- [ ] Frontend: `npm run build` erfolgreich
- [ ] Backend: `go test ./...` erfolgreich
- [ ] Backend: `go vet ./...` erfolgreich
- [ ] Backend: `gofmt -l .` liefert keine Treffer
- [ ] CI Workflow `CI` ist gruen
- [ ] Release Workflow fuer Tag `vX.Y.Z` laeuft erfolgreich

## 3. Datenbank und Migration

- [ ] Migrationsstrategie abgestimmt (Auto-Migrate in Prod aus)
- [ ] Zielschema verifiziert
- [ ] DB Backup vor Deployment erstellt
- [ ] Restore-Pfad dokumentiert

## 4. Deployment

- [ ] Frontend-Artefakt (`dist`) erzeugt und deployt
- [ ] Backend-Binary (`go-backend/app`) erzeugt und deployt
- [ ] Service-Start erfolgreich
- [ ] `/health` ist `ok`
- [ ] `/ready` ist `ready`

## 5. Funktionale Smoke-Tests

- [ ] Login funktioniert
- [ ] Geschuetzter Endpoint mit Token erreichbar
- [ ] Upload eines erlaubten Dateityps funktioniert
- [ ] Upload eines unerlaubten Dateityps wird korrekt abgelehnt
- [ ] Monitoring-Endpunkt liefert Daten (`/api/campaigns/scheduler/monitoring`)

## 6. Operativer Betrieb

- [ ] Logging im gewuenschten Format (`LOG_FORMAT`) aktiv
- [ ] Security-Header aktiv
- [ ] Alerting fuer 5xx/Readiness konfiguriert
- [ ] Oncall/Verantwortliche fuer Go-Live benannt
- [ ] Rollback-Owner benannt

## 7. Abnahme

- [ ] Fachliche Abnahme (Product/Business)
- [ ] Technische Abnahme (Engineering)
- [ ] Go-Live-Freigabe dokumentiert (Datum, Version, Verantwortliche)

---

## Empfohlener Minimalablauf am Go-Live-Tag

1. Pre-Deployment Backup
2. Deployment Frontend + Backend
3. Health/Readiness Check
4. Login- und Kernflow-Smoke-Test
5. 30 Minuten Monitoring mit erhoehter Aufmerksamkeit
6. Freigabe in Betriebsprotokoll vermerken