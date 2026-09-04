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

echo; echo "=== (2) Die letzte Zusage startet die volle Lobby von selbst ==="
# Auto-Start (Sept 2026): der Host muss nicht mehr danebensitzen und drücken —
# der Anfangszustand entsteht serverseitig (server/mapgen.js).
ACC=$(respond $GUEST $G true)
chk "die Antwort meldet den Start" "$(echo "$ACC" | jq -r .started)" "true"
chk "der Zustand steht auf angenommen" \
    "$(mylist $GUEST | jq -r ".[] | select(.id==\"$G\") | .invite_status")" "accepted"
chk "Spiel läuft, ohne dass jemand gestartet hat" "$(game $HOST $G | jq -r .status)" "active"
chk "und der Startzustand trägt beide Spieler" \
    "$(game $HOST $G | jq -r .state_blob | (cd "$SERVER_DIR" && node -e "
        const L=require('lz-string');let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        const s=JSON.parse(L.decompressFromEncodedURIComponent(d.trim()));
        console.log(s.p.map(x=>x.n).sort().join(',')
          +'|karte:'+(Object.keys(s.v).length>0 && s.u.length===2 && s.rad===7));})"))" \
    "guestuser,hostuser|karte:true"
chk "ein nachträglicher Startversuch läuft ins Leere" "$(start $HOST $G)" "403"

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
# Bewusst eine Lobby mit freiem Platz (3 Plätze, 2 Leute): eine volle Lobby
# würde bei der Zusage sofort starten und die folgenden Prüfungen liefen dann
# gegen ein laufendes Spiel statt gegen eine Lobby.
G4=$(C -X POST $API/games -H 'Content-Type: application/json' -H "Authorization: Bearer $HOST" \
       -d '{"max_players":3,"map_radius":7,"team_mode":"ffa","name":"Halbvoll","ranked":true}' | jq -r .id)
invite $HOST $G4 guestuser > /dev/null
chk "der Host kann seine eigene Lobby nicht ablehnen" \
    "$(respond $HOST $G4 false | jq -r .error)" "Der Host kann die Lobby nicht verlassen — stattdessen löschen"
chk "ein Unbeteiligter hat kein Mitspracherecht" \
    "$(respond $THIRD $G4 true | jq -r .error)" "Nicht eingeladen"
chk "eine Zusage in einer noch nicht vollen Lobby startet nichts" \
    "$(respond $GUEST $G4 true | jq -r .started)" "false"
chk "doppeltes Zusagen bleibt folgenlos" "$(respond $GUEST $G4 true | jq -r .accepted)" "true"
G5=$(mkgame $HOST true)
C -X POST $API/games/lobby/$(game $HOST $G5 | jq -r .invite_token)/join -H "Authorization: Bearer $THIRD" > /dev/null
chk "wer über den Einladungslink beitritt, hat damit zugesagt" \
    "$(mylist $THIRD | jq -r ".[] | select(.id==\"$G5\") | .invite_status")" "accepted"
chk "eine so gefüllte Lobby startet ohne Rückfrage" "$(start $HOST $G5)" "200"

echo; echo "=== (6) Ranked mit 6 Spielern: Zusagen einzeln, Absage mitten in der Reihe ==="
# Bei 2 Spielern kann eine Absage nur den letzten Slot treffen — erst ab 3
# Spielern entsteht der Fall, für den renumberLobbySlots da ist: eine LÜCKE in
# der Mitte. Und erst hier zeigt sich, ob die Sperre wirklich zählt statt nur
# "irgendwer fehlt noch" zu prüfen.
mk6() { C -X POST $API/games -H 'Content-Type: application/json' -H "Authorization: Bearer $1" \
          -d '{"max_players":6,"map_radius":12,"team_mode":"ffa","name":"Sechser","ranked":true}' | jq -r .id; }
G6=$(mk6 $HOST)
for n in p2 p3 p4 p5 p6; do eval "T_$n=\$(login $n)"; invite $HOST $G6 $n > /dev/null; done
chk "alle fünf Eingeladenen stehen offen" \
    "$(game $HOST $G6 | jq -r '[.players[] | select(.invite_status=="pending")] | length')" "5"
