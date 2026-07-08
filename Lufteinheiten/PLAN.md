# Lufteinheiten — Implementierungsplan (Phase 2)

Stand: 04.07.2026 · abgestimmt mit Jonathan · Voraussetzung: 3D-Port (Phase 1, fertig hinter `?r3d=1`)

## 1. Überblick

Vier Lufteinheiten (Typ-IDs **12–15**), eine pro Fraktion als **dritte Spezialeinheit** — rekrutierbar im Dorf, sobald die Fraktion gewählt ist. Lufteinheiten fliegen auf einer zweiten Ebene über dem Spielfeld: Boden und Luft teilen sich ein Hex, Luft ignoriert alle Bodenhindernisse (Mauern, Türme, Steine, Einheiten, Dörfer). Kernrollen: **Fronten überfliegen** und **Angriff aus der Luft**.

## 2. Die vier Einheiten

| | 🏰 Luftschraube | 🪓 Gleiter | 👁 Fallschirmspringer | ⚖ Bombenballon |
|---|---|---|---|---|
| Fraktion | Feudalismus (0) | Plünderer (1) | Spionage (2) | Gilden (3) |
| Typ-ID | 12 | 13 | 14 | 15 |
| Kosten | 7 Gold | 6 Gold | **4 Gold** | 9 Gold |
| HP | 14 | 8 | 10 | 14 |
| Bewegung | 2 | **4** (schnellste Einheit) | 2 fliegend / **2 gelandet** | 2 |
| Angriff | 5 DMG, RW 1 (Rammstoß, melee) | 5 DMG (+1 Plünderer-Passiv), RW 1 (melee) | Schleuder: 4 DMG, RW 2 (ranged) | 🔥 Anzünden (s.u.) |
| Ziele | Luft + Boden + Gebäude | Luft + Boden + Gebäude | fliegend: **nur Luft** · gelandet: Luft + Boden | **nur Boden** + Gebäude |
| Fähigkeit | 🚁 Lufttransport | 💥 Sturzangriff | 🪂 Absprung | 🔥 Anzünden + 🌋 Feuersturm |
| Rolle | zäher Allrounder + Transporter | Schnell-Jäger mit Kamikaze-Option | Späher/Infiltrator | fliegende Brandwaffe |

**Fraktions-Passiva gelten:** Feudal-HP-Bonus bei Rekrutierung (12), Plünderer-Nahkampf +1 (13), Spionage-Sicht +1 (14). Veteranen-System gilt für alle (2 Kills → +1 DMG). Vorerst **keine neuen Forschungs-Upgrades** für Lufteinheiten (nach Playtest nachziehbar).

### 2.1 Luftschraube (12) — Lufttransport

- **„Aufladen"** (Aktion, `a = 1`): nimmt eine benachbarte (oder direkt darunter stehende) EIGENE Bodeneinheit auf. Die Einheit verschwindet vom Feld und hängt an der Luftschraube (Fracht-Icon am Sprite). Kapazität: 1. Stationierte Wagenburg (`dp = 1`) muss erst abbauen.
- Die Luftschraube fliegt normal weiter (BEW 2), die Fracht kommt mit — über Mauern, Fronten, Steinfelder hinweg.
- **„Absetzen"** (Aktion): Fracht auf ein freies Boden-Hex im Umkreis 1 stellen; die Aktion der abgesetzten Einheit ist danach verbraucht (`a = 1`).
- **Risiko**: Wird die Luftschraube mit Fracht abgeschossen, stürzt die Fracht mit ab und stirbt.
- State: `u.cg` = vollständiges Einheiten-Objekt der Fracht (verlässt `u[]`, bekommt beim Absetzen neue `i`).

### 2.2 Gleiter (13) — Sturzangriff

- **„Sturzangriff"** (Aktion): stürzt sich auf ein Ziel im **Umkreis 1** — Bodeneinheit, Gebäude ODER Lufteinheit.
- **9 Schaden**, kein Konter — und der Gleiter wird dabei **zerstört** (wie die Saboteur-Detonation, gleicher Code-Pfad als Vorlage).
- Plünderer-Kopfgeld-Upgrade (+3 G pro Kill) greift beim Sturzangriff-Kill.
- Der einzige Nicht-Turm-Konter gegen Lufteinheiten, den auch ein „Boden-Spieler" über die Plünderer-Fraktion bekommt — und ein Werkzeug gegen gegnerische Ballons.

