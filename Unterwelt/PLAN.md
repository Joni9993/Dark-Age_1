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

**Einziger Unterwelt-Siegweg:** die **Herzkaverne** unter dem zentralen Wachturm erobern (Wächter: der Alte Wurm) und ihren **Kern** **3 eigene Zugenden lang erschließen** (`ERSCHLIESSUNG_TARGET`, js/logic.js — ursprünglich 4, dann 5, seit Korrektur Aug 2026 **3**) → Sieg über die gesamte Partie. **Grundprinzip (Korrektur Juli 2026):** Tiefeneinheiten haben **keinerlei Auswirkung auf das Spiel oben** — es gibt keine Kammer/Unterminierung mehr, die von unten Oberflächen-Strukturen beschädigt. Der Sprengmeister hat stattdessen **Dynamit** (s. Abschn. 6), das rein innerhalb der Unterwelt wirkt.

## 2. Weltaufbau (seed-deterministisch)

Unterwelt-Terrain-Typen, erzeugt aus `sd` (eigener Hash-Kanal, damit oben/unten unkorreliert sind):

| Typ | Bedeutung |
|---|---|
| **Fels** | Standard, massiv — nur durch Graben passierbar |
| **Kaverne** | natürliche hohle Tasche (alte Wühlgänge des Wurms), bereits offen, nicht miteinander verbunden |
| **Kristallader** | Fels mit Kristallen — Gesamtmenge seed-deterministisch zufällig zwischen 4 und 12 (Korrektur Juli 2026, vorher fix 4). Wird abgebaut wie Steinhaufen oben (Toggle-Abbau, kein Aktionsverbrauch), danach offener/begehbarer Gang |
| **Stollenruine** | verlassene Gänge eines längst verschwundenen Bergvolks: fertige Korridore + **Fundkammer** (einmalige Beute: Kristalle oder eine Reliquie) |
| **Herzkaverne (Kern)** | `UW_HERZ`, `getHeartCoreHexes` — **Zentrum + voller Ring 1 = 7 Hexes, auf JEDER Kartengröße gleich** (Korrektur Sept 2026, s.u.), **exakt unter dem zentralen Wachturm** (dasselbe Hex wie `ct`): beide Machtorte der Karte liegen senkrecht übereinander. Nur hier zählt die Erschließung, und nur hier hält ein Gegner sie an |
| **Herzweg (Ausläufer)** | `UW_HERZWEG`, `getHeartArmHexes` — die 6 Sternarme: je ein Hex pro Kubik-Achse in Ring 2 (ab Radius 6) bzw. zusätzlich Ring 3 (ab Radius 9); `i % 2`/`i % 3` über `hexRingAround` trifft geometrisch genau die Ring-Ecken. Radius 5 → **keine**, Radius 7 → **6**, Radius 12 → **12**. Begehbar wie der Kern, aber **ohne jede Spielwirkung** — reiner Zugang. Am Boden als Weg zum Herz erkennbar (s. Abschn. 9) |

Kern und Ausläufer zusammen sind `getHeartCavernHexes` (Optik + Begehbarkeit). Beide Teile sind dauerhaft offen und **nicht verfüllbar** — Stollenbruch greift nur auf selbst gegrabene Hexes (`uw.d`).

**Warum der Kern nicht mitwächst** (Korrektur Sept 2026, Jonathan: *"es ist zu schwer, die Kaverne zu halten"*): vorher war die ganze Sternfläche der zählende Bereich, auf Radius 12 also **19 Hexes** statt 7 — sechs Arme bis Distanz 3, jeder eine eigene Einfallslinie. Das war mit einer realistischen Expedition nicht zu verteidigen, während dieselbe Aufgabe auf Radius 5 mit 7 Hexes gut machbar blieb: derselbe Zielwert bei völlig unterschiedlicher Verteidigungslast. Der Stern bleibt als **Geometrie und Optik** erhalten (er macht das Herz auf großen Karten überhaupt erst auffindbar), zählt aber nicht mehr mit.

Verteilung fairness-gebändert wie `SPAWN_BUDGETS` oben (gleiche Kristall-/Ruinen-Chancen pro Spieler-Sektor); nach dem Tuning mit einem `maptest`-Analog messen.

