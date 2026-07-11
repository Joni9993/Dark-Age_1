// === ART-DATEN (Paletten, Pixel-Sprites, 3D-Voxelmodelle) ===
// GENERIERT vom Art-Editor (editor.html) — Änderungen am besten dort machen.
//
// CLASSIC_* = unverändertes Live-Design, unangetastet vom Editor durchgereicht.
// NEW_*     = Redesign in Arbeit, nur sichtbar mit ?debug=1 (oder im Editor).
// DEBUG_ART entscheidet, welcher Satz aktiv ist — siehe Ende der Datei.
//
// Sprite-Format: 1 Zeichen = 1 Pixel ('.' = transparent, 'P'/'p' = Spielerfarbe hell/dunkel).
// Voxelmodell-Format: Tiefen-Schichten (hinten → vorne), jede Schicht w×h Pixel.

const P = 9;
const PD = 19;

const SPRITE_CHARS = {
    ".": 0,
    "X": 1,
    "S": 2,
    "A": 3,
    "W": 4,
    "R": 5,
    "I": 6,
    "G": 7,
    "F": 8,
    "w": 10,
    "L": 11,
    "a": 12,
    "D": 13,
    "r": 14,
    "s": 15,
    "f": 16,
    "V": 17,
    "H": 18,
    "B": 20,
    "C": 21,
    "E": 22,
    "P": P,
    "p": PD,
};
const SPRITE_CHARS_REV = Object.fromEntries(Object.entries(SPRITE_CHARS).map(([c, v]) => [v, c]));

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

function decodeSpriteRows(str) {
    const rows = str.trim().split(/\s+/);
    const out = [];
    for (const row of rows) for (const ch of row) out.push(SPRITE_CHARS[ch] || 0);
    if (rows.some(r => r.length !== rows[0].length)) console.error("art.js: Sprite-Zeilen ungleich breit:", str);
    return out;
}
const SP = decodeSpriteRows;
const L = (str) => str.trim().split(/\s+/).map(r => [...r].map(ch => SPRITE_CHARS[ch] || 0));

const DEBUG_ART = (typeof window !== 'undefined' && window.FORCE_NEW_ART === true)
    || new URLSearchParams(location.search).has('debug');

// ============================================================================
// CLASSIC — unverändertes Live-Design (nicht vom Editor bearbeitet)
// ============================================================================
const CLASSIC_PAL = {
    "1": "#111",
    "2": "#ffccaa",
    "3": "#cfd8dc",
    "4": "#795548",
    "5": "#9e9e9e",
    "6": "#424242",
    "7": "#ffb300",
    "8": "#ff6e40"
};

