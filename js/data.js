// === PALETTE & SPRITE CONSTANTS ===
const pal = { 1: "#111", 2: "#ffccaa", 3: "#cfd8dc", 4: "#795548", 5: "#9e9e9e", 6: "#424242", 7: "#ffb300", 8: "#ff6e40" };
const P = 9;

const pixelSprites = {
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
    // === LUFTEINHEITEN (Da-Vinci-Stil) ===
    // 12 Luftschraube: spiralförmiges Segeldach über Gondel
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
    // 13 Gleiter: gepfeilte Flügel mit Spielerfarben-Segel, hängender Pilot
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
    // 14 Fallschirmspringer (fliegend): Schirmkuppel, Seile, hängende Figur
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
    // 14 gelandet: Figur mit Schleuder, gepacktes Schirmbündel auf dem Rücken
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
    // 15 Bombenballon: runde Hülle mit Gold-Naht, Glut, Korb
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

// === PLAYER COLORS ===
const playerColors = ["#00e5ff", "#ff1744", "#00e676", "#ffea00", "#d500f9", "#ff9100"];
const getEntityColor = (id) => id === -1 ? "#888888" : playerColors[id];

// === FACTIONS ===
const factions = {
    0: { name: "🏰 Feudalismus", desc: "Passive: Neu rekrutierte Einheiten erhalten +1 Max-HP pro 2 Dörfer, die du beim Rekrutieren besitzt.\nSpezial: 🛡️ Ritter, 🏹 Kamelreiter & 🚁 Luftschraube", cost: 10, reqV: 2 },
    1: { name: "🩸 Plünderer", desc: "Passive: +1 DMG für Nahkämpfer.\nSpezial: 🪓 Berserker, 💥 Saboteur & 🛩️ Gleiter", cost: 10, reqV: 2 },
    2: { name: "👁️ Spionage", desc: "Passive: +1 Sichtweite.\nSpezial: 🗡️ Assassine, 🐘 Elefant & 🪂 Fallschirmspringer", cost: 10, reqV: 2 },
    3: { name: "⚖️ Gilden", desc: "Passive: +1 Gold pro Dorf.\nSpezial: 🏗️ Tribok, 🚚 Wagenburg & 🎈 Bombenballon", cost: 10, reqV: 2 }
};

// === UPGRADES ===
const upgrades = {
    0: { fac: 0, t: 1, name: "Plattenpanzer", desc: "Basis-Schwerter erhalten +5 Max HP.", g: 0, m: 7 },
    1: { fac: 0, t: 2, name: "Waffenmeister", desc: "Neu rekrutierte Einheiten starten bereits als Veteran (+1 DMG).", g: 0, m: 7 },
    2: { fac: 1, t: 1, name: "Kopfgeld", desc: "+3 Gold für jeden Kill.", g: 0, m: 7 },
    3: { fac: 1, t: 2, name: "Brandschatzer", desc: "Berserker machen +3 DMG gegen Hauptgebäude.", g: 0, m: 7 },
    4: { fac: 2, t: 1, name: "Spähbogen", desc: "Bogenschützen erhalten +1 Reichweite und +1 Schaden.", g: 0, m: 7 },
    5: { fac: 2, t: 2, name: "Schattenläufer", desc: "Assassinen erhalten +1 Bewegung und +1 Schaden.", g: 0, m: 7 },
    6: { fac: 3, t: 1, name: "Söldner-Verträge", desc: "Schwert, Bogen & Pferd kosten -1 Gold.", g: 0, m: 7 },
    7: { fac: 3, t: 2, name: "Pech & Schwefel", desc: "Triboke machen zusätzlich 20% der Max-HP des Ziels als Schaden (mind. 1).", g: 0, m: 7 },
    8: { fac: 0, t: 3, name: "Doppelschuss", desc: "Parthershot (Kamelreiter) kostet 0 Holz.", g: 0, m: 7 },
    9: { fac: 1, t: 3, name: "Instabiler Kern", desc: "Saboteur Explosionsschaden +2 (insg. 10 DMG).", g: 0, m: 7 },
    10: { fac: 2, t: 3, name: "Belagerungsbestie", desc: "Elefant macht +5 DMG gegen Gebäude & Tunnel.", g: 0, m: 7 },
    11: { fac: 3, t: 3, name: "Verstärkte Beschläge", desc: "Wagenburg: dauerhaft +4 Max HP. Bei Nahkampfangriff erleidet der Angreifer 2 DMG Rückschlag.", g: 0, m: 7 }
};

// === UNIT STATS ===
const unitStats = {
    0: { dmg: 5, range: 1, move: 1, name: "Schwert", cost: 3, maxHp: 10, isMelee: true },
    1: { dmg: 4, range: 2, move: 1, name: "Bogen", cost: 4, maxHp: 10, isMelee: false },
    2: { dmg: 5, range: 1, move: 2, name: "Pferd", cost: 4, maxHp: 10, isMelee: true },
    3: { dmg: 6, range: 1, move: 2, name: "Ritter", cost: 6, maxHp: 15, isMelee: true },
    4: { dmg: 6, range: 1, move: 2, name: "Berserker", cost: 4, maxHp: 8, isMelee: true },
    5: { dmg: 6, range: 1, move: 3, name: "Assassine", cost: 5, maxHp: 8, isMelee: true },
    6: { dmg: 6, range: 3, move: 1, name: "Tribok", cost: 7, maxHp: 8, isMelee: false },
    7: { dmg: 2, range: 1, move: 1, name: "Arbeiter", cost: 2, maxHp: 10, isMelee: true },
    8: { dmg: 0, range: 0, move: 2, name: "Saboteur", cost: 8, maxHp: 8, isMelee: false },
    9: { dmg: 8, range: 1, move: 1, name: "Elefant", cost: 9, maxHp: 30, isMelee: true },
    10: { dmg: 6, range: 2, move: 2, name: "Kamelreiter", cost: 6, maxHp: 12, isMelee: false },
    11: { dmg: 6, range: 1, move: 2, name: "Wagenburg", cost: 7, maxHp: 18, isMelee: true },
    // Lufteinheiten (isAir): fliegen über der Bodenebene, hitsAir/hitsGround steuern die Ziel-Matrix.
    // Fallschirmspringer (14): fliegend nur Luft-Ziele; nach Absprung (u.ld=1) Bodeneinheit mit move 2.
    // Bombenballon (15): greift nie Luft an; Normalangriff = Anzünden (4 sofort + 4 nächster Zug), Feuersturm für 5 Holz.
    12: { dmg: 5, range: 1, move: 2, name: "Luftschraube", cost: 7, maxHp: 14, isMelee: true, isAir: true, hitsAir: true, hitsGround: true },
    13: { dmg: 5, range: 1, move: 4, name: "Gleiter", cost: 6, maxHp: 8, isMelee: true, isAir: true, hitsAir: true, hitsGround: true },
    14: { dmg: 4, range: 2, move: 3, name: "Fallschirmspringer", cost: 4, maxHp: 10, isMelee: false, isAir: true, hitsAir: true, hitsGround: false, ldMove: 2 },
    15: { dmg: 4, range: 1, move: 2, name: "Bombenballon", cost: 9, maxHp: 14, isMelee: false, isAir: true, hitsAir: false, hitsGround: true, igniteDmg: 4, fsCost: 5 }
};