### 2.3 Fallschirmspringer (14) — Absprung

- **Fliegend**: BEW 2, Schleuder trifft nur Lufteinheiten, immun gegen Nahkampf (wie alle Flieger), kann nicht erobern.
- **Fähigkeit „Absprung"**: wählt ein freies Boden-Hex im **Umkreis 2** (kostenlos, auch Dorf-Hexes; blockiert durch Bodeneinheiten/Mauern/Türme/Steine/lebende Startdörfer). Zählt **wie Bewegung** (`a = 2`) — er darf im selben Zug noch schießen.
- **Gelandet (permanent!)**: normale Bodeneinheit — BEW 2, Schleuder 4 DMG / RW 2 auf Luft UND Boden, kann Dörfer erobern, normal angreifbar (auch Nahkampf). Wieder abheben geht nicht — ein Fallschirm fliegt nur einmal. Neuer Flieger = neu rekrutieren (4 Gold).
- State: `u.ld = 1` (einmal gesetzt, bleibt).

### 2.4 Bombenballon (15) — das Feuer-System

Der Ballon greift nie Luft an und kontert nie. Zwei Aktionen:

**🔥 Anzünden (Normalangriff, RW 1, nur Bodenziele):**
Zündet EINE Bodeneinheit oder ein Gebäude (Mauer/Turm/Tunnel/Startdorf) an: **sofort 4 Schaden**, und **weitere 4** zu Beginn des nächsten Zuges des Besitzers → **8 Schaden über 2 Züge**. Brennende Ziele zeigen ein 🔥-Symbol. Erneutes Anzünden frischt auf (kein Stapeln). Verbraucht die Aktion (`a = 1`).

**🌋 Feuersturm (Spezialfähigkeit, 5 Holz):**
Wirkt auf das Feld **direkt unter dem Ballon + alle 6 Nachbarfelder** — der Ballon muss also übers Ziel schweben, er selbst ist das Fadenkreuz. Effekt:
- **Sofort 4 Schaden** auf ALLE Bodeneinheiten und Gebäude in den 7 Feldern — **Friendly Fire**: auch eigene und verbündete!
- Die 7 Felder **brennen 2 Runden** (diese + nächste): Betreten = sofort 2 Schaden; auf brennendem Feld stehen = 2 Schaden zu Beginn des eigenen Zuges.
- **Lufteinheiten über den Feldern sind immun** (Feuer ist am Boden).
- Verbraucht die Aktion (`a = 1`). UI: Button zeigt Vorschau-Highlight der 7 Felder, zweiter Klick bestätigt.

**Timing der Brand-Ticks** (deterministisch in `doEndTurn` beim Spielerwechsel, Anzeige über `th`-artige Float-Liste):
- Einheiten mit `bn > 0` des NEUEN aktiven Spielers: −4, dann `bn--`.
- Einheiten des neuen Spielers auf brennendem Feld: −2.
- Brennende Strukturen: Tick beim Rundenwechsel (−4, `bn--`).
- Tode durch Feuer: Einheit entfernt (kein Veteranen-Kill-Credit — Flag für später); Startdorf-Tod → normale Win-Check-Logik.

## 3. Luft-Regeln (Konter-Matrix)

| Angreifer ↓ / Ziel → | Bodeneinheit | Gebäude | Lufteinheit |
|---|---|---|---|
| Nahkampf Boden (0,2,3,4,5,7,9,11) | ✔ | ✔ | ✘ (auch kein Konter) |
| Fernkampf Boden (1,6,10, gelandeter 14) | ✔ | ✔ | ✔ (+ Konter wenn in RW) |
| Turm | ✔ | ✔ | ✔ |
| Luftschraube 12 / Gleiter 13 | ✔ | ✔ | ✔ (Luft-vs-Luft kontert normal) |
| Fallschirm 14 fliegend | ✘ | ✘ | ✔ |
| Ballon 15 | 🔥 Anzünden/Feuersturm | 🔥 | ✘ (kontert nie) |
| AoEs (Tribok, Saboteur, Ritter, Elefant, Feuersturm) | ✔ | je nach AoE | ✘ (nur Boden) |

