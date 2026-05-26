# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in a browser — no build step, no server, no dependencies to install. The entire game ships as a single HTML file.

For map generation/analysis scripts:
```
node maptest/gen_maps.js    # generates test map links as HTML
node maptest/analyze_maps.js # runs 1000 map simulations and prints stats
```

## Architecture

**Single-file game**: All CSS, HTML, and JavaScript live in `index.html`. There is no bundler, no framework, no npm.

**URL-based async multiplayer**: The entire game state is JSON-serialized, LZ-compressed (via the `lz-string` CDN library), and encoded into a URL query parameter. Players share this URL (e.g., via WhatsApp) to pass turns. There is no server.

**Deterministic map generation**: The map terrain (forests, hills) is not stored in game state — it is regenerated from the seed (`gameState.sd`) each time using `getTerrainType(state, x, y)`. Only the village ownership map (`gameState.v`) is stored. This keeps state size minimal.

## Game State Schema

The canonical reference is `gameState.json`. Key fields:

| Field | Type | Meaning |
|---|---|---|
| `sd` | number | Map seed — drives terrain + village placement |
| `rn` | number | Round number |
| `cp` | number | Current player index |
| `p[]` | array | Player objects: `g` gold, `m` wood, `s` stone, `f[]` factions, `u[]` upgrades, `sv` start village key, `sh` start village HP, `dead` |
| `v` | object | Village ownership: `"x,y": playerId` (-1 = neutral) |
| `u[]` | array | Units: `i` id, `p` player, `t` type, `x/y`, `h` HP, `a` acted, `vet` veteran, `k` kill count, `fb` feudalism HP bonus |
| `st[]` | array | Stone piles: `{x, y, h}` (h=remaining stones, 0=passable) |
| `tw[]` | array | Towers: `{x, y, o, h, a}` |
| `tu[]` | array | Tunnels: `{x1, y1, x2, y2, o}` |
| `wa[]` | array | Walls: `{x, y, h, o}` |

## Coordinate System

Hex grid uses **odd-r offset** coordinates. Two key conversion functions:
- `oddRToCube(x, y)` — converts to cube coordinates for distance math
- `hexDistance(p1, p2)` — Chebyshev distance in cube space

Villages are keyed as `"x,y"` strings. Neighbors depend on whether the row is odd or even (different offset arrays in `getNeighbors`).

## Game Systems

**Factions** (`factions` object, keys 0–3): Feudalism, Plunderers, Espionage, Guilds. Each unlocks 2 special units and has 3 research upgrades. Player chooses a faction via the draft overlay when owning enough villages.

**Units** (`unitStats`, types 0–11): Sword, Bow, Horse, Knight, Berserker, Assassin, Trebuchet, Worker, Saboteur, Elephant, Camel Rider, War Wagon. Stats (dmg, range, move, maxHp, cost) are pure data; runtime modifiers come from upgrades, terrain, veterancy, and faction passives — all computed in `getExpectedDamage` and helper getters like `getUnitMove`, `getUnitMaxHp`.

**Fog of war**: Stored as compressed hex strings (4 bits per nibble). `compressFog(arr)` / `decompressFog(hex)` convert between seen-tile index arrays and this format.

**Rendering**: Canvas 2D. `drawScene(gameState)` is the main render entry point. `drawPixelSprite` renders 10×10 pixel-art sprites for each unit type defined in `pixelSprites`. Hex tiles are drawn as 2.5D beveled shapes using `terrainColors`. Camera state is `camX`, `camY`, `camScale`.

**Animation loop**: `animateLoop()` drives floating damage numbers and attack projectile animations (slash, arrow, fire) using `requestAnimationFrame`. Runs only while animations are active.
