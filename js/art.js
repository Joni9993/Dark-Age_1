// === ART-DATEN (Paletten, Pixel-Sprites, 3D-Voxelmodelle) ===
// Diese Datei ist die einzige Quelle für den Look des Spiels und wird vom
// Editor (editor.html) komplett neu generiert — Format nicht von Hand ändern,
// Pixel-Änderungen am besten im Editor machen.
//
// WICHTIG: Zwei komplette Datensätze koexistieren hier:
//   CLASSIC_* — Live-Design (aktuell im echten Spiel sichtbar)
//   NEW_*     — Redesign in Arbeit, nur sichtbar mit ?debug=1 (oder im Editor)
// DEBUG_ART entscheidet, welcher Satz als `pal`/`pixelSprites`/... exportiert
// wird. So bleibt das Live-Spiel unangetastet, während wir im Debug-Modus
// iterieren — erst auf ausdrücklichen Wunsch wird NEW_* zum einzigen Datensatz.
// Ausnahme: CLASSIC_TERRAIN_COLORS wurde bereits auf Wunsch auf die sanftere/
// hellere Boden-Palette aus dem Redesign umgestellt (Gebäude/Einheiten/Steine
// bleiben unverändert im alten Look, bis die auch freigegeben werden).
//
// Sprite-Format: 1 Zeichen = 1 Pixel (Zeilen als Strings, '.' = transparent).
// Voxelmodell-Format: Tiefen-Schichten (hinten → vorne), jede Schicht w×h Pixel.

const P = 9;
const PD = 19;

// Zeichen ↔ Palettenindex für NEW_* (auch vom Editor benutzt). CLASSIC_* sind
// rohe Zahlen-Arrays und brauchen dieses Mapping nicht.
const SPRITE_CHARS = {
    ".": 0, "X": 1, "S": 2, "A": 3, "W": 4, "R": 5, "I": 6, "G": 7, "F": 8,
    "P": P, "w": 10, "L": 11, "a": 12, "D": 13, "r": 14, "s": 15, "f": 16,
    "V": 17, "H": 18, "p": PD
};
const SPRITE_CHARS_REV = Object.fromEntries(Object.entries(SPRITE_CHARS).map(([c, v]) => [v, c]));

// Pixelfarbe eines Sprite-Werts auflösen (P/PD → Spielerfarbe hell/dunkel).
// Nutzt das jeweils aktive `pal` (unten per DEBUG_ART gesetzt).
const _pdCache = {};
function darkenHexColor(hex, f) {
    const key = hex + f;
    if (_pdCache[key]) return _pdCache[key];
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return (_pdCache[key] = `rgb(${r},${g},${b})`);
}
function spritePixelColor(val, playerColor) {
    if (val === P) return playerColor;
    if (val === PD) return darkenHexColor(playerColor, 0.55);
    return pal[val];
}

// Template-String → numerisches Pixel-Array (Zeilen per Whitespace getrennt)
function decodeSpriteRows(str) {
    const rows = str.trim().split(/\s+/);
    const out = [];
    for (const row of rows) for (const ch of row) out.push(SPRITE_CHARS[ch] || 0);
    if (rows.some(r => r.length !== rows[0].length)) console.error("art.js: Sprite-Zeilen ungleich breit:", str);
    return out;
}
const SP = decodeSpriteRows;
const L = (str) => str.trim().split(/\s+/).map(r => [...r].map(ch => SPRITE_CHARS[ch] || 0));

// Debug-/Editor-Gate: NEW_* ist nur mit ?debug=1 sichtbar, oder wenn eine Seite
// (der Editor) window.FORCE_NEW_ART explizit setzt, bevor diese Datei lädt.
const DEBUG_ART = (typeof window !== 'undefined' && window.FORCE_NEW_ART === true)
    || new URLSearchParams(location.search).has('debug');


// ============================================================================
// CLASSIC — Live-Design (1:1 aus dem letzten Commit übernommen, bis auf
// CLASSIC_TERRAIN_COLORS s.u.). Sonst NICHT von Hand anpassen — das hier ist
// absichtlich eingefroren, bis wir uns entscheiden, komplett auf NEW_* umzustellen.
// ============================================================================
const CLASSIC_PAL = { 1: "#111", 2: "#ffccaa", 3: "#cfd8dc", 4: "#795548", 5: "#9e9e9e", 6: "#424242", 7: "#ffb300", 8: "#ff6e40" };

