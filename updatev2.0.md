# Implementation Plan: Dark Ages - "Stone & Steel" Update

## 1. Übersicht & Ziel
Einführung einer neuen Ressource (Stein), Map-Mechanik (Steinhaufen als physische, abbaubare Hindernisse), Gebäuden (Türme) und Umstrukturierung des Einheiten-Rosters (Arbeiter als Basis-Einheit, Wagenburg als neue Gilden-Spezialeinheit sowie Buffs für den Tribok).

## 2. Anpassung des Datenmodells (`gameState`)
Folgende neue Properties müssen in das JSON/State-Objekt integriert werden:
* **Spieler-Objekt (`gameState.p[i]`):** * Neuer Key `s` (Stones), startet bei 0.
* **Steinhaufen-Array (`gameState.st`):**
    * Array aus Objekten: `{ x, y, h: 40 }` (h = verbleibende Steine).
* **Türme-Array (`gameState.tw`):**
    * Array aus Objekten: `{ x, y, o: playerId, h: 15, a: 0 }` (h = HP, a = acted 0/1).
* **Einheiten-Objekt (`gameState.u[i]`):**
    * Neuer Key `mi: {x, y}` (Mining Target) für Arbeiter (speichert Koordinaten des Steinhaufens).
    * Neuer Key `dp: 0/1` (Deployed) für die Wagenburg, um den stationären Modus zu tracken.

## 3. Die neue Ressource & Steinhaufen
### 3.1. Map-Generierung
* **Start-Steine:** In der `startGameBtn.addEventListener` Logik: Finde für jeden Spieler genau 1 freies Feld in **Distanz 2** zum Startdorf (`sv`). Platziere dort einen Steinhaufen (`{x, y, h: 40}`).
* **Neutrale Steine:** `2 * playerCount` Steinhaufen auf der Map verteilen. Bedingungen: Muss im `radius` liegen, darf nicht auf Wasser/außerhalb liegen, Mindestabstand 2 zu anderen Steinhaufen und Dörfern.
### 3.2. Rendering & Pathing
* **Optik:** Steinhaufen rendern (Graue Felsen). Text über dem Haufen zeigt `h` an.
* **Kollision:** Steinhaufen (`gameState.st`) blockieren Bewegung in `calculateMoves()`.
* **Sichtlinie (LoS):** Durchschießen ist erlaubt (nicht als Blocker in `calculateAttacks()`).
* **Verschwinden:** Sobald `h <= 0` fällt, wird das Objekt aus `gameState.st` gefiltert. Feld wird begehbar.

## 4. Roster-Update: Arbeiter (Worker)
* **Basis-Stats:** Name in `unitStats` zu "Arbeiter" ändern. ID bleibt (z.B. 7), wird aus den Fraktions-Abfragen gelöst.
* **Verfügbarkeit & Kosten:** Kann von **jedem** Spieler im Hauptgebäude für `2 Gold` rekrutiert werden.
* **Gebäude-Kosten:** Mauer (`1 Stein`), Tunnel (`4 Stein`), Turm (`5 Stein`).
* **Auto-Miner Mechanik:**
    * Klick auf Arbeiter neben Steinhaufen -> "⛏️ Abbau starten" im Menü.
    * Setzt `u.mi = {x: targetX, y: targetY}`. Verbraucht **keine** Aktion (`u.a`).
    * Im UI ein kleines Spitzhacken-Icon beim Arbeiter rendern, wenn `mi` gesetzt ist.

## 5. Neue Gebäude-Art: Der Turm (Tower)
* **Werte:** 15 HP, 5 DMG (fix), 2 Reichweite, greift nur Einheiten an. Kein Veteranensystem.
* **Mechanik:** Kann 1x pro Runde feuern (`a: 1`). Zieht dem anvisierten Ziel (`gameState.u`) exakt 5 HP ab. 

