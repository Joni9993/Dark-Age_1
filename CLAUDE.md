# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

**Development / testing (recommended):** open `index.html?debug=1` directly in a browser — no server, no login. This starts a hotseat test game with a debug panel (spawn units, cheats, fog toggle, save/load scenarios, "State → URL" for reproducible test states). See `debug.md` for the full feature list and the `window.dbg` console helpers.

**Full app (server mode):**
```bash
cd server && node index.js   # → http://localhost:3000 (serves frontend + API)
```
Requires PostgreSQL and `server/.env` (see `README.md` for setup: DATABASE_URL, JWT_SECRET, VAPID keys, SMTP). The DB schema is created automatically on start.

**Legacy URL mode:** opening `index.html?state=...` (LZ-compressed state in the URL) still works without server or account — this was the original multiplayer mode and is kept alive (`isLegacyUrlMode`).

## Versioning

The app version is shown bottom-right on the start screen (`#app-version` in `index.html`, set from `APP_VERSION` in `js/globals.js`, hidden once `bootGame()` starts an actual match). Format `MAJOR.PATCH.HOTFIX` (started at `1.0.0`):
- **MAJOR** (1st number): a bigger update / new implementation (e.g. a new system/feature like the 3D renderer or air units).
- **PATCH** (2nd number): a regular patch (e.g. balance change, smaller feature tweak).
- **HOTFIX** (3rd number): a hotfix (e.g. a quick bug fix).

Only the affected number increments by 1; the numbers to its right reset to 0 (standard semver behavior). At the end of a work session, judge which category the change falls into and ask the user whether `APP_VERSION` should be bumped accordingly — don't bump it silently.

**Verifikationsskripte** (kein Server, keine DB, kein DOM):
```bash
node maptest/verify_recap.js              # Rückblick: Log-Führung, Sichtbarkeit, Verdichtung
node maptest/verify_underworld_m13.js     # Unterwelt-Integrationspass (u.a. dieselbe Sichtregel)
```

**Server-Prüfskripte** (ohne DB): `node server/scripts/test-rating.js`, `node server/scripts/test-seating.js`.
Eines braucht Server **und** Wegwerf-Datenbank, weil seine Logik in SQL und Transaktionen steckt:
```bash
cd server && DATABASE_URL=... JWT_SECRET=test PORT=3311 node index.js   # in einer zweiten Shell
bash server/scripts/test-invite-flow.sh                                # Einladungs-Zusage, legt Testkonten an
```

**Map analysis scripts:**
```bash
node maptest/gen_maps.js [spieler] [radius]  # generates test map links as HTML (default 6 / 12)
node maptest/analyze_maps.js [numMaps]       # spawn fairness stats for all map sizes × player counts
```
Both load the real `js/mapgen.js` via `maptest/load_game.js` — no logic copies to keep in sync.

## Architecture

**Frontend**: Vanilla JS + Canvas/WebGL, no framework, no build step, no npm. `index.html` loads `js/*.js` as classic scripts — **load order matters** (globals → art → icons → data → prng → hex → logic → render → render3d → events → abilities → ui → recap → diplomacy → input → radialmenu → segmented → mapgen → config → api → auth → settings → lobby → debug → main). Two ordering constraints that are easy to break: `icons.js` must precede every module that builds markup with `icon()` (ui, input, radialmenu, segmented), and `segmented.js` must precede `mapgen.js`, which calls `updateTeamModeOptions()` at load time and expects the tiles to already exist. External libs via CDN: `lz-string`, `three.js` (pinned ≤ r152 — newer releases dropped the UMD build). Fonts via Google Fonts: MedievalSharp (wordmark/titles), Jersey 15 (body), Silkscreen (labels/numbers).

