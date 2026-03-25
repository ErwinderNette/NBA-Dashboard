#!/bin/bash

# PostgreSQL Setup Script für NBA Dashboard
# Dieses Skript erstellt die Datenbank und den Benutzer

echo "Erstelle Datenbank und Benutzer..."

# Finde PostgreSQL-Binärpfad
PSQL_PATH=""
PG_ISREADY_PATH=""

# Prüfe verschiedene mögliche Pfade
if [ -f "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
    PSQL_PATH="/opt/homebrew/opt/postgresql@15/bin/psql"
    PG_ISREADY_PATH="/opt/homebrew/opt/postgresql@15/bin/pg_isready"
elif [ -f "/usr/local/bin/psql" ]; then
    PSQL_PATH="/usr/local/bin/psql"
    PG_ISREADY_PATH="/usr/local/bin/pg_isready"
elif command -v psql > /dev/null 2>&1; then
    PSQL_PATH=$(command -v psql)
    PG_ISREADY_PATH=$(command -v pg_isready)
else
    echo "FEHLER: PostgreSQL-Tools nicht gefunden!"
    echo "Bitte stelle sicher, dass PostgreSQL installiert ist."
    exit 1
fi

echo "Verwende PostgreSQL von: $PSQL_PATH"

# Prüfe ob PostgreSQL läuft
if lsof -i :5432 > /dev/null 2>&1 || lsof /tmp/.s.PGSQL.5432 > /dev/null 2>&1; then
    echo "✓ PostgreSQL läuft"
else
    echo "FEHLER: PostgreSQL läuft nicht"
    echo "Bitte starte PostgreSQL zuerst (z.B. mit: brew services start postgresql@15)"
    exit 1
fi

# Verwende aktuellen Benutzer (Standard bei Homebrew-Installation)
CURRENT_USER=$(whoami)

echo "Verwende Benutzer: $CURRENT_USER"

# Versuche zuerst Unix-Socket-Verbindung (Standard bei Homebrew)
# Falls das nicht funktioniert, versuche TCP/IP
CONNECTION_ARGS=""
if $PSQL_PATH -U $CURRENT_USER -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    CONNECTION_ARGS="-U $CURRENT_USER"
    echo "Verwende Unix-Socket-Verbindung"
elif $PSQL_PATH -h localhost -p 5432 -U $CURRENT_USER -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    CONNECTION_ARGS="-h localhost -p 5432 -U $CURRENT_USER"
    echo "Verwende TCP/IP-Verbindung"
else
    echo "WARNUNG: Kann keine Verbindung testen, versuche trotzdem..."
    CONNECTION_ARGS="-U $CURRENT_USER"
fi

# Erstelle Benutzer (falls nicht vorhanden)
$PSQL_PATH $CONNECTION_ARGS -d postgres -c "CREATE USER nba_user WITH PASSWORD 'nba_pass';" 2>&1 | grep -v "already exists" | grep -v "^CREATE ROLE" || echo "✓ Benutzer nba_user erstellt oder existiert bereits"

# Erstelle Datenbank (falls nicht vorhanden)
$PSQL_PATH $CONNECTION_ARGS -d postgres -c "CREATE DATABASE nba_dashboard OWNER nba_user;" 2>&1 | grep -v "already exists" | grep -v "^CREATE DATABASE" || echo "✓ Datenbank nba_dashboard erstellt oder existiert bereits"

# Setze Berechtigungen
$PSQL_PATH $CONNECTION_ARGS -d nba_dashboard -c "GRANT ALL PRIVILEGES ON DATABASE nba_dashboard TO nba_user;" 2>&1 | grep -v "ERROR" | grep -v "^GRANT" || echo "✓ Berechtigungen gesetzt"

echo ""
echo "✓ Setup abgeschlossen!"
echo ""
echo "Du kannst jetzt das Backend starten mit:"
echo "  go run cmd/main.go"