Weitere Regeln:
- Boden + Luft teilen sich ein Hex; **max. 1 Lufteinheit pro Hex** (Luft blockiert Luft).
- Luftbewegung ignoriert alle Bodenhindernisse; Tunnel sind für Luft irrelevant; Flieger blockieren weder Bodenbewegung noch Bauen noch Tunnelausgänge.
- Flieger können nicht erobern, minen, bauen; Wachturm-Übernahme nur durch Boden (gelandeter 14 zählt als Boden).
- Sicht: normale Regeln (2 Felder, Spionage 3); Flieger lüften Nebel wie alle Einheiten.
- Feudal-Dorfheilung heilt auch Flieger, die über dem eigenen Dorf schweben (bewusst, Balance-Flag).

## 4. UI / UX

- **Luftansicht-Toggle** `[✈]` im HUD neben dem Menü-Button: Kamera fährt animiert (~400 ms) in die **Vogelperspektive (Winkel per `AIR_VIEW_ELEV` in `render3d.js` einstellbar, aktuell 60°)** — steiler statt flacher (Änderung Jonathan, 04.07.2026). Bodenansicht (Standard): Flieger schweben ~1.4×hexSize hoch mit **10 % Deckkraft** + Schatten-Ellipse. Luftansicht: Flieger **100 %**, Boden bleibt normal sichtbar. Sprites kippen mit der Kamera mit, damit sie aus der Steilsicht lesbar bleiben.
- **Strikte Ebenen-Trennung** (Änderung Jonathan, 05.07.2026): Außerhalb der Luftansicht sind Lufteinheiten **komplett ignoriert** — nicht anwählbar (Klick auf ein Feld mit nur einer Lufteinheit trifft nichts), nicht als Angriffsziel verfügbar (auch nicht für Türme). Erst der `[✈]`-Button schaltet die Luft-Ebene für Auswahl/Ziele frei. Wird die Luftansicht ausgeschaltet während eine Lufteinheit ausgewählt ist, wird die Auswahl automatisch aufgehoben (inkl. laufender Spezial-Zielwahl wie Sturzangriff/Absprung). Landende/gelandete Einheiten (Fallschirm mit `ld=1`) zählen als Boden und bleiben in beiden Ansichten normal nutzbar. Betrifft `calculateAttacks` (filtert `a.air` wenn `!window.airView`) und die Klick-Auflösung in `handleCanvasClick` (input.js).
- **Klick-Logik**: In der Luftansicht trifft Klick die Luft-Ebene zuerst; erneuter Klick auf dasselbe Hex mit beiden Ebenen wechselt Boden↔Luft. In der Bodenansicht wird die Luft-Ebene beim Klick gar nicht erst betrachtet. Angriffsvorschau (`showTileUI`) zeigt das Ziel der aktiven Ebene.
- **Aktionsmenü** (bestehendes `mkBtn`-Muster): Ballon „🔥 Anzünden" (rote RW-1-Bodenziele) + „🌋 Feuersturm (5 🌲)"; Fallschirm fliegend „🪂 Absprung" (grüne Ziel-Hexes Umkreis 2).
- **Rekrutierung** im Dorf-Menü: `12 🚁` / `13 🛩` / `14 🪂` / `15 🎈` je nach Fraktion; Flieger-Kauf braucht freie Luft-Ebene über dem Dorf, Boden-Kauf freie Boden-Ebene (unabhängig voneinander).
- **Brand-Anzeigen**: brennende Ziele 🔥-Icon neben der HP-Zahl; brennende Felder orange getönt + Feuer-Partikel (beide Renderer: 3D Partikel, 2D-Fallback orangener Hex-Overlay).
- Info-Panel-Texte für alle 4 Einheiten inkl. Zustand (beladen/fliegend/gelandet/brennend).

## 5. Pixel-Sprites (10×10, `pixelSprites`, P = Spielerfarbe)

Da-Vinci-Technik-Look (Referenzbilder in diesem Ordner). Neue Palette-Farbe `8: '#ff6e40'` (Feuer/Akzent).

| Key | Design |
|---|---|
| `12` | Luftschraube: spiralförmiges Segel-Dach (pal 3 hell + 4 Holzrahmen), darunter kleine Gondel mit P-Banner |
| `13` | Gleiter: gepfeilte Holzflügel (4), P-farbene Segelfläche, winziger Pilot (2/1) |
| `14` | Fallschirm: P-farbene Schirmkuppel, Seile (1), hängende Figur (2/1) |
| `"fallschirm_ld"` | gelandete Variante: Figur mit Schleuder, gepacktes Schirmbündel auf dem Rücken (Muster: `wagen_dp`) |
| `15` | Ballon: runde P-Hülle mit Gold-Akzenten (7), Korb (4), Glut-Punkt (8) |

