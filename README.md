# Dark Ages

Rundenbasiertes Strategie-Spiel mit Server-basiertem Multiplayer.

## Stack

- **Frontend**: Vanilla JS + Canvas, kein Framework, kein Build-Step
- **Backend**: Node.js + Express
- **Datenbank**: PostgreSQL
- **Notifications**: Web Push (VAPID)
- **Email-Versand**: Nodemailer (externer SMTP, z. B. Brevo Free)

---

## Setup (einmalig)

### 1. Voraussetzungen auf dem Server
- Node.js ≥ 18
- PostgreSQL ≥ 13
- HTTPS (Let's Encrypt via Caddy oder nginx) — nötig für Web Push

```bash
# PostgreSQL-Datenbank anlegen
createdb darkages
```

### 2. Server-Dependencies installieren
```bash
cd server
npm install
```

### 3. VAPID-Keys generieren (für Push-Notifications)
```bash
npx web-push generate-vapid-keys
# → Public Key + Private Key notieren
```

### 4. `.env` anlegen
```bash
cp server/.env.example server/.env
# Datei öffnen und alle Werte eintragen
```

Wichtige Felder in `server/.env`:
| Variable | Beschreibung |
|---|---|
| `DATABASE_URL` | z.B. `postgresql://postgres:pw@localhost:5432/darkages` |
| `JWT_SECRET` | Langer Zufallsstring: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SMTP_*` | SMTP-Zugangsdaten (z. B. Brevo, Postmark, eigener Mailserver) |
| `VAPID_PUBLIC_KEY` | Aus Schritt 3 |
| `VAPID_PRIVATE_KEY` | Aus Schritt 3 |
| `APP_URL` | Öffentliche URL der App, z. B. `https://dark-ages.deinedomain.de` |

### 5. VAPID Public Key im Frontend eintragen
```js
// js/config.js
const VAPID_PUBLIC_KEY = 'dein-public-key-aus-schritt-3';
```

### 6. Server starten
```bash
cd server
node index.js
# → "Dark Ages läuft auf http://localhost:3000"
# → Datenbank-Schema wird beim Start automatisch angelegt
```

Der Server serviert das Frontend (statische Dateien) und die API unter `/api/*` auf demselben Port.

### 7. Nginx/Caddy als Reverse-Proxy (Beispiel Caddy)
```
dark-ages.deinedomain.de {
    reverse_proxy localhost:3000
}
```

---

## Starten (nach Setup)

```bash
cd server && node index.js
# oder als Daemon:
pm2 start index.js --name dark-ages
```

---

## Lokales Testen

```bash
cd server && node index.js
# Browser: http://localhost:3000
```

Push-Notifications funktionieren lokal nur über `localhost` (nicht `file://`).  
Ohne HTTPS-Domain gibt es keine Push auf mobilen Geräten.

---

## Legacy-Modus (ohne Server)

Der alte Link-basierte Modus (`?state=...` URL) funktioniert weiterhin — einfach `index.html` direkt im Browser öffnen. Kein Account nötig.

---

## Kartenanalyse

```bash
node maptest/gen_maps.js      # generiert Test-Karten als HTML
node maptest/analyze_maps.js  # 1000 Karten-Simulationen
```

---

## Dateistruktur

```
server/
  index.js          Einstiegspunkt (Express + statische Dateien)
  db.js             PostgreSQL Pool + Schema-Initialisierung
  auth.js           OTP-Generierung + JWT
  email.js          Nodemailer-Wrapper
  push.js           Web Push (VAPID)
  routes/
    auth.js         /api/auth/*
    games.js        /api/games/*, /api/games/lobby/*
    friends.js      /api/friends/*
    push.js         /api/push/*
  .env.example      Vorlage für Umgebungsvariablen
js/
  config.js         VAPID Public Key (client-seitig)
  api.js            fetch()-Wrapper mit JWT
  auth.js           Login-UI + OTP-Flow
  lobby.js          Home, Lobby, Freunde, Spielöffnen
  ...               (bestehende Spiellogik unverändert)
```
