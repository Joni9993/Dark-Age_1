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

**Einziger Unterwelt-Siegweg:** die **Herzkaverne** unter dem zentralen Wachturm erobern (Wächter: der Alte Wurm) und **4 Runden erschließen** → Sieg über die gesamte Partie. Unterminierung ist bewusst KEIN Siegweg, sondern taktisches Werkzeug — und nur erlaubt gegen **Tunnel, Mauern, Türme und Startdörfer** (nie gegen normale Dörfer).

## 2. Weltaufbau (seed-deterministisch)

Unterwelt-Terrain-Typen, erzeugt aus `sd` (eigener Hash-Kanal, damit oben/unten unkorreliert sind):

| Typ | Bedeutung |
|---|---|
| **Fels** | Standard, massiv — nur durch Graben passierbar |
| **Kaverne** | natürliche hohle Tasche (alte Wühlgänge des Wurms), bereits offen, nicht miteinander verbunden |
| **Kristallader** | Fels mit Kristallen — wird abgebaut wie Steinhaufen oben (`h`-Abbau), gibt Kristalle, danach offener Gang |
| **Stollenruine** | verlassene Gänge eines längst verschwundenen Bergvolks: fertige Korridore + **Fundkammer** (einmalige Beute: Kristalle oder eine Reliquie) |
| **Herzkaverne** | fixe große Kaverne (Zentrum + 6 Nachbarn) **exakt unter dem zentralen Wachturm** — beide Machtorte der Karte liegen senkrecht übereinander |

Verteilung fairness-gebändert wie `SPAWN_BUDGETS` oben (gleiche Kristall-/Ruinen-Chancen pro Spieler-Sektor); nach dem Tuning mit einem `maptest`-Analog messen.

**Lore-Anker:** Die bestehenden Tunnel (`tu[]`) führten schon immer *durch* die Unterwelt — das erklärt rückwirkend, warum sie unter Fronten hindurchkommen. Der Tunnelbau öffnet daher automatisch die beiden Unterwelt-Hexes unter seinen Endpunkten.

## 3. Regeln unten

**Graben:** Nur Tunnelgräber (und Bohrwagen) können Fels entfernen — 1 Hex pro Zug (Bohrwagen 2). Gegrabene Hexes sind dauerhaft offen und für alle Tiefeneinheiten begehbar (auch gegnerische — angeschnittene Netze verbinden sich).