Sprites funktionieren automatisch in 2D und 3D (Voxelisierung). **Abnahme**: Ich baue sie, stelle sie per Debug-Spawn in 3D + 2D dar und Jonathan segnet Screenshots ab, bevor es weitergeht.

## 6. Technische Umsetzung

**State-Schema (neu, alles optional → delete-defaults an den 3 Sync-Stellen `doEndTurn` / `confirmSurrender` / `bootGame`):**
- `u[].ld = 1` — Fallschirm gelandet (permanent)
- `u[].cg = {…}` — Fracht der Luftschraube (vollständiges Einheiten-Objekt ohne `i`)
- `u[].bn = n` — Einheit brennt noch n Ticks (Anzünden: startet bei 1 nach Sofortschaden)
- `wa/tw/tu[].bn`, Startdorf-Brand als `p[].svb` — brennende Strukturen
- `fi[] = [{x, y, r}]` — brennende Felder, aktiv solange `rn <= r` (Feuersturm setzt `r = rn + 1`)
- Luft-Erkennung rein über Typ-ID: `unitStats[t].isAir` — kein Serialisierungs-Feld

**`js/data.js`**: `unitStats` 12–15 mit neuen Feldern `isAir`, `hitsAir`, `hitsGround`; Ballon-Sonderfelder (`igniteDmg: 4`, `fsCost: 5`); `factions[].desc` erweitern; `pixelSprites` 12/13/14/`fallschirm_ld`/15; `pal[8]`.

**`js/logic.js`** (erweitern, nicht umschreiben):
- Helper: `isFlying(u)` (= isAir && !u.ld), `groundUnitAt(x,y)`, `airUnitAt(x,y)`, `canTargetUnit(attacker, target)` — kapselt die komplette Matrix aus Abschnitt 3, wird an GENAU drei Stellen benutzt: `calculateAttacks`, Konterschlag-Block, Turmschuss.
- `calculateMoves`: Branch für Flieger (ignoriert Bodenblocker, blockt nur `airUnitAt`); Boden-Branch: Occupancy-Check auf `groundUnitAt` umstellen.
- `calculateAttacks`: nutzt `canTargetUnit`; Ballon liefert Anzünden-Ziele (RW 1, nur Boden) mit `ignite: true`; Luft-Ziele bekommen `air: true` für die Klick-Ebene.
- `getExpectedDamage`: Flieger kriegen keinen Hügel-Bonus; Ballon-Anzünden läuft an `getExpectedDamage` vorbei (fixe 4+4).
- `getUnitMove`: 14 gelandet → 2 (Muster `dp`-Spezialfall).

**`js/input.js`**:
- Klick-Auflösung: 2 Einheiten pro Hex möglich → aktive Ebene (`window.airView`) priorisieren, Re-Klick zykliert.
- Konterschlag-Block (Z. ~417): mit `canTargetUnit(target, attacker)` gaten. Melee-Kill-Nachrücken: Flieger nur wenn `!airUnitAt`; Wachturm-/Dorf-Erober-Pfade mit `!isFlying` gaten; Tunnel-Teleport für Flieger überspringen.
- Anzünden-Branch (Muster: Turmschuss): Sofort-4, `bn=1` aufs Ziel, `spawnAttackAnim('fire')`, Recap-Eintrag.
- Bestehende AoEs (Tribok/Saboteur/Ritter/Elefant): Filter `!isFlying(u)`.
- `doEndTurn`: Brand-Ticks (Abschnitt 2.2) vor Einkommen; `fi[]` aufräumen wenn `rn > r`; delete-defaults für `ld/bn/fi`.
- **Alt-Bug fixen**: `factionUnitMap` (Z. 1061/1120) → `{0:[3,10,12], 1:[4,8,13], 2:[5,9,14], 3:[6,11,15]}`; Dorf-belegt-Check ebenenbewusst; „kann abspringen/anzünden/Feuersturm" in Rest-Aktions-Checks.