chk "Start gesperrt, und die Meldung nennt die Anzahl" \
    "$(C -X POST $API/games/$G6/start -H 'Content-Type: application/json' -H "Authorization: Bearer $HOST" \
        -d "$(jq -nc --arg b "$BLOB" '{seed:1,state_blob:$b}')" | jq -r .error)" \
    "5 eingeladene Spieler haben noch nicht zugesagt"

respond $T_p2 $G6 true > /dev/null
respond $T_p3 $G6 true > /dev/null
chk "nach zwei Zusagen fehlen noch drei" \
    "$(game $HOST $G6 | jq -r '[.players[] | select(.invite_status=="pending")] | length')" "3"
chk "und der Start ist weiter gesperrt" "$(start $HOST $G6)" "409"

# p3 sitzt auf Slot 2 (Host 0, p2 1, p3 2, p4 3, p5 4, p6 5) und hat bereits
# zugesagt — seine Absage reißt die Lücke also mitten in eine Reihe, in der vor
# UND hinter ihm Spieler mit unterschiedlichem Zustand sitzen.
chk "p3 sitzt vor der Absage auf Slot 2" \
    "$(game $HOST $G6 | jq -r '.players | map(select(.username=="p3")) | .[0].slot')" "2"
respond $T_p3 $G6 false > /dev/null
chk "die Slots sind danach lückenlos" \
    "$(game $HOST $G6 | jq -r '[.players[].slot] | join(",")')" "0,1,2,3,4"
chk "und jeder Zustand ist beim richtigen Spieler geblieben" \
    "$(game $HOST $G6 | jq -r '[.players[] | .username + ":" + .invite_status] | join(" ")')" \
    "hostuser:accepted p2:accepted p4:pending p5:pending p6:pending"

respond $T_p4 $G6 true > /dev/null
respond $T_p5 $G6 true > /dev/null
chk "eine einzelne offene Zusage wird im Singular gemeldet" \
    "$(C -X POST $API/games/$G6/start -H 'Content-Type: application/json' -H "Authorization: Bearer $HOST" \
        -d "$(jq -nc --arg b "$BLOB" '{seed:1,state_blob:$b}')" | jq -r .error)" \
    "Ein eingeladener Spieler hat noch nicht zugesagt"
respond $T_p6 $G6 true > /dev/null

# Der Blob muss zu den tatsächlich verbliebenen Sitzen passen — er wird beim
# Start ausgepackt und die Namen werden auf die gemischten Sitze verteilt.
BLOB5=$(cd "$SERVER_DIR" && node -e "const L=require('lz-string');
console.log(L.compressToEncodedURIComponent(JSON.stringify(
  {p:[{n:'a'},{n:'b'},{n:'c'},{n:'d'},{n:'e'}],rn:1,cp:0,v:{},u:[]})))")
BLOB6=$(cd "$SERVER_DIR" && node -e "const L=require('lz-string');
console.log(L.compressToEncodedURIComponent(JSON.stringify(
  {p:[{n:'a'},{n:'b'},{n:'c'},{n:'d'},{n:'e'},{n:'f'}],rn:1,cp:0,v:{},u:[]})))")
chk "mit allen Zusagen startet die Fünfer-Runde" \
    "$(C -o /dev/null -w '%{http_code}' -X POST $API/games/$G6/start -H 'Content-Type: application/json' \
        -H "Authorization: Bearer $HOST" -d "$(jq -nc --arg b "$BLOB5" '{seed:1,state_blob:$b}')")" "200"
chk "und alle fünf Namen stehen im Startzustand" \
    "$(game $HOST $G6 | jq -r .state_blob | (cd "$SERVER_DIR" && node -e "
        const L=require('lz-string');let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        const s=JSON.parse(L.decompressFromEncodedURIComponent(d.trim()));
        console.log(s.p.map(x=>x.n).sort().join(','));})"))" \
    "hostuser,p2,p4,p5,p6"

echo; echo "=== (7) Feste Teams: eine Absage darf kein stilles Jeder-gegen-jeden erzeugen ==="
# js/mapgen.js überspringt die Team-Zuweisung, wenn die Spielerzahl nicht durch
# die Teamgröße teilbar ist — aus einem 3v3 würde ohne Meldung ein FFA, und
# server/rating.js wertet es auch so (state.at fehlt). Über Kick/Verlassen war
# das schon erreichbar; mit dem Ablehnen wird es der Normalfall.
GT=$(C -X POST $API/games -H 'Content-Type: application/json' -H "Authorization: Bearer $HOST" \
       -d '{"max_players":6,"map_radius":12,"team_mode":"teams3","name":"Dreier","ranked":true}' | jq -r .id)
