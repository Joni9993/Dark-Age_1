# Die Unterwelt — Designplan (Phase 3)

Stand: 17.07.2026 · abgestimmt mit Jonathan · Voraussetzung: Kamerafokus-Zyklus (Standard/Luft/Unterwelt, bereits umgesetzt auf `feature/underworld`: `cycleCameraFocus`, Kamera unter der Karte, `isSurfaceVisible`, Unterwelt-Feldauswahl)

**Tonalität (verbindlich): nichts Okkultes.** Kein „Ritual", kein Erwecken/Beschwören, keine Untoten. Die Lore der Tiefe speist sich aus Bergbau, Ingenieurskunst, Mittelalter-Handwerk und Tierwelt — dieselbe Welt wie oben, nur unter Tage.

## 1. Überblick

Die Unterseite der Karte ist eine zweite Spielebene aus **massivem Fels** — deterministisch aus dem Seed generiert wie das Oberflächen-Terrain (`getUnderworldType(state, x, y)` analog `getTerrainType`, nichts davon im State). Dort gilt ein invertiertes Regelset:

| Oben | Unten |
|---|---|
| Freie Bewegung, gebaute Hindernisse (Mauern) | Alles ist Hindernis — **Bewegung wird gegraben** |
| Sichtfeld + persistente Erkundung | **Nur das eigene Stollennetz sichtbar**, keinerlei Umgebungssicht |
| Aufklärung durch Sicht | Aufklärung durch **Gehör** (Grabgeräusche, Richtungs-Ping) |
| Flankenmanöver, offene Schlachten | **Engstellen-Kampf** in 1-Hex-Gängen — der Vorderste blockt |
| Neutralität ist passiv (leere Dörfer) | **PvE**: Höhlentiere reagieren auf Lärm |

**Einziger Unterwelt-Siegweg:** die **Herzkaverne** unter dem zentralen Wachturm erobern (Wächter: der Alte Wurm) und **4 Runden erschließen** → Sieg über die gesamte Partie. **Grundprinzip (Korrektur Juli 2026):** Tiefeneinheiten haben **keinerlei Auswirkung auf das Spiel oben** — es gibt keine Kammer/Unterminierung mehr, die von unten Oberflächen-Strukturen beschädigt. Der Sprengmeister hat stattdessen **Dynamit** (s. Abschn. 6), das rein innerhalb der Unterwelt wirkt.

## 2. Weltaufbau (seed-deterministisch)

Unterwelt-Terrain-Typen, erzeugt aus `sd` (eigener Hash-Kanal, damit oben/unten unkorreliert sind):

