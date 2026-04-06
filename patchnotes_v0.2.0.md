# 🏰 Dark Ages — Patch Notes v0.2.0
### 6. April 2026

---

## ⚖️ Scoreboard Überarbeitung
- Das Scoreboard zeigt keine Einheiten- und Dorfzahlen mehr an — stattdessen wird ein **Punktestand** berechnet:
  - 🏘️ Dorf = **10 Punkte**
  - ⚔️ Einheit = **5 Punkte**
  - 💰 Gold = **1 Punkt**
- Spieler werden im Scoreboard automatisch **nach Punkten sortiert** (höchster zuerst).
- Eliminierte Spieler werden als *„Ausgeschieden"* markiert.

> Begründung: Vorher konnte man exakt ablesen, wie viele Einheiten und Dörfer der Gegner hat — das gab zu viele taktische Informationen preis.

---

## 📢 Ereignis-System Fix
- **Random-Ereignisse werden jetzt allen Spielern angezeigt**, nicht mehr nur Spieler 1.
- Das Event-Popup erscheint bei jedem Spieler beim Laden seines Zugs als Info-Meldung.
- Die **Auswirkung** des Events wird nur einmal ausgelöst (beim Rundenübergang), um Doppeleffekte zu vermeiden.

---

## 📖 Spielinfo: Veteranen & Terrain
- **Veteranen-Status** wird jetzt im Info-Panel angezeigt, wenn man eine Einheit anklickt: `★ Veteran (+1 DMG)`
- **Hügel-Terrain** zeigt jetzt beim Anklicken den Hinweis: `+1 DMG für Fernkämpfer`
- Grasland zeigt weiterhin *„Normales Gelände"*, Wälder *„Sicht blockiert, Schutz für Assassinen"*.

---

## 🤝 Diplomatiesystem (NEU)
*Verfügbar ab 4 Spielern, freigeschaltet ab Runde 5.*

### Kernmechanik
- Über den neuen **🤝 Diplomatie**-Button im HUD kann man Bündnisse anfragen.
- Jeder Spieler kann maximal **1 Bündnis** gleichzeitig haben.
- Es kann nur **1 offene Anfrage** gleichzeitig laufen — kein Spam an alle Spieler.

### Kosten
- **Anfrage senden:** 5 Gold + 5 Holz
- **Anfrage annehmen:** 5 Gold + 5 Holz
- Ablehnen und Zurückziehen sind kostenlos.

### Bündnis-Effekte
- ✅ **Geteilte Sicht** — Verbündete sehen gegenseitig durch den Nebel des Krieges.
- 🛡️ **Angriffsschutz** — Keine Angriffe auf Einheiten, Gebäude oder Dörfer des Verbündeten möglich (inkl. Rundumschlag und Tribok-AoE).
- 🚫 **Dorf-Einnahme** gesperrt für Partnerdörfer.

### Bündnisbruch
- Bündnisse können jederzeit **manuell gebrochen** werden (kein automatisches Zeitlimit).
- Der **brechende Spieler** erhält eine **1-Runden-Waffenruhe** — er darf den Ex-Partner in dieser Runde nicht angreifen.
- Der **gebrochene Spieler** darf sofort in seiner nächsten Runde zuschlagen.

### UI
- Anfragen werden automatisch beim Zugbeginn als Popup angezeigt (mit Annehmen/Ablehnen).
- Status wird im Diplomatie-Menü übersichtlich mit farbigen Spielernamen dargestellt.

---

## 🎨 Visuelles Overhaul

### Terrain
- **Hügel** ragen jetzt mit **doppelter Seitenhöhe** aus dem Spielfeld (2.5D-Effekt), mit Gradient-Seitenfläche und Stein-Details auf der Oberfläche.
- **Wälder** zeigen 5 gestaffelte Bäume mit Stämmen, verschiedenen Grüntönen und Licht-Highlights.
- **Grasland** hat dezente Gras-Striche für lebendigeres Aussehen.

### Einheiten-Elevation
- Einheiten und Gebäude auf **Hügeln** werden visuell **erhöht** dargestellt — sie stehen tatsächlich *auf* dem Hügel.
- HP-Balken, Schatten und Veteranen-Sterne folgen der Elevation.

### Klick-Erkennung
- Die Hit-Detection wurde für erhöhte Hügel-Hexe korrigiert — der klickbare Bereich stimmt jetzt mit der visuellen Position überein.

---

## ⚔️ Angriffsanimationen (NEU)

| Animation | Einheiten | Beschreibung |
|-----------|-----------|--------------|
| 🔶 **Slash** | Schwert, Pferd, Ritter, Berserker, Assassine | Orange Schwertbogen am Ziel (~2 Sekunden) |
| 🔘 **Pfeil** | Bogen | Silber-graues Projektil im Bogen vom Angreifer zum Ziel |
| 🔥 **Feuer** | Tribok (Flächenbrand) | 8 orange/gelbe Feuerpartikel am Einschlagsort |

- Animationen sind rein visuell und blockieren keine Interaktion.
- Floating-Damage-Texte berücksichtigen jetzt ebenfalls die Hügel-Elevation.

---

## 📜 Animierter Turn Recap (NEU)

Beim Laden eines neuen Zugs sieht der Spieler jetzt eine **animierte Zusammenfassung** der gegnerischen Aktionen:

- Die Kamera fährt sequenziell zu jeder sichtbaren Aktion (1,2 Sekunden pro Schritt).
- Farbcodierte Icons zeigen den Aktionstyp:
  - `→` Blau = Bewegung
  - `⚔` Rot = Angriff (mit Slash-Animation)
  - `✦` Grün = Einheit rekrutiert
  - `⚑` Orange = Dorf erobert

### Strikter Ereignis-Strang
Die Reihenfolge beim Zugbeginn ist fest definiert:
1. **Turn Recap** — Animation der gegnerischen Aktionen
2. **Random-Ereignis** — Popup wartet auf „Weiter"-Klick
3. **Diplomatie-Anfragen** — Fenster öffnet sich automatisch

Kein Element überspringt oder überlappt ein anderes.

---

## 📦 URL-Kompression

Optimierungen um die Share-Links trotz neuer Features kompakt zu halten:

- Leere Arrays (`al`, `req`, `tc`, `of`) werden vor der Serialisierung entfernt.
- Default-Werte (`dead: 0`, `a: 0`) werden gestripped.
- Unit-IDs werden entfernt und beim Laden regeneriert.
- **Einsparung:** ~100–200 Zeichen pro URL.

---

*Dark Ages: URL Tactics — 2.5D Fullscreen Edition*