**Lore-Anker:** Die bestehenden Tunnel (`tu[]`) führten schon immer *durch* die Unterwelt — das erklärt rückwirkend, warum sie unter Fronten hindurchkommen. Der Tunnelbau öffnet daher automatisch das Unterwelt-Hex unter seinem **Startpunkt** (Korrektur Juli 2026, s. u.).

## 3. Regeln unten

**Graben:** Nur der Arbeiter (die Ebenen-Brücke, s. u.) und der Bohrwagen können Fels entfernen — 1 Hex pro Zug (Bohrwagen 2). Gegrabene Hexes sind dauerhaft offen und für alle Tiefeneinheiten begehbar (auch gegnerische — angeschnittene Netze verbinden sich).

**Bewegen + Angreifen/Fähigkeit im selben Zug (Korrektur Juli 2026):** Tiefeneinheiten agieren jetzt exakt wie Oberflächen-Einheiten — Bewegung hinterlässt den Zwischenzustand `a=2` ("hat sich bewegt, darf noch GENAU eine weitere Aktion"), das Aktionsmenü öffnet danach automatisch mit den von der neuen Position frisch berechneten Angriffs-/Grab-/Fähigkeits-Optionen erneut, eine zweite Bewegung im selben Zug bleibt aber ausgeschlossen. Angriff/Graben/Dynamit/Stollenbruch sind daher aus `a=0` ODER `a=2` nutzbar und verbrauchen die Aktion vollständig (`a=1`). Einzige Ausnahme: der Bohrwagen darf 2x/Zug graben — nur seine allererste Grabung des Zuges (aus `a=0`) hinterlässt ebenfalls `a=2`, jede weitere Aktion danach (2. Grabung oder Angriff, auch nach vorheriger Bewegung) verbraucht sie endgültig. **Ab-/Aufsteigen (uwDescend/uwAscend) verbraucht seit einer weiteren Korrektur (Juli 2026) den Zug NICHT mehr** — der Arbeiter landet auf der neuen Ebene mit `a=0` (voller Bewegung + Aktion), damit der Ebenenwechsel nicht wie ein verlorener Zug wirkt.