| Typ | Bedeutung |
|---|---|
| **Fels** | Standard, massiv — nur durch Graben passierbar |
| **Kaverne** | natürliche hohle Tasche (alte Wühlgänge des Wurms), bereits offen, nicht miteinander verbunden |
| **Kristallader** | Fels mit Kristallen — Gesamtmenge seed-deterministisch zufällig zwischen 4 und 12 (Korrektur Juli 2026, vorher fix 4). Wird abgebaut wie Steinhaufen oben (Toggle-Abbau, kein Aktionsverbrauch), danach offener/begehbarer Gang |
| **Stollenruine** | verlassene Gänge eines längst verschwundenen Bergvolks: fertige Korridore + **Fundkammer** (einmalige Beute: Kristalle oder eine Reliquie) |
| **Herzkaverne** | fixe große Kaverne (Zentrum + 6 Nachbarn(angepasst auf map größe) **exakt unter dem zentralen Wachturm** — beide Machtorte der Karte liegen senkrecht übereinander |

Verteilung fairness-gebändert wie `SPAWN_BUDGETS` oben (gleiche Kristall-/Ruinen-Chancen pro Spieler-Sektor); nach dem Tuning mit einem `maptest`-Analog messen.

**Lore-Anker:** Die bestehenden Tunnel (`tu[]`) führten schon immer *durch* die Unterwelt — das erklärt rückwirkend, warum sie unter Fronten hindurchkommen. Der Tunnelbau öffnet daher automatisch das Unterwelt-Hex unter seinem **Startpunkt** (Korrektur Juli 2026, s. u.).

## 3. Regeln unten

**Graben:** Nur der Arbeiter (die Ebenen-Brücke, s. u.) und der Bohrwagen können Fels entfernen — 1 Hex pro Zug (Bohrwagen 2). Gegrabene Hexes sind dauerhaft offen und für alle Tiefeneinheiten begehbar (auch gegnerische — angeschnittene Netze verbinden sich).

**Bewegen + Angreifen/Fähigkeit im selben Zug (Korrektur Juli 2026):** Tiefeneinheiten agieren jetzt exakt wie Oberflächen-Einheiten — Bewegung hinterlässt den Zwischenzustand `a=2` ("hat sich bewegt, darf noch GENAU eine weitere Aktion"), das Aktionsmenü öffnet danach automatisch mit den von der neuen Position frisch berechneten Angriffs-/Grab-/Fähigkeits-Optionen erneut, eine zweite Bewegung im selben Zug bleibt aber ausgeschlossen. Angriff/Graben/Dynamit/Stollenbruch/Ab- und Aufsteigen sind daher aus `a=0` ODER `a=2` nutzbar und verbrauchen die Aktion vollständig (`a=1`). Einzige Ausnahme: der Bohrwagen darf 2x/Zug graben — nur seine allererste Grabung des Zuges (aus `a=0`) hinterlässt ebenfalls `a=2`, jede weitere Aktion danach (2. Grabung oder Angriff, auch nach vorheriger Bewegung) verbraucht sie endgültig.

**Sicht („Nur Stollen sichtbar"):** Ein Spieler sieht dauerhaft die **Geometrie** seines Netzes: alles selbst Gegrabene + jedes offene Hex, das eine eigene Einheit je betreten hat (persistiert wie Fog, `compressFog`-Muster). Keinerlei Umgebungssicht in den Fels hinein. **Bewegliches** (fremde Einheiten, Kreaturen) ist nur im **Umkreis 2 um eigene Einheiten** sichtbar — bekannte Gänge können also jederzeit Hinterhalte enthalten.

**Gehör:** Graben, Abbau und Dynamit-Arbeiten erzeugen **Lärm**. Fremder Lärm im Umkreis 3 einer eigenen Einheit erzeugt eine ungefähre **Richtungsmarkierung** (Sektor, kein exaktes Hex) — die einzige Fernaufklärung der Tiefe. Der Horcher (Spionage) macht daraus exakte Ortung.

**Engstellen-Kampf:** In Gängen gibt es kein Vorbeikommen — wer vorn steht, blockt. **Engstelle** = offenes Hex mit ≤ 2 offenen Nachbarn; die Grubenwache nimmt dort −1 Schaden. Flankieren heißt unten: sich eine Flanke *graben*.

**Nachschub & Moral:** Kampfeinheiten (17–22) werden am **Stollenkopf** gekauft (Unterwelt-Hex unter dem **Startpunkt** eines eigenen Tunnels — s. u.), bezahlt mit Gold von oben. Verliert ein Spieler **seinen letzten Tunnel** in die Unterwelt (zerstört/unterminiert), setzt der **Moral-Kollaps** ein: alle seine Tiefeneinheiten verlieren **1 HP zu Beginn jedes eigenen Zuges**, bis wieder ein Tunnel steht. Tunnel-Jagd oben ist damit die schärfste Antwort auf eine starke Tiefen-Expedition.

**Ebenen-Wechsel:** **Nur der Arbeiter** wechselt zwischen den Ebenen — **kein eigener Tunnelgräber-Einheitstyp** (zweite Korrektur Juli 2026: Jonathan wollte nicht zwei verschiedene "Tunnelgräber" im Dorf-Menü sehen — Arbeiter UND Tunnelgräber wirkten wie Dopplung). Der ganz normale, im Dorf rekrutierte Arbeiter (kein Fraktions-Lock) läuft zu seinem eigenen Tunnel-Startpunkt; steht er dort, bietet ihm das Menü zusätzlich zum normalen Tunnelgang die Option **„Abtauchen"** an — er behält dabei seinen Typ und seine Oberflächen-Werte, es findet **keine Typumwandlung** statt (kein separater Unterwelt-Stat-Block). Am Stollenkopf unten kann er wieder **„Aufsteigen"**. Es gibt **keinen Kauf eines Tunnelgräbers am Stollenkopf** — der einzige Weg nach unten ist, den eigenen Arbeiter runterzuschicken.

**Stollenkopf-Regel (Korrektur Juli 2026):** Ein Tunnel hat zwei Enden — den **Startpunkt** (die Bewegungsreichweite der bauenden Einheit, also physisch nahe eigenem Territorium) und den frei wählbaren **Zielpunkt** (jedes bereits entdeckte Feld, ggf. weit weg). Der Stollenkopf entsteht **ausschließlich unter dem Startpunkt** — sonst könnten Spieler ihren Tunnel-Zielpunkt direkt in die Herzkaverne legen und hätten ungegraben freien Zugang zum Wurm und zum Siegweg. Der Zielpunkt bleibt für alles andere unverändert (Oberflächen-Teleport) — nur das Unterwelt-HUB hängt am Startpunkt.

## 4. Das Roster (Typ-IDs 17–22 + der Arbeiter als Ebenen-Brücke)

Alle Kosten/Werte sind **Balance-Erstentwurf** (Playtest-Vorbehalt wie bei den Lufteinheiten).

**Kein eigener Tunnelgräber-Typ** (Korrektur Juli 2026): die Ebenen-Brücke ist der ganz normale **⛏ Arbeiter** (Typ 7, 2 G, 10 HP, BEW 1, 2 DMG — Oberflächen-Werte gelten unverändert auch unten, kein separater Stat-Block, keine Typumwandlung beim Ab-/Aufsteigen). Zusätzlich zu seinen bestehenden Oberflächen-Fähigkeiten (Mauer/Turm/Tunnel bauen, Stein abbauen) kann er unten graben und Kristalladern abbauen — exakt dieselben Fähigkeiten, die früher am eigenen Tunnelgräber-Typ hingen.

| | 🛡 Grubenwache | 💥 Sprengmeister |
|---|---|---|
| Typ-ID | 17 | 18 |
| Verfügbar | alle | alle |
| Rekrutierung | am Stollenkopf | am Stollenkopf |
| Kosten | 5 G | 6 G |
| HP | 14 | 8 |
| Bewegung | 2 | 2 |
| Angriff | 4 DMG, RW 1 | 3 DMG, RW 1 |
| Fähigkeiten | **Schildstellung**: −1 erlittener Schaden in Engstellen | **Dynamit** (s. Abschn. 6) · **Stollenbruch**: eigenes offenes Nachbar-Hex wieder verfüllen (Verfolger aussperren, Gegenstollen kappen) |

| | ⚔ Grubenritter | 🪙 Beutegräber | 👂 Horcher | ⚙ Bohrwagen |
|---|---|---|---|---|
| Fraktion | Feudalismus (0) | Plünderer (1) | Spionage (2) | Gilden (3) |
| Typ-ID | 19 | 20 | 21 | 22 |
| Kosten | 7 G | 5 G | 4 G | 9 G |
| HP | 16 (+`fb`-Bonus) | 10 | 8 | 14 |
| Bewegung | 2 | 3 | 2 | 1 |
| Angriff | 5 DMG, RW 1 | 4 DMG (+1 Plünderer-Passiv), RW 1 | 3 DMG, RW 1 | 4 DMG Rammbohrer, RW 1 |
| Fähigkeit | Elite-Gangkämpfer — hält Engstellen quasi allein (Schildstellungs-Bonus wie 17) | plündert Fundkammern/Adern doppelt so schnell · stiehlt getragene Kristalle beim Kill · Kopfgeld-Upgrade greift auf Kreaturen | **Lauschen**: Lärm-Pings im Umkreis 5 als exaktes Hex statt Richtung · unsichtbar (`iv`) in offenen Gängen | **gräbt 2 Hex/Zug** — die Gilden untergraben schneller als alle anderen |

Fraktions-Passiva und Veteranen-System (2 Kills → +1 DMG) gelten wie oben; Kreaturen-Kills zählen für Veteranenstatus. `factionUnitMap`-Erweiterung: `{0:[…,19], 1:[…,20], 2:[…,21], 3:[…,22]}`.

## 5. PvE — die Tierwelt der Tiefe

Kein Bergvolk mehr am Leben, keine Geister — nur Tiere und Ruinen.

**Korrektur Juli 2026 — "Runden-Phase + Telegraph" (civ-artige Barbaren-Phase × Into-the-Breach-Telegraph):**
im ursprünglichen Entwurf zogen Kreaturen bei **jedem** `doEndTurn` (jedem Spielerzug-Ende) — bei 6 Spielern wurde
eine Einheit so bis zu 6x angegriffen, bevor ihr Besitzer je reagieren konnte. Neues Modell: Kreaturen agieren
**genau 1x pro Runde**, beim Rundenwechsel (`uwCreatureRoundPhase()`, `js/logic.js`, aufgerufen aus `doEndTurn`/
`confirmSurrender` sobald `gameState.rn` hochzählt). Jeder bevorstehende Treffer wird dabei eine volle Runde
**vorher** als Ziel-Hex markiert (Telegraph, `c.ap = {p: patternIdx, d: dirIdx}`) — **jeder Spieler hat also
mindestens einen vollen Zug Zeit zum Ausweichen**, unabhängig von Spieleranzahl/-reihenfolge. Grundprinzip: **wer
auf einem markierten Feld stehen bleibt, wird getroffen — egal wessen Einheit es ist**, auch eine, die erst nach
der Markierung dorthin gezogen ist. Kreaturen schaden Kreaturen nie.

Ablauf eines Aufrufs von `uwCreatureRoundPhase()`:
1. **Auflösung:** die in der Vorrunde gesetzten Telegraphen lösen aus — jede Spieler-Einheit auf einem der über
   `getCreatureAttackHexes(state, creature)` (rein, aus Position + `c.ap` abgeleitet) berechneten Ziel-Hexes nimmt
   Schaden.
2. **Bewegung:** danach zieht jede Kreatur — **Jagd** (Ziel via `uwNearestPlayerUnit` im Aggro-Radius vorhanden):
   bis zu `huntMove` Schritte, jeder Schritt verringert die Distanz zum Ziel strikt, stoppt bei Distanz 1 (nie AUF
   die Einheit); der Blindwühler darf dabei massiven Fels aufgraben (Adern mit Restbestand umgeht er weiterhin).
   Ohne Ziel: **Patrouille**, genau 1 Schritt, kreaturspezifisch (s. Tabelle).
3. **Neue Telegraphen:** erneuter Ziel-Scan nach der Bewegung — nur mit Ziel bekommt die Kreatur eine neue Markierung
   (`p`: kleine Kreaturen `rn % 2`, Wurm `rn % 4`; `d`: die Achsenrichtung, deren Distanz-1-Hex dem Ziel am
   nächsten liegt), sonst wird eine bestehende Markierung gelöscht.

Telegraph-Ziel-Hexes werden **nie gespeichert** — Kreaturen bewegen sich innerhalb einer Runde nicht, daher lassen
sie sich jederzeit verlustfrei aus (Position, `c.ap`) neu ableiten.

| Kreatur | HP | DMG | Aggro | Jagd/Runde | Patrouille/Runde | Verhalten |
|---|---|---|---|---|---|---|
| 🕷 **Höhlenspinne** | 6 | 4 | 3 | 2 | 1 | nistet in Kavernen; Netze machen ein Gang-Hex zur Engstelle mit Bewegungsstopp (legt nach jeder Bewegung eins auf ihrem Hex ab); patrouilliert im Umkreis 2 ihres Nests |
| 🦡 **Blindwühler** | 12 | 5 | 5 (hört am weitesten) | 2 | 1 | gräbt sich selbst durch massiven Fels — auf der Jagd wie auf Patrouille (zieht ohne Ziel auf die letzte Lärmquelle im Umkreis 4 zu, nutzt dabei auch fremde Stollen). Wer viel gräbt, gräbt sich seine Feinde herbei |
| 🪨 **Steinpanzer** | 28 | 6 | 3 | 1 (bewusst langsam — große AoE) | 1 | sitzt auf den reichsten Kristalladern; Patrouille-Schritte nur, wenn danach weiterhin eine Ader mit Restbestand angrenzt (Wachposten-Regel), sonst steht er |
| 🐛 **Der Alte Wurm** | 30 | 8 | 3 | 2 (Leine: nie weiter als 3 Hexes vom Herzkaverne-Zentrum) | 1 | **Wächter der Herzkaverne**. Ohne Ziel: außerhalb Distanz 1 vom Zentrum 1 Schritt zurück, sonst 1 Schritt im Ring 1 (Patrouille ums Herz). Muss besiegt werden, bevor die Erschließung beginnen kann — stirbt einmal, bleibt tot (globale Meldung: „Ein Beben läuft durch das Land — der Alte Wurm ist gefallen") |

**Angriffsmuster** (`getCreatureAttackHexes`, geometrisch exakt über `uwHexInDirection`/`hexRingAround`/die
Dynamit-Dreiecks-Geometrie `getDynamiteTriangle`/den Keil-Helper `getWedgeHexes`, alle `js/hex.js`+`js/logic.js`):

| Kreatur | Muster p0 | Muster p1 | Muster p2 | Muster p3 |
|---|---|---|---|---|
| Spinne | „Sprungbiss": Linie 2 in Richtung `d` | „Umklammern": Distanz-1-Hex in `d` + dessen 2 gemeinsame Nachbarn | — | — |
| Blindwühler | „Grabstoß": Linie 3 in Richtung `d` | „Beben": Ring 1 (6 Hexes) | — | — |
| Steinpanzer | „Felsschlag": Ring 1 (6 Hexes) | „Erdrutsch": 120°-Keil bis Distanz 2 in Richtung `d` (6 Hexes) | — | — |
| Alter Wurm | Ring 1 (6 Hexes) | **nur** Ring 2 (12 Hexes, Ring 1 bleibt sicher!) | 6 Strahlen à 3 Felder, alle Achsen (18 Hexes) | „Wirbel": zwei gegenüberliegende Erdrutsch-Keile in `d` und `d+3` (12 Hexes) |

Lärm-Logik: jede Grab-/Abbau-/Dynamit-Aktion hinterlässt einen Lärm-Marker (Hex + Runde, transient, `uw.n`). Der
Blindwühler zieht am Rundenende darauf zu, solange kein Spieler-Ziel in Aggro-Reichweite ist. Kämpfe erzeugen
ebenfalls Lärm — ein PvP-Gefecht kann ihn anlocken, der dann *beide* Seiten anfällt.

**UI:** rote Markierungen mit 🎯-Symbol zeigen Telegraph-Hexes an — sichtbar, sobald das Hex im eigenen Stollen-Netz
liegt (`uwVis`), unabhängig von der sonstigen Umkreis-2-Sichtregel für bewegliche Kreaturen (die Markierung selbst
ist der Fairness-Kern des Systems, die Kreatur dahinter darf verborgen bleiben). Das Info-Panel eines angeklickten
Hex zeigt zusätzlich „🎯 [Kreaturname] greift dieses Feld am Rundenende an (X DMG)".

## 6. Dynamit (taktisches Werkzeug, kein Siegweg, ersetzt Unterminierung — Korrektur Juli 2026)

**Grundprinzip:** Tiefeneinheiten haben KEINERLEI Auswirkung auf das Spiel oben. Die frühere Unterminierung (Kammer/Zünden gegen Oberflächen-Strukturen) ist komplett gestrichen — Dynamit wirkt ausschließlich innerhalb der Unterwelt.

- **Ziel:** ein angrenzendes, noch massives **Fels-Hex** ("im Gebirge platzieren") — kein Oberflächen-Ziel mehr, keine Priorität Startdorf/Turm/Mauer/Tunnel.
- Der **Sprengmeister** wählt sein Fels-Ziel: Aktion **„Dynamit legen"** (kostet **1 Holz**, 1 Zug, laut). Die Ladung liegt lose in der Unterwelt (nicht am Gerät selbst) und explodiert automatisch, **sobald der platzierende Spieler seinen nächsten Zug startet** — unabhängig davon, wohin sich der Sprengmeister danach noch bewegt.
- **Wirkung:** ein **Dreieck aus 3 Hexes** (das Ziel-Hex + die beiden Hexes, die zusammen mit Platzierer und Ziel die anliegende Dreiecksfläche bilden — geometrisch eindeutig, keine weitere Zielwahl nötig). Jedes der 3 Hexes: **6 Schaden** auf eine dort stehende Tiefeneinheit/Kreatur (AoE, auch eigene Truppen — Friendly Fire wie beim Feuersturm der Bombenballon oben), und jedes noch geschlossene Hex (Fels oder unangebrochene Ader) wird dauerhaft offen — **"das Gebirge wegsprengen, um den Weg freizumachen"**. Eine erwischte Ader wird dabei zerstört statt sauber abgebaut.
- Rührt **nie** an `tu[]`/`wa[]`/`tw[]`/`p[].sh` — auch wenn ein Ziel-Hex zufällig unter einem Stollenkopf liegt, bleibt die Tunnel-HP unangetastet.
- Keine Oberflächen-Anzeige (kein Beben-Indiz oben) — die Ladung ist nur innerhalb der Unterwelt sichtbar (🧨-Icon auf den 3 Ziel-Hexes, gemäß der normalen Netz-Sichtregeln).
- Krater/Einsturz-Löcher, die die Ebenen physisch verbinden: **bewusst verschoben** (Phase 4-Idee), kollidiert vorerst mit „nur der Arbeiter wechselt die Ebene".

## 7. Ökonomie: Kristalle & Reliquien

- **Kristalle** (`p[].k`) entstehen nur unten (Adern, Fundkammern). Abbau läuft als **Toggle** (Korrektur Juli 2026, Muster: Steinabbau des Arbeiters oben) — „Abbau starten"/„stoppen", verbraucht keine Aktion, läuft automatisch am Zugende, solange die Einheit in Reichweite (eigenes Hex oder angrenzend) einer Ader mit Restbestand steht. **Tragen bleibt nötig, aber ohne Obergrenze** (`u.cr`, uncapped) — die Fracht muss weiterhin physisch zum eigenen Stollenkopf getragen werden, liefert dort aber **automatisch** ab, sobald die Einheit auf/neben ihm steht (kein manueller „Abliefern"-Klick mehr). Stirbt ein Träger, **fällt seine Fracht als Haufen** auf das Sterbe-Hex (`uw.dr`) — jede andere trage-fähige Einheit (Arbeiter, Beutegräber) sammelt ihn beim Betreten automatisch ein; ein Beutegräber-Kill stiehlt sie stattdessen direkt (uncapped).
- **Reliquien** = Fundstücke alter Handwerkskunst (nicht sakral!), kaufbar für Kristalle im Dorf-Menü, Erstentwurf:
  - **Damaszener Klinge** (4 💎): eine Einheit permanent +5 DMG
  - **Harnisch des Bergvolks** (4 💎): eine Einheit permanent +10 max-HP
  - **Meisterwerkzeug** (3 💎): ein Bauwerk (Mauer/Turm/Tunnel/Startdorf) sofort auf volle HP
  - **Karte der Tiefe** (5 💎): deckt dauerhaft die gesammte MAP(oberfläche als auch unterwelt) auf

## 8. Der Herz-Sieg: die Erschließung

1. **Wurm besiegen** (Abschn. 5) — stärkste PvE-Hürde des Spiels, verhindert Früh-Rushes.
2. **Erschließung starten:** eigene Einheit im Zentrum der Herzkaverne, keine gegnerische Einheit in der Kaverne (7 Hexes). Zähler `hz = {p, n}`.
3. **4 eigene Zugenden halten.** Wird die Bedingung unterbrochen (Zentrum verloren oder Gegner in der Kaverne), **fällt der Zähler auf 0 zurück**.
4. Ab Start der Erschließung erfahren es **alle** über das Event-System: „Die Erde bebt — {Spieler} erschließt das Herz der Tiefe" + sichtbarer Countdown im HUD + Beben-Effekt am zentralen Wachturm. Volle Information, kein heimlicher Sieg.
5. Nach Runde 4: Sieg über die Gesamtpartie („Wer das Fundament des Landes hält, dem beugt sich die Oberfläche") — läuft durch die normale Win-Check-/Team-Logik (Diplomatie: verbündete Einheiten in der Kaverne unterbrechen nicht).

**Gegenspiel-Wege:** eigene Expedition in die Herzkaverne (1 Einheit in der Kaverne genügt zum Unterbrechen) · Tunnel des Erschließers oben zerstören/unterminieren → Moral-Kollaps seiner Expedition · Beutegräber/Horcher-Guerilla in seinen Stollen.

## 9. UI / UX

- **Kamerafokus-Zyklus** (fertig): Standard → Luftansicht → Unterwelt. Im Unterwelt-Fokus ist die Oberfläche komplett aus (nicht sichtbar, nicht anwählbar) — Spiegelbild der strikten Ebenen-Trennung der Luftansicht.
- **Unterseiten-Rendering:** Fels = geschlossene dunkle Tile-Unterseiten; offene Hexes „ausgehöhlt" (vertieft, wärmeres Material); Kristalladern glitzern; Herzkaverne mit eigenem Großmodell (`voxelModels`). Einheiten stehen als Voxel-Billboards in den Gängen, von unten betrachtet. 2D-Fallback (`?r2d=1`): abgedunkelte Karte mit Gang-Overlays.
- **Klick-Flow:** `handleUnderworldClick` (existiert) wächst zum vollen Pendant von `handleCanvasClick`: Auswahl → Grab-/Bewegungs-/Angriffs-Vorschau → Aktionsmenü (`mkBtn`-Muster: „⛏ Graben", „💎 Abbau starten"/„🛑 Abbau stoppen" (Toggle, Korrektur Juli 2026), „🧨 Dynamit legen" (Korrektur Juli 2026, ersetzt Kammer/Zünden), „🕳 Aufsteigen").
- **Gehör-Anzeige:** Richtungs-Pings als pulsierende Sektor-Markierung am Rand des eigenen Netzes; Horcher-Ortung als exaktes Hex-Icon.
- **Countdown & Beben:** Erschließungs-Fortschritt im HUD aller Spieler; Beben-Partikel am Wachturm. Dynamit (Korrektur Juli 2026) hat bewusst KEINE Oberflächen-Anzeige mehr — nur ein 🧨-Icon unten auf den 3 Ziel-Hexes.
- Rekrutierung am Stollenkopf über das bestehende Kauf-Menü-Muster (`buyUnit` ebenenbewusst, wie bei Luft).

## 10. Technische Umsetzung (Skizze)

**State-Schema (neu, delete-defaults an den 3 Sync-Stellen `doEndTurn`/`confirmSurrender`/`bootGame`):**
- `p[].k` — Kristalle
- `p[].ue` — Unterwelt-Erkundung (Netz-Geometrie, `compressFog`-Muster)
- `uw.d` — global gegrabene Hexes (kompakter String, gleiche Kompression)
- `uw.u[]` — Tiefeneinheiten (gleiche Feldnamen wie `u[]`: `p,t,x,y,h,a,vet,k` + `cr` Kristalle uncapped, `mi` Abbau-Toggle-Ziel `{x,y}` wie beim Arbeiter oben)
- `uw.dy` — platzierte Dynamit-Ladungen (Korrektur Juli 2026, ersetzt `u.ch`): `[{p: Besitzer, hexes: [{x,y}, {x,y}, {x,y}]}]`, detoniert automatisch am nächsten Zugstart des Besitzers
- `uw.dr` — herrenlose Kristallhaufen `{"x,y": Menge}` (Korrektur Juli 2026: fällt beim Tod eines Trägers, wird von trage-fähigen Einheiten beim Betreten automatisch eingesammelt)
- `uw.c[]` — Kreaturen `{t, x, y, h}`; Wurm tot = Eintrag fehlt + Flag `uw.wd = 1`
- `uw.n[]` — Lärm-Marker der letzten Runde `{x, y}` (transient, wird pro Runde ersetzt)
- `uw.hz` — Erschließung `{p, n}`
- `u.rq[]`-Analogie für Reliquien: `p[].rel[]` gekaufte, `u[].art` ausgerüstete Reliquie

**Terrain:** `getUnderworldType(state, x, y)` in `js/hex.js` neben `getTerrainType` (eigener Seed-Hash-Kanal). Offen = natürlich offen (Kaverne/Ruine/Herz) ODER in `uw.d`.

**Logik:** eigene, kleine Parallel-Funktionen statt Verzweigung der Boden-Logik: `calculateMovesUW` (BFS nur über offene Hexes; Graben als 1-Hex-Sonderzug), `calculateAttacksUW`, Engstellen-Check als Helper `isChokepoint(x, y)`. Kreaturen-Zug + Moral-Kollaps + Erschließungs-Zähler deterministisch in `doEndTurn` (Muster: Brand-Ticks).

**Renderer:** Unterseiten-Szene im 3D-Renderer (Kamera-Infrastruktur existiert); `Renderer.pickHex` funktioniert bereits von unten. 2D-Fallback minimal.

## 11. Meilensteine (Spiel bleibt nach jedem spielbar)

| M | Inhalt | Verifikation |
|---|---|---|
| **M9a** | Unterwelt-Terrain-Generierung + Unterseiten-Rendering (Fels/Kaverne/Ader/Ruine/Herz) + Debug-Tools (Aufdecken, Spawnen) | gleiche Karte bei gleichem Seed; Fairness-Kurzanalyse; Kamera-Roundtrip ohne Render-Artefakte |
| **M9b** | Ebenen-Brücke: Arbeiter (kein eigener Tunnelgräber-Typ, zweite Korrektur Juli 2026) taucht am Tunnel-Startpunkt ab/auf, Graben, Netz-Sicht + Persistenz, Gehör-Pings | Tunnel bauen → Arbeiter hinschicken → abtauchen → graben → Kristall abbauen → aufsteigen/abliefern; Sicht zeigt nur eigenes Netz; URL-Roundtrip mit `uw.*` |
| **M10** | Kampfeinheiten 17–22, Engstellen-Regel, Kristall-Tragen/Stehlen, Reliquien-Shop | Engstellen-Bonus greift; Beutegräber-Diebstahl; jede Fraktion rekrutiert ihre Tiefeneinheit; Reliquie kauf- und ausrüstbar |
| **M11** | PvE: Spinne/Wühler/Steinpanzer + Lärm-System + Alter Wurm; **Korrektur Juli 2026**: Runden-Phase + Telegraph (ersetzt das Pro-Zug-Modell) | Determinismus über mehrere Runden-Phasen; Telegraph→Ausweichen (kein Schaden) vs. Stehenbleiben (exakter Schaden), besitzerunabhängig; Wurm-Leine hält über viele Phasen; Jagd-/Patrouille-Reichweiten korrekt; Muster-Geometrien exakt (Ring 2 ohne Ring-1-Überlappung, 18-Hex-Strahlen, 6-Hex-Keile); kein Telegraph ohne Ziel; Wurm verteidigt Herz, bleibt nach Tod tot |
| **M12** | Dynamit (ersetzt Unterminierung, Korrektur Juli 2026) + Moral-Kollaps + Erschließung + Sieg + Events/Countdown oben | Dynamit-Dreieck = exakt 6 DMG pro Hex, wirkt NIE auf tu/wa/tw/p[].sh; letzter Tunnel weg → −1 HP/Zug; Erschließung unterbricht/resettet korrekt; Sieg feuert Win-Check inkl. Team-Logik |
| **M13** | Integrations-Pass: Recap, Diplomatie, Serialisierung/Blob-Größe, Guide (`darkages_guide.html`), 3-Spieler-Partie | Recap zeigt Tiefen-Aktionen; Verbündeten-Regeln in der Kaverne; Blob-Längen-Check; **Playtest mit Christian & Vincent** |

## 12. Balance-Flags & offene Fragen (nach Playtest / vor M-Start klären)

- Wurm 30 HP / 8 DMG AoE (unbedingter Konter beim Angreifen, `resolveUWAttackOnCreature`): mit 4–5 Einheiten schaffbar? Soll er zwischen Kämpfen regenerieren?
- Runden-Phase + Telegraph (Korrektur Juli 2026): neue DMG-Werte (Spinne 4, Wühler 5, Steinpanzer 6, Wurm 8) + Aggro-/Bewegungswerte reiner Erstentwurf — fühlt sich "genau ein Zug zum Ausweichen" fair an, oder ist das bei mehreren gleichzeitig telegraphierenden Kreaturen (z. B. Spinne + Wühler auf überlappenden Feldern) zu viel Druck pro Runde? Steinpanzer-Erdrutsch/Wurm-Wirbel-Muster (6/12 Hexes) ggf. zu großflächig für die Kartenradien 5/7.
- Erschließung 4 Runden + Zähler-Reset auf 0: zu hart? Alternative: Reset nur um −1 pro Unterbrechungsrunde.
- Expeditionsgröße: aktuell nur durch Gold begrenzt — braucht es ein hartes Limit (z. B. max. 6 Einheiten unten)?
- Moral-Kollaps −1 HP: reicht das als Druck, oder zusätzlich „kein Heilen/Kein Kauf" ohne Tunnel?
- Bohrwagen 2 Hex/Zug: untergräbt (haha) er das Grab-Tempo-Gefüge? Ggf. 2 Hex nur geradeaus.
- Kristall-Preise der Reliquien und Aderngrößen — komplett Playtest-Sache.
- Sicht-Kompromiss „Geometrie persistent, Bewegliches nur Umkreis 2": im Playtest prüfen, ob Hinterhalte sich gut anfühlen oder nur frustrieren.
- Krater/physische Ebenen-Durchbrüche: Phase-4-Idee, bewusst raus.
- Sprites/Modelle: 6 neue `pixelSprites` (17–22, der Arbeiter (7) nutzt sein bestehendes Sprite auch unten) + Kreaturen (4) + Herzkaverne als `voxelModels`-Großmodell — Abnahme wie bei Luft per Debug-Spawn + Screenshot.