const CLASSIC_PIXEL_SPRITES = {
    0: [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 1, 0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 0, 3, 0, 1, 1, P, P, P, P, 1, 1, 3, 0, 1, 3, 1, P, P, P, 1, 1, 1, 0, 1, 3, 1, 3, 3, 3, 1, 4, 0, 0, 1, 1, 0, 1, 1, 1, 0, 4, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    1: [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, P, P, P, P, 1, 0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 1, P, P, 1, 0, 1, 4, 1, 0, 0, 1, P, P, 1, 1, 3, 4, 1, 0, 0, 1, 4, 4, 1, 0, 1, 4, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1, P, 1, 1, 1, 0, 0, 0, 1, 1, 1, P, 1, 3, 1, 1, 0, 1, 4, 4, 4, 1, 1, P, 4, 1, 0, 1, 4, 1, 4, 4, 4, 4, 4, 1, 0, 1, 4, 1, 1, 4, 4, 4, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    3: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 3, 6, 3, 1, 0, 0, 0, 0, 0, 1, 3, P, 3, 1, 1, 1, 1, 3, 0, 1, P, P, P, 1, 1, 3, 3, 1, 1, 4, 4, 4, 4, 4, 4, 4, 3, 1, 1, 4, P, P, P, P, P, 4, 1, 0, 1, 1, 4, 1, 1, 4, 1, 1, 0, 0, 0, 1, 4, 0, 0, 4, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0],
    4: [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 0, 0, 0, 0, 1, 2, 1, 1, 2, 1, 0, 0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0, 3, 1, P, P, P, P, 1, 3, 0, 0, 3, 1, 2, 2, 2, 2, 1, 3, 0, 0, 1, 1, 1, 4, 4, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    5: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 6, 6, 6, 1, 0, 0, 0, 0, 0, 1, 6, 2, 6, 1, 0, 0, 0, 0, 1, 1, 6, 6, 6, 1, 1, 0, 0, 1, 3, 1, P, P, P, 1, 3, 1, 0, 1, 1, 1, 6, 6, 6, 1, 1, 1, 0, 0, 0, 1, 6, 6, 6, 1, 0, 0, 0, 0, 0, 1, 6, 6, 6, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    6: [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 1, 0, 0, 0, 1, 1, 1, 4, 1, 1, 0, 1, 0, 1, 4, 4, 4, 4, 1, 0, 0, 1, 1, 3, 1, 4, 1, 1, 4, 1, 0, 1, 1, 1, 1, 4, 1, 0, 1, 4, 1, 0, 0, 0, 1, 4, 1, 0, 0, 1, 0, 0, 0, 1, P, P, P, P, 1, 0, 0, 0, 1, 3, 1, 1, 1, 1, 3, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0],
    7: [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 1, 0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 0, 0, 0, 1, 1, P, P, P, P, 1, 0, 1, 0, 1, 2, 1, P, P, 1, 3, 3, 3, 1, 1, 1, 0, P, P, 1, 0, 4, 0, 0, 0, 0, 1, 1, 1, 1, 0, 4, 0, 0, 0, 0, 1, 0, 0, 1, 0, 4, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "village": [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 1, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, P, P, P, P, P, P, 1, 0, 0, 1, P, P, 1, 1, P, P, 1, 0, 0, 1, P, P, 1, 1, P, P, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "startVillage": [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 3, 1, 3, 1, 3, 1, 3, 1, 0, 1, 3, 3, 3, 3, 3, 3, 3, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, P, P, P, P, P, P, P, 1, 0, 1, P, P, 1, 1, 1, P, P, 1, 0, 1, P, P, 1, 0, 1, P, P, 1, 0, 1, P, P, 1, 0, 1, P, P, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "tunnel": [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 1, 0, 0, 1, 4, 1, P, P, P, 1, 4, 1, 0, 1, 4, 1, 1, 1, 1, 1, 4, 1, 0, 1, 4, 1, 1, 1, 1, 1, 4, 1, 0, 1, 4, 1, 1, 1, 1, 1, 4, 1, 0, 1, 4, 1, 1, 1, 1, 1, 4, 1, 0, 1, 4, 1, 1, 1, 1, 1, 4, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    8: [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, P, P, P, P, 1, 0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 0, 0, 0, 1, 1, P, P, P, P, 1, 1, 0, 0, 0, 1, 1, P, P, 1, 1, 0, 7, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 7, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    9: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, P, P, P, P, 1, 0, 0, 0, 0, 6, 1, P, P, 1, 6, 6, 0, 0, 6, 6, 6, 1, 1, 5, 5, 6, 6, 0, 6, 6, 6, 6, 6, 5, 5, 1, 6, 0, 6, 6, 6, 6, 6, 6, 6, 6, 3, 3, 0, 6, 6, 0, 6, 6, 0, 6, 0, 0, 0, 6, 5, 0, 6, 5, 0, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    10: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, P, P, 3, 1, 0, 0, 0, 0, 0, 0, P, 0, 1, 0, 0, 0, 0, 0, 0, 4, 4, 4, 0, 0, 4, 4, 0, 4, 4, 4, 4, 4, 4, 4, 4, 1, 4, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 4, 0, 4, 0, 0, 4, 0, 0, 0, 0, 4, 0, 4, 0, 0, 4, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0],
    11: [
        0, 0, 0, 0, 1, 1, 1, 1, 0, 0,
        0, 0, 0, 0, 1, P, P, 1, 0, 0,
        0, 0, 0, 0, 1, 1, 1, 1, 0, 0,
        0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
        1, 4, 4, 4, 4, 4, 4, 4, 1, 0,
        1, 4, 5, 4, 4, 4, 5, 4, 1, 0,
        1, 4, 4, 4, 4, 4, 4, 4, 1, 0,
        0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
        0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
        0, 0, 1, 1, 0, 0, 1, 1, 0, 0
    ],
    "wagen_dp": [
        0, 0, 0, 0, 1, 1, 1, 1, 0, 0,
        0, 0, 0, 0, 1, P, P, 1, 0, 0,
        0, 0, 0, 0, 1, 1, 1, 1, 0, 0,
        0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
        1, 4, 4, 4, 4, 4, 4, 4, 1, 0,
        1, 4, 5, 4, 1, 1, 5, 4, 1, 0,
        1, 4, 4, 4, 4, 4, 4, 4, 1, 0,
        1, 5, 5, 5, 5, 5, 5, 5, 1, 0,
        1, 4, 4, 4, 4, 4, 4, 4, 1, 0,
        0, 1, 1, 1, 1, 1, 1, 1, 1, 0
    ],
    "wall": [0, 0, 4, 0, 0, 4, 0, 0, 4, 0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, P, P, P, P, P, P, P, P, 4, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 4, 0, 0, 4, 0, 0, 4, 0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    "stone": [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 5, 5, 5, 0, 0, 0,
        0, 0, 0, 5, 5, 5, 5, 5, 0, 0,
        0, 0, 5, 5, 5, 5, 5, 5, 5, 0,
        0, 5, 5, 5, 5, 5, 5, 5, 5, 0,
        0, 5, 5, 5, 5, 5, 5, 5, 5, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ],
    "tower": [
        0, 0, 0, 1, 0, 1, 0, 1, 0, 0,
        0, 0, 0, 1, 3, 1, 3, 1, 0, 0,
        0, 0, 0, 1, 3, 3, 3, 1, 0, 0,
        0, 0, 0, 1, 1, 1, 1, 1, 0, 0,
        0, 0, 0, 1, P, P, P, 1, 0, 0,
        0, 0, 0, 1, P, P, P, 1, 0, 0,
        0, 0, 1, 1, 3, 3, 3, 1, 1, 0,
        0, 0, 1, 3, 3, 1, 3, 3, 1, 0,
        0, 0, 1, 3, 3, 1, 3, 3, 1, 0,
        0, 0, 1, 1, 1, 1, 1, 1, 1, 0
    ],
    "watchtower": [
        0, 0, 1, 0, 7, 7, 0, 1, 0, 0,
        0, 0, 1, 7, 7, 7, 7, 1, 0, 0,
        0, 1, 1, 1, 1, 1, 1, 1, 1, 0,
        0, 0, 1, 3, 3, 3, 3, 1, 0, 0,
        0, 1, 1, 3, 7, 7, 3, 1, 1, 0,
        0, 1, 3, 3, 7, 7, 3, 3, 1, 0,
        0, 1, 3, 3, 3, 3, 3, 3, 1, 0,
        0, 1, 3, 3, 3, 3, 3, 3, 1, 0,
        0, 1, 3, 3, 3, 3, 3, 3, 1, 0,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7
    ],
    12: [
        0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
        0, 1, 3, 3, 4, 3, 3, 1, 0, 0,
        1, 3, 4, 3, 3, 4, 3, 3, 1, 0,
        0, 1, 1, 4, 3, 3, 1, 1, 0, 0,
        0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
        0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
        0, 0, 1, P, P, P, P, 1, 0, 0,
        0, 0, 1, P, 2, 2, P, 1, 0, 0,
        0, 0, 0, 1, 1, 1, 1, 0, 0, 0
    ],
    13: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 0, 0, 0, 0, 0, 1, 1,
        1, P, 1, 1, 0, 0, 1, 1, P, 1,
        0, 1, P, P, 1, 1, P, P, 1, 0,
        0, 1, 4, P, P, P, P, 4, 1, 0,
        0, 0, 1, 4, P, P, 4, 1, 0, 0,
        0, 0, 0, 1, 4, 4, 1, 0, 0, 0,
        0, 0, 0, 0, 1, 2, 1, 0, 0, 0,
        0, 0, 0, 0, 1, 2, 1, 0, 0, 0,
        0, 0, 0, 0, 0, 1, 0, 0, 0, 0
    ],
    14: [
        0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
        0, 1, P, P, P, P, P, 1, 0, 0,
        1, P, P, P, P, P, P, P, 1, 0,
        1, 1, P, 1, P, P, 1, P, 1, 0,
        0, 1, 0, 1, 0, 0, 1, 0, 1, 0,
        0, 0, 1, 0, 1, 1, 0, 1, 0, 0,
        0, 0, 0, 1, 2, 2, 1, 0, 0, 0,
        0, 0, 0, 1, 6, 6, 1, 0, 0, 0,
        0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
        0, 0, 0, 0, 1, 1, 0, 0, 0, 0
    ],
    "fallschirm_ld": [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
        0, 0, 1, 6, 2, 2, 6, 1, 0, 0,
        0, 0, 1, P, P, P, P, 1, 0, 0,
        0, 1, 4, 1, P, P, 1, 0, 3, 0,
        0, 1, 4, 1, 6, 6, 1, 3, 0, 0,
        0, 0, 1, 1, 6, 6, 1, 1, 0, 0,
        0, 0, 0, 1, 6, 6, 1, 0, 0, 0,
        0, 0, 0, 1, 0, 0, 1, 0, 0, 0,
        0, 0, 1, 1, 0, 0, 1, 1, 0, 0
    ],
    15: [
        0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
        0, 1, P, P, 7, P, P, 1, 0, 0,
        1, P, P, P, 7, P, P, P, 1, 0,
        1, P, P, P, 7, P, P, P, 1, 0,
        1, P, P, P, P, P, P, P, 1, 0,
        0, 1, P, P, P, P, P, 1, 0, 0,
        0, 0, 1, 1, P, 1, 1, 0, 0, 0,
        0, 0, 0, 1, 8, 1, 0, 0, 0, 0,
        0, 0, 1, 4, 4, 4, 1, 0, 0, 0,
        0, 0, 0, 1, 1, 1, 0, 0, 0, 0
    ]
};

// Bereits auf die sanftere/hellere Boden-Palette aus dem Redesign umgestellt
// (siehe NEW_TERRAIN_COLORS unten — beide sind aktuell identisch).
const CLASSIC_TERRAIN_COLORS = {
    grass: { top: "#3b4c37", side: "#212c22" },
    forest: { top: "#263622", side: "#131d14" },
    hill: { top: "#655139", side: "#403122", sideBottom: "#2a1f16" },
    black: { top: "#000", side: "#000" }
};

// Gebäude/Einheiten bleiben Live vorerst flache Billboards; "stone" wird weiter
// unten (nach NEW_VOXEL_MODELS) auf Wunsch bereits als echtes 3D-Modell live freigegeben.
const CLASSIC_VOXEL_MODELS = {};


// ============================================================================
// NEW — Redesign in Arbeit (nur ?debug=1 / Editor). Dark-Fantasy-Mittelalter
// für Bodeneinheiten & Gebäude; Da-Vinci-Maschinen NUR bei den Lufteinheiten
// (12–15, Leinen `L` + Holz). Wird iterativ verfeinert, bis wir auf Live
// umstellen.
// ============================================================================
const NEW_PAL = {
    1: "#0e0c14",  // X  Outline (fast schwarz, warmstichig)
    2: "#c99361",  // S  Haut (wettergegerbt, abgedunkelt)
    3: "#9fabbc",  // A  Stahl hell
    4: "#5e3a20",  // W  Holz
    5: "#7d838f",  // R  Stein hell
    6: "#2c303d",  // I  Eisen / dunkles Leder
    7: "#c98a10",  // G  Gold (gealtert, matt)
    8: "#e2571f",  // F  Feuer / Glut
    10: "#3a2515", // w  Holz dunkel
    11: "#a99872", // L  Leinen / Segel (verwittert, Da-Vinci-Maschinen)
    12: "#565f70",  // a  Stahl / Stein mittel
    13: "#131019", // D  Tiefer Schatten
    14: "#8f6435", // r  Holz hell / Seil
    15: "#333a4d", // s  Schiefer
    16: "#8a2c0e", // f  Feuer dunkel
    17: "#293d1f", // V  Laub / Moos
    18: "#cabe98", // H  Highlight / Creme (gedämpft)
};

const NEW_PIXEL_SPRITES = {
    // 0 Schwertkämpfer — europäischer Ritterhelm (Großhelm mit Sehschlitz),
    // Kettenwappenrock, Kite-Schild links, gerades Schwert rechts
    0: SP(`
        ..XXXX....
        .XAAAAX...
        .XADDAX...
        RXXPPPPX.A
        RXXPPpPXAA
        RXXPPpPXXG
        .XXXXXXX.w
        ..X..X....
        .XX..XX...
        ..........`),
    // 1 Bogenschütze — Kapuze, Gesicht im Schatten, breiter Bogenstab mit Pfeil
    1: SP(`
        ..XXXX....
        .XPPPpX...
        .XDSSDX.rr
        ..XIIX..rr
        ..XIIXXrAA
        ..XwwX..rr
        ..XXXX..rr
        ..X..X....
        .XX..XX...
        ..........`),
    // 2 Pferd — kräftige Silhouette: Mähne, Kopf mit Kiefer, Reiterbüste, massiger Rumpf
    2: SP(`
        .....XXX..
        ....XwwwX.
        ...XPpXww.
        ..XPPPXww.
        ..XPPPXww.
        .XwwwwwwwX
        XwwwwwwwwX
        XwwwwwwwwX
        .XXX..XXX.
        .XX....XX.`),
    // 3 Ritter — dieselbe Silhouette wie Pferd, aber in Stahl: Großhelm, Barding, Schabracke
    3: SP(`
        .....XXX..
        ....XAAAX.
        ...XAPAAX.
        ..XAPpAX..
        ..XAPpAX..
        .XAAAAAAAX
        XAAAAAAAAX
        XAPPPPpPAX
        .XXX..XXX.
        .XX....XX.`),
    // 4 Berserker — zwei erhobene Streitäxte (breite Klingen), wilde Kriegsbemalung
    4: SP(`
        .A......A.
        AA......AA
        .w......w.
        ..XwSSwX..
        ..XSDDSX..
        .XXSSSSXX.
        .XrPPPprX.
        ..XSSSSX..
        ..XXwwXX..
        ...X..X...`),
    // 5 Assassine — Kapuzengestalt mit glühenden Augen, zwei Dolche nach unten gehalten
    5: SP(`
        ...XXX....
        ..XIIIX...
        ..XFDFX...
        .XXIIIXX..
        XAXPPpXAX.
        XXXIIIXXa.
        a.XIIDX..a
        a.XIIDX...
        ..XX.XX...
        ..........`),
    // 6 Tribok — Wurfarm mit Stein oben, zwei hängende Gegengewichte, breite Basis
    6: SP(`
        ....RR....
        ....RR....
        ....ww....
        ....ww....
        ..WWWWWW..
        .WIssssIW.
        .WIssssIW.
        .W......W.
        WWWWWWWWWW
        W.W....W.W`),
    // 7 Arbeiter — Lederkapuze, Spitzhacke
    7: SP(`
        ..XXXX....
        .XwwwwX...
        .XSSSSX...
        XXPPPpX.X.
        XSXPPXAAAX
        XX.PpX.w..
        ..XXXX.w..
        ..X..X.w..
        .XX..XX...
        ..........`),
    // 8 Saboteur — Kapuze, Gesicht im Schatten, große Bombe mit Funken
    8: SP(`
        ..XXXX....
        .XPPPpX...
        .XDSSDX...
        XXPPPpXX..
        .XXPPXX.F.
        .XXXXXX.II
        ..XXXX..II
        ..X..X....
        .XX.XX....
        ..........`),
    // 9 Elefant — Stoßzähne, Schabracke in Spielerfarbe (größer gerendert)
    9: SP(`
        ..........
        ..........
        .XPPPpX...
        .aXPPXaa..
        aaaXXRRaa.
        IaIIIRRXa.
        IIIIIIIIHH
        .II.II.I..
        .ID.ID.II.
        ..........`),
    // 10 Kamelreiter — Turban-Reiter mit Bogen, deutlicher Höcker
    10: SP(`
        ..XXX.....
        ..XPpX....
        .XXSSXX...
        X.XPPXXrX.
        .XrRRrXrX.
        XrrrrrrXX.
        XwrrrrrwX.
        .XwX.XwX..
        .XwX.XwX..
        ..X...X...`),
    // 11 Wagenburg — Planwagen mit Leinen-Verdeck, deutliche Speichenräder
    11: SP(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWaWWWWaWX
        XWWWWWWWWX
        .XX....XX.
        .XaaXXaaX.
        ..XX..XX..`),
    // Wagenburg verschanzt — zusätzliche Panzerplatten
    "wagen_dp": SP(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWaWXXaWWX
        XaaaaaaaaX
        XWWWWWWWWX
        .XaaXXaaX.
        ..XX..XX..`),

    // === LUFTEINHEITEN (Da-Vinci-Maschinen: Leinen-Segel + Holzrahmen) ===
    // 12 Luftschraube — breites Rotorblatt über schmalem Mast, Gondel mit Pilot
    12: SP(`
        ..XXXXXX..
        .XrrrrrrX.
        ..XXXXXX..
        ....XX....
        ....XX....
        ...XXXX...
        ..XPPPpX..
        ..XPSSpX..
        ...XXXX...
        ....XX....`),
    // 13 Gleiter — sauberer Delta-Flügel, hängender Pilot im Gurtzeug
    13: SP(`
        ..XXXXXX..
        .XPPLLPPX.
        ..XPLLPX..
        ...XrrX...
        ....XX....
        ...XSSX...
        ...XIIX...
        ...X..X...
        ..........
        ..........`),
    // 14 Fallschirmspringer (fliegend) — Schirmkuppel, klare Leinen, hängende Figur
    14: SP(`
        ...XXXX...
        .XPPPPPX..
        XPPLLLPPX.
        .X.X..X.X.
        ..X.XX.X..
        ....XX....
        ...XSSX...
        ...XIIX...
        ....XX....
        ....XX....`),
    // 14 gelandet — Figur mit Schleuder, gepacktes Schirmbündel auf dem Rücken
    "fallschirm_ld": SP(`
        ..........
        ...XXXX...
        ..XISSIX..
        ..XPPPpX..
        .XrXPPX.A.
        .XrXIIXA..
        ..XXIIXX..
        ...XIIX...
        ...X..X...
        ..XX..XX..`),
    // 15 Bombenballon — Hülle in Spielerfarbe mit Gold-Naht, Glut, Korb
    15: SP(`
        ...XXXX...
        .XPPGPpX..
        XPPPGPPpX.
        XPPPGPPpX.
        XPPPPPPpX.
        .XPPPPpX..
        ..XXPXX...
        ...XFX....
        ..XWwWX...
        ...XXX....`),

    // === GEBÄUDE (2D-Fallback — im 3D-Renderer ersetzen Voxelmodelle diese Sprites) ===
    "village": SP(`
        ...XXXX...
        ..XPPPpX..
        .XPPPPPpX.
        XXXXXXXXXX
        .XWLLLLWX.
        .XLLwwLLX.
        .XLLwwLLX.
        .XXXXXXXX.
        ..........
        ..........`),
    "startVillage": SP(`
        .X.X.X.X..
        XaXaXaXaX.
        XaaaaaaaX.
        XXXXXXXXX.
        XPPPPPPpX.
        XPPXXXPpX.
        XPPXDXPpX.
        XPPXDXPpX.
        XXXXXXXXX.
        ..........`),
    "tunnel": SP(`
        ..XXXXX...
        .XVVVVVX..
        XWXPPPXWX.
        XWXDDDXWX.
        XWXDDDXWX.
        XWXDDDXWX.
        XwXDDDXwX.
        XwXDDDXwX.
        XXXXXXXXX.
        ..........`),
    "wall": SP(`
        ..a..a..a.
        .aaaaaaaa.
        aaRaaRaaRa
        aPPPPPPPPa
        aaRaaRaaRa
        aaaaaaaaa.
        .a..a..a..
        aaaaaaaaaa
        aRaaRaaRaa
        aaaaaaaaaa`),
    "stone": SP(`
        ..........
        ..........
        ..........
        ....XXX...
        ..XXRaaX..
        .XRRRRaaX.
        XRRaRRRaaX
        XRRRRaRRIX
        .XXXXXXXX.
        ..........`),
    "tower": SP(`
        ...X.X.X..
        ...XaXaX..
        ...XaaaX..
        ...XXXXX..
        ...XPPpX..
        ...XPPpX..
        ..XXaaaXX.
        ..XaaDaaX.
        ..XaaDaaX.
        ..XXXXXXX.`),
    "watchtower": SP(`
        ..X.GG.X..
        ..XGGGGX..
        .XXXXXXXX.
        ..XaaaaX..
        .XXaGGaXX.
        .XaaGGaaX.
        .XaaaaaaX.
        .XaaDDaaX.
        .XaaDDaaX.
        GGGGGGGGGG`)
};

// === 3D-VOXELMODELLE (nur render3d, nur NEW_*) ===
// Echte 3D-Körper: Schichten von hinten (Norden) nach vorne (Süden), jede
// Schicht w Spalten × h Zeilen (Zeile 0 = oben). s = Voxelgröße in Welteinheiten.
const NEW_VOXEL_MODELS = (() => {
    // --- Dorf: Fachwerkhaus, Satteldach in Spielerfarbe (Giebel zur Kamera) ---
    const vilMid = L(`
        ....P....
        ...PPP...
        ..PPPPP..
        PPPPPPPPP
        .LLLLLLL.
        .LLLLLLL.
        .LLLLLLL.`);
    const vilBack = L(`
        ....p....
        ...pPp...
        ..pPPPp..
        ppPPPPPpp
        .LWLLLWL.
        .LLLLLLL.
        .LWLLLWL.`);
    const vilFront = L(`
        ....p....
        ...pPp...
        ..pPPPp..
        ppPPPPPpp
        .LWLLLWL.
        .LWLwwWL.
        .LWLwwWL.`);

    // --- Startdorf: Steinfeste mit Zinnen, Turm, Banner & Tor ---
    const svWall = L(`
        ...........
        ...........
        ...........
        ...........
        ...........
        a.a.a.a.a.a
        aaaaaaaaaaa
        aaaaaaaaaaa
        aRaaaaaaRaa
        aaaaaaaaaaa
        aaaaaaaaaaa
        aaaaaaaaaaa`);
    const svTower = L(`
        .....P.....
        ....PP.....
        ...a.a.a...
        ...aaaaa...
        ...aaRaa...
        a.aaaaaaa.a
        aaaaaaaaaaa
        aaaaaaaaaaa
        aRaaaaaaRaa
        aaaaaaaaaaa
        aaaaaaaaaaa
        aaaaaaaaaaa`);
    const svFront = L(`
        ...........
        ...........
        ...........
        ...........
        ...........
        a.a.a.a.a.a
        aaaaaaaaaaa
        aaaaPPPaaaa
        aRaaPPPaaRa
        aaaaDDDaaaa
        aaaaDDDaaaa
        aaaaDDDaaaa`);

    // --- Wachturm (baubar): schlanker Steinturm, hohler Zinnenkranz, Banner vorn ---
    const twMid = L(`
        a.....a
        a.....a
        aaaaaaa
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .RaaaR.`);
    const twBack = L(`
        a.a.a.a
        aaaaaaa
        aaaaaaa
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .aaaaa.
        .RaaaR.`);
    const twFront = L(`
        a.a.a.a
        aaaaaaa
        aaaaaaa
        .aPPPa.
        .aPPPa.
        .aPPPa.
        .aPPPa.
        .aaDaa.
        .aaDaa.
        .aaaaa.
        .aaaaa.
        .RaaaR.`);

    // --- Zentraler Wachturm: großer Turm mit goldenem Dach ---
    const ctMid = L(`
        ....G....
        ...GGG...
        ..GGGGG..
        .aaaaaaa.
        .aaaaaaa.
        ..aaaaa..
        ..aaaaa..
        ..aaaaa..
        ..aaaaa..
        ..aaaaa..
        ..aaaaa..
        ..aaaaa..
        ..aaaaa..
        .RaaaaaR.`);
    const ctFront = L(`
        ....f....
        ...fGf...
        ..fGGGf..
        .aaaaaaa.
        .aaaaaaa.
        ..aaDaa..
        ..aaDaa..
        ..aPPPa..
        ..aPPPa..
        ..aaaaa..
        ..aaaaa..
        ..aaDaa..
        ..aaDaa..
        .RaaaaaR.`);

    // --- Mauer: Zinnenwall quer über das Hex, Wappenschild vorn ---
    const waMid = L(`
        a.a.a.a.a.a.a.a
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaRaaaaaaaaaRaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa`);
    const waFront = L(`
        a.a.a.a.a.a.a.a
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaPPPaaaaaa
        aaRaaaPPPaaaRaa
        aaaaaaaPaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa`);

    // --- Tunnel: Erdhügel mit Moos-Kuppe und verschaltem Eingang ---
    const tuMid = L(`
        ...VVV...
        ..wwwww..
        .wwwwwww.
        .wwWwWww.
        wwwwwwwww
        wWwwwwwWw`);
    const tuBack = L(`
        ...VVV...
        ..Vwwww..
        .wwwwwww.
        .wwwwwww.
        wwWwwwWww
        wwwwwwwww`);
    const tuFront = L(`
        ...VVV...
        ..wwwww..
        .wwrPrww.
        .wwrDrww.
        wwwrDrwww
        wWwrDrwWw`);

    // --- Steinhaufen: unregelmäßige Felsbrocken ---
    const stA = L(`
        .........
        .........
        .........
        ...RR....
        ..RRRa...`);
    const stB = L(`
        .........
        .........
        ...RRa...
        ..RRRaa..
        .RRRRRa..`);
    const stC = L(`
        .........
        ....RR...
        ..RRRRa..
        .RRRRRaa.
        .RRRRRaa.`);
    const stD = L(`
        ....RR...
        ..RRRRa..
        .RRaRRRa.
        .RRRRRaa.
        RRRRRRRa.`);

    // ── Einheiten als echte Voxelkörper (statt Billboard-Sprite) ──────────────
    // Beine wiederverwendet über mehrere Biped-Einheiten (Stiefel/nackt/dunkel).
    const legsBooted = [
        "..XIXIX..", "..XIXIX..", "..XwXwX..", "..XwXwX..", "..XX.XX.."
    ].map(r => [...r].map(ch => SPRITE_CHARS[ch] || 0));
    const legsBare = [
        "..XSXSX..", "..XSXSX..", "..XSXSX..", "..XSXSX..", "..XX.XX.."
    ].map(r => [...r].map(ch => SPRITE_CHARS[ch] || 0));
    const legsDark = [
        "..XIXIX..", "..XIXIX..", "..XIXIX..", "..XIXIX..", "..XX.XX.."
    ].map(r => [...r].map(ch => SPRITE_CHARS[ch] || 0));

    // --- 0 Schwertkämpfer: Großhelm, Kite-Schild links, Schwert rechts ---
    const swBack = L(`
        ...XXX...
        ..XAAAX..
        ..XAAAX..
        .XAIIIAX.
        .XAIIIAX.
        .XAIIIAX.
        .XIIIIIX.`).concat(legsBooted);
    const swMid = L(`
        ...XXX...
        ..XAAAX..
        ..XAAAX..
        .XAPPPAX.
        .XAPPpAX.
        .XAPPpAX.
        .XIIIIIX.`).concat(legsBooted);
    const swFront = L(`
        ...XXX...
        ..XADAX..
        ..XAAAX..
        RXAPPPAXA
        RXAPPpAXA
        RXAPPpAXG
        .XIIIIIXw`).concat(legsBooted);

    // --- 1 Bogenschütze: Kapuze, breiter Bogenstab rechts ---
    const boMid = L(`
        ...XXX...
        ..XPPPX..
        .XPDSDPX.
        .XIIIIIX.
        .XIPPpIX.
        .XIPPpIX.
        .XIIIIIX.`).concat(legsBooted);
    const boFront = L(`
        ...XXX...
        ..XPPPX.r
        .XPDSDPXr
        .XIIIIIXA
        .XIPPpIXr
        .XIPPpIXr
        .XIIIIIXr`).concat(legsBooted);

    // --- 4 Berserker: erhobene Streitäxte, bloße Brust ---
    const bsBack = L(`
        .........
        .........
        .........
        ..XwwwwX.
        ..XSSSSX.
        .XSSSSSX.
        .XSPPPSX.
        .XSSSSSX.
        ..XwwwX..`).concat(legsBare);
    const bsFront = L(`
        A.......A
        AA.....AA
        .w.....w.
        ..XwSSwX.
        ..XSDDSX.
        .XSSSSSX.
        .XrPPPrX.
        .XSSSSSX.
        ..XwwwX..`).concat(legsBare);

    // --- 5 Assassine: Kapuze mit Glutaugen, Dolche nach unten ---
    const asMid = L(`
        ...XXX...
        ..XIIIX..
        .XIDDDIX.
        .XIIIIIX.
        .XIPPpIX.
        .XIIIIIX.
        .XIIIIIX.`).concat(legsDark);
    const asFront = L(`
        ...XXX...
        ..XIIIX..
        .XIFDFIX.
        .XIIIIIX.
        aXIPPpIXa
        aXIIIIIXa
        .XIIIIIX.`).concat(legsDark);

    // --- 8 Saboteur: Kapuze, Sprengbombe mit Zündschnur ---
    const saMid = L(`
        ...XXX...
        ..XPPPX..
        .XPDSDPX.
        .XIIIIIX.
        .XIPPpIX.
        .XIIIIIX.
        .XIIIIIX.`).concat(legsDark);
    const saFront = L(`
        ...XXX...
        ..XPPPX..
        .XPDSDPX.
        .XIIIIIXF
        .XIPPpIXI
        .XIIIIIXI
        .XIIIIIX.`).concat(legsDark);

    // --- 2 Pferd: schmaler Hals mit klarer Taille zum Rumpf (liest als Tier,
    // nicht als Kiste) — Kopf/Ohren dünn, Reiterbüste seitlich am Hals, dann
    // abrupt breiterer Rumpf ---
    const hoBack = L(`
        ....XXX...
        ...XwwwX..
        ...XwwwX..
        ....XwX...
        ...XwwXw..
        .XwwwwwwwX
        XwwwwwwwwX
        XwwwwwwwwX
        .XXX..XXX.
        .XX....XX.`);
    const hoFront = L(`
        ....XXX...
        ...XwwwX..
        ...XwwwX..
        ....XwX...
        ...XPpXw..
        .XwwwwwwwX
        XwwwwwwwwX
        XwwwwwwwwX
        .XXX..XXX.
        .XX....XX.`);

    // --- 3 Ritter: dieselbe Silhouette in Stahl, Schabracke ---
    const knBack = L(`
        ....XXX...
        ...XAAAX..
        ...XAAAX..
        ....XAX...
        ...XAAXA..
        .XAAAAAAAX
        XAAAAAAAAX
        XAAAAAAAAX
        .XXX..XXX.
        .XX....XX.`);
    const knFront = L(`
        ....XXX...
        ...XAAAX..
        ...XAAAX..
        ....XAX...
        ...XPpXA..
        .XAAAAAAAX
        XAAAAAAAAX
        XAPPPPpPAX
        .XXX..XXX.
        .XX....XX.`);

    // --- 10 Kamelreiter: schmaler Hals + deutlicher Höcker-Bulge vor dem
    // Rumpf, Turban-Reiter ---
    const caBack = L(`
        ....XXX...
        ...XrrrX..
        ...XrrrX..
        ....XrX...
        ...XrrXr..
        ..XrRRrX..
        .XrrrrrrrX
        XrrrrrrrrX
        XrrrrrrrrX
        .XXX..XXX.
        .XX....XX.`);
    const caFront = L(`
        ....XXX...
        ...XrrrX..
        ...XrrrX..
        ....XrX...
        ...XPpXr..
        ..XrRRrX..
        .XrrrrrrrX
        XrrrrrrrrX
        XrrrrrrrrX
        .XXX..XXX.
        .XX....XX.`);

    // --- 11 Wagenburg: Leinen-Verdeck, Speichenräder ---
    const wgBack = L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWWWWWWWWX
        XWWWWWWWWX
        .XX....XX.
        .XaaXXaaX.
        ..XX..XX..`);
    const wgFront = L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWaWWWWaWX
        XWWWWWWWWX
        .XX....XX.
        .XaaXXaaX.
        ..XX..XX..`);

    // Wagenburg verschanzt: zusätzliche Panzerplatten
    const wgdBack = L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWWWXXWWWX
        XaaaaaaaaX
        XWWWWWWWWX
        .XaaXXaaX.
        ..XX..XX..`);
    const wgdFront = L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWaWXXaWWX
        XaaaaaaaaX
        XWWWWWWWWX
        .XaaXXaaX.
        ..XX..XX..`);

    // --- 6 Tribok: Wurfarm mit Stein, zwei hängende Gegengewichte ---
    const trBack = L(`
        ....RR....
        ....RR....
        ....ww....
        ....ww....
        ..WWWWWW..
        .W......W.
        .W......W.
        .W......W.
        WWWWWWWWWW
        W.W....W.W`);
    const trFront = L(`
        ....RR....
        ....RR....
        ....ww....
        ....ww....
        ..WWWWWW..
        .WIssssIW.
        .WIssssIW.
        .W......W.
        WWWWWWWWWW
        W.W....W.W`);

    // --- 12 Luftschraube: breites Rotorblatt (nur vorn, bleibt dünn), Gondel ---
    const lsBack = L(`
        ..........
        ..........
        ..........
        ....XX....
        ....XX....
        ...XXXX...
        ..XIIIIX..
        ..XIIIIX..
        ...XXXX...
        ....XX....`);
    const lsFront = L(`
        ..XXXXXX..
        .XrrrrrrX.
        ..XXXXXX..
        ....XX....
        ....XX....
        ...XXXX...
        ..XPPPpX..
        ..XPSSpX..
        ...XXXX...
        ....XX....`);

    // --- 13 Gleiter: dünner Delta-Flügel, hängender Pilot ---
    const glFull = L(`
        ..XXXXXX..
        .XPPLLPPX.
        ..XPLLPX..
        ...XrrX...
        ....XX....
        ...XSSX...
        ...XIIX...
        ...X..X...
        ..........
        ..........`);

    return {
        village:      { s: 2.6, layers: [vilBack, vilMid, vilMid, vilMid, vilMid, vilMid, vilFront] },
        startVillage: { s: 2.6, layers: [svWall, svWall, svTower, svTower, svTower, svWall, svFront] },
        tower:        { s: 2.5, layers: [twBack, twMid, twMid, twMid, twMid, twFront] },
        watchtower:   { s: 2.6, layers: [ctMid, ctMid, ctMid, ctMid, ctMid, ctMid, ctFront] },
        wall:         { s: 2.5, layers: [waMid, waMid, waFront] },
        tunnel:       { s: 2.6, layers: [tuBack, tuMid, tuMid, tuMid, tuMid, tuMid, tuFront] },
        stone:        { s: 2.4, layers: [stA, stB, stC, stD, stC, stB, stA] },

        0:  { s: 2.3, layers: [swBack, swMid, swFront] },
        1:  { s: 2.3, layers: [boMid, boMid, boFront] },
        4:  { s: 2.3, layers: [bsBack, bsBack, bsFront] },
        5:  { s: 2.3, layers: [asMid, asMid, asFront] },
        8:  { s: 2.3, layers: [saMid, saMid, saFront] },
        2:  { s: 2.6, layers: [hoBack, hoBack, hoFront] },
        3:  { s: 2.7, layers: [knBack, knBack, knFront] },
        10: { s: 2.6, layers: [caBack, caBack, caFront] },
        11: { s: 2.5, layers: [wgBack, wgBack, wgFront] },
        "wagen_dp": { s: 2.5, layers: [wgdBack, wgdBack, wgdFront] },
        6:  { s: 2.5, layers: [trBack, trBack, trFront] },
        12: { s: 2.4, layers: [lsBack, lsFront] },
        13: { s: 2.4, layers: [glFull, glFull] }
    };
})();

// Stein-Resource ist auf Wunsch bereits live freigegeben — teilt sich das echte
// 3D-Voxelmodell mit dem Redesign (Gebäude/Einheiten bleiben vorerst klassisch).
CLASSIC_VOXEL_MODELS.stone = NEW_VOXEL_MODELS.stone;

// Etwas heller/sanfter als die erste Redesign-Fassung — Boden wirkte zu düster
// und in Kombination mit der Noise-Textur zu unruhig/"noisy" fürs Auge.
const NEW_TERRAIN_COLORS = {
    grass: { top: "#3b4c37", side: "#212c22" },
    forest: { top: "#263622", side: "#131d14" },
    hill: { top: "#655139", side: "#403122", sideBottom: "#2a1f16" },
    black: { top: "#000", side: "#000" }
};


// ============================================================================
// Aktiver Datensatz (per DEBUG_ART umgeschaltet) — das ist es, was Spiellogik
// und Renderer als `pal`/`pixelSprites`/`terrainColors`/`voxelModels` sehen.
// ============================================================================
const pal = DEBUG_ART ? NEW_PAL : CLASSIC_PAL;
const pixelSprites = DEBUG_ART ? NEW_PIXEL_SPRITES : CLASSIC_PIXEL_SPRITES;
const terrainColors = DEBUG_ART ? NEW_TERRAIN_COLORS : CLASSIC_TERRAIN_COLORS;
const voxelModels = DEBUG_ART ? NEW_VOXEL_MODELS : CLASSIC_VOXEL_MODELS;

// === SPIELERFARBEN (identisch in beiden Modi) ===
const playerColors = ["#00e5ff", "#ff1744", "#00e676", "#ffea00", "#d500f9", "#ff9100"];