const CLASSIC_PIXEL_SPRITES = {"0":[0,0,1,1,1,1,0,0,0,0,0,1,3,3,3,3,1,0,0,0,0,1,2,2,2,2,1,0,3,0,1,1,9,9,9,9,1,1,3,0,1,3,1,9,9,9,1,1,1,0,1,3,1,3,3,3,1,4,0,0,1,1,0,1,1,1,0,4,0,0,0,0,0,1,0,1,0,0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],"1":[0,0,1,1,1,1,0,0,0,0,0,1,9,9,9,9,1,0,0,0,0,1,2,2,2,2,1,0,1,0,0,0,1,9,9,1,0,1,4,1,0,0,1,9,9,1,1,3,4,1,0,0,1,4,4,1,0,1,4,1,0,0,1,1,1,1,0,0,1,0,0,0,1,0,0,1,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],"2":[0,0,0,1,1,1,0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0,1,9,1,1,1,0,0,0,1,1,1,9,1,3,1,1,0,1,4,4,4,1,1,9,4,1,0,1,4,1,4,4,4,4,4,1,0,1,4,1,1,4,4,4,1,0,0,0,1,0,0,1,0,1,0,0,0,0,1,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0],"3":[0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1,3,6,3,1,0,0,0,0,0,1,3,9,3,1,1,1,1,3,0,1,9,9,9,1,1,3,3,1,1,4,4,4,4,4,4,4,3,1,1,4,9,9,9,9,9,4,1,0,1,1,4,1,1,4,1,1,0,0,0,1,4,0,0,4,1,0,0,0,0,1,1,0,0,1,1,0,0,0],"4":[0,0,1,1,1,1,0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,1,2,1,1,2,1,0,0,0,1,1,2,2,2,2,1,1,0,0,3,1,9,9,9,9,1,3,0,0,3,1,2,2,2,2,1,3,0,0,1,1,1,4,4,1,1,1,0,0,0,1,0,1,1,0,1,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],"5":[0,0,0,1,1,1,0,0,0,0,0,0,1,6,6,6,1,0,0,0,0,0,1,6,2,6,1,0,0,0,0,1,1,6,6,6,1,1,0,0,1,3,1,9,9,9,1,3,1,0,1,1,1,6,6,6,1,1,1,0,0,0,1,6,6,6,1,0,0,0,0,0,1,6,6,6,1,0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],"6":[0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,1,3,1,1,0,0,0,1,1,1,4,1,1,0,1,0,1,4,4,4,4,1,0,0,1,1,3,1,4,1,1,4,1,0,1,1,1,1,4,1,0,1,4,1,0,0,0,1,4,1,0,0,1,0,0,0,1,9,9,9,9,1,0,0,0,1,3,1,1,1,1,3,1,0,0,1,1,1,0,0,1,1,1,0,0],"7":[0,0,1,1,1,1,0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,1,2,2,2,2,1,0,0,0,1,1,9,9,9,9,1,0,1,0,1,2,1,9,9,1,3,3,3,1,1,1,0,9,9,1,0,4,0,0,0,0,1,1,1,1,0,4,0,0,0,0,1,0,0,1,0,4,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],"8":[0,0,1,1,1,1,0,0,0,0,0,1,9,9,9,9,1,0,0,0,0,1,2,2,2,2,1,0,0,0,1,1,9,9,9,9,1,1,0,0,0,1,1,9,9,1,1,0,7,0,0,1,1,1,1,1,1,0,1,7,0,0,1,1,1,1,0,0,0,1,0,0,1,0,0,1,0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"9":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,9,9,9,9,1,0,0,0,0,6,1,9,9,1,6,6,0,0,6,6,6,1,1,5,5,6,6,0,6,6,6,6,6,5,5,1,6,0,6,6,6,6,6,6,6,6,3,3,0,6,6,0,6,6,0,6,0,0,0,6,5,0,6,5,0,6,6,0,0,0,0,0,0,0,0,0,0,0],"10":[0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,1,0,0,0,0,0,0,0,9,9,3,1,0,0,0,0,0,0,9,0,1,0,0,0,0,0,0,4,4,4,0,0,4,4,0,4,4,4,4,4,4,4,4,1,4,0,4,4,4,4,4,4,0,0,0,0,4,0,4,0,0,4,0,0,0,0,4,0,4,0,0,4,0,0,0,0,1,0,1,0,0,1,0,0,0],"11":[0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,9,9,1,0,0,0,0,0,0,1,1,1,1,0,0,0,1,1,1,1,1,1,1,1,0,1,4,4,4,4,4,4,4,1,0,1,4,5,4,4,4,5,4,1,0,1,4,4,4,4,4,4,4,1,0,0,1,1,1,1,1,1,1,1,0,0,0,1,1,0,0,1,1,0,0,0,0,1,1,0,0,1,1,0,0],"12":[0,0,0,1,1,1,1,0,0,0,0,1,3,3,4,3,3,1,0,0,1,3,4,3,3,4,3,3,1,0,0,1,1,4,3,3,1,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,9,9,9,9,1,0,0,0,0,1,9,2,2,9,1,0,0,0,0,0,1,1,1,1,0,0,0],"13":[0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,1,9,1,1,0,0,1,1,9,1,0,1,9,9,1,1,9,9,1,0,0,1,4,9,9,9,9,4,1,0,0,0,1,4,9,9,4,1,0,0,0,0,0,1,4,4,1,0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0,0,1,0,0,0,0],"14":[0,0,0,1,1,1,1,0,0,0,0,1,9,9,9,9,9,1,0,0,1,9,9,9,9,9,9,9,1,0,1,1,9,1,9,9,1,9,1,0,0,1,0,1,0,0,1,0,1,0,0,0,1,0,1,1,0,1,0,0,0,0,0,1,2,2,1,0,0,0,0,0,0,1,6,6,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0],"15":[0,0,0,1,1,1,1,0,0,0,0,1,9,9,7,9,9,1,0,0,1,9,9,9,7,9,9,9,1,0,1,9,9,9,7,9,9,9,1,0,1,9,9,9,9,9,9,9,1,0,0,1,9,9,9,9,9,1,0,0,0,0,1,1,9,1,1,0,0,0,0,0,0,1,8,1,0,0,0,0,0,0,1,4,4,4,1,0,0,0,0,0,0,1,1,1,0,0,0,0],"village":[0,0,0,1,1,1,1,0,0,0,0,0,1,4,4,4,4,1,0,0,0,1,4,4,4,4,4,4,1,0,1,1,1,1,1,1,1,1,1,1,0,1,9,9,9,9,9,9,1,0,0,1,9,9,1,1,9,9,1,0,0,1,9,9,1,1,9,9,1,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"startVillage":[0,1,0,1,0,1,0,1,0,0,1,3,1,3,1,3,1,3,1,0,1,3,3,3,3,3,3,3,1,0,1,1,1,1,1,1,1,1,1,0,1,9,9,9,9,9,9,9,1,0,1,9,9,1,1,1,9,9,1,0,1,9,9,1,0,1,9,9,1,0,1,9,9,1,0,1,9,9,1,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],"tunnel":[0,0,1,1,1,1,1,0,0,0,0,1,4,4,4,4,4,1,0,0,1,4,1,9,9,9,1,4,1,0,1,4,1,1,1,1,1,4,1,0,1,4,1,1,1,1,1,4,1,0,1,4,1,1,1,1,1,4,1,0,1,4,1,1,1,1,1,4,1,0,1,4,1,1,1,1,1,4,1,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],"wagen_dp":[0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,9,9,1,0,0,0,0,0,0,1,1,1,1,0,0,0,1,1,1,1,1,1,1,1,0,1,4,4,4,4,4,4,4,1,0,1,4,5,4,1,1,5,4,1,0,1,4,4,4,4,4,4,4,1,0,1,5,5,5,5,5,5,5,1,0,1,4,4,4,4,4,4,4,1,0,0,1,1,1,1,1,1,1,1,0],"wall":[0,0,4,0,0,4,0,0,4,0,0,4,4,4,4,4,4,4,4,0,4,4,5,4,4,5,4,4,5,4,4,9,9,9,9,9,9,9,9,4,4,4,5,4,4,5,4,4,5,4,4,4,4,4,4,4,4,4,4,0,0,4,0,0,4,0,0,4,0,0,4,4,4,4,4,4,4,4,4,4,4,5,4,4,5,4,4,5,4,4,4,4,4,4,4,4,4,4,4,4],"stone":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,5,5,0,0,0,0,0,0,5,5,5,5,5,0,0,0,0,5,5,5,5,5,5,5,0,0,5,5,5,5,5,5,5,5,0,0,5,5,5,5,5,5,5,5,0,0,0,0,0,0,0,0,0,0,0],"tower":[0,0,0,1,0,1,0,1,0,0,0,0,0,1,3,1,3,1,0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,1,9,9,9,1,0,0,0,0,0,1,9,9,9,1,0,0,0,0,1,1,3,3,3,1,1,0,0,0,1,3,3,1,3,3,1,0,0,0,1,3,3,1,3,3,1,0,0,0,1,1,1,1,1,1,1,0],"watchtower":[0,0,1,0,7,7,0,1,0,0,0,0,1,7,7,7,7,1,0,0,0,1,1,1,1,1,1,1,1,0,0,0,1,3,3,3,3,1,0,0,0,1,1,3,7,7,3,1,1,0,0,1,3,3,7,7,3,3,1,0,0,1,3,3,3,3,3,3,1,0,0,1,3,3,3,3,3,3,1,0,0,1,3,3,3,3,3,3,1,0,7,7,7,7,7,7,7,7,7,7],"fallschirm_ld":[0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,6,2,2,6,1,0,0,0,0,1,9,9,9,9,1,0,0,0,1,4,1,9,9,1,0,3,0,0,1,4,1,6,6,1,3,0,0,0,0,1,1,6,6,1,1,0,0,0,0,0,1,6,6,1,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,1,0,0,1,1,0,0]};

