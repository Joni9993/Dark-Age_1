// === SPIEL-DATEN (Stats, Fraktionen, Upgrades) ===
// Paletten, Sprites & Voxelmodelle liegen in js/art.js (editierbar via editor.html).

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
    4: { fac: 2, t: 1, name: "Spähbogen", desc: "Bogenschützen erhalten +1 Schaden.", g: 0, m: 7 },
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
    0: { dmg: 5, range: 1, move: 1, name: "Schwert", cost: 3, maxHp: 10, isMelee: true, light: true },
    1: { dmg: 4, range: 2, move: 1, name: "Bogen", cost: 4, maxHp: 10, isMelee: false, light: true },
    2: { dmg: 5, range: 1, move: 2, name: "Pferd", cost: 4, maxHp: 10, isMelee: true, light: true },
    3: { dmg: 6, range: 1, move: 2, name: "Ritter", cost: 6, maxHp: 15, isMelee: true, light: true },
    4: { dmg: 6, range: 1, move: 2, name: "Berserker", cost: 4, maxHp: 8, isMelee: true, light: true },
    5: { dmg: 6, range: 1, move: 3, name: "Assassine", cost: 5, maxHp: 8, isMelee: true, light: true },
    6: { dmg: 6, range: 3, move: 1, name: "Tribok", cost: 7, maxHp: 8, isMelee: false, light: true },
    7: { dmg: 2, range: 1, move: 1, name: "Arbeiter", cost: 2, maxHp: 10, isMelee: true, light: true },
    8: { dmg: 0, range: 0, move: 2, name: "Saboteur", cost: 8, maxHp: 8, isMelee: false, light: true },
    9: { dmg: 8, range: 1, move: 1, name: "Elefant", cost: 9, maxHp: 22, isMelee: true, heavy: true },
    10: { dmg: 6, range: 2, move: 2, name: "Kamelreiter", cost: 6, maxHp: 12, isMelee: false, light: true },
    11: { dmg: 6, range: 1, move: 2, name: "Wagenburg", cost: 7, maxHp: 18, isMelee: true, heavy: true },
    // Lufteinheiten (isAir): fliegen über der Bodenebene, hitsAir/hitsGround steuern die Ziel-Matrix.
    // Fallschirmspringer (14): fliegend nur Luft-Ziele; nach Absprung (u.ld=1) Bodeneinheit mit move 2.
    // Bombenballon (15): greift nie Luft an; Normalangriff = Anzünden (4 sofort + 4 beim nächsten
    // eigenen Zug des Ziel-Besitzers), Feuersturm (fsCost Holz) = AoE, 3 sofort + 3 Folgeschaden
    // pro getroffenem Ziel, gleiches bn/bo-Brand-Tag-System wie Anzünden (siehe doEndTurn).
    12: { dmg: 5, range: 1, move: 2, name: "Luftschraube", cost: 7, maxHp: 14, isMelee: true, isAir: true, hitsAir: true, hitsGround: true },
    13: { dmg: 5, range: 1, move: 4, name: "Gleiter", cost: 6, maxHp: 8, isMelee: true, isAir: true, hitsAir: true, hitsGround: true },
    14: { dmg: 4, range: 2, move: 2, name: "Fallschirmspringer", cost: 4, maxHp: 10, isMelee: false, isAir: true, hitsAir: true, hitsGround: false, ldMove: 2 },
    15: { dmg: 4, range: 1, move: 2, name: "Bombenballon", cost: 9, maxHp: 14, isMelee: false, isAir: true, hitsAir: false, hitsGround: true, igniteDmg: 4, fsCost: 5, fsDmg: 3 }
};