**Sicht („Nur Stollen sichtbar"):** Ein Spieler sieht dauerhaft die **Geometrie** seines Netzes: alles selbst Gegrabene + jedes offene Hex, das eine eigene Einheit je betreten hat (persistiert wie Fog, `compressFog`-Muster). Keinerlei Umgebungssicht in den Fels hinein. **Bewegliches** (fremde Einheiten, Kreaturen) ist nur im **Umkreis 2 um eigene Einheiten** sichtbar — bekannte Gänge können also jederzeit Hinterhalte enthalten.

**Gehör:** Graben, Abbau und Unterminierungs-Arbeiten erzeugen **Lärm**. Fremder Lärm im Umkreis 3 einer eigenen Einheit erzeugt eine ungefähre **Richtungsmarkierung** (Sektor, kein exaktes Hex) — die einzige Fernaufklärung der Tiefe. Der Horcher (Spionage) macht daraus exakte Ortung.

**Engstellen-Kampf:** In Gängen gibt es kein Vorbeikommen — wer vorn steht, blockt. **Engstelle** = offenes Hex mit ≤ 2 offenen Nachbarn; die Grubenwache nimmt dort −1 Schaden. Flankieren heißt unten: sich eine Flanke *graben*.

**Nachschub & Moral:** Tiefeneinheiten werden am **Stollenkopf** gekauft (Unterwelt-Hex unter einem eigenen Tunnel-Endpunkt), bezahlt mit Gold von oben. Verliert ein Spieler **seinen letzten Tunnel** in die Unterwelt (zerstört/unterminiert), setzt der **Moral-Kollaps** ein: alle seine Tiefeneinheiten verlieren **1 HP zu Beginn jedes eigenen Zuges**, bis wieder ein Tunnel steht. Tunnel-Jagd oben ist damit die schärfste Antwort auf eine starke Tiefen-Expedition.

**Ebenen-Wechsel:** Vorerst kann **nur der Tunnelgräber** durch Tunnel zwischen den Ebenen wechseln (Aktion am Stollenkopf bzw. Tunnel-Endpunkt oben). Er trägt dabei Kristalle nach oben. Erweiterbar, bewusst restriktiv gestartet.

## 4. Das Roster (Typ-IDs 16–22)

Alle Kosten/Werte sind **Balance-Erstentwurf** (Playtest-Vorbehalt wie bei den Lufteinheiten).

| | ⛏ Tunnelgräber | 🛡 Grubenwache | 💥 Sprengmeister |
|---|---|---|---|
| Typ-ID | 16 | 17 | 18 |
| Verfügbar | alle | alle | alle |
| Kosten | 3 G | 5 G | 6 G |
| HP | 8 | 14 | 8 |
| Bewegung | 1 (gräbt ODER läuft) | 2 | 2 |
| Angriff | 1 DMG, RW 1 (Notwehr) | 4 DMG, RW 1 | 3 DMG, RW 1 |
| Fähigkeiten | Graben (1 Hex/Zug) · Kristallabbau · trägt Kristalle (max. 3) · **einziger Ebenen-Wechsler** | **Schildstellung**: −1 erlittener Schaden in Engstellen | **Unterminierung** (s. Abschn. 6) · **Stollenbruch**: eigenes offenes Nachbar-Hex wieder verfüllen (Verfolger aussperren, Gegenstollen kappen) |

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

Kein Bergvolk mehr am Leben, keine Geister — nur Tiere und Ruinen. Kreaturen handeln **deterministisch** (seed-basiert, ausgeführt in `doEndTurn` wie die Brand-Ticks der Lufteinheiten — dein Async-Modell hat keinen Server-Takt):

| Kreatur | HP | DMG | Verhalten |
|---|---|---|---|
| 🕷 **Höhlenspinne** | 6 | 3 | nistet in Kavernen; Netze machen ein Gang-Hex zur Engstelle mit Bewegungsstopp; jagt im Umkreis 2 des Nests |
| 🦡 **Blindwühler** | 12 | 5 | Riesenwühler — gräbt selbst (1 Hex/Zug) **auf die letzte Lärmquelle im Umkreis 4 zu** und nutzt dabei auch fremde Stollen. Wer viel gräbt, gräbt sich seine Feinde herbei |
| 🪨 **Steinpanzer** | 20 | 2 | träger Panzerbrocken, sitzt auf den reichsten Kristalladern — lebendes Risk/Reward-Schloss, verfolgt nie |
| 🐛 **Der Alte Wurm** | 40 | 8 (trifft alle Angreifer in RW 1) | **Wächter der Herzkaverne**, verlässt sie nie. Seine uralten Wühlgänge sind die natürlichen Kavernen der Karte. Muss besiegt werden, bevor die Erschließung beginnen kann — stirbt einmal, bleibt tot (globale Meldung: „Ein Beben läuft durch das Land — der Alte Wurm ist gefallen") |

Lärm-Logik: jede Grab-/Abbau-/Unterminierungs-Aktion hinterlässt einen Lärm-Marker (Hex + Runde, transient). Kreaturen im Radius ziehen am Zugende darauf zu. Kämpfe erzeugen ebenfalls Lärm — ein PvP-Gefecht kann Wühler anlocken, die *beide* Seiten anfallen.

## 6. Unterminierung (taktisches Werkzeug, kein Siegweg)

Historisches Sappieren: Kammer unter die Befestigung, Stützbalken, Brandsatz.

- **Nur gegen:** Tunnel-Endpunkte, Mauern, Türme, **Startdörfer**. Normale Dörfer sind tabu.
- Der **Sprengmeister** steht auf dem Unterwelt-Hex direkt unter dem Ziel: Aktion **„Kammer anlegen"** (kostet 3 Holz, 1 Zug, laut!) → Folgezug **„Zünden"**: **10 Schaden** auf die Oberflächen-Struktur, Beben-Anzeige oben für alle Sichtbaren.
- Gegenspiel: Der Lärm der Kammer-Arbeiten ist oben als schwaches Beben auf dem Hex sichtbar (Vorwarnung), unten hörbar; Gegenstollen können die Kammer vor der Zündung stürmen.
- Krater/Einsturz-Löcher, die die Ebenen physisch verbinden: **bewusst verschoben** (Phase 4-Idee), kollidiert vorerst mit „nur Tunnelgräber wechselt die Ebene".

## 7. Ökonomie: Kristalle & Reliquien

- **Kristalle** (`p[].k`) entstehen nur unten (Adern, Fundkammern). Tunnelgräber tragen sie (`u.cr`, max. 3) zum Stollenkopf und durch den Tunnel nach oben — erst dann sind sie gutgeschrieben. Getragene Kristalle sind klaubar (Beutegräber-Kill).
- **Reliquien** = Fundstücke alter Handwerkskunst (nicht sakral!), kaufbar für Kristalle im Dorf-Menü, Erstentwurf:
  - **Damaszener Klinge** (4 💎): eine Einheit permanent +1 DMG
  - **Harnisch des Bergvolks** (4 💎): eine Einheit permanent +5 max-HP
  - **Meisterwerkzeug** (3 💎): ein Bauwerk (Mauer/Turm/Tunnel) sofort auf volle HP
  - **Karte der Tiefe** (5 💎): deckt dauerhaft das gesamte Stollennetz EINES Gegners auf (Geometrie, nicht Einheiten)
- Kristalle fließen bewusst NICHT in normale Einheitenkosten — keine Inflation der bestehenden Ökonomie.

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
- **Klick-Flow:** `handleUnderworldClick` (existiert) wächst zum vollen Pendant von `handleCanvasClick`: Auswahl → Grab-/Bewegungs-/Angriffs-Vorschau → Aktionsmenü (`mkBtn`-Muster: „⛏ Graben", „💎 Abbauen", „💥 Kammer anlegen", „🧨 Zünden", „🕳 Aufsteigen").
- **Gehör-Anzeige:** Richtungs-Pings als pulsierende Sektor-Markierung am Rand des eigenen Netzes; Horcher-Ortung als exaktes Hex-Icon.
- **Countdown & Beben:** Erschließungs-Fortschritt im HUD aller Spieler; Beben-Partikel am Wachturm; Unterminierungs-Vorwarnung als leichtes Zittern des Oberflächen-Hexes.
- Rekrutierung am Stollenkopf über das bestehende Kauf-Menü-Muster (`buyUnit` ebenenbewusst, wie bei Luft).

## 10. Technische Umsetzung (Skizze)

**State-Schema (neu, delete-defaults an den 3 Sync-Stellen `doEndTurn`/`confirmSurrender`/`bootGame`):**
- `p[].k` — Kristalle
- `p[].ue` — Unterwelt-Erkundung (Netz-Geometrie, `compressFog`-Muster)
- `uw.d` — global gegrabene Hexes (kompakter String, gleiche Kompression)
- `uw.u[]` — Tiefeneinheiten (gleiche Feldnamen wie `u[]`: `p,t,x,y,h,a,vet,k` + `cr` Kristalle, `ch` Kammer angelegt)
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
| **M9b** | Tunnelgräber: Kauf am Stollenkopf, Graben, Ebenen-Wechsel, Netz-Sicht + Persistenz, Gehör-Pings | Tunnel bauen → unten kaufen → graben → Kristall abbauen → oben abliefern; Sicht zeigt nur eigenes Netz; URL-Roundtrip mit `uw.*` |
| **M10** | Kampfeinheiten 17–22, Engstellen-Regel, Kristall-Tragen/Stehlen, Reliquien-Shop | Engstellen-Bonus greift; Beutegräber-Diebstahl; jede Fraktion rekrutiert ihre Tiefeneinheit; Reliquie kauf- und ausrüstbar |
| **M11** | PvE: Spinne/Wühler/Steinpanzer + Lärm-System + Alter Wurm | Wühler gräbt nachweislich auf Lärm zu (deterministisch reproduzierbar per Seed); Wurm verteidigt Herz, bleibt nach Tod tot |
| **M12** | Unterminierung + Moral-Kollaps + Erschließung + Sieg + Events/Countdown oben | Kammer→Zünden = exakt 10 DMG nur auf erlaubte Ziele; letzter Tunnel weg → −1 HP/Zug; Erschließung unterbricht/resettet korrekt; Sieg feuert Win-Check inkl. Team-Logik |
| **M13** | Integrations-Pass: Recap, Diplomatie, Serialisierung/Blob-Größe, Guide (`darkages_guide.html`), 3-Spieler-Partie | Recap zeigt Tiefen-Aktionen; Verbündeten-Regeln in der Kaverne; Blob-Längen-Check; **Playtest mit Christian & Vincent** |

## 12. Balance-Flags & offene Fragen (nach Playtest / vor M-Start klären)

- Wurm 40 HP / 8 DMG AoE: mit 4–5 Einheiten schaffbar? Soll er zwischen Kämpfen regenerieren?
- Erschließung 4 Runden + Zähler-Reset auf 0: zu hart? Alternative: Reset nur um −1 pro Unterbrechungsrunde.
- Expeditionsgröße: aktuell nur durch Gold begrenzt — braucht es ein hartes Limit (z. B. max. 6 Einheiten unten)?
- Moral-Kollaps −1 HP: reicht das als Druck, oder zusätzlich „kein Heilen/Kein Kauf" ohne Tunnel?
- Bohrwagen 2 Hex/Zug: untergräbt (haha) er das Grab-Tempo-Gefüge? Ggf. 2 Hex nur geradeaus.
- Kristall-Preise der Reliquien und Aderngrößen — komplett Playtest-Sache.
- Sicht-Kompromiss „Geometrie persistent, Bewegliches nur Umkreis 2": im Playtest prüfen, ob Hinterhalte sich gut anfühlen oder nur frustrieren.
- Krater/physische Ebenen-Durchbrüche: Phase-4-Idee, bewusst raus.
- Sprites/Modelle: 7 neue `pixelSprites` (16–22) + Kreaturen (4) + Herzkaverne als `voxelModels`-Großmodell — Abnahme wie bei Luft per Debug-Spawn + Screenshot.