for n in p2 p3 p4 p5 p6; do invite $HOST $GT $n > /dev/null; done
for n in p2 p3 p4 p5 p6; do eval "respond \$T_$n $GT true" > /dev/null; done
chk "die volle Sechser-Lobby startet mit der letzten Zusage von selbst" \
    "$(game $HOST $GT | jq -r .status)" "active"
chk "und zwar wirklich als 3v3, nicht als Jeder-gegen-jeden" \
    "$(game $HOST $GT | jq -r .state_blob | (cd "$SERVER_DIR" && node -e "
        const L=require('lz-string');let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        const s=JSON.parse(L.decompressFromEncodedURIComponent(d.trim()));
        console.log('at='+s.at+' teamgroessen='+s.p.map(x=>(x.al||[]).length+1).join(','));})"))" \
    "at=1 teamgroessen=3,3,3,3,3,3"

GT2=$(C -X POST $API/games -H 'Content-Type: application/json' -H "Authorization: Bearer $HOST" \
        -d '{"max_players":6,"map_radius":12,"team_mode":"teams3","name":"Dreier2","ranked":true}' | jq -r .id)
for n in p2 p3 p4 p5 p6; do invite $HOST $GT2 $n > /dev/null; done
for n in p2 p3 p4 p5; do eval "respond \$T_$n $GT2 true" > /dev/null; done
respond $T_p6 $GT2 false > /dev/null
chk "nach einer Absage sind noch fünf übrig" "$(game $HOST $GT2 | jq -r '.players | length')" "5"
chk "und der Start wird abgewiesen statt still zum FFA zu werden" \
    "$(C -X POST $API/games/$GT2/start -H 'Content-Type: application/json' -H "Authorization: Bearer $HOST" \
        -d "$(jq -nc --arg b "$BLOB5" '{seed:1,state_blob:$b}')" | jq -r .error)" \
    "Feste 3er-Teams brauchen eine durch 3 teilbare Spielerzahl (mindestens 6) — aktuell sind es 5"
chk "das Spiel bleibt Lobby" "$(game $HOST $GT2 | jq -r .status)" "lobby"

echo; echo "=== (8) Auto-Start: was ihn NICHT auslösen darf ==="
# Der Beitritt über den Einladungslink war schon immer Sache des Hosts, was den
# Start angeht — die Automatik beantwortet nur die Frage, die sie selbst
# gestellt hat (die Einladung).
G8=$(mkgame $HOST true)
C -X POST $API/games/lobby/$(game $HOST $G8 | jq -r .invite_token)/join -H "Authorization: Bearer $GUEST" > /dev/null
chk "die Lobby ist voll" "$(game $HOST $G8 | jq -r '.players | length')" "2"
chk "ein Link-Beitritt startet trotzdem nichts" "$(game $HOST $G8 | jq -r .status)" "lobby"
chk "der Host startet sie von Hand" "$(start $HOST $G8)" "200"

# Eine unvollständige Lobby wartet weiter, auch wenn niemand mehr offen ist:
# solange ein Platz frei ist, will der Host womöglich noch jemanden einladen.
G9=$(C -X POST $API/games -H 'Content-Type: application/json' -H "Authorization: Bearer $HOST" \
       -d '{"max_players":4,"map_radius":7,"team_mode":"ffa","name":"Dreiviertel","ranked":true}' | jq -r .id)
invite $HOST $G9 p2 > /dev/null
invite $HOST $G9 p4 > /dev/null
respond $T_p2 $G9 true > /dev/null
chk "auch die letzte offene Zusage startet nichts, solange ein Platz frei ist" \
    "$(respond $T_p4 $G9 true | jq -r .started)" "false"
chk "die Lobby bleibt Lobby" "$(game $HOST $G9 | jq -r .status)" "lobby"
chk "der Host kann sie unvollständig von Hand starten" "$(start $HOST $G9)" "200"

echo
[ $fail -eq 0 ] && echo "Alle Prüfungen bestanden." || { echo "FEHLER"; exit 1; }
