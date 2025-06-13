# NBA Dashboard

Ein modernes Dashboard für die Verwaltung und Analyse von NBA-Daten, bestehend aus einem React-Frontend und einem Go-Backend.

## 🚀 Features

- **Benutzerauthentifizierung** mit verschiedenen Rollen (Admin, Advertiser)
- **Datei-Upload-System** mit dedizierten Bereichen für Admins und Advertiser
- **Kampagnen-Management** mit dynamischer Auswahl
- **Responsive Design** mit moderner UI/UX
- **Sichere API-Integration** mit zentraler Konfiguration

## 🛠️ Technologie-Stack

### Frontend
- **Framework**: React mit TypeScript
- **Build Tool**: Vite
- **Styling**: 
  - Tailwind CSS
  - shadcn/ui Komponenten
- **State Management**: React Query
- **HTTP Client**: Axios
- **Routing**: React Router

### Backend
- **Framework**: Go mit Fiber
- **Features**:
  - CORS-Unterstützung
  - File Upload Handling
  - Logger Middleware
  - 10MB Upload-Limit

## 📦 Installation

### Voraussetzungen
- Node.js (LTS Version)
- Go 1.24.4 oder höher
- npm oder yarn

### Frontend Setup
```bash
# Repository klonen
git clone <repository-url>

# In das Projektverzeichnis wechseln
cd NBA-Dashboard

# Dependencies installieren
npm install

# Umgebungsvariablen konfigurieren
cp .env.example .env
# .env Datei mit den korrekten Werten anpassen

# Entwicklungsserver starten
npm run dev
```

### Backend Setup
```bash
# In das Backend-Verzeichnis wechseln
cd go-backend

# Go-Module installieren
go mod download

# Server starten
go run cmd/main.go
```

## 🔧 Konfiguration

### Frontend Umgebungsvariablen
```env
VITE_API_BASE_URL=http://localhost:3001/api
```

### Backend Konfiguration
- Port: 3001
- Upload-Verzeichnis: `uploads/`
- CORS: Konfiguriert für `http://localhost:4173`

## 📁 Projektstruktur

### Frontend

## Environment Configuration

### API Configuration
Dieses Projekt ist für den Betrieb unter `nba.uppr.de` konfiguriert und nutzt zentrale API-Aufrufe über Umgebungsvariablen.

**Erforderliche Umgebungsvariablen:**
Kopieren Sie `.env.example` nach `.env` und passen Sie die Werte an:

```bash
cp .env.example .env
```

**Mindestens erforderlich:**
```
VITE_API_BASE_URL=https://netzwerk.uppr.de/api
```

### API Usage
Das Projekt nutzt Axios mit einer zentralen Konfiguration in `src/utils/api.ts`. Alle API-Aufrufe gehen über diese Instanz und nutzen automatisch die `VITE_API_BASE_URL`.

**Dynamische Kampagnen-API:**
- Kampagnen können über die `CampaignSelector`-Komponente ausgewählt werden
- API-Aufrufe werden automatisch mit der gewählten `campaignId` zusammengesetzt
- Beispiel-Endpoint: `/6115e2ebc15bf7cffcf39c56dfce109acc702fe1/admin/{campaignId}/get-orders.json`

### Deployment Configuration
- **Router:** Konfiguriert für `basename="/"` für Hosting unter `nba.uppr.de`
- **Build:** Standard Vite-Build-Prozess
- **Environment:** Produktions-URLs in `.env.production` für verschiedene Deployment-Umgebungen


```

## 🔐 Sicherheit

- Geschützte Routen für Admin- und Advertiser-Bereiche
- Sichere Datei-Upload-Validierung
- CORS-Konfiguration für sichere Cross-Origin-Requests

## 🚀 Deployment

### Frontend
- Build mit `npm run build`
- Statische Dateien in `dist/` Verzeichnis
- Konfiguriert für Hosting unter `nba.uppr.de`

### Backend
- Go-Binary erstellen mit `go build`
- Server auf Port 3001 ausführen
- Upload-Verzeichnis mit korrekten Berechtigungen konfigurieren

## 🤝 Beitragen

1. Fork das Repository
2. Erstelle einen Feature Branch
3. Committe deine Änderungen
4. Push zum Branch
5. Erstelle einen Pull Request

## 📝 Lizenz

desörf

## 👥 Autoren

erwski