## 6. Einheiten-Updates & Neue Einheiten (Gilden-Fraktion)
### 6.1. Neue Einheit: Die Wagenburg (Kriegswagen)
*Ersetzt den alten Tunnelgräber in Fraktion 3.*
* **Typ-ID:** Neue ID in `unitStats` anlegen (z.B. 11).
* **Stats Basis:** DMG: 4, Range: 1, Move: 2, HP: 18, Cost: 7 Gold.
* **Fraktion:** Gilden-Fraktion (`factions[3]`).
* **Spezial-Fähigkeit "Aufschlagen / Abbauen" (Kostenlos, verbraucht Zug):**
    * *Mechanik:* Action-Menu Toggle. Setzt `u.dp = 1` (Aufgeschlagen) oder `0` (Mobil). Aktion der Einheit wird auf `1` (Acted) gesetzt.
    * *Effekt Deployed (`dp === 1`):* `Move` sinkt auf 0, `Range` steigt auf 2. 
    * *Aura-Effekt:* In `getExpectedDamage()` wird geprüft: Steht das Ziel (befreundete Einheit) auf einem direkten Nachbarfeld einer EIGENEN aufgeschlagenen Wagenburg? Wenn ja, wird der einkommende Schaden um **1 reduziert** (Minimum 1 DMG bleibt).
* **Upgrade (Forschung):** "Verstärkte Beschläge" (Cost: 10G, 5H) -> 
    * Wagenburg erhält dauerhaft +4 Max HP (HP: 22). 
    * *Dornen-Effekt:* Wenn ein Nahkämpfer die Wagenburg angreift, erleidet der Angreifer automatisch 2 DMG Rückschlag (in der Retaliation-Logik einbauen).

### 6.2. Buff: Tribok (ID: 6)
* **Reichweiten-Erhöhung:** In `unitStats[6]` `range` auf **3** anheben.
* **Sichtweiten-Erhöhung:** In `getVisibleHexes()` eine Ausnahme hinzufügen: Der Tribok erhält standardmäßig eine feste Sichtweite von **3 Feldern**, unabhängig von der Spionage-Fraktion.

## 7. Game-Loop Anpassungen (Turn End/Start)
*In `endTurnBtn.addEventListener`:*
1. **Auto-Miner Auswertung (vor Einkommen):**
    * Iteriere über alle Einheiten des aktiven Spielers.
    * Wenn `u.mi` gesetzt ist: Prüfe, ob Arbeiter noch direkt neben Steinhaufen steht und dieser existiert.
    * Wenn ja: Steinhaufen `h - 1`, Spieler `s + 1`, Floating-Text "+1 Stein". Wenn `h === 0`, Steinhaufen entfernen und `mi` bei betroffenen Arbeitern löschen.
    * Wenn nein: `u.mi` löschen.
2. **Türme Reset:** Alle eigenen Türme in `gameState.tw` auf `a = 0` zurücksetzen.

## 8. UI & HUD Updates
* **Ressourcen-Leiste:** Top-HUD erweitern: `💰 X | 🪵 Y | 🪨 Z`.
* **Info-Panel & Klick-Logik:**
    * Klick auf Steinhaufen: "Steinvorkommen (X/40)<div class='info-detail'>Benötigt Arbeiter zum Abbau</div>"
    * Klick auf Turm: "Turm (X/15 HP)<div class='info-detail'>Range 2 | 5 DMG</div>"
    * Klick auf Wagenburg: Zeigt an, ob mobil oder stationär. Erwähnt Aura-Effekt.
* **Action Menus:** "⛏️ Abbau", "🧱 Mauer (1🪨)", "🚇 Tunnel (4🪨)", "🗼 Turm (5🪨)", "⛺ Aufschlagen / 🐎 Abbauen".
* **State Compression:** `gameState.st` und `gameState.tw` in die `lz-string` Komprimierung/Dekomprimierung einbinden. Die Eigenschaft `dp` bei Einheiten muss beim Komprimieren berücksichtigt (und ggf. auf 0 zurückgesetzt/ignoriert) werden, wenn Platz gespart wird.