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
    2: { fac: 1, t: 1, name: "Kopfgeld", desc: "+2 Gold für jeden Kill.", g: 0, m: 7 },
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
    1: { dmg: 5, range: 2, move: 1, name: "Bogen", cost: 4, maxHp: 10, isMelee: false, light: true },
    2: { dmg: 5, range: 1, move: 2, name: "Pferd", cost: 4, maxHp: 10, isMelee: true, light: true },
    3: { dmg: 6, range: 1, move: 2, name: "Ritter", cost: 6, maxHp: 15, isMelee: true, light: true },
    4: { dmg: 6, range: 1, move: 2, name: "Berserker", cost: 4, maxHp: 10, isMelee: true, light: true },
    5: { dmg: 6, range: 1, move: 3, name: "Assassine", cost: 4, maxHp: 8, isMelee: true, light: true },
    6: { dmg: 6, range: 3, move: 1, name: "Tribok", cost: 7, maxHp: 10, isMelee: false, light: true },
    7: { dmg: 2, range: 1, move: 1, name: "Arbeiter", cost: 2, maxHp: 10, isMelee: true, light: true },
    8: { dmg: 0, range: 0, move: 2, name: "Saboteur", cost: 6, maxHp: 8, isMelee: false, light: true },
    9: { dmg: 7, range: 1, move: 1, name: "Elefant", cost: 9, maxHp: 22, isMelee: true, heavy: true },
    10: { dmg: 6, range: 2, move: 2, name: "Kamelreiter", cost: 6, maxHp: 12, isMelee: false, light: true },
    11: { dmg: 6, range: 1, move: 2, name: "Wagenburg", cost: 7, maxHp: 18, isMelee: true, heavy: true },
    // Lufteinheiten (isAir): fliegen über der Bodenebene, hitsAir/hitsGround steuern die Ziel-Matrix.
    // Fallschirmspringer (14): fliegend nur Luft-Ziele; nach Absprung (u.ld=1) Bodeneinheit mit move 2.
    // Bombenballon (15): greift nie Luft an; Normalangriff = Anzünden (4 sofort + 4 beim nächsten
    // eigenen Zug des Ziel-Besitzers), Feuersturm (fsCost Holz) = AoE, 3 sofort + 3 Folgeschaden
    // pro getroffenem Ziel, gleiches bn/bo-Brand-Tag-System wie Anzünden (siehe doEndTurn).
    12: { dmg: 5, range: 1, move: 2, name: "Luftschraube", cost: 7, maxHp: 14, isMelee: true, isAir: true, hitsAir: true, hitsGround: true },
    13: { dmg: 5, range: 1, move: 4, name: "Gleiter", cost: 6, maxHp: 10, isMelee: true, isAir: true, hitsAir: true, hitsGround: true },
    14: { dmg: 4, range: 2, move: 2, name: "Fallschirmspringer", cost: 4, maxHp: 10, isMelee: false, isAir: true, hitsAir: true, hitsGround: false, ldMove: 2 },
    15: { dmg: 4, range: 1, move: 2, name: "Bombenballon", cost: 9, maxHp: 14, isMelee: false, isAir: true, hitsAir: false, hitsGround: true, igniteDmg: 4, fsCost: 5, fsDmg: 3 },
    // Unterwelt (Phase 3): eigene Ebene unter der Karte, siehe Unterwelt/PLAN.md.
    // Kein Fraktions-Lock für 17-18 (jeder Spieler kann sie bauen); 19-22 sind
    // Fraktions-Spezialeinheiten (Zuordnung wie oben über die faktionUnitMap-Stellen
    // in input.js, nicht hier — unitStats selbst kennt keine Fraktionsbindung, exakt
    // wie bei den Boden-/Lufteinheiten). "RW 1" heißt hier durchgehend Nahkampf.
    // KEIN eigener Tunnelgräber-Typ (Korrektur Juli 2026, Jonathan: "es soll einfach
    // nur der Arbeiter sein"): die Brücke zwischen den Ebenen ist der ganz normale
    // Arbeiter (7, oben) — steht er an seinem eigenen Tunnel-Startpunkt, kann er
    // abtauchen (uwDescend) und behält dabei Typ 7 sowie seine Oberflächen-Werte
    // auch unten (kein separater Unterwelt-Stat-Block, keine zweite Rekrutierungs-
    // option). Graben/Abbau-Fähigkeiten unten sind daher an Typ 7 gebunden
    // (calculateDigsUW/calculateMineTargetsUW, js/logic.js), nicht mehr an 16.
    17: { dmg: 4, range: 1, move: 2, name: "Grubenwache", cost: 5, maxHp: 14, isMelee: true, light: true, isUW: true },
    18: { dmg: 3, range: 1, move: 2, name: "Sprengmeister", cost: 6, maxHp: 8, isMelee: true, light: true, isUW: true },
    // Grubenritter (19, Feudalismus): +fb-Bonus wie Ritter/Kamelreiter oben (getUnitMaxHp).
    19: { dmg: 5, range: 1, move: 2, name: "Grubenritter", cost: 7, maxHp: 16, isMelee: true, light: true, isUW: true },
    // Beutegräber (20, Plünderer): +1 DMG via Plünderer-Passiv (wie alle Nahkämpfer,
    // hier schon in dmg eingepreist — getExpectedDamageUW addiert es zusätzlich analog
    // zu getExpectedDamage, NICHT doppelt: dmg hier ist der Basiswert ohne Passiv).
    20: { dmg: 4, range: 1, move: 3, name: "Beutegräber", cost: 5, maxHp: 10, isMelee: true, light: true, isUW: true },
    21: { dmg: 3, range: 1, move: 2, name: "Horcher", cost: 4, maxHp: 8, isMelee: true, light: true, isUW: true },
    // Bohrwagen (22, Gilden): digMove = Grab-Aktionen pro Zug (2 statt 1, siehe
    // digUWHex/executeUWDig — a=2 als Zwischenzustand wie beim Bewegen+Angreifen-Muster).
    22: { dmg: 4, range: 1, move: 1, name: "Bohrwagen", cost: 9, maxHp: 14, isMelee: true, light: true, isUW: true, digMove: 2 }
};