const CLASSIC_TERRAIN_COLORS = {
    "grass": {
        "top": "#3b4c37",
        "side": "#212c22"
    },
    "forest": {
        "top": "#263622",
        "side": "#131d14"
    },
    "hill": {
        "top": "#655139",
        "side": "#403122",
        "sideBottom": "#2a1f16"
    },
    "black": {
        "top": "#000",
        "side": "#000"
    }
};

const CLASSIC_VOXEL_MODELS = {
    "stone": {
        "s": 2.4,
        "layers": [
            [
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    5,
                    5,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    5,
                    5,
                    5,
                    12,
                    0,
                    0,
                    0
                ]
            ],
            [
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    5,
                    5,
                    12,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    5,
                    5,
                    5,
                    12,
                    12,
                    0,
                    0
                ],
                [
                    0,
                    5,
                    5,
                    5,
                    5,
                    5,
                    12,
                    0,
                    0
                ]
            ],
            [
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    0,
                    5,
                    5,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    5,
                    5,
                    5,
                    5,
                    12,
                    0,
                    0
                ],
                [
                    0,
                    5,
                    5,
                    5,
                    5,
                    5,
                    12,
                    12,
                    0
                ],
                [
                    0,
                    5,
                    5,
                    5,
                    5,
                    5,
                    12,
                    12,
                    0
                ]
            ],
            [
                [
                    0,
                    0,
                    0,
                    0,
                    5,
                    5,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    5,
                    5,
                    5,
                    5,
                    12,
                    0,
                    0
                ],
                [
                    0,
                    5,
                    5,
                    12,
                    5,
                    5,
                    5,
                    12,
                    0
                ],
                [
                    0,
                    5,
                    5,
                    5,
                    5,
                    5,
                    12,
                    12,
                    0
                ],
                [
                    5,
                    5,
                    5,
                    5,
                    5,
                    5,
                    5,
                    12,
                    0
                ]
            ],
            [
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    0,
                    5,
                    5,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    5,
                    5,
                    5,
                    5,
                    12,
                    0,
                    0
                ],
                [
                    0,
                    5,
                    5,
                    5,
                    5,
                    5,
                    12,
                    12,
                    0
                ],
                [
                    0,
                    5,
                    5,
                    5,
                    5,
                    5,
                    12,
                    12,
                    0
                ]
            ],
            [
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    5,
                    5,
                    12,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    5,
                    5,
                    5,
                    12,
                    12,
                    0,
                    0
                ],
                [
                    0,
                    5,
                    5,
                    5,
                    5,
                    5,
                    12,
                    0,
                    0
                ]
            ],
            [
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    0,
                    5,
                    5,
                    0,
                    0,
                    0,
                    0
                ],
                [
                    0,
                    0,
                    5,
                    5,
                    5,
                    12,
                    0,
                    0,
                    0
                ]
            ]
        ]
    }
};