**Sicht („Nur Stollen sichtbar" + Sichtweite 1, Korrektur Juli 2026):** Ein Spieler sieht dauerhaft die **Geometrie** seines Netzes: alles selbst Gegrabene + jedes offene Hex, das eine eigene Einheit je betreten hat, **plus die 6 Nachbarhexes jeder eigenen Einheit und jedes eigenen Stollenkopfs** (Sichtweite 1 — sonst wären Felsbrocken, Kristalladern und Fundkammern direkt neben dem Gang unauffindbar). Alles davon persistiert wie Fog (`compressFog`-Muster). Tiefer in den Fels hinein sieht man weiterhin nichts (kein Radius-2+-Sichtfeld wie oben). **Bewegliches** (fremde Einheiten, Kreaturen) ist nur im **Umkreis 2 um eigene Einheiten** sichtbar — unabhängig von der Netz-Geometrie; bekannte Gänge können also jederzeit Hinterhalte enthalten.

**Gehör:** Graben, Abbau, Kämpfe, Dynamit, Stollenbruch UND herumlaufende/angreifende Kreaturen erzeugen **Lärm** (`addUWNoise(x, y, type)`, `type` ∈ dig/mine/combat/dynamite/collapse/creature_move/creature_attack — Unterminierung gibt es nicht mehr, durch Dynamit ersetzt). Fremder Lärm im Umkreis 3 einer eigenen Einheit erzeugt eine ungefähre **Richtungsmarkierung** (auf das nächstgelegene eigene Netz-Hex approximiert, kein exaktes Hex) — die einzige Fernaufklärung der Tiefe. Der Horcher (Spionage) macht daraus im Umkreis 5 exakte Ortung. Ein Klick auf ein markiertes Feld zeigt per Tooltip, welche Art Geräusch dort gehört wurde (`UW_NOISE_TYPE_NAMES`, js/logic.js).

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
| Kosten | 5 G | 4 G (Kostenkorrektur Juli 2026, war 6) |
| HP | 14 | 8 |
| Bewegung | 2 | 2 |
| Angriff | 4 DMG, RW 1 | 3 DMG, RW 1 |
| Fähigkeiten | **Wache** (Passiv, Korrektur Juli 2026 — ersetzt Schildstellung, war unverständlich): heilt +2 HP am Rundenende, wenn sie den Zug über NICHT bewegt wurde (Angreifen ist erlaubt, kein Überheilen über Max-HP) | **Dynamit** (s. Abschn. 6) · **Stollenbruch**: eigenes offenes Nachbar-Hex wieder verfüllen (Verfolger aussperren, Gegenstollen kappen) |

| | ⚔ Grubenritter | 🪙 Beutegräber | 👂 Horcher | ⚙ Bohrwagen |
|---|---|---|---|---|
| Fraktion | Feudalismus (0) | Plünderer (1) | Spionage (2) | Gilden (3) |
| Typ-ID | 19 | 20 | 21 | 22 |
| Kosten | 6 G (Kostenkorrektur Juli 2026, war 7) | 4 G (Kostenkorrektur Juli 2026, war 5) | 3 G (Kostenkorrektur Juli 2026, war 4) | 6 G (Kostenkorrektur Juli 2026, war 9) |
| HP | 16 (+`fb`-Bonus) | 10 | 8 | 14 |
| Bewegung | 2 | 3 | 2 | 1 |
| Angriff | 6 DMG, RW 1 (Korrektur Juli 2026, war 5 — teure Elite-Einheit) | 4 DMG (+1 Plünderer-Passiv), RW 1 | 3 DMG, RW 1 | 4 DMG Rammbohrer, RW 1 |
| Fähigkeit | **Sturmangriff** (Korrektur Juli 2026, ersetzt Schildstellung): nach einem Kill (Einheit oder Kreatur) darf sie sich noch einmal frisch bewegen + angreifen — einmal pro eigenem Zug, keine Kill-Ketten | plündert Fundkammern/Adern doppelt so schnell · stiehlt getragene Kristalle beim Kill · Kopfgeld-Upgrade greift auf Kreaturen | **Lauschen**: Lärm-Pings im Umkreis 5 als exaktes Hex statt Richtung · **Sprung**: 2 Hex weit, unabhängig von Fels/Weg dazwischen, Ziel muss offen & frei sein (Korrektur Juli 2026, ersetzt die permanente Tarnung — war zu stark) | **gräbt 2 Hex/Zug** — die Gilden untergraben schneller als alle anderen |

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
| 🦡 **Blindwühler** | 12 | 5 | 4 (hört am weitesten) | 2 | 1 | gräbt sich selbst durch massiven Fels — auf der Jagd wie auf Patrouille (zieht ohne Ziel auf die letzte Lärmquelle im Umkreis 4 zu, nutzt dabei auch fremde Stollen). Wer viel gräbt, gräbt sich seine Feinde herbei |
| 🪨 **Steinpanzer** | 18 | 6 | 3 | 1 (bewusst langsam — große AoE) | 1 | sitzt auf den reichsten Kristalladern; Patrouille-Schritte nur, wenn danach weiterhin eine Ader mit Restbestand angrenzt (Wachposten-Regel), sonst steht er |
| 🐛 **Der Alte Wurm** | 24 | 8 | 3 | 2 (Leine: nie weiter als 3 Hexes vom Herzkaverne-Zentrum) | 1 | **Wächter der Herzkaverne**. Ohne Ziel: außerhalb Distanz 1 vom Zentrum 1 Schritt zurück, sonst 1 Schritt im Ring 1 (Patrouille ums Herz). Muss besiegt werden, bevor die Erschließung beginnen kann — stirbt einmal, bleibt tot (globale Meldung: „Ein Beben läuft durch das Land — der Alte Wurm ist gefallen") |

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

**UI:** rote Markierungen mit 🎯-Symbol zeigen Telegraph-Hexes an — NUR sichtbar, wenn aktuell eine eigene (oder
verbündete) Einheit im Umkreis 2 steht (`uwHexNearOwnUnits`, Korrektur Juli 2026 — vorher reichte die bloße
Netz-Geometrie/`uwVis` aus dem Gedächtnis, wodurch die Warnung stehen blieb, obwohl längst keine eigene Einheit mehr
dort war, um sie zu sehen). Das Info-Panel eines angeklickten Hex zeigt zusätzlich „🎯 [Kreaturname] greift dieses
Feld am Rundenende an (X DMG)" — unter derselben Sichtbarkeits-Bedingung. Massiver, noch ungegrabener Fels ist nie
Teil eines Angriffsmusters (`getCreatureAttackHexes` filtert auf `isUnderworldOpen`, Korrektur Juli 2026) — eine
Kreatur schlägt nie durch die Wand auf eine dahinterliegende offene Tasche.

## 6. Dynamit (taktisches Werkzeug, kein Siegweg, ersetzt Unterminierung — Korrektur Juli 2026)

**Grundprinzip:** Tiefeneinheiten haben KEINERLEI Auswirkung auf das Spiel oben. Die frühere Unterminierung (Kammer/Zünden gegen Oberflächen-Strukturen) ist komplett gestrichen — Dynamit wirkt ausschließlich innerhalb der Unterwelt.

- **Ziel:** **jedes angrenzende Hex** — unabhängig davon, ob dort massiver Fels liegt oder es bereits offen ist (Korrektur Juli 2026, Jonathan: vorher nur ein noch massives Fels-Hex) — kein Oberflächen-Ziel mehr, keine Priorität Startdorf/Turm/Mauer/Tunnel.
- Der **Sprengmeister** wählt sein Ziel-Hex: Aktion **„Dynamit legen"** (kostet **1 Holz**, 1 Zug, laut). Die Ladung liegt lose in der Unterwelt (nicht am Gerät selbst) und explodiert automatisch, **sobald der platzierende Spieler seinen nächsten Zug startet** — unabhängig davon, wohin sich der Sprengmeister danach noch bewegt.
- **Wirkung:** ein **Dreieck aus 3 Hexes** (das Ziel-Hex + die beiden Hexes, die zusammen mit Platzierer und Ziel die anliegende Dreiecksfläche bilden — geometrisch eindeutig, keine weitere Zielwahl nötig). Jedes der 3 Hexes: **6 Schaden** auf eine dort stehende Tiefeneinheit/Kreatur (AoE, auch eigene Truppen — Friendly Fire wie beim Feuersturm der Bombenballon oben), und jedes noch geschlossene **Fels**-Hex wird dauerhaft offen — **"das Gebirge wegsprengen, um den Weg freizumachen"**. **Korrektur Juli 2026 (Jonathan):** Kristaladern im Dreieck bleiben davon ausgenommen — sie nehmen weiterhin AoE-Schaden auf eine dort stehende Einheit, öffnen/zerstören aber nie durch Dynamit; eine Ader verschwindet ausschließlich durch vollständigen Abbau (Restbestand auf 0).
- Rührt **nie** an `tu[]`/`wa[]`/`tw[]`/`p[].sh` — auch wenn ein Ziel-Hex zufällig unter einem Stollenkopf liegt, bleibt die Tunnel-HP unangetastet.
- Keine Oberflächen-Anzeige (kein Beben-Indiz oben) — die Ladung ist nur innerhalb der Unterwelt sichtbar (🧨-Icon auf den 3 Ziel-Hexes, gemäß der normalen Netz-Sichtregeln).
- Krater/Einsturz-Löcher, die die Ebenen physisch verbinden: **bewusst verschoben** (Phase 4-Idee), kollidiert vorerst mit „nur der Arbeiter wechselt die Ebene".

## 7. Ökonomie: Kristalle & Reliquien

- **Kristalle** (`p[].k`) entstehen nur unten (Adern, Fundkammern). Abbau läuft als **Toggle** (Korrektur Juli 2026, Muster: Steinabbau des Arbeiters oben) — „Abbau starten"/„stoppen", verbraucht keine Aktion, läuft automatisch am Zugende, solange die Einheit in Reichweite (eigenes Hex oder angrenzend) einer Ader mit Restbestand steht. **Tragen bleibt nötig, aber ohne Obergrenze** (`u.cr`, uncapped) — die Fracht muss weiterhin physisch zum eigenen Stollenkopf getragen werden, liefert dort aber **automatisch** ab, sobald die Einheit auf/neben ihm steht (kein manueller „Abliefern"-Klick mehr). Stirbt ein Träger, **fällt seine Fracht als Haufen** auf das Sterbe-Hex (`uw.dr`) — jede andere trage-fähige Einheit (Arbeiter, Beutegräber) sammelt ihn beim Betreten automatisch ein; ein Beutegräber-Kill stiehlt sie stattdessen direkt (uncapped).
- **Reliquien** = Fundstücke alter Handwerkskunst (nicht sakral!), kaufbar für Kristalle im Reliquien-Fenster
  (Radialmenü). **Korrektur Juli 2026** (Jonathan: Einzeleinheiten-Ausrüstung war zu schwach — stirbt die
  Trägereinheit, ist die ganze Investition weg, und Unterwelt-Einheiten konkurrieren 1:1 in Gold mit der
  Oberflächenarmee): Klingenschmiede/Bollwerk/Karte binden sich nicht mehr an eine Einheit (`u.art` entfällt),
  sondern wirken sofort beim Kauf als permanentes Spieler-Flag (`applyInstantRelic`, js/logic.js) — nur das
  Meisterwerkzeug bleibt zielgebunden (Bauwerk):
  - **Klingenschmiede der Tiefe** (7 💎, vorher "Damaszener Klinge" 4 💎/Einzeleinheit): permanent +1 DMG für
    ALLE eigenen Einheiten (Oberfläche, Unterwelt, Luft — `pState.rb`-Flag, gelesen von `getExpectedDamage`
    UND `getExpectedDamageUW`, es gibt keine separate Luft-Schadensfunktion)
  - **Bollwerk des Bergvolks** (7 💎, vorher "Harnisch des Bergvolks" 4 💎/Einzeleinheit): permanent +50%
    Max-HP auf Startdorf/Mauern/Türme (sofort voll geheilt, Tunnel bewusst ausgenommen) + permanent +2 Max-HP
    für ALLE eigenen Einheiten (sofort mitgeheilt) — `pState.ra`-Flag, gelesen von `getUnitMaxHp` sowie den
    neuen Helpern `getVillageMaxHp`/`getWallMaxHp`/`getTowerMaxHp`
  - **Meisterwerkzeug** (3 💎): ein Bauwerk (Mauer/Turm/Tunnel/Startdorf) sofort auf volle HP
  - **Karte der Tiefe** (6 💎, Preiskorrektur Juli 2026, vorher 7): permanente 100%-Sicht auf die gesammte MAP
    (Oberfläche als auch Unterwelt-Netz) — nicht nur einmalig aufdecken (`p[].mr`-Flag)
- **Handel** (Korrektur Juli 2026, neues Radialmenü-Fenster „⚖️ Handel"): Gold/Holz/Stein tauschen 1:1 in beide
  Richtungen; Kristalle sind bewusst NUR verkaufbar (1 💎 → 3 einer Zielressource), nicht kaufbar — sonst wären
  Reliquien rein per Gold ohne Unterwelt-Investment erreichbar. Löst außerdem, dass Kristalle nach dem Kauf
  aller vier Reliquien sonst nutzlos würden.

## 8. Der Herz-Sieg: die Erschließung

1. **Wurm besiegen** (Abschn. 5) — stärkste PvE-Hürde des Spiels, verhindert Früh-Rushes. Ohne `uw.wd === 1` steigt `checkErschliessungProgress` sofort aus.
2. **Erschließung starten:** eigene Einheit **exakt im Zentrums-Hex** (Ring 1 genügt nicht), keine nicht-verbündete Einheit im **Kern** (die 7 Hexes, s. Abschn. 2 — Gegner in den Ausläufern sind egal). Zähler `hz = {p, n}`.
3. **3 eigene Zugenden halten** (`ERSCHLIESSUNG_TARGET`, js/logic.js — die einzige Stelle, die die Zahl definiert; UI/Debug lesen sie von dort).
4. Ab Start der Erschließung erfahren es **alle** über das Event-System: „Die Erde bebt — {Spieler} erschließt das Herz der Tiefe" + sichtbarer Countdown im HUD + Beben-Effekt am zentralen Wachturm. Volle Information, kein heimlicher Sieg.
5. Nach dem dritten gehaltenen Zugende: Sieg über die Gesamtpartie („Wer das Fundament des Landes hält, dem beugt sich die Oberfläche") — läuft durch die normale Win-Check-/Team-Logik (Diplomatie: verbündete Einheiten in der Kaverne unterbrechen nicht). Wird erst final geprüft, wenn die letzte Runde komplett durchlaufen ist (alle Spieler hatten ihren Zug), und die Haltebedingung wird dabei **noch einmal frisch geprüft** — wer nach dem Erschließer noch am Zug ist, kann ihm auf der Ziellinie eine Einheit in die Kaverne stellen (Korrektur Juli 2026).

**Halten, Anhalten, Zurückfallen** (`erschliessungStatus`, js/logic.js — dieselbe Dreiteilung gilt am Zugende wie bei der finalen Sieg-Prüfung am Rundenende):

| Lage am eigenen Zugende | Folge |
|---|---|
| eigene Einheit im Zentrum, kein Gegner im Kern | **+1** |
| ein nicht-verbündeter Gegner im Kern (egal wo genau, egal ob die eigene Einheit noch lebt) | **Pause** — `hz.pa = 1`, der Zähler bleibt stehen. Wer den Eindringling wieder rauswirft, zählt weiter, statt bei 0 anzufangen. Aus der Pause heraus gibt es keinen Sieg, auch bei vollem Zähler |
| Mitte leer, **ohne** gegnerischen Druck (Einheit gefallen, weggelaufen, von einer Kreatur erschlagen) | **Reset auf 0** |
| ein Gegner steht selbst im **Zentrum** | **Übernahme**: er erfüllt dort die Bedingung selbst, der alte Zähler verschwindet, seiner startet bei 1 |

Pausiert wird also nur unter echtem gegnerischem Druck. Sonst ließe sich Fortschritt beliebig lange horten — 2/3 erreichen, woanders Krieg führen und Monate später in einem einzigen Zug einlösen (Entscheidung Jonathan, Sept 2026).

**Wann der Zähler angefasst wird** (`advanceErschliessung`, aufgerufen für JEDES Zugende): nur am Zugende **seines eigenen Besitzers** — das Zugende eines Unbeteiligten sagt nichts über dessen Fortschritt aus (Bugfix Juli 2026, sonst kam bei 2+ Spielern nie jemand über 1/n hinaus). Zwei Ausnahmen davon (Korrektur Sept 2026):
- **Übernahme:** Erfüllt der endende Spieler die Bedingung selbst, steht *seine* Einheit im Zentrum — der bisherige Halter also nicht mehr. Sein Zähler wird dann sofort durch den neuen (bei `n=1` startenden) ersetzt, statt den Übernehmer bis zum nächsten Zugende des alten Halters warten zu lassen.
- **Toter Halter:** `killPlayer` (js/logic.js) löscht `uw.hz` des Toten mit. Vorher blieb ein Zähler mit `n=1`/`n=2` für den Rest der Partie stehen und blockierte **jede** weitere Erschließung — erreichbar über Hauptdorf-Verlust ebenso wie über Aufgeben (`confirmSurrender` ruft `killPlayer`). Der Fall `n=3` räumte sich zufällig über die Rundenend-Prüfung in `doEndTurn` selbst auf.

**Was NICHT anhält:** Gegner in den **Ausläufern** (nur der Kern zählt) · Verbündete im Kern (`al[]` wird live gelesen — ein Bündnisbruch macht sie sofort wieder zu Gegnern und hält die Erschließung an) · **Kreaturen**: geprüft wird nur `uw.u` (Spielereinheiten), nicht `uw.c`. Kreaturen können die Einheit im Zentrum aber erschlagen — dann greift die Reset-Zeile oben.

**Gegenspiel-Wege:** eigene Expedition in den Kern (1 Einheit irgendwo in den 7 Hexes genügt zum Anhalten — man muss sie dort aber auch halten, Anhalten allein zerstört den Fortschritt nicht mehr) · die Einheit im Zentrum erschlagen oder per Dynamit sprengen und selbst nachrücken (übernimmt den Platz sofort, s. o.) · Tunnel des Erschließers oben zerstören → Moral-Kollaps seiner Expedition · Beutegräber/Horcher-Guerilla in seinen Stollen. Die Kaverne selbst lässt sich **nicht** zuschütten (Stollenbruch nur auf `uw.d`), wohl aber der Zugangsstollen des Erschließers.

## 9. UI / UX

- **Kamerafokus-Zyklus** (fertig): Standard → Luftansicht → Unterwelt. Im Unterwelt-Fokus ist die Oberfläche komplett aus (nicht sichtbar, nicht anwählbar) — Spiegelbild der strikten Ebenen-Trennung der Luftansicht.
- **Unterseiten-Rendering:** Fels = geschlossene dunkle Tile-Unterseiten; offene Hexes „ausgehöhlt" (vertieft, wärmeres Material); Kristalladern glitzern; Herzkaverne mit eigenem Großmodell (`voxelModels`).
- **Boden „Glut & Adern"** (Korrektur Sept 2026): der **Kern** ist der hellste, wärmste Boden der ganzen Unterwelt (`#6b3a20`) mit dichtem Glut-Glitzern — auf einen Blick als Innerstes erkennbar. Die **Ausläufer** sind dunkler Basalt (`#3d2a2a`) und tragen statt des gestreuten Glitzerns eine **gerichtete Glutader**: vier Voxel auf der Verbindungslinie zum Zentrum, zur Mitte hin dicker und heller (2D: ein Farbverlaufs-Strich mit heller Spitze zum Herz). Man liest am Boden ab, in welche Richtung das Herz liegt, ohne die Karte zu drehen. Die Ausrichtung kommt aus der Geometrie, nicht aus dem Seed — sie funktioniert auf allen sechs Armen identisch.
- **Angehaltene Erschließung** ist überall gedämpft statt bunt: HUD-Plakette (`.score-hz-badge.is-paused` + Sanduhr-Icon statt 🌍), Zähler über dem Herz auf der Karte, eigener Toast am Zugstart. „Volle Information" gilt für die Pause genauso wie für den Fortschritt — der Verteidiger soll sehen, dass sein Gegenangriff wirkt. Einheiten stehen als Voxel-Billboards in den Gängen, von unten betrachtet. 2D-Fallback (`?r2d=1`): abgedunkelte Karte mit Gang-Overlays.
- **Klick-Flow:** `handleUnderworldClick` (existiert) wächst zum vollen Pendant von `handleCanvasClick`: Auswahl → Grab-/Bewegungs-/Angriffs-Vorschau → Aktionsmenü (`mkBtn`-Muster: „⛏ Graben", „💎 Abbau starten"/„🛑 Abbau stoppen" (Toggle, Korrektur Juli 2026), „🧨 Dynamit legen" (Korrektur Juli 2026, ersetzt Kammer/Zünden), „🕳 Aufsteigen").
- **Gehör-Anzeige:** Richtungs-Pings als orangenes Hex-Overlay (nächstgelegenes eigenes Netz-Hex); Horcher-Ortung als kräftigeres rotes Hex-Overlay. Klick auf ein markiertes Feld zeigt per Tooltip die Geräusch-Art (Graben/Abbau/Kämpfe/Dynamit/Stollenbruch/Kreatur-Bewegung/Kreatur-Angriff, `UW_NOISE_TYPE_NAMES`).
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
- `uw.hz` — Erschließung `{p, n, pa}` (`p` = Halter, `n` = gehaltene eigene Zugenden, `pa` = angehalten (nur gesetzt, wenn ein Gegner im Kern steht); wird beim Tod des Halters mitgelöscht)
- Reliquien: `p[].rel[]` gekaufte, noch nicht verbrauchte "building"-Reliquien (aktuell nur `tool`);
  `p[].rb`/`p[].ra` permanente Passiv-Flags aus Klingenschmiede/Bollwerk (Korrektur Juli 2026, ersetzt
  `u[].art`, siehe Abschn. 7) — wie `p[].mr` nie normalisiert/gelöscht, nur `1` gesetzt oder `undefined`

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

- Wurm 24 HP / 8 DMG AoE (unbedingter Konter beim Angreifen, `resolveUWAttackOnCreature`), Korrektur Juli 2026 (30 -> 24, Balancing-Auftrag Jonathan): mit 4–5 Einheiten schaffbar? Soll er zwischen Kämpfen regenerieren?
- Runden-Phase + Telegraph (Korrektur Juli 2026): neue DMG-Werte (Spinne 4, Wühler 5, Steinpanzer 6, Wurm 8) + Aggro-/Bewegungswerte reiner Erstentwurf — fühlt sich "genau ein Zug zum Ausweichen" fair an, oder ist das bei mehreren gleichzeitig telegraphierenden Kreaturen (z. B. Spinne + Wühler auf überlappenden Feldern) zu viel Druck pro Runde? Steinpanzer-Erdrutsch/Wurm-Wirbel-Muster (6/12 Hexes) ggf. zu großflächig für die Kartenradien 5/7.
- Erschließung: 4 → 5 → **3** Zugenden (Korrektur Aug 2026). Der zählende Bereich ist seit Sept 2026 auf allen Karten der 7-Hex-Kern, und ein Gegner im Kern hält den Zähler nur an, statt ihn zu vernichten — beides macht den Siegweg spürbar gnädiger. Nach dem Playtest zu prüfen: ist 3 damit zu billig geworden (Gegenmittel wären 4 Zugenden oder ein Abbau um −1 je Pausenrunde), und reicht die Pause als Anreiz, den Kern überhaupt zu stürmen?
- Expeditionsgröße: aktuell nur durch Gold begrenzt — braucht es ein hartes Limit (z. B. max. 6 Einheiten unten)?
- Moral-Kollaps −1 HP: reicht das als Druck, oder zusätzlich „kein Heilen/Kein Kauf" ohne Tunnel?
- Bohrwagen 2 Hex/Zug: untergräbt (haha) er das Grab-Tempo-Gefüge? Ggf. 2 Hex nur geradeaus.
- Kristall-Preise der Reliquien und Aderngrößen — komplett Playtest-Sache.
- Sicht-Kompromiss „Geometrie persistent, Bewegliches nur Umkreis 2": im Playtest prüfen, ob Hinterhalte sich gut anfühlen oder nur frustrieren.
- Krater/physische Ebenen-Durchbrüche: Phase-4-Idee, bewusst raus.
- Sprites/Modelle: 6 neue `pixelSprites` (17–22, der Arbeiter (7) nutzt sein bestehendes Sprite auch unten) + Kreaturen (4, als 2D-Fallback/CLASSIC-Art) + Herzkaverne als `voxelModels`-Großmodell. **Update (Juli 2026):** die 4 Kreaturen (`uw_spinne`/`uw_wuehler`/`uw_steinpanzer`/`uw_wurm`) rendern jetzt ebenfalls als echte `voxelModels` (statt Billboard) — Muster: Tunnel-HUB/Herzkaverne (`addVoxelModel` mit `mirrorY`), Billboard bleibt 2D-/CLASSIC-Fallback. Der Wurm ist als Boss deutlich größer skaliert (`s: 3.0` vs. `2.6` bei den anderen dreien) statt über den früheren `sizeMultiplier`. Zusätzlich rendern massive Fels-/Ader-Hexes jetzt als echte Voxel-Steine (`uw_fels_a/b/c`, 3 Brocken-Varianten, je < 40 sichtbare Voxel) über ein eigenes seed-memoisiertes `InstancedMesh` in `buildUnderworldTiles` (nicht über das per-Frame-voxelMesh) — Variante/Rotation/Skalierung deterministisch je Hex, Netz-Sichtregel wie die Kristall-Akzente. Alle 7 neuen Voxelmodelle liegen in `NEW_VOXEL_MODELS`, im Editor unter "Unterwelt — 3D-Voxelmodelle" gelistet — Abnahme/Feinschliff durch Jonathan im Editor steht noch aus.
