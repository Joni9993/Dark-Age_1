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

**Map analysis scripts:**
```bash
node maptest/gen_maps.js     # generates test map links as HTML
node maptest/analyze_maps.js # runs 1000 map simulations and prints stats
```

## Architecture

**Frontend**: Vanilla JS + Canvas/WebGL, no framework, no build step, no npm. `index.html` loads `js/*.js` as classic scripts — **load order matters** (globals → data → prng → hex → logic → render → render3d → events → abilities → ui → diplomacy → input → mapgen → config → api → auth → lobby → debug → main). External libs via CDN: `lz-string`, `three.js` (pinned ≤ r152 — newer releases dropped the UMD build).

**Backend** (`server/`): Node.js + Express + PostgreSQL. Serves the frontend statically and the API under `/api/*` on the same port. JWT auth (localStorage, `js/api.js`), friends system, lobby with invite tokens, Web Push notifications (VAPID, `sw.js` — push only, no asset caching).

**Server-based async multiplayer**: The full game state is JSON-serialized, LZ-compressed, and stored as `state_blob` on the server per turn (`POST /api/games/:id/turn`, see `submitTurnToServer` in `js/input.js`). Opponents load the blob when opening the game; lobbies poll via `setInterval` (`js/lobby.js`). Only the active player may interact (`currentTurnSlot === currentUserSlot`); everyone else is read-only/spectator.

**Deterministic map generation**: Terrain (forests, hills) is NOT stored in state — it is regenerated from the seed (`gameState.sd`) via `getTerrainType(state, x, y)`. Only village ownership (`gameState.v`) is stored.

## Frontend Modules

| File | Responsibility |
|---|---|
| `js/globals.js` | DOM refs + mutable globals (gameState, selection, camera vars) |
| `js/data.js` | Pure data: `unitStats` (types 0–11), `factions`, `upgrades`, `pixelSprites` (10×10 pixel art, `P`=player color), `playerColors` |
| `js/hex.js` | Hex math: odd-r offset coords, `oddRToCube`, `hexDistance`, `getNeighbors`, `getTerrainType`, `getHexCenter` |
| `js/logic.js` | Rules: `calculateMoves` (BFS), `calculateAttacks`, `getExpectedDamage` (all modifiers), `getVisibleHexes`, `getUnitMove/MaxHp/Cost`, `checkVeteran` |
| `js/render.js` | 2D canvas renderer + **`Renderer` facade** (see below) |
| `js/render3d.js` | Three.js renderer (hex prisms + voxelized pixel sprites), active with `?r3d=1` |
| `js/input.js` | Canvas click handling, action flow, attack/counter-attack resolution, `doEndTurn` (serialization), pointer/touch/camera gestures |
| `js/abilities.js` | Special abilities: mining, wall/tunnel/tower building, detonate, deploy, AoE |
| `js/ui.js` | HUD, scoreboard, action menu, `buyUnit`, faction/upgrade purchase, undo (`saveUndoState`) |
| `js/events.js`, `js/diplomacy.js` | Random round events; alliances/truces/team win |
| `js/mapgen.js` | Initial state + map generation (`buildInitialGameState`) |
| `js/api.js`, `js/auth.js`, `js/lobby.js`, `js/config.js` | Server mode: fetch wrapper with JWT, login, home/lobby screens, game list, friends, push registration |
| `js/debug.js` | `?debug=1` test mode (hotseat, click tools, scenarios) |
| `js/main.js` | `bootGame()` (state normalization + recap + events), calls `initApp()` |

## Renderer Facade (important)

All rendering, picking, and camera access goes through the global `Renderer` object (defined at the bottom of `js/render.js`, interface: `init/resize/render/pickHex/beginGesture/gesturePan/gestureZoom/wheelZoom/centerOn/spawnFloatingText/spawnAttackAnim`). `js/render3d.js` replaces `Renderer` with a Three.js implementation when `?r3d=1` is in the URL (3D will become the default after playtesting; 2D stays as fallback).

