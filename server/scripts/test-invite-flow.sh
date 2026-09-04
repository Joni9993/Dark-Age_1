#!/bin/bash
# Einladungs-Zusage (Sept 2026) — End-to-End gegen einen LAUFENDEN Server.
#
# Anders als die übrigen Prüfskripte (maptest/*.js, server/scripts/test-*.js)
# braucht dieses hier Server UND Datenbank: die ganze Mechanik steckt in SQL und
# Transaktionen (Slot-Neunummerierung nach einer Absage, die Zusage-Prüfung
# innerhalb derselben Transaktion wie der Spielstart) — genau das, was eine
# Nachbildung in Node nicht mitprüfen würde.
#
#   ACHTUNG: legt Testkonten (hostuser/guestuser/dritter) und Testpartien an.
#   Nur gegen eine Wegwerf-Datenbank laufen lassen, nie gegen die echte.
#
#   cd server && DATABASE_URL=... JWT_SECRET=test PORT=3311 node index.js
#   bash server/scripts/test-invite-flow.sh          # default: 127.0.0.1:3311
#   API=http://127.0.0.1:4000/api bash server/scripts/test-invite-flow.sh
API=${API:-http://127.0.0.1:3311/api}

command -v jq >/dev/null || { echo "jq wird gebraucht"; exit 2; }
# Der Blob wird beim Start wirklich ausgepackt (server/seating.js mischt die
# Sitzplätze darin) — ein Platzhalter-String kommt nicht durch.
SERVER_DIR=$(cd "$(dirname "$0")/.." && pwd)
BLOB=$(cd "$SERVER_DIR" && node -e "const L=require('lz-string');
console.log(L.compressToEncodedURIComponent(JSON.stringify(
  {p:[{n:'hostuser'},{n:'guestuser'}],rn:1,cp:0,v:{},u:[]})))") || exit 2

C() { curl -s --noproxy '*' "$@"; }
fail=0
ok()  { echo "OK: $1"; }
bad() { echo "FAIL: $1"; fail=1; }
chk() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 — erwartet '$3', bekam '$2'"; fi; }

login()  { C -X POST $API/auth/login -H 'Content-Type: application/json' \
             -d "{\"username\":\"$1\",\"password\":\"passwort\"}" | jq -r .token; }
mkgame() { C -X POST $API/games -H 'Content-Type: application/json' -H "Authorization: Bearer $1" \
             -d "{\"max_players\":2,\"map_radius\":7,\"team_mode\":\"ffa\",\"name\":\"Test\",\"ranked\":$2}" | jq -r .id; }
invite() { C -X POST $API/games/$2/invite -H 'Content-Type: application/json' -H "Authorization: Bearer $1" -d "{\"username\":\"$3\"}"; }
start()  { C -o /dev/null -w '%{http_code}' -X POST $API/games/$2/start -H 'Content-Type: application/json' \
             -H "Authorization: Bearer $1" -d "$(jq -nc --arg b "$BLOB" '{seed:1,state_blob:$b}')"; }
respond(){ C -X POST $API/games/$2/invite/respond -H 'Content-Type: application/json' -H "Authorization: Bearer $1" -d "{\"accept\":$3}"; }
mylist() { C $API/games -H "Authorization: Bearer $1"; }
game()   { C $API/games/$2 -H "Authorization: Bearer $1"; }

HOST=$(login hostuser); GUEST=$(login guestuser); THIRD=$(login dritter)
if [ -z "$HOST" ] || [ "$HOST" = "null" ]; then
    echo "FAIL: kein Login — läuft der Server unter $API?"; exit 1
fi
ok "Login/Registrierung"

echo; echo "=== (1) Ranked: der Start ist ohne Zusage gesperrt ==="
G=$(mkgame $HOST true)
invite $HOST $G guestuser > /dev/null
chk "die Einladung steht beim Gast als offen in der Liste" \
    "$(mylist $GUEST | jq -r ".[] | select(.id==\"$G\") | .invite_status")" "pending"
chk "der Host selbst gilt als zugesagt" \
    "$(mylist $HOST | jq -r ".[] | select(.id==\"$G\") | .invite_status")" "accepted"
chk "Start wird abgewiesen, solange die Zusage fehlt" "$(start $HOST $G)" "409"
chk "und das Spiel ist danach unverändert Lobby" "$(game $HOST $G | jq -r .status)" "lobby"

echo; echo "=== (2) Nach der Zusage startet es ==="
respond $GUEST $G true > /dev/null
chk "der Zustand steht auf angenommen" \
    "$(mylist $GUEST | jq -r ".[] | select(.id==\"$G\") | .invite_status")" "accepted"
chk "Start geht durch" "$(start $HOST $G)" "200"
chk "Spiel läuft" "$(game $HOST $G | jq -r .status)" "active"

echo; echo "=== (3) Ablehnen: raus aus der Lobby, Slot wieder frei ==="
G2=$(mkgame $HOST true)
invite $HOST $G2 guestuser > /dev/null
respond $GUEST $G2 false > /dev/null
chk "die Partie taucht in der Liste des Gastes nicht mehr auf" \
    "$(mylist $GUEST | jq -r "[.[] | select(.id==\"$G2\")] | length")" "0"
chk "und er hat auch keinen Zugriff mehr" \
    "$(C -o /dev/null -w '%{http_code}' $API/games/$G2 -H "Authorization: Bearer $GUEST")" "403"
chk "der Host ist wieder allein in der Lobby" "$(game $HOST $G2 | jq -r '.players | length')" "1"
invite $HOST $G2 dritter > /dev/null
# Der Kern der Absage-Behandlung: ohne renumberLobbySlots bliebe Slot 1 belegt
# und die Lobby würde sich für voll halten.
chk "der frei gewordene Slot wird neu vergeben" \
    "$(game $HOST $G2 | jq -r '.players | map(select(.username=="dritter")) | .[0].slot')" "1"
chk "und der Start bleibt gesperrt, bis auch der Dritte zusagt" "$(start $HOST $G2)" "409"

echo; echo "=== (4) Normale Partie: eine offene Einladung bremst den Start nicht ==="
G3=$(mkgame $HOST false)
invite $HOST $G3 guestuser > /dev/null
chk "auch hier ist die Einladung zunächst offen" \
    "$(mylist $GUEST | jq -r ".[] | select(.id==\"$G3\") | .invite_status")" "pending"
chk "der Host kann trotzdem starten" "$(start $HOST $G3)" "200"
chk "die offene Einladung gilt damit als angenommen" \
    "$(mylist $GUEST | jq -r ".[] | select(.id==\"$G3\") | .invite_status")" "accepted"

echo; echo "=== (5) Grenzfälle ==="
G4=$(mkgame $HOST true)
invite $HOST $G4 guestuser > /dev/null
chk "der Host kann seine eigene Lobby nicht ablehnen" \
    "$(respond $HOST $G4 false | jq -r .error)" "Der Host kann die Lobby nicht verlassen — stattdessen löschen"
chk "ein Unbeteiligter hat kein Mitspracherecht" \
    "$(respond $THIRD $G4 true | jq -r .error)" "Nicht eingeladen"
respond $GUEST $G4 true > /dev/null
chk "doppeltes Zusagen bleibt folgenlos" "$(respond $GUEST $G4 true | jq -r .accepted)" "true"
G5=$(mkgame $HOST true)
C -X POST $API/games/lobby/$(game $HOST $G5 | jq -r .invite_token)/join -H "Authorization: Bearer $THIRD" > /dev/null
chk "wer über den Einladungslink beitritt, hat damit zugesagt" \
    "$(mylist $THIRD | jq -r ".[] | select(.id==\"$G5\") | .invite_status")" "accepted"
chk "eine so gefüllte Lobby startet ohne Rückfrage" "$(start $HOST $G5)" "200"

echo
[ $fail -eq 0 ] && echo "Alle Prüfungen bestanden." || { echo "FEHLER"; exit 1; }