**Art datasets**: `js/art.js` holds TWO complete datasets — `NEW_*` (the dark-fantasy design, **live for everyone since v3.0.0**) and `CLASSIC_*` (the pre-redesign look, kept frozen as an archive, never hand-edited). The `DEBUG_ART` flag that used to gate the redesign behind `?debug=1` is now hard-coded to `true` (in both `js/art.js` and the editor's generated output); it still picks which set is exposed as the actual `pal`/`pixelSprites`/`terrainColors`/`voxelModels` globals, so flipping it back to an expression would restore the old gate if ever needed.

**Art editor**: `editor.html` (open directly in a browser) edits the `NEW_*` dataset — pixel sprites, 3D voxel models (layer-by-layer with onion skin), palette, player colors, terrain colors — with live 2D/3D previews. Work autosaves to localStorage; "art.js herunterladen" generates a complete replacement `js/art.js` containing the edited `NEW_*` block, the untouched `CLASSIC_*` block (passed through verbatim from the currently loaded globals — the editor never touches it), and the `DEBUG_ART` switch (round-trip and classic-passthrough both verified by test). Prefer changing pixels in the editor over hand-editing art.js.

**Backend** (`server/`): Node.js + Express + PostgreSQL. Serves the frontend statically and the API under `/api/*` on the same port. JWT auth (localStorage, `js/api.js`), friends system, lobby with invite tokens, Web Push notifications (VAPID, `sw.js` — push only, no asset caching), Glicko-2 player rating (`server/rating.js`, see *Rating & Leaderboard* below) and randomized seat assignment at game start (`server/seating.js`).

**Server-based async multiplayer**: The full game state is JSON-serialized, LZ-compressed, and stored as `state_blob` on the server per turn (`POST /api/games/:id/turn`, see `submitTurnToServer` in `js/input.js`). Opponents load the blob when opening the game; lobbies poll via `setInterval` (`js/lobby.js`). Only the active player may interact (`currentTurnSlot === currentUserSlot`); everyone else is read-only/spectator.

**Deterministic map generation**: Terrain (forests, hills) is NOT stored in state — it is regenerated from the seed (`gameState.sd`) via `getTerrainType(state, x, y)`. Only village ownership (`gameState.v`) is stored.

## Frontend Modules

| File | Responsibility |
|---|---|
| `js/globals.js` | DOM refs + mutable globals (gameState, selection, camera vars) |
| `js/art.js` | All look data (edit via `editor.html`): `pal` palette, `pixelSprites` (char-string pixel art, `P`/`p` = player color light/dark via `spritePixelColor`), `voxelModels` (true-3D buildings as depth layers), `playerColors`, `terrainColors` |
| `js/data.js` | Pure game data: `unitStats` (types 0–15), `factions`, `upgrades` |
| `js/hex.js` | Hex math: odd-r offset coords, `oddRToCube`, `hexDistance`, `getNeighbors`, `getTerrainType`, `getHexCenter` |
| `js/logic.js` | Rules: `calculateMoves` (BFS), `calculateAttacks`, `getExpectedDamage` (all modifiers), `getVisibleHexes`, `getUnitMove/MaxHp/Cost`, `checkVeteran` |
| `js/render.js` | 2D canvas renderer + **`Renderer` facade** (see below) |
| `js/render3d.js` | Three.js renderer (hex prisms + voxelized pixel sprites), default renderer; `?r2d=1` forces the legacy 2D canvas renderer |
| `js/input.js` | Canvas click handling, action flow, attack/counter-attack resolution, `doEndTurn` (serialization), pointer/touch/camera gestures |
| `js/abilities.js` | Special abilities: mining, wall/tunnel/tower building, detonate, deploy, AoE |
| `js/ui.js` | HUD, scoreboard, action menu, `buyUnit`, faction/upgrade purchase, undo (`saveUndoState`) |
| `js/events.js`, `js/diplomacy.js` | Random round events; alliances/truces/team win |
| `js/mapgen.js` | Initial state + map generation (`buildInitialGameState`, `SPAWN_BUDGETS`) |
| `js/api.js`, `js/auth.js`, `js/lobby.js`, `js/config.js` | Server mode: fetch wrapper with JWT, login, home/lobby screens, game list, friends, push registration |
| `js/settings.js` | Background music via the Web Audio API (`AudioBufferSourceNode.loop`, not the native `<audio loop>` — that element cannot loop gaplessly regardless of file quality, confirmed against current best-practice sources). Audio data comes from `audio/theme_song_data.js` (a base64 blob, loaded via `<script>` — deliberately not `fetch()`, which fails under `file://` when `index.html?debug=1` is opened directly). Built from the raw recording via `node audio/build_loop.js`: crossfades head/tail in raw PCM for a seamless content-level seam, then encodes to FLAC (no MP3/LAME encoder-delay padding) before base64-embedding. Tunable params at the top of that file — **must be re-run after editing them, it does not auto-rebuild**. Settings modal: music on/off, volume, 2D/3D renderer toggle (`da_renderer`, mirrors `?r2d=1`, reloads to apply), end-turn confirmation dialog on/off (`da_endturn_confirm`, read in `js/input.js` `endTurnBtn` click handler), push notification status/activation, logout. All prefs in localStorage, per device |
| `js/icons.js` | Pixel-Icon-Set: `<symbol>`-Sprite (12×12-Raster, `crispEdges`) + `icon(name, cls)` für JS-erzeugtes Markup. **Generiert** aus `design/ui-mockup/parts/sprite.html` — dort bearbeiten, nicht hier |
| `js/segmented.js` | Kachel-Auswahl im Setup-Screen (Kartengröße/Spielerzahl/Teams). Die `<select>` bleiben im DOM (`.seg-native`, per CSS versteckt) und sind weiterhin die Datenquelle — alle bestehenden Leser (`mapSizeSelect.value` usw.) sind unverändert |
| `js/recap.js` | **Rückblick** — was seit dem eigenen letzten Zug passiert ist: Log-Führung (`recapAppendTurn`), Sichtbarkeitsregel (`recapVisibleActions`, auch von beiden Renderern benutzt), Verdichtung (`buildRecapGroups`) und das Panel. Obere Hälfte DOM-frei und in Node getestet (`node maptest/verify_recap.js`) |
| `js/debug.js` | `?debug=1` test mode (hotseat, click tools, scenarios) |
| `js/main.js` | `bootGame()` (state normalization + recap + events), calls `initApp()` |

## Pixel-UI (css/game.css)

Die Menü- und HUD-Oberfläche folgt einem eigenen Formkanon. Entwurf und
Bauanleitung liegen als Design-Canvas unter `design/ui-mockup/` (Quelldateien
in `src/*.body.html`, `node parts/gen_map.mjs && node build.mjs` baut die
Artboards neu). Regeln, die in `css/game.css` gelten:

- **`border-radius: 0` überall** — global im `*`-Reset erzwungen, damit die
  Regel nicht versehentlich wieder aufweicht.
- **Kein `backdrop-filter`.** Tiefe entsteht aus 2px-Bevels
  (`--bevel` / `--bevel-in` / `--drop`), nicht aus Blur. Panels sind deckend.
- **Rahmen 2px** in `--edge`, Abstände in Vielfachen von 4, Trefferflächen
  ≥ 44px.
- **Buttons** haben einen 4px-Sockel (`0 4px 0`), der beim `:active` durch
  `translateY(4px)` verschwindet — diese Bewegung ersetzt Hover-Effekte, die
  auf Touch ohnehin nicht greifen.
- **Farben kommen aus `NEW_PAL`** (js/art.js); die alten Tokennamen
  (`--gold`, `--bg-panel`, …) existieren weiter, zeigen aber auf die neue
  Palette, damit bestehende Regeln nicht angefasst werden mussten.
- **Aktionsfarben** statt Inline-Hex: `.act-fire` (Kampf), `.act-build`
  (Stein), `.act-gold` (Ökonomie), `.act-shadow` (Spionage), `.act-earth`
  (Unterwelt), `.act-ally` (Bündnis/Zustimmung). Die ~25 fest verdrahteten
  Material-Farben in `js/input.js` und `js/diplomacy.js` sind dadurch
  verschwunden — **keine neuen Inline-Farben dort einführen**.
- **Emoji nur noch in Fließtext.** Buttons, Ressourcen und Statusmarken nutzen
  `icon()` aus `js/icons.js`. Emoji bleiben in Strings, die auch als
  `textContent`/`title` oder in Server-Nachrichten landen (Toasts,
  `unitStats`-Namen in `js/data.js`) — dort wäre Markup sichtbarer Quelltext.
- **HP** wird segmentiert dargestellt (`hpBar()` in `js/ui.js`): **ein Block
  = ein HP**, nie zusammengefasst — man soll die Blöcke abzählen können. Dass
  lange Leisten passen, löst `flex-shrink`, nicht eine kleinere Blockzahl (ein
  früherer 20er-Deckel ließ das Hauptgebäude mit 30 HP zu wenige Blöcke
  zeigen). Die Zahl steht **nur** rechts in der Kopfzeile, nicht zusätzlich im
  Namen.
- **Maximal-HP nie fest verdrahten.** Die Reliquie „Bollwerk des Bergvolks"
  (`pState.ra`) hebt mehrere Maxima an — dafür gibt es `getVillageMaxHp`,
  `getWallMaxHp`, `getTowerMaxHp` und `getUnitMaxHp` (js/logic.js). Fest
  eingetragene 30/15/10 in einer Anzeige sind still falsch, sobald jemand die
  Reliquie hat.
- **HP über dem Maximum sind möglich**: das Ereignis „Kriegslust" hebt
  Einheiten auf `max+2`. `hpBar()` klemmt deshalb bewusst nicht nach oben,
  sondern hängt Bonus-Blöcke in Gold an (`.hp-bar i.over`).
- **Info-Panel-Kopfzeilen laufen über `infoHead()`/`infoStats()`** (js/ui.js).
  Das Panel wird an sechs Stellen gebaut (Oberfläche, Unterwelt, Kreatur,
  Hauptgebäude, Palisade, Turm) und war genau deshalb auseinandergelaufen —
  die Unterwelt hatte eine HP-Leiste, die Oberfläche nicht. Neue Info-Zeilen
  bitte über diese Bausteine, nicht per eigenem Markup.
- **Overlays** (`.overlay`) lassen oben `68px + safe-area` frei: `#game-hud`
  liegt mit z-index 150 bewusst darüber, damit die Ressourcen beim Forschen
  und Fraktion-Wählen sichtbar bleiben.

**Fraktionsdaten** (`js/data.js`) tragen `name`, `ic` (Icon-Name), `passive`
und `special` getrennt — früher steckte alles als ein
`"Passive: …\nSpezial: …"`-Block in `desc`. Die Kartenlayouts setzen die Teile
einzeln (Trennlinie, Beschriftung „Spezial", Kostenchips), das geht mit einem
Textblob nicht.
- **Spielerfarben** (`playerColors`, Neon) bleiben unverändert, damit sie auf
  der Karte lesbar sind — in der UI aber nur als Bannerfläche auf dunkler
  Platte (`.score-dot`), nie als Textfarbe.

**Schriften.** `--font-display` MedievalSharp (Wortmarke/Titel),
`--font-body` Jersey 15 (Fließtext), `--font-ui` Silkscreen (Labels, Zahlen,
Buttons).

> **Pixelschriften sind nur auf ihrem eigenen Raster scharf.** Jede andere
> Größe lässt der Browser weichzeichnen — die Schrift sieht dann aus wie eine
> gewöhnliche Schrift mit eckigen Buchstaben, und genau so wirkte die UI beim
> ersten Anlauf. Erlaubte Größen:
>
> | Schrift | scharf bei |
> |---|---|
> | Jersey 15 | **15px**, 30px |
> | Silkscreen | **8px**, 12px, 16px |
> | MedievalSharp | beliebig (kein Pixelfont, bewusst weich) |
>
> Einzige bewusste Ausnahme: Eingabefelder stehen auf 16px, weil iOS sonst
> beim Fokussieren hineinzoomt.

Auch die HP-Zahlen auf der Karte (`textTexture` in `js/render3d.js`) laufen in
Silkscreen — in Schritten von 8px und mit `NearestFilter`, sonst interpoliert
die GPU die Sprite-Textur und die Pixelkanten verwaschen.

Die Schriftwahl selbst ist nicht beliebig: Pixelify Sans war zuerst gesetzt und
wurde verworfen, weil seine Ziffern mehrdeutig sind (die `5` ist von einem `S`
nicht zu unterscheiden, `2`/`8` verschwimmen bei 11px) — in einem Spiel voller
Kosten- und Rundenzahlen ein Ausschlusskriterium. Umgekehrt ist in Silkscreen
das `c` kaum von der `0` zu trennen, es taugt deshalb nicht für Hex-Codes oder
Fließtext.

## Renderer Facade (important)

All rendering, picking, and camera access goes through the global `Renderer` object (defined at the bottom of `js/render.js`, interface: `init/resize/render/pickHex/beginGesture/gesturePan/gestureZoom/gestureOrbit/wheelZoom/centerOn/spawnFloatingText/spawnAttackAnim`). `js/render3d.js` replaces `Renderer` with a Three.js implementation by default; `?r2d=1` in the URL keeps the legacy 2D canvas renderer. The 3D camera supports touch-only left/right orbit (two-finger twist, `gestureOrbit`) around a fixed elevation angle; `gestureOrbit` is a no-op on the 2D renderer (pure top-down, no rotation).

Rules:
- Game logic must never touch `camX/camY/camScale`, `ctx`, or hex hit-testing directly — always go through `Renderer`.
- `renderBoard(state)`, `spawnFloatingText`, `spawnAttackAnim` are global delegates that forward to the active renderer; call sites don't change.
- The 2D canvas context is created eagerly in `globals.js`; the 3D renderer therefore uses its own `#gameCanvas3d` canvas and hides the 2D one. Input listeners are bound to `#canvas-wrapper` so both canvases receive events.
- Units are voxelized billboards from `pixelSprites` (any NxN size, scale normalized to 10). Buildings/stones render as true 3D `voxelModels` (world-fixed orientation, enclosed voxels culled, no blob shadow) when a model with the same key exists; the 2D renderer always uses the `pixelSprites` fallback. Tiles get fake-AO via vertex colors + deterministic per-tile color jitter; trees are trunk+double-cone pines. Style guide: ground units/buildings = dark-fantasy middle ages, air units (12–15) = da-Vinci machines (linen `L` + wood tones).

## Game State Schema

The canonical reference is `gameState.json`. Key fields:

| Field | Type | Meaning |
|---|---|---|
| `sd` | number | Map seed — drives terrain + village placement |
| `rn` / `cp` | number | Round number / current player index |
| `p[]` | array | Players: `n` name, `g` gold, `m` wood, `s` stone, `f[]` factions, `u[]` upgrades, `sv` start village key, `sh` start village HP, `e` explored fog, `al/req/tc` diplomacy, `gifts[]` pending resource gifts from allies `{from, g, m, s}` (shown as a toast and cleared on the recipient's next turn), `dead` |
| `v` | object | Village ownership: `"x,y": playerId` (-1 = neutral) |
| `u[]` | array | Units: `i` id, `p` player, `t` type, `x/y`, `h` HP, `a` acted, `vet` veteran, `k` kills, `iv` invisible, `cd` cooldown, `mi` mining target, `dp` deployed, `fb` feudalism HP bonus |
| `st[]` | array | Stone piles: `{x, y, h}` (h=0 → passable) |
| `tw[]` | array | Towers: `{x, y, o, h, a}` |
| `tu[]` | array | Tunnels: `{x1, y1, x2, y2, o, h, r}` (r = build round, usable when `r <= rn`) |
| `wa[]` | array | Walls: `{x, y, h, o}` |
| `ct` | object | Central watchtower `{x, y, ctrl}` |
| `la[]` | array | Rückblick-Log: `{x, y, t, p}` (+ optional `ut`/`uw`/`global`/`vo`, bei Angriffen `au` **oder** `ab` sowie `dm`/`vk`/`vt`/`vp`/`kl`). Läuft über eine **ganze Runde**, nicht nur einen Zug — `recapAppendTurn` (js/recap.js) hängt an und wirft die Einträge eines Spielers weg, sobald er wieder gezogen hat. `p` = Urheber (`-1` = Kreaturen/Weltereignis), `vo` = Vorbesitzer eines eroberten Dorfes. Gedeckelt auf `RECAP_LOG_CAP` Einträge |

**Serialization invariants**: before compressing, default values are deleted (`a: 0`, `dp: 0`, empty arrays) and `u.i` is always removed (regenerated on load in `bootGame`). This cleanup exists in **three places** that must stay in sync: `doEndTurn` and `confirmSurrender` (`js/input.js`) and the restore side in `bootGame` (`js/main.js`).

## Coordinate System

Hex grid uses **odd-r offset** coordinates (pointy-top). `oddRToCube(x, y)` converts to cube coords; `hexDistance` is Chebyshev distance in cube space. Villages are keyed as `"x,y"` strings. Neighbor offsets differ for odd/even rows (`getNeighbors`).

## Game Systems

**Factions** (keys 0–3): Feudalism, Plunderers, Espionage, Guilds. Each unlocks 2 special units and 3 research upgrades; chosen via draft overlay when owning enough villages. Faction special units per player: `{0:[3,10], 1:[4,8], 2:[5,9], 3:[6,11]}`.

**Units** (`unitStats`, types 0–11): Sword, Bow, Horse, Knight, Berserker, Assassin, Trebuchet(Tribok), Worker, Saboteur, Elephant, Camel Rider, War Wagon. Stats are pure data; runtime modifiers (upgrades, terrain, veterancy, faction passives, HP scaling) are computed in `getExpectedDamage` and getters like `getUnitMove`, `getUnitMaxHp`.

**Fair spawn placement** (`js/mapgen.js`): start villages are spread evenly along the ring at `radius - 1` (exact corner positions for 2/3/6 players; for 4 players a `1/6` ring-phase offset avoids landing two players exactly on hex corners and two on edge midpoints — corners and edge midpoints have different Voronoi-sector sizes, which without the offset gave the corner players up to ~40% more territory/villages; 5 players still has a smaller residual imbalance since 5 doesn't evenly divide a hexagon's 6-fold symmetry — no phase choice fully fixes it). Neutral villages and stones come from the `SPAWN_BUDGETS` table (per map radius 5/7/12 × player count 2–6): every player gets the same number of spawns in identical distance bands around their start village; the remainder goes only to "contested" hexes (roughly equidistant to the two nearest players).

*Hard no-touch floor* (Korrektur Juli 2026, "Sauberkeit garantieren, Budget senken"): no spawn (village or stone, any placement mechanism) may ever land at hex distance 1 from another — `Math.max(minSpacing - 1, 2)` replaces every `minSpacing - 1` relaxation tier, so the historical "-1" fallback can soften 3→2 but never reach 1. `villageOK` was also extended to check stones (symmetric to `stoneOK`, which already checked villages — this closed a gap where a later-band village could land directly next to an earlier stone). Where the old code guaranteed exact spawn *counts* by relaxing spacing down to bare non-overlap, it now does the opposite: counts degrade gracefully instead. This is a deliberate trade-off (confirmed with the user after empirical testing) — on the tightest maps (radius 5 with 4+ players, radius 7 with 6 players) a player may end up with only 1 (or 0) of the "guaranteed" 2 near-spawn villages, or no near-spawn stone at all, rather than the old behavior of forcing the full count via touching placements.

*Avoiding clumping* (same correction, informed by research into Poisson-disc/blue-noise and stratified-sampling point distribution): plain `pickRandom` over a filtered candidate pool clumps, because it has no awareness of how crowded a region already is. Three call sites were fixed:
- **`farthestPick(candidates)`**: a "greedy farthest point" helper — scores each candidate by its minimum distance to every existing village/stone and picks the best (shuffled tie-break). Used everywhere a candidate is chosen, replacing `pickRandom`.
- **`placeContested`**: previously a flat round-robin over player-pairs, picking one random cell per pair per turn. With only one pair (2 players), the entire contested budget landed on one random point along the single pair-border (a line bisecting the map through its center) — visibly a "stripe" of villages clumped in the middle. First fix: (1) split the total budget across pairs *proportionally to each pair's contested-cell pool size* (so a lone pair on a 2-player map gets the full budget spread across its whole line, not clumped at one point), (2) sort each pair's pool by a pure cube-coordinate projection onto the perpendicular of the two villages' connecting line (`alongBorder` — deliberately not `getHexCenter`, which needs render.js/globals.js pixel constants not loaded by the Node test harness in `maptest/`), (3) bucket that sorted pool into `quota` equal-length segments and `farthestPick` one candidate per bucket (stratified sampling along the border's full length). That alone still left a visible stripe, just an evenly-*populated* one: the exact-tie zone (`c.contested`, tolerance ±1) is geometrically a razor-thin line — only ~2 hexes wide on a 25-wide radius-12 map, regardless of tolerance (empirically confirmed the width scales ~linearly with the tolerance value, not suddenly widening), so stratifying *along* an inherently 1-hex-wide line can't add width. Second fix: `placeContested` now gathers its candidate pool via a separately-stored `c.diff` (raw distance-difference to the second-nearest player, not just the boolean `contested`) with a much wider tolerance, `wideThreshold = Math.max(1, Math.round(radius / 2))` — turning the line into an actual band several hexes wide, letting `farthestPick`'s 2D distance scoring spread picks across the band's width too, not just its length. `placeForPlayers`' own `!c.contested` preference (avoid handing a player border cells for their guaranteed own-sector spawns) intentionally keeps the original strict ±1 definition — only `placeContested`'s pool-gathering uses the wider one. A separate hub-convergence issue surfaces with 3+ players: every adjacent-pair border passes close to the map's geometric center, so independently-valid per-pair picks can still pile up there in aggregate — `farthestPick`'s cross-pair awareness (it scores against *all* placed villages/stones, not just the current pair's) mitigates but doesn't eliminate this; the hard no-touch floor is what actually guarantees no visible clump.
- **Near-spawn placement** (below): same hub-convergence problem between adjacent players (both aim "toward center", which for neighbors also means "toward each other") — fixed by grouping ring-3 candidates into center-distance tiers (preserves the direction preference) and `farthestPick`-ing within each tier before moving to the next.

The closest spawns (2 villages + 1 stone per player) are placed deterministically at "ring-3" hexes (`hexRingAround`, js/hex.js — exactly 3 hexes from the start village), restricted to the half of the 18 ring-3 hexes that is no farther from the map center than the start village itself, sorted by proximity to center — this guarantees they always spawn toward the center or slightly to the side, never behind the village (direct neighbors, ring-1, were tried first but rejected: of a village's 6 neighbors, geometrically only exactly one is ever closer to the center, and the starting unit already occupies that one, so any ring-1 pick was forced backward; ring-2 was tried next and worked, but was later widened to ring-3). Uses `villageOK`/`stoneOK` with `minDist=2` (never relaxed below, per the hard floor above) instead of the general 3/2 convention, since "ring-3 from *my own* village" itself would otherwise self-reject with the general minDist=3 (distance 3 *is* < 3). Since every player applies the identical rule to their own (rotationally symmetric) village, the resulting distance is the same for all players (5-player residual asymmetry aside, as above).

All other bands are measured from the start village as before. Placement uses candidate-list sampling with per-round shuffled player order; on saturated maps constraints are relaxed stepwise (allow contested → lower min spacing, floored at 2 → widen band) — counts are no longer strictly guaranteed on the tightest configurations (see above). Min spacing: villages ≥ 3, stones ≥ 2 (both floored at 2, never lower). Fairness is measured by `node maptest/analyze_maps.js` — run it after tuning `SPAWN_BUDGETS`.

**Combat flow** (`js/input.js`): attack → damage → counter-attack after 600 ms `setTimeout` if the target survives and has the attacker in range → melee killers advance onto the target hex. Veterancy at 2 kills (+1 dmg).

**Fog of war**: per player as compressed hex string (`compressFog`/`decompressFog`, `js/prng.js`). `getVisibleHexes` computes live vision (units, villages, towers, central watchtower); `updateExploration` persists it.

**Rückblick / Recap** (`js/recap.js`, Aug 2026): Beim Zugstart zeigt ein Panel links oben, was seit dem **eigenen letzten Zug** im eigenen Sichtfeld passiert ist. Es löst den alten, dauerhaft abgeschalteten Kamera-Playback ab (1200 ms je Aktion, kein Abbruch, ein Glyph ohne Urheber). Fünf Eigenschaften sind Absicht, nicht Zufall:

- **Nicht blockierend.** Kein Overlay, kein Timer, kein Kamerazwang — die Kamera fährt ausschließlich, wenn der Spieler eine Zeile antippt (mehrfaches Antippen steppt die Felder dieser Zeile durch). Der Zug ist die ganze Zeit spielbar; der erste Klick aufs Spielfeld räumt das Panel weg.
- **Wieder aufrufbar.** Der Knopf im HUD (`#recap-btn`, nur sichtbar wenn es etwas zu berichten gibt) holt ihn jederzeit zurück. Das ist die Voraussetzung dafür, dass er nicht blockieren muss — vorher war jeder Rückblick nach dem ersten Klick für immer weg.
- **Eine ganze Runde statt eines Zuges.** `gameState.la` wurde früher in `doEndTurn` überschrieben; bei 3+ Spielern konnte man die Züge aller anderen Spieler prinzipiell nie sehen. `recapAppendTurn` hängt jetzt an, stempelt den Urheber (`a.p`) auf jeden Eintrag und wirft die Einträge eines Spielers weg, sobald **dieser** wieder zieht — dadurch enthält der Log ohne zusätzlichen Rundenzähler immer genau "alles seit dem letzten Zug dessen, der als Nächstes dran ist". Deckel: `RECAP_LOG_CAP`. `fx/fy` werden beim Anhängen gestrichen (einziger Leser war die entfernte Angriffsanimation).
- **Verdichtet und priorisiert.** Gruppierung nach Spieler; `recapTouchesViewer` markiert Aktionen auf eigenem Besitz als Treffer, sortiert sie samt ihrer Gruppe nach oben und färbt den HUD-Knopf rot. Der Vorbesitzer eines eroberten Dorfes steckt als `vo` im Eintrag — nach dem Besitzerwechsel ist er aus dem State allein nicht mehr ableitbar.
- **Zwei verschiedene Verdichtungen, mit Absicht** (`buildRecapGroups`): **Angriffe bekommen je eine eigene Zeile** — wer, auf wen, wie viel Schaden, tot ja/nein steht in jedem Angriff anders, ein gebündeltes "3 Angriffe" wirft genau das weg, wofür man den Rückblick liest. **Alles andere wird je Einheitentyp gebündelt** ("Pferd bewegt ×2"), damit ein Zug mit zwölf Bewegungen das Panel nicht flutet und trotzdem in jeder Zeile steht, *welche* Einheit gehandelt hat.

**Was in einem Eintrag steht.** Neben `x/y/t/p` tragen Aktionen so viel Kontext, wie an ihrer Push-Stelle *ohne Raten* verfügbar ist: `ut` = handelnde Einheit, und bei Angriffen `au` (Angreifer-Typ), `dm` (Schaden), `vk` (Zielart: `unit`/`building`/`wall`/`tower`/`tunnel`/`creature`), `vt` (Ziel-Einheitentyp), `vp` (Ziel-Besitzer), `kl` (zerstört). Gesetzt wird das in `executeAttackOnTarget` bzw. `executeUWAttack` (js/input.js) — die einzigen Stellen, an denen alle Zielarten schon aufgelöst sind. Daraus wird die Zeile *"Ritter → dein Schwert −6 ☠"*; `vp === viewer` erzeugt das "dein". Einträge ganz ohne Angaben (Blobs von vor dieser Änderung) landen auf neutralem Text, nie auf `undefined`.

**"Trifft dich" liest `vp`, nicht das Hex.** `recapTouchesViewer` prüft zuerst `a.vp === viewer` (bzw. `a.vo` beim Dorf) und erst danach, ob auf dem Feld noch etwas Eigenes steht. Die Reihenfolge ist der Punkt: eine **zerstörte** Einheit steht dort nicht mehr — ohne `vp` blieb ausgerechnet der Kill unmarkiert, während der Streifschuss daneben rot war.

**Flächenschaden erzeugt je getroffenem Ziel einen eigenen Eintrag, auf dessen Feld** (`recapAoE`, js/recap.js). Feuersturm, Stampede, Tribok-Salve, Rundumschlag, Saboteur-Detonation und der Gleiter-Sturzangriff melden ihre Treffer über einen gemeinsamen Sammler (`hits.unit(u, dmg)` / `.wall` / `.tower` / `.tunnel` / `.building`, jeweils direkt nach dem `h -= dmg`, damit das Kill-Flag stimmt) und rufen am Ende `flush(turnActions, cx, cy)`. Das erspart eine Opferliste im Eintrag und bringt drei Dinge geschenkt, die sonst alle einzeln nachzubauen wären: die Fog-Regel greift je Ziel, "trifft dich" und die Karten-Hervorhebung sitzen auf dem richtigen Feld, und die Zeile ist dieselbe wie bei einem Einzelangriff. Trifft die Fähigkeit nichts, bleibt ein Eintrag auf dem Mittelpunkt (*"Elefant greift an"*).

**Der Turmschuss** hatte bis Aug 2026 **gar keinen** Log-Eintrag — ein Schuss auf das eigene Dorf fiel im Rückblick des Getroffenen komplett unter den Tisch. Er läuft jetzt über denselben Sammler, mit `ab: 'tower'` statt `au`: hinter ihm steht keine Einheit, die Zeile heißt *"Turm → dein Bogen −5"* und trägt das Turm-Symbol statt eines Einheiten-Sprites.

**Symbole und Hervorhebung.** Jede Zeile trägt das echte `pixelSprites`-Bild der Einheit in Spielerfarbe (`recapSpriteURL` rendert es einmalig in ein Offscreen-Canvas und cacht die data-URL) — bei Angriffen Angreifer groß, Ziel klein, damit die Zeile als "der da → den da" liest. Antippen wählt eine Station der flachen Ereignisliste (`recapFlat`, ein Eintrag je Zeile×Feld): `window.recapFocus` hebt **alle** Felder der Zeile auf der Karte hervor (gelesen von `js/render.js` und `js/render3d.js`), die Kamera fährt auf das Feld dieser Station, weiteres Antippen blättert weiter — am Zeilenende in die nächste Zeile, nicht im Kreis.

**Eingeklappt ist der Standardzustand** (`setRecapCollapsed`, Aug 2026): beim Zugstart öffnet das Panel als ~140px hoher Streifen — Kopfzeile, Kurzfassung ("6 Ereignisse · 2 treffen dich") und eine ‹ ›-Leiste. Das Handy ist die Hauptplattform, dort deckte die volle Liste das halbe Spielfeld ab; die Liste ist damit die Ausnahme (☰ im Kopf), nicht der Normalfall. Ist eine Station gewählt, steht statt der Kurzfassung diese eine Zeile da, und ‹ › blättern durch *alle* Ereignisse, ohne dass man die Liste aufklappen muss.

Ohne Auswahl passiert **nichts von allein**: keine Kamerafahrt, keine Hervorhebung (`syncRecapSelState`, Position zeigt `–/6`). Automatisch auf das erste Ereignis zu springen wäre wieder eine Kamerabewegung, die niemand ausgelöst hat — genau das, was der Rückblick nicht mehr tun soll.

Wird die Liste doch aufgeklappt und dann eine Zeile angetippt, klappt sie **geometrisch begründet** wieder ein: `recapCoversTarget()` prüft, ob das Panel gerade auf der Mitte von `#canvas-wrapper` liegt — genau dorthin setzt `Renderer.centerOn` das gewählte Feld. Die Frage ist bewusst nicht "ist das ein Handy" (ein Breakpoint hätte ein kleines Desktop-Fenster und eine durch viele Zeilen ungewöhnlich hohe Liste verfehlt), sondern "verdeckt das Panel das Ziel". Nach dem Einklappen wird noch einmal zentriert, damit das Feld in der nun freien Fläche landet.

**Der Rückblick am Spielende** (Sept 2026, Vincents Frage "kann man von beendeten Spielen einen Rückblick anschauen?"): konnte man nicht — und zwar aus zwei voneinander unabhängigen Gründen, während die ganze Infrastruktur dafür (`defeatLog`, 14-Tage-Sichtbarkeit beendeter Spiele in der Liste, Defeat-Banner) längst stand:

- **`bootGame` stieg vor dem Rückblick aus.** Die Siegprüfung stand vor `prepareRecap()` und beendete die Funktion mit `showWin(...); return;` — und `showWin` schließt das Panel und blendet Karte samt HUD (also auch den Rückblick-Knopf) aus. Jetzt wird das Ende nur gemerkt (`window.gameFinished`), der Boot läuft vollständig durch, und der Sieg-/Niederlage-Screen legt sich erst danach darüber — mit einem Knopf (`showEndRecap`, js/diplomacy.js), der ihn für die Endstellung wieder wegräumt. Die Karte ist dort begehbar, aber tot: `handleCanvasClick` steigt bei `gameFinished` sofort aus, sonst könnte der Sieger im beendeten Spiel weiterspielen.
- **`defeatLog` wurde nie gefüllt.** `bootGame` normalisiert bei jedem Zugstart `p.defeatLog = []`, und ein leeres Array ist truthy — der "nur einmal setzen"-Schutz in `finalizeDefeatLogs`/`finalizeGameEndLogs` (`|| p.defeatLog`) stieg dadurch im echten Spiel **immer** sofort wieder aus. Die Prüfungen fragen jetzt nach der Länge. Das war auch der Grund, warum der eine Fall, der theoretisch schon funktionierte (ausgeschieden, Partie läuft weiter), in der Praxis ebenfalls leer blieb. Gesichert durch `verify_recap.js` (l2), das die bootGame-Zeile nachstellt — die älteren Tests bauen ihre States selbst und kannten sie nicht.

Dazu: **Aufgeben schreibt jetzt einen Log-Eintrag** (`t: 'surrender'`, `global`), vorher gab es keinen — wer gewann, weil der Gegner aufgab, sah im Rückblick bestenfalls dessen letzte gewöhnliche Aktionen. Und der Endscreen redet nicht mehr jeden mit "SIEG" an (`.is-defeat`, Titel/Symbol/Strahlenkranz getauscht); wer vor dem Gerät sitzt, weiß nur der Server-Modus über `currentUserSlot`, im Hotseat bleibt es beim Sieg-Screen.

**Kreaturen-Angriffe stehen bewusst NICHT im Rückblick** (Entscheidung Jonathan, Aug 2026): der Telegraph der Vorrunde zeigt sie bereits als rot markierte Felder an, bevor sie fallen, und der Treffer selbst läuft als Schadens-Float über `gameState.uwbd`. Eine Zeile "Kreatur greift an" konnte weder das eine noch das andere klarstellen — und zählte jeden Angriffs*versuch* der Runde mit, also "2 Kreaturangriffe" bei einem einzigen getroffenen Arbeiter.

**Keine nichtssagenden Zeilen** (`recapEntryUsable`): ein Eintrag wird verworfen, wenn seine Aktionsart nicht in `RECAP_KINDS` steht **oder** sein `p` kein gültiger Spielerindex ist. Beides trifft laufende Partien, deren Blob älter ist als der Code — die entfernten `creatureAtk`-Einträge (`p: -1`) landeten sonst auf `RECAP_FALLBACK` und standen als "2 Aktionen" im Panel, und die Selbst-Beschneidung in `recapAppendTurn` (`a.p !== pid`) hat sie nie erwischt, sie wären bis `RECAP_LOG_CAP` mitgelaufen. Eine Zeile, die nichts aussagt, ist schlechter als gar keine. Die Kehrseite: **eine vergessene Beschriftung macht die Aktion unsichtbar** — dagegen sichert `verify_recap.js` (g) hart ab, indem es alle `turnActions.push`/`la.push`-Stellen im Spielcode einsammelt und gegen `RECAP_KINDS` prüft. `RECAP_FALLBACK` ist damit reine Verteidigung, keine Anzeigelogik.

Die Sichtbarkeitsregel (M13: `global` immer, `uw` über das Netz, sonst Oberflächensicht, getarnte fremde Einheiten decken zu) steht seither **nur noch einmal**, in `recapVisibleActions` — `js/render.js`, `js/render3d.js` und das Panel benutzen dieselbe Funktion, vorher lag dieselbe Zeile dreimal im Code. `t: 'cap'` war ein Sammelbegriff für Dorf-Eroberung, Palisade, Turm, Tunnel, Auf- und Abtauchen; diese fünf haben jetzt eigene Typen (`wall`/`tower`/`tunnel`/`asc`/`desc`), das Auf-/Abbauen der Wagenburg stand als `atk` da und heißt jetzt `deploy` — sonst lässt sich keine sinnvolle Zeile daraus beschriften. Beschriftet werden die Typen in `RECAP_KINDS`; die Anzahl hängt als "×3" rechts an der Zeile statt im Text, weil im Deutschen sonst Artikel und Verb mitgebeugt werden müssten ("2× Arbeiter gräbt"). Zuschauer (ausgeschieden) bekommen keinen Rückblick — für sie ist `gameState.cp` der aktive Spieler, es gäbe also keine eigene Sicht, auf die er sich beziehen könnte. Tests: `node maptest/verify_recap.js` (Log-Führung, Sichtbarkeit, Angriffszeilen, Verdichtung, Icon-Namen, Blob-Zuwachs; kein DOM nötig).

**Rating & Leaderboard** (`server/rating.js`, Aug 2026): the leaderboard ranks by a **Glicko-2** rating instead of raw win counts. Glicko-2 rather than plain Elo because the player base is small and very unevenly active (one player with ~50 games, the median at 1–5) — plain Elo would give a one-game player a number that looks as authoritative as a veteran's. Glicko-2 additionally tracks an uncertainty (RD): few games → high RD → shown as *provisional* and sorted after established players (`PROVISIONAL_GAMES = 5`); inactivity re-inflates RD instead of freezing a stale value forever. To players it still looks like Elo — one number around 1500.

- **Ratings are a pure function of game history.** `rating_history` holds every step; the columns on `profiles` are only a cache. `server/scripts/rebuild-ratings.js` replays everything (milliseconds at this data volume), so parameter changes are never a one-way door.
- **No backfill** (decision Aug 2026): `RATING_EPOCH` in `rating.js` gates which games count — everyone starts at 1500 and the 63 pre-existing games stay unrated but untouched in the DB. Set the epoch back and rebuild to include them.
- **Multiplayer/teams** are decomposed pairwise: `winner_slots` is the winning group, losers are ranked among themselves by `game_players.eliminated_round` (later elimination = better). Teammates in fixed-team games (`state.at === 1`, allies in `p[i].al`) are not scored against each other. Each pairing is weighted `1/opponents` so one N-player game carries one game's worth of information, not N−1.
- **Abandoning (`left_game`) counts as a loss** against everyone — with async games running for weeks, quitting to protect a rating would otherwise be the dominant strategy.
- **Seats are shuffled at game start** (`server/seating.js`). The host used to get slot 0 permanently and slot 0 always moves first — in all 49 resolvable 1v1 games the host sat on slot 0, a structural edge a rating would otherwise book as skill. Only the display name `p[i].n` follows the player; everything else in `state.p[i]` (`sv`, `e`, resources, `al`) belongs to the seat and stays put.
- Tests: `node server/scripts/test-rating.js` (Glicko-2 vs. Glickman's reference example + the game→pairings translation) and `node server/scripts/test-seating.js` (name↔slot invariant). No DB needed for either.

**Einladung mit Zusage** (`game_players.invite_status`, Sept 2026, Jonathans Meldung „man kann eine Einladung nicht ablehnen"): `POST /:id/invite` schrieb den Freund bisher direkt als Mitspieler in die Lobby — zwischen „drin" und „nicht drin" gab es gar keinen Zustand. Bei einer **Ranked**-Partie hieß das: mitspielen oder aufgeben, und Aufgeben (`left_game`) wertet `server/rating.js` bewusst als Niederlage gegen alle. Gemessen mit der echten `glicko2Update` kostet eine solche erzwungene Aufgabe gegen einen gleich starken Gegner **−175** Punkte bei RD 350 (frischer Account), −85 bei RD 200, −26 bei RD 100 — es trifft also ausgerechnet die Neulinge am härtesten.

- **Nur Ranked ist gesperrt.** `POST /:id/start` weist mit 409 ab, solange jemand auf `'pending'` steht; in einer normalen Partie gilt eine offene Einladung mit dem Start als angenommen (dieselbe Transaktion setzt sie auf `'accepted'`). Dieselbe Wartepflicht für Feierabendpartien wäre Reibung ohne Gegenwert — die Grenze liegt genau dort, wo der Schaden liegt.
- **`DEFAULT 'accepted'`** ist der Grund, warum nichts zu migrieren war: der Altbestand, der Host selbst und jeder, der über den Einladungslink beitritt, haben aktiv zugestimmt. Nur die Host-Einladung schreibt `'pending'`.
- **Ablehnen löscht die Zeile** (`POST /:id/invite/respond {accept:false}`) statt einen Zustand `'declined'` zu hinterlassen — sonst bliebe der Slot belegt, denn Beitritt und Einladung rechnen mit `MAX(slot)+1`. Es läuft deshalb durch dasselbe `renumberLobbySlots` wie Kick und Verlassen, und ist zugleich der Ausstieg für einen bereits zugesagten Spieler (eine Geste für „ich bin raus"). Der Host erfährt es per Push.
- **Zusagen melden sich beim Host** (Sept 2026): eine Absage schickte von Anfang an einen Push, eine Zusage lief lautlos — der Host musste selbst nachsehen, ob er starten kann. Gemeldet wird nur der echte Zustandswechsel (`pending` → `accepted`), sonst schickt ein doppelter Tap auf zwei Geräten zwei Nachrichten.
- **Der Spielstart benachrichtigte gar niemanden** (Sept 2026, Jonathans Meldung: Vincent startete, er selbst hatte den ersten Zug und erfuhr es nicht): die „Du bist dran"-Nachricht hängt allein an `POST /:id/turn`, griff also erst ab dem **zweiten** Zug. Wer den ersten Zug hat, wurde als Einziger nie benachrichtigt — und hält die Partie auf. Seit die Sitzplätze gemischt werden (`server/seating.js`) trifft das nicht mehr planbar den Host, sondern irgendwen. `notifyGameStarted` schickt jetzt aus **beiden** Startwegen eine Nachricht an alle außer den Auslöser (Host beim Hand-Start, Zusagender beim Auto-Start — die sehen den Start auf dem Schirm), mit einer eigenen Zeile für den auf Slot 0.
- **Auto-Start** (`tryAutoStart`, Sept 2026): sobald die letzte offene Zusage eintrifft **und** die Lobby voll ist, startet die Partie von selbst. Die drei Bedingungen sind bewusst eng: **voll** (solange ein Platz frei ist, will der Host vielleicht noch jemanden einladen), **keine offene Zusage mehr** (auch in einer normalen Partie, obwohl der Host dort manuell jederzeit starten dürfte — von selbst loszulaufen, während noch jemand gefragt ist, wäre etwas anderes als das Zugesagte) und **nur aus dem Zusage-Pfad heraus** (ein Beitritt über den Einladungslink löst ihn nicht aus; dort war der Start immer Sache des Hosts). Passt die Teamgröße nicht, unterbleibt der Auto-Start still — der Host sieht den Grund an seinem Startknopf. Fehler beim Auto-Start werden geschluckt und geloggt: die Zusage ist da bereits committet und darf nicht daran scheitern.
- **Dafür generiert der Server jetzt selbst Karten** (`server/mapgen.js`): bis dahin konnte NUR der Client eine Partie starten, weil der Anfangszustand in `js/mapgen.js` entsteht und als `state_blob` hochgeladen wird — eine Automatik hätte also nur funktioniert, solange der Host die App offen hat. `server/mapgen.js` lädt denselben Frontend-Code in Node (gleiches Vorgehen wie `maptest/load_game.js`, keine Kopie der Generierungslogik — die müsste sonst bei jeder Balance-Änderung mitgepflegt werden). Der eigentliche Start (Sitzplätze mischen, Team-Prüfung, `games`-Update) liegt in `finalizeStart` und wird von Hand-Start und Auto-Start gemeinsam benutzt.
- **Der Papierkorb auf Lobby-Karten** war Host-only (`slot === 0`); ein Eingeladener kam aus der Liste heraus gar nicht mehr raus, sondern nur über „Lobby verlassen" zwei Ebenen tiefer. Jetzt hat jede Rolle ihren Ausstieg auf der Karte — der Host löst auf, alle anderen verlassen.
- **Feste Teams brechen sonst still** (mitgefixt Sept 2026): `buildInitialGameState` (js/mapgen.js:470) überspringt die Team-Zuweisung wortlos, wenn die Spielerzahl nicht durch die Teamgröße teilbar ist — aus einem 3v3, aus dem einer absagt, würde ein Jeder-gegen-jeden, das `server/rating.js` mangels `state.at === 1` auch so wertet. Erreichbar war das schon über Kick und Verlassen; mit dem Ablehnen wird es der Normalfall, deshalb weist `POST /:id/start` es jetzt mit 409 ab und der Startknopf des Hosts sagt es vorher.
- **Wer welchen Push bekommt, lässt sich echt prüfen** — das Skript unten deckt es nicht ab, `notifyPlayer` ist ohne VAPID-Schlüssel ein No-Op. Vorgehen (einmalig aufgebaut Sept 2026, ca. 15 Minuten): VAPID-Schlüsselpaar mit `require('web-push').generateVAPIDKeys()` erzeugen, einen **HTTPS**-Empfänger auf einem lokalen Port starten (web-push weist `http://`-Endpunkte ab), der nur den Pfad der eingehenden Zustellung mitschreibt, je Testkonto eine Zeile in `push_subscriptions` mit `endpoint = https://127.0.0.1:<port>/<username>` und einem echten `crypto.createECDH('prime256v1')`-Schlüssel eintragen, und den Server mit `NODE_TLS_REJECT_UNAUTHORIZED=0` plus den VAPID-Variablen starten. Entschlüsseln muss der Empfänger nichts — die Frage ist, **wer** etwas bekommt, und genau die war zweimal falsch beantwortet. Vorsicht bei der Auswertung: die Einladungs-Pushes laufen asynchron noch nach, ein Log-Schnappschuss direkt nach dem Einladen enthält sie sonst mit.
- Test: `bash server/scripts/test-invite-flow.sh` gegen einen laufenden Server (s.o.) — inklusive des Falls, den eine Nachbildung in Node nicht prüfen würde: nach einer Absage muss der frei gewordene Slot wieder vergeben werden, sonst hält sich die Lobby für voll.

**Rendering entry point**: `renderBoard(gameState)` → active renderer. Rendering is event-driven (after actions), not per-frame; animation loops run only while animations are active.

## Planned / In Progress

Three.js port (Phase 1) is the default renderer (`?r2d=1` for the legacy 2D fallback); air units (Lufteinheiten, unit types 12–15, one per faction) are planned as Phase 2 — design docs in `Lufteinheiten/`.