// Fraktions-Zuordnung der Unterwelt-Spezialeinheiten (Typ-IDs 19-22) — gleiches
// Muster wie die faktionUnitMap-Stellen in input.js (Rekrutierungsmenüs), hier
// zentral für Rekrutierung UND Debug-Spawner.
const uwFactionUnitMap = { 0: 19, 1: 20, 2: 21, 3: 22 };

// === RELIQUIEN (M10, PLAN.md Abschn. 7) ===
// Fundstücke alter Handwerkskunst (nicht sakral!) — kaufbar für Kristalle im
// Dorf-Menü, eine ausgerüstete Reliquie pro Einheit (u[].art / uw.u[].art).
// "map" wirkt sofort beim Kauf und landet nie in p[].rel (siehe applyMapRelic).
const RELICS = {
    blade: { name: "Damaszener Klinge", icon: "🗡️", cost: 4, desc: "Eine Einheit erhält permanent +5 DMG.", target: "unit" },
    armor: { name: "Harnisch des Bergvolks", icon: "🛡️", cost: 4, desc: "Eine Einheit erhält permanent +10 Max-HP (heilt beim Ausrüsten mit).", target: "unit" },
    tool: { name: "Meisterwerkzeug", icon: "🔧", cost: 3, desc: "Ein Bauwerk (Mauer/Turm/Tunnel/Startdorf) sofort auf volle HP.", target: "building" },
    map: { name: "Karte der Tiefe", icon: "🗺️", cost: 5, desc: "Deckt dauerhaft die gesamte Karte auf (Oberfläche + Unterwelt).", target: "instant" }
};

// === UNTERWELT-KREATUREN (M11, PLAN.md Abschn. 5) ===
// Eigener Nummernkreis (100+), bewusst NICHT 0-3 — würde sonst mit den
// Oberflächen-Einheiten-Typ-IDs 0-3 (Schwert/Bogen/Pferd/Ritter) kollidieren,
// falls eine Kreatur je versehentlich durch surface-seitigen Code (unitStats[t])
// gejagt würde. Kreaturen gehören keinem Spieler (uw.c[] = {t, x, y, h}, kein p/a).
// Reichweite ist für alle fix 1 (reiner Nahkampf), daher kein range-Feld nötig.
const UWC_SPINNE = 100, UWC_WUEHLER = 101, UWC_STEINPANZER = 102, UWC_WURM = 103;
const uwCreatureStats = {
    [UWC_SPINNE]: { name: "Höhlenspinne", hp: 6, dmg: 3, sprite: 'uw_spinne' },
    [UWC_WUEHLER]: { name: "Blindwühler", hp: 12, dmg: 5, sprite: 'uw_wuehler' },
    [UWC_STEINPANZER]: { name: "Steinpanzer", hp: 28, dmg: 2, sprite: 'uw_steinpanzer' },
    // Der Alte Wurm: AoE (trifft ALLE Angreifer in RW 1) + unbedingter Konter,
    // siehe processUWCreatureTurn/resolveUWAttackOnCreature (js/logic.js).
    [UWC_WURM]: { name: "Der Alte Wurm", hp: 30, dmg: 8, sprite: 'uw_wurm' }
};