Rules:
- Game logic must never touch `camX/camY/camScale`, `ctx`, or hex hit-testing directly — always go through `Renderer`.
- `renderBoard(state)`, `spawnFloatingText`, `spawnAttackAnim` are global delegates that forward to the active renderer; call sites don't change.
- The 2D canvas context is created eagerly in `globals.js`; the 3D renderer therefore uses its own `#gameCanvas3d` canvas and hides the 2D one. Input listeners are bound to `#canvas-wrapper` so both canvases receive events.
- 3D units/buildings are voxelized from the same `pixelSprites` data — new sprites automatically work in both renderers.

## Game State Schema

The canonical reference is `gameState.json`. Key fields:

| Field | Type | Meaning |
|---|---|---|
| `sd` | number | Map seed — drives terrain + village placement |
| `rn` / `cp` | number | Round number / current player index |
| `p[]` | array | Players: `n` name, `g` gold, `m` wood, `s` stone, `f[]` factions, `u[]` upgrades, `sv` start village key, `sh` start village HP, `e` explored fog, `al/req/tc` diplomacy, `dead` |
| `v` | object | Village ownership: `"x,y": playerId` (-1 = neutral) |
| `u[]` | array | Units: `i` id, `p` player, `t` type, `x/y`, `h` HP, `a` acted, `vet` veteran, `k` kills, `iv` invisible, `cd` cooldown, `mi` mining target, `dp` deployed, `fb` feudalism HP bonus |
| `st[]` | array | Stone piles: `{x, y, h}` (h=0 → passable) |
| `tw[]` | array | Towers: `{x, y, o, h, a}` |
| `tu[]` | array | Tunnels: `{x1, y1, x2, y2, o, h, r}` (r = build round, usable when `r <= rn`) |
| `wa[]` | array | Walls: `{x, y, h, o}` |
| `ct` | object | Central watchtower `{x, y, ctrl}` |
| `la[]` | array | Last actions (recap) |

**Serialization invariants**: before compressing, default values are deleted (`a: 0`, `dp: 0`, empty arrays) and `u.i` is always removed (regenerated on load in `bootGame`). This cleanup exists in **three places** that must stay in sync: `doEndTurn` and `confirmSurrender` (`js/input.js`) and the restore side in `bootGame` (`js/main.js`).

## Coordinate System

Hex grid uses **odd-r offset** coordinates (pointy-top). `oddRToCube(x, y)` converts to cube coords; `hexDistance` is Chebyshev distance in cube space. Villages are keyed as `"x,y"` strings. Neighbor offsets differ for odd/even rows (`getNeighbors`).

## Game Systems

**Factions** (keys 0–3): Feudalism, Plunderers, Espionage, Guilds. Each unlocks 2 special units and 3 research upgrades; chosen via draft overlay when owning enough villages. Faction special units per player: `{0:[3,10], 1:[4,8], 2:[5,9], 3:[6,11]}`.

**Units** (`unitStats`, types 0–11): Sword, Bow, Horse, Knight, Berserker, Assassin, Trebuchet(Tribok), Worker, Saboteur, Elephant, Camel Rider, War Wagon. Stats are pure data; runtime modifiers (upgrades, terrain, veterancy, faction passives, HP scaling) are computed in `getExpectedDamage` and getters like `getUnitMove`, `getUnitMaxHp`.

**Combat flow** (`js/input.js`): attack → damage → counter-attack after 600 ms `setTimeout` if the target survives and has the attacker in range → melee killers advance onto the target hex. Veterancy at 2 kills (+1 dmg).

**Fog of war**: per player as compressed hex string (`compressFog`/`decompressFog`, `js/prng.js`). `getVisibleHexes` computes live vision (units, villages, towers, central watchtower); `updateExploration` persists it.

**Rendering entry point**: `renderBoard(gameState)` → active renderer. Rendering is event-driven (after actions), not per-frame; animation loops run only while animations are active.

## Planned / In Progress

Three.js port (Phase 1) is code-complete behind `?r3d=1`; air units (Lufteinheiten, unit types 12–15, one per faction) are planned as Phase 2 — design docs in `Lufteinheiten/`.