// ============================================================================
// NEW — Redesign in Arbeit (nur ?debug=1 / Editor)
// ============================================================================
const NEW_PAL = {
    1: "#0e0c14",  // X
    2: "#c99361",  // S
    3: "#9fabbc",  // A
    4: "#5e3a20",  // W
    5: "#7d838f",  // R
    6: "#2c303d",  // I
    7: "#c98a10",  // G
    8: "#e2571f",  // F
    10: "#3a2515",  // w
    11: "#a99872",  // L
    12: "#565f70",  // a
    13: "#131019",  // D
    14: "#8f6435",  // r
    15: "#333a4d",  // s
    16: "#8a2c0e",  // f
    17: "#293d1f",  // V
    18: "#cabe98",  // H
    20: "#d2c6c6",  // B
    21: "#000000",  // C
    22: "#eeebe8",  // E
};

const NEW_PIXEL_SPRITES = {
    // Schwertkämpfer
    0: SP(`
        ..........
        ...XXX....
        ..XHHHX.P.
        XXXSSSX.P.
        XBXpppX.P.
        XBXPPPXXX.
        XBXHHHX.G.
        .XXXXX....
        ...X.X....
        ..XX.XX...`),
    // Bogenschütze
    1: SP(`
        ...XX.....
        ..XppX....
        .XPPPPXr..
        .XDSSDXBr.
        ..XIIX.Br.
        ..XIIXXWWP
        ..XGGX.Br.
        ..XXXX.Br.
        ..X..X.r..
        .ww..ww...`),
    // Pferd
    2: SP(`
        ..........
        ...XX.....
        ..XAAX....
        ..XSSX....
        ..XPPSX...
        ..XppXBWGG
        .GWHpHWBWW
        .GWWXWWWB.
        .G.W..W.W.
        ...W..W.W.`),
    // Ritter — Design mit Kamelreiter (10) getauscht
    3: SP(`
        ..........
        ...XX.P...
        ..XAAXP...
        ..XSSXP...
        ..XAAACEr.
        ..XrrEpEEE
        .EpEEppPP.
        .Epppppp..
        .E.E..E...
        ...B..B...`),
    // Berserker
    4: SP(`
        ..........
        ...XXXX...
        ..XwSSwX..
        A.XSDDSX.A
        AXXSSSSXXA
        WXpPPPPpXW
        ..XpwwpX..
        ..XXXXXX..
        ...X..X...
        ..XX..XX..`),
    // Assassine
    5: SP(`
        ...XXX....
        ..XIIIX...
        ..XLDLX...
        .XXIIIXX..
        XAXPPpXAX.
        XXXIIIXXP.
        P.XIIIX..P
        P.XIXIX...
        ..XX.XX...
        ..........`),
    // Tribok
    6: SP(`
        ..........
        ......XX..
        ..XXXXB.X.
        .XWWWWX..X
        XBXWXXWX.X
        XXXWX.XWX.
        ..XWpX.X..
        .XPPPPX...
        XAXXXXAX..
        XXX..XXX..`),
    // Arbeiter
    7: SP(`
        ..XXXX....
        .XwwwwX...
        .XSSSSX.A.
        .XPPPPXAAA
        XSXPPXXSw.
        .XXppX..w.
        ..XXXX..w.
        ..X..X....
        .XX..XX...
        ..........`),
    // Saboteur
    8: SP(`
        ..XXXX....
        .XFFFFX...
        .XDSSDX...
        XXPPPPXXX.
        XXpPPpX.F.
        .XXppXX.pp
        ..XXXX..pp
        ..X..X....
        .XX..XX...
        ..........`),
    // Elefant
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
    // Kamelreiter — Design mit Ritter (3) getauscht
    10: SP(`
        ..XX......
        .XAAX.....
        .XSSXX....
        .XPPPBX...
        .rpprX.rr.
        rrrprrrrXr
        .rrXrrr...
        .r.r..r...
        .r.r..r...
        .X.X..X...`),
    // Wagenburg
    11: SP(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWaWWWWaWX
        XWWWWWWWWX
        .XXPPPPXX.
        .XaaXXaaX.
        ..XX..XX..`),
    // Luftschraube
    12: SP(`
        ..XXXXXX..
        .XEWEEWEX.
        XEWBEWBWEX
        XXXXWEXXXX
        ....XX....
        ...XXXX...
        ..XpPPpX..
        .XpPPPPpX.
        .XpPHHPpX.
        .XXXXXXXX.`),
    // Gleiter
    13: SP(`
        .X......X.
        XpXX..XXpX
        XWppXXppWX
        .XWPppPWX.
        ..XWPPWX..
        ..XXWWX...
        ...XXpX...
        .....X....
        ..........
        ..........`),
    // Fallschirmspringer
    14: SP(`
        ...XXXX...
        ..XppppX..
        .XpPPPPpX.
        XpPXPPXPpX
        .XXXXXXXX.
        ...XSSX...
        ...XssX...
        ....XX....
        ....XX....
        ..........`),
    // Bombenballon
    15: SP(`
        ..XXXXX...
        .XPPGPpX..
        XPPPGPPpX.
        XPPPGPPpX.
        XPPPPPPpX.
        .XPPPPpX..
        ..XXPXX...
        ...XFX....
        ..XWwWX...
        ...XXX....`),
    // Wagenburg (verschanzt)
    "wagen_dp": SP(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWaXXXXaWX
        XppppppppX
        XWWWWWWWWX
        .XaaXXaaX.
        ..XX..XX..`),
    // Fallschirm (gelandet)
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
    // Dorf
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
    // Startdorf
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
    // Tunnel
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
    // Mauer
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
    // Steinhaufen
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
    // Wachturm
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
    // Zentralturm
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
        GGGGGGGGGG`),
};

const NEW_VOXEL_MODELS = {
    "0": { s: 2.3, layers: [
        L(`
        ...XXX...
        ..XAAAX..
        ..XAAAX..
        .XAIIIAX.
        .XAIIIAX.
        .XAIIIAX.
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XwXwX..
        ..XwXwX..
        ..XX.XX..`),
        L(`
        ...XXX...
        ..XAAAX..
        ..XAAAX..
        .XAPPPAX.
        .XAPPpAX.
        .XAPPpAX.
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XwXwX..
        ..XwXwX..
        ..XX.XX..`),
        L(`
        ...XXX...
        ..XADAX..
        ..XAAAX..
        RXAPPPAXA
        RXAPPpAXA
        RXAPPpAXG
        .XIIIIIXw
        ..XIXIX..
        ..XIXIX..
        ..XwXwX..
        ..XwXwX..
        ..XX.XX..`)
    ] },
    "1": { s: 2.3, layers: [
        L(`
        ...XXX...
        ..XPPPX..
        .XPDSDPX.
        .XIIIIIX.
        .XIPPpIX.
        .XIPPpIX.
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XwXwX..
        ..XwXwX..
        ..XX.XX..`),
        L(`
        ...XXX...
        ..XPPPX..
        .XPDSDPX.
        .XIIIIIX.
        .XIPPpIX.
        .XIPPpIX.
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XwXwX..
        ..XwXwX..
        ..XX.XX..`),
        L(`
        ...XXX...
        ..XPPPX.r
        .XPDSDPXr
        .XIIIIIXA
        .XIPPpIXr
        .XIPPpIXr
        .XIIIIIXr
        ..XIXIX..
        ..XIXIX..
        ..XwXwX..
        ..XwXwX..
        ..XX.XX..`)
    ] },
    "2": { s: 2.6, layers: [
        L(`
        ....XXX...
        ...XwwwX..
        ...XwwwX..
        ....XwX...
        ...XwwXw..
        .XwwwwwwwX
        XwwwwwwwwX
        XwwwwwwwwX
        .XXX..XXX.
        .XX....XX.`),
        L(`
        ....XXX...
        ...XwwwX..
        ...XwwwX..
        ....XwX...
        ...XwwXw..
        .XwwwwwwwX
        XwwwwwwwwX
        XwwwwwwwwX
        .XXX..XXX.
        .XX....XX.`),
        L(`
        ....XXX...
        ...XwwwX..
        ...XwwwX..
        ....XwX...
        ...XPpXw..
        .XwwwwwwwX
        XwwwwwwwwX
        XwwwwwwwwX
        .XXX..XXX.
        .XX....XX.`)
    ] },
    "3": { s: 2.6, layers: [
        L(`
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
        .XX....XX.`),
        L(`
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
        .XX....XX.`),
        L(`
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
        .XX....XX.`)
    ] },
    "4": { s: 2.3, layers: [
        L(`
        .........
        .........
        .........
        ..XwwwwX.
        ..XSSSSX.
        .XSSSSSX.
        .XSPPPSX.
        .XSSSSSX.
        ..XwwwX..
        ..XSXSX..
        ..XSXSX..
        ..XSXSX..
        ..XSXSX..
        ..XX.XX..`),
        L(`
        .........
        .........
        .........
        ..XwwwwX.
        ..XSSSSX.
        .XSSSSSX.
        .XSPPPSX.
        .XSSSSSX.
        ..XwwwX..
        ..XSXSX..
        ..XSXSX..
        ..XSXSX..
        ..XSXSX..
        ..XX.XX..`),
        L(`
        A.......A
        AA.....AA
        .w.....w.
        ..XwSSwX.
        ..XSDDSX.
        .XSSSSSX.
        .XrPPPrX.
        .XSSSSSX.
        ..XwwwX..
        ..XSXSX..
        ..XSXSX..
        ..XSXSX..
        ..XSXSX..
        ..XX.XX..`)
    ] },
    "5": { s: 2.3, layers: [
        L(`
        ...XXX...
        ..XIIIX..
        .XIDDDIX.
        .XIIIIIX.
        .XIPPpIX.
        .XIIIIIX.
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XX.XX..`),
        L(`
        ...XXX...
        ..XIIIX..
        .XIDDDIX.
        .XIIIIIX.
        .XIPPpIX.
        .XIIIIIX.
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XX.XX..`),
        L(`
        ...XXX...
        ..XIIIX..
        .XIFDFIX.
        .XIIIIIX.
        aXIPPpIXa
        aXIIIIIXa
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XX.XX..`)
    ] },
    "6": { s: 2.5, layers: [
        L(`
        ....RR....
        ....RR....
        ....ww....
        ....ww....
        ..WWWWWW..
        .W......W.
        .W......W.
        .W......W.
        WWWWWWWWWW
        W.W....W.W`),
        L(`
        ....RR....
        ....RR....
        ....ww....
        ....ww....
        ..WWWWWW..
        .W......W.
        .W......W.
        .W......W.
        WWWWWWWWWW
        W.W....W.W`),
        L(`
        ....RR....
        ....RR....
        ....ww....
        ....ww....
        ..WWWWWW..
        .WIssssIW.
        .WIssssIW.
        .W......W.
        WWWWWWWWWW
        W.W....W.W`)
    ] },
    "8": { s: 2.3, layers: [
        L(`
        ...XXX...
        ..XPPPX..
        .XPDSDPX.
        .XIIIIIX.
        .XIPPpIX.
        .XIIIIIX.
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XX.XX..`),
        L(`
        ...XXX...
        ..XPPPX..
        .XPDSDPX.
        .XIIIIIX.
        .XIPPpIX.
        .XIIIIIX.
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XX.XX..`),
        L(`
        ...XXX...
        ..XPPPX..
        .XPDSDPX.
        .XIIIIIXF
        .XIPPpIXI
        .XIIIIIXI
        .XIIIIIX.
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XIXIX..
        ..XX.XX..`)
    ] },
    "10": { s: 2.7, layers: [
        L(`
        ....XXX...
        ...XAAAX..
        ...XAAAX..
        ....XAX...
        ...XAAXA..
        .XAAAAAAAX
        XAAAAAAAAX
        XAAAAAAAAX
        .XXX..XXX.
        .XX....XX.`),
        L(`
        ....XXX...
        ...XAAAX..
        ...XAAAX..
        ....XAX...
        ...XAAXA..
        .XAAAAAAAX
        XAAAAAAAAX
        XAAAAAAAAX
        .XXX..XXX.
        .XX....XX.`),
        L(`
        ....XXX...
        ...XAAAX..
        ...XAAAX..
        ....XAX...
        ...XPpXA..
        .XAAAAAAAX
        XAAAAAAAAX
        XAPPPPpPAX
        .XXX..XXX.
        .XX....XX.`)
    ] },
    "11": { s: 2.5, layers: [
        L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWWWWWWWWX
        XWWWWWWWWX
        .XX....XX.
        .XaaXXaaX.
        ..XX..XX..`),
        L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWWWWWWWWX
        XWWWWWWWWX
        .XX....XX.
        .XaaXXaaX.
        ..XX..XX..`),
        L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWaWWWWaWX
        XWWWWWWWWX
        .XX....XX.
        .XaaXXaaX.
        ..XX..XX..`)
    ] },
    "12": { s: 2.4, layers: [
        L(`
        ..........
        ..........
        ..........
        ....XX....
        ....XX....
        ...XXXX...
        ..XIIIIX..
        ..XIIIIX..
        ...XXXX...
        ....XX....`),
        L(`
        ..XXXXXX..
        .XrrrrrrX.
        ..XXXXXX..
        ....XX....
        ....XX....
        ...XXXX...
        ..XPPPpX..
        ..XPSSpX..
        ...XXXX...
        ....XX....`)
    ] },
    "13": { s: 2.4, layers: [
        L(`
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
        L(`
        ..XXXXXX..
        .XPPLLPPX.
        ..XPLLPX..
        ...XrrX...
        ....XX....
        ...XSSX...
        ...XIIX...
        ...X..X...
        ..........
        ..........`)
    ] },
    "village": { s: 2.6, layers: [
        L(`
        ....p....
        ...pPp...
        ..pPPPp..
        ppPPPPPpp
        .LWLLLWL.
        .LLLLLLL.
        .LWLLLWL.`),
        L(`
        ....P....
        ...PPP...
        ..PPPPP..
        PPPPPPPPP
        .LLLLLLL.
        .LLLLLLL.
        .LLLLLLL.`),
        L(`
        ....P....
        ...PPP...
        ..PPPPP..
        PPPPPPPPP
        .LLLLLLL.
        .LLLLLLL.
        .LLLLLLL.`),
        L(`
        ....P....
        ...PPP...
        ..PPPPP..
        PPPPPPPPP
        .LLLLLLL.
        .LLLLLLL.
        .LLLLLLL.`),
        L(`
        ....P....
        ...PPP...
        ..PPPPP..
        PPPPPPPPP
        .LLLLLLL.
        .LLLLLLL.
        .LLLLLLL.`),
        L(`
        ....P....
        ...PPP...
        ..PPPPP..
        PPPPPPPPP
        .LLLLLLL.
        .LLLLLLL.
        .LLLLLLL.`),
        L(`
        ....p....
        ...pPp...
        ..pPPPp..
        ppPPPPPpp
        .LWLLLWL.
        .LWLwwWL.
        .LWLwwWL.`)
    ] },
    "startVillage": { s: 2.6, layers: [
        L(`
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
        aaaaaaaaaaa`),
        L(`
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
        aaaaaaaaaaa`),
        L(`
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
        aaaaaaaaaaa`),
        L(`
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
        aaaaaaaaaaa`),
        L(`
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
        aaaaaaaaaaa`),
        L(`
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
        aaaaaaaaaaa`),
        L(`
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
        aaaaDDDaaaa`)
    ] },
    "tower": { s: 2.5, layers: [
        L(`
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
        .RaaaR.`),
        L(`
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
        .RaaaR.`),
        L(`
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
        .RaaaR.`),
        L(`
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
        .RaaaR.`),
        L(`
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
        .RaaaR.`),
        L(`
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
        .RaaaR.`)
    ] },
    "watchtower": { s: 2.6, layers: [
        L(`
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
        .RaaaaaR.`),
        L(`
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
        .RaaaaaR.`),
        L(`
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
        .RaaaaaR.`),
        L(`
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
        .RaaaaaR.`),
        L(`
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
        .RaaaaaR.`),
        L(`
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
        .RaaaaaR.`),
        L(`
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
        .RaaaaaR.`)
    ] },
    "wall": { s: 2.5, layers: [
        L(`
        a.a.a.a.a.a.a.a
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaRaaaaaaaaaRaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa`),
        L(`
        a.a.a.a.a.a.a.a
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaRaaaaaaaaaRaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa`),
        L(`
        a.a.a.a.a.a.a.a
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaPPPaaaaaa
        aaRaaaPPPaaaRaa
        aaaaaaaPaaaaaaa
        aaaaaaaaaaaaaaa
        aaaaaaaaaaaaaaa`)
    ] },
    "tunnel": { s: 2.6, layers: [
        L(`
        ...VVV...
        ..Vwwww..
        .wwwwwww.
        .wwwwwww.
        wwWwwwWww
        wwwwwwwww`),
        L(`
        ...VVV...
        ..wwwww..
        .wwwwwww.
        .wwWwWww.
        wwwwwwwww
        wWwwwwwWw`),
        L(`
        ...VVV...
        ..wwwww..
        .wwwwwww.
        .wwWwWww.
        wwwwwwwww
        wWwwwwwWw`),
        L(`
        ...VVV...
        ..wwwww..
        .wwwwwww.
        .wwWwWww.
        wwwwwwwww
        wWwwwwwWw`),
        L(`
        ...VVV...
        ..wwwww..
        .wwwwwww.
        .wwWwWww.
        wwwwwwwww
        wWwwwwwWw`),
        L(`
        ...VVV...
        ..wwwww..
        .wwwwwww.
        .wwWwWww.
        wwwwwwwww
        wWwwwwwWw`),
        L(`
        ...VVV...
        ..wwwww..
        .wwrPrww.
        .wwrDrww.
        wwwrDrwww
        wWwrDrwWw`)
    ] },
    "stone": { s: 2.4, layers: [
        L(`
        .........
        .........
        .........
        ...RR....
        ..RRRa...`),
        L(`
        .........
        .........
        ...RRa...
        ..RRRaa..
        .RRRRRa..`),
        L(`
        .........
        ....RR...
        ..RRRRa..
        .RRRRRaa.
        .RRRRRaa.`),
        L(`
        ....RR...
        ..RRRRa..
        .RRaRRRa.
        .RRRRRaa.
        RRRRRRRa.`),
        L(`
        .........
        ....RR...
        ..RRRRa..
        .RRRRRaa.
        .RRRRRaa.`),
        L(`
        .........
        .........
        ...RRa...
        ..RRRaa..
        .RRRRRa..`),
        L(`
        .........
        .........
        .........
        ...RR....
        ..RRRa...`)
    ] },
    "wagen_dp": { s: 2.5, layers: [
        L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWWWXXWWWX
        XaaaaaaaaX
        XWWWWWWWWX
        .XaaXXaaX.
        ..XX..XX..`),
        L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWWWXXWWWX
        XaaaaaaaaX
        XWWWWWWWWX
        .XaaXXaaX.
        ..XX..XX..`),
        L(`
        ....XXXX..
        ....XPpX..
        ..XLLLLXX.
        .XLLLLLLXX
        XWWWWWWWWX
        XWaWXXaWWX
        XaaaaaaaaX
        XWWWWWWWWX
        .XaaXXaaX.
        ..XX..XX..`)
    ] },
};

// Gebäude-Voxelmodelle und Einheiten-/Lufteinheiten-Sprites sind auf Wunsch
// bereits live freigegeben — geteilt mit dem Redesign, unabhängig von DEBUG_ART
// (dieselbe Technik wie zuvor schon für die Stein-Resource).
["village", "startVillage", "tower", "watchtower", "wall", "tunnel", "stone"].forEach(k => {
    if (NEW_VOXEL_MODELS[k]) CLASSIC_VOXEL_MODELS[k] = NEW_VOXEL_MODELS[k];
});
[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, "wagen_dp", "fallschirm_ld"].forEach(k => {
    if (NEW_PIXEL_SPRITES[k]) CLASSIC_PIXEL_SPRITES[k] = NEW_PIXEL_SPRITES[k];
});
// Die live freigegebenen Sprites/Modelle sind gegen NEW_PAL entworfen — die
// Palette muss mitziehen, sonst zeigen die neuen Farbindizes (>8) nichts an.
Object.assign(CLASSIC_PAL, NEW_PAL);

const NEW_TERRAIN_COLORS = {
    grass: { top: "#2a3627", side: "#19221a" },
    forest: { top: "#1c2819", side: "#0f1710" },
    hill: { top: "#4e3e2c", side: "#33271b", sideBottom: "#231a12" },
    black: { top: "#000", side: "#000" }
};

// ============================================================================
// Aktiver Datensatz
// ============================================================================
const pal = DEBUG_ART ? NEW_PAL : CLASSIC_PAL;
const pixelSprites = DEBUG_ART ? NEW_PIXEL_SPRITES : CLASSIC_PIXEL_SPRITES;
const terrainColors = DEBUG_ART ? NEW_TERRAIN_COLORS : CLASSIC_TERRAIN_COLORS;
const voxelModels = DEBUG_ART ? NEW_VOXEL_MODELS : CLASSIC_VOXEL_MODELS;

const playerColors = ["#00e5ff","#ff1744","#00e676","#ffea00","#d500f9","#ff9100"];
