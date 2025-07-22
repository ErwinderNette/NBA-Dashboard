# NBA Dashboard

Ein modernes Dashboard für die Verwaltung und Analyse von NBA-Daten, bestehend aus einem React-Frontend und einem Go-Backend.

---

## 🚀 Features

- **Benutzerauthentifizierung** mit verschiedenen Rollen (Admin, Advertiser)
- **Datei-Upload-System** mit dedizierten Bereichen für Admins und Advertiser
- **Kampagnen-Management** mit dynamischer Auswahl
- **Responsive Design** mit moderner UI/UX
- **Sichere API-Integration** mit zentraler Konfiguration

---

## 🛠️ Technologie-Stack

**Frontend:**  
- React (TypeScript), Vite, Tailwind CSS, shadcn/ui, React Query, Axios, React Router

**Backend:**  
- Go (Fiber), CORS, File Upload, Logger Middleware

---

## 📁 Projektstruktur

```plaintext
NBA-Dashboard/
│
├── go-backend/         # Go-Backend: API, Auth, Uploads, Datenbank
│   ├── cmd/            # Einstiegspunkt für den Go-Server
│   ├── internal/
│   │   ├── config/     # Konfiguration (z.B. Datenbank)
│   │   ├── handlers/   # HTTP-Handler (z.B. Authentifizierung)
│   │   └── models/     # Datenmodelle (User, Uploads)
│   ├── uploads/        # Upload-Verzeichnis für Dateien
│   ├── go.mod, go.sum  # Go-Abhängigkeiten
│
├── public/             # Statische Dateien (Bilder, Icons, robots.txt)
│   └── lovable-uploads/# Öffentlich zugängliche Uploads
│
├── src/                # React-Frontend
│   ├── components/     # Wiederverwendbare UI-Komponenten
│   ├── hooks/          # Eigene React-Hooks
│   ├── lib/            # Hilfsfunktionen
│   ├── pages/          # Seiten (Dashboard, Login, etc.)
│   ├── services/       # API- und Service-Logik
│   ├── types/          # TypeScript-Typdefinitionen
│   ├── utils/          # Weitere Hilfsfunktionen
│   ├── App.tsx, main.tsx # Einstiegspunkte
│   └── index.css, App.css # Stylesheets
│
├── docker-compose.yml  # Container-Orchestrierung
├── tailwind.config.ts  # Tailwind CSS Konfiguration
├── package.json        # Node.js Abhängigkeiten & Skripte
├── README.md           # Diese Datei
└── ...                 # Weitere Konfigurationsdateien
```

---

## ⚙️ Installation & Setup

### Voraussetzungen
- Node.js (LTS)
- Go 1.24.4+
- npm oder yarn

### Frontend
```bash
git clone <repository-url>
cd NBA-Dashboard
npm install
cp .env.example .env
# .env anpassen
npm run dev
```

### Backend
```bash
cd go-backend
go mod download
go run cmd/main.go
```

---

## 🔧 Konfiguration

**Frontend:**  
.env → VITE_API_BASE_URL=http://localhost:3001/api

**Backend:**  
- Port: 3001
- Upload-Verzeichnis: uploads/
- CORS: http://localhost:4173

---

## 🔐 Sicherheit

- Geschützte Routen für Admin/Advertiser
- Sichere Datei-Uploads
- CORS-Konfiguration

---

## 🚀 Deployment

**Frontend:**  
npm run build → dist/ für Hosting

**Backend:**  
go build → Binary auf Server, Port 3001

---

## 🤝 Beitragen

1. Fork das Repository
2. Feature Branch erstellen
3. Änderungen committen
4. Pushen
5. Pull Request

---

## 📝 Lizenz

uppr GmbH
desörf

---

## 👥 Autoren

erwski

---