**`js/abilities.js`**: `useAbility('absprung')` (Ziel-Hexes Umkreis 2 via BFS-frei-Check, setzt `ld=1, a=2`, Position umsetzen) · `useAbility('feuersturm')` (5 Holz, 7-Felder-Anwendung, `fi[]`-Einträge, `a=1`) · `useAbility('aufladen')`/`useAbility('absetzen')` (Lufttransport: Fracht in `u.cg` verschieben / auf freiem Boden-Hex Umkreis 1 wieder in `u[]` einfügen mit neuer `i`; Tod des Trägers löscht `cg` mit) · `useAbility('sturzangriff')` (Klon der Saboteur-Detonation: Ziel Umkreis 1, Boden ODER Luft ODER Gebäude, 9 Schaden, Gleiter wird entfernt, Kopfgeld-Check) — alle nach `saveUndoState`-Muster.

**`js/ui.js`**: `buyUnit` ebenenbewusst (Flieger brauchen freie Luft-Ebene); Rekrutierungs-Buttons; Info-Panel-Texte.

**`js/render3d.js`**: Flughöhe + Schatten; eigenes transparentes Voxel-Mesh für Luft (Bodenansicht 10 %, `depthWrite:false`); `setAirView(on)` mit Polar-Tween 40°→~68°; Feuer: Partikel-Emitter pro brennendem Feld + orange Tile-Tönung; 🔥-Icon via `addIcon`; gelandeter 14 am Boden mit `fallschirm_ld`.

**`js/render.js` (2D-Fallback, minimal)**: Flieger 10 % Alpha + ✈-Marker; brennende Felder orange Overlay; `setAirView` = Opacity-Flip ohne Kipp.

**`index.html`**: `#air-view-btn` unten im `#ui-container`, teilt sich die Zeile 50/50 mit `#end-turn-btn`.

## 7. Meilensteine (Spiel bleibt nach jedem spielbar)

| M | Inhalt | Verifikation |
|---|---|---|
| **M5a** | Daten + Sprites + Bewegung/Angriff/Konter-Logik, Flieger debug-spawnbar, 3D-Luft-Layer (volle Deckkraft) | Konter-Matrix-Checkliste im Hotseat (jede Zeile aus Abschnitt 3); Flug über Mauer/Turm/Stein/Dorf; Boden läuft unter Flieger durch; 2 Flieger stapeln nicht; **Sprite-Abnahme per Screenshot** |
| **M5b** | Feuer-System: Anzünden, Feuersturm, `fi[]`, Brand-Ticks, Feuer-Rendering | Anzünden = exakt 4+4 über 2 Züge; Feuersturm trifft eigene+fremde Boden, nicht Luft; Betreten-Schaden; Felder erlöschen nach 2 Runden; Undo nach jeder Aktion |
| **M6** | Rekrutierung, Absprung, Lufttransport, Sturzangriff, factionUnitMap-Fix, Rest-Aktions-Checks | Jede Fraktion rekrutiert ihren Flieger; Absprung Umkreis 2 + Schuss im selben Zug; gelandet erobern; Aufladen→Flug über Mauer→Absetzen; Träger-Tod tötet Fracht; Sturzangriff auf Boden-, Luft- und Gebäudeziel (Gleiter weg, Kopfgeld gezahlt); End-Turn-URL round-trippt mit `ld/cg/bn/fi` |
| **M7** | Luftansicht: Kipp-Toggle, 10 %-Opacity, Klick-Ebenen + Zyklus | Gestapeltes Hex: Bodenansicht wählt Boden, Luftansicht Luft, Re-Klick wechselt; Schadensvorschau zeigt richtiges Ziel |
| **M8** | Integrations-Pass: Veteranen, Recap, Events, Diplomatie, Serialisierung, 3-Spieler-Partie | Verbündeter Flieger nicht angreifbar; Recap zeigt Luft-Aktionen; URL-Längen-Check; **Playtest mit Christian & Vincent** |

## 8. Balance-Flags (nach Playtest prüfen)

- Ballon 9G/14 HP: Türme brauchen 3 Schuss — zu zäh/zu weich?
- Feuersturm 5 Holz: Frequenz im echten Spiel
- Gleiter BEW 4: Karten-Durchquerung in 2–3 Zügen ok? Sturzangriff 9 Schaden für 6 G Einsatz — Trade fair?
- Fallschirm 4G: Absprung+Schuss im selben Zug zu stark?
- Lufttransport: darf der Elefant (9G) getragen werden? Vorerst ja — beobachten
- Feuer-Kills geben keinen Veteranen-Credit; Feudal-Heilung wirkt auf schwebende Flieger
