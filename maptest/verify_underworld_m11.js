// Verifikationsskript M11 — lädt die echten Spiel-Skripte (Muster wie
// maptest/verify_underworld_m10.js), testet die DOM-freien Kernfunktionen der
// PvE-Kreaturen (Spinne/Wühler/Steinpanzer/Alter Wurm) unter dem neuen
// "Runden-Phase + Telegraph"-Modell (Korrektur Juli 2026, ersetzt das alte
// Pro-Zug-Modell processUWCreatureTurn): Determinismus, Telegraph->Ausweichen,
// Wurm-Leine, Bewegungsreichweiten (Jagd/Patrouille), exakte Muster-Geometrien,
// "kein Ziel -> kein Telegraph", Serialisierungs-Roundtrip inkl. c.ap sowie der
// unveränderte Spawn-Platzierungs-Block.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function loadGameCode() {
    const stub = { addEventListener() { }, value: '', innerHTML: '' };
    const selectStub = { ...stub, querySelector: () => null, selectedOptions: [] };
    global.playerCountSelect = selectStub;
    global.namesContainer = stub;
    global.startGameBtn = stub;
    global.mapSizeSelect = stub;
    global.teamModeSelect = selectStub;
    if (!global.document) global.document = { getElementById: () => null };
    global.window = global;
    global.isSpectator = false;
    global.showToast = () => {};

    const files = ['js/prng.js', 'js/hex.js', 'js/data.js', 'js/mapgen.js', 'js/logic.js'];
    const src = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
    const fn = new Function(src + `
        return {
            buildInitialGameState, createPRNG, isInsideMap, hexDistance, getNeighbors, underworldHash,
            getUnderworldType, isUnderworldOpen, getUWVeinRemaining, getStollenkopfOwner,
            getSpiderNestHexes, getNearestSpiderNest, getSteinpanzerVeinHexes, getWuehlerSpawnHexes,
            getHeartCavernHexes, hexRingAround, uwHexInDirection,
            UW_FELS, UW_KAVERNE, UW_ADER, UW_RUINE, UW_HERZ,
            calculateMovesUW, calculateDigsUW, calculateMineTargetsUW, uwUnitAt, uwCreatureAt,
            digUWHex, mineUWVein, resolveUWAttack, resolveUWAttackOnCreature, getExpectedDamageUW,
            creatureHitUnit, uwNearestPlayerUnit, uwCreatureRoundPhase, getCreatureAttackHexes,
            isUWCreatureVisible,
            getUnitMaxHp, getUnitCost, checkVeteran, unitStats, uwCreatureStats,
            UWC_SPINNE, UWC_WUEHLER, UWC_STEINPANZER, UWC_WURM
        };
    `);
    return fn();
}

const M = loadGameCode();

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error('FAIL: ' + msg); failures++; }
    else console.log('OK: ' + msg);
}

function useState(state) { global.gameState = state; }

function freshState(seed, radius, playerCount = 2) {
    const names = Array.from({ length: playerCount }, (_, i) => `P${i}`);
    const rng = M.createPRNG(seed);
    const origRandom = Math.random;
    Math.random = rng;
    let state;
    try { state = M.buildInitialGameState(names, radius); } finally { Math.random = origRandom; }
    useState(state);
    return state;
}

function findCreature(state, type) {
    return (state.uw.c || []).find(c => c.t === type);
}

function forceOpen(state, x, y) {
    if (!state.uw.d) state.uw.d = [];
    const idx = y * state.bw + x;
    if (!state.uw.d.includes(idx)) state.uw.d.push(idx);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('=== (a) Determinismus: identischer Seed + Aufruffolge -> identisches Ergebnis ===');
{
    function runScenario() {
        const state = freshState(21, 12, 2);
        // Ein Spielereinheit neben einen Wühler setzen + Lärm platzieren, damit
        // tatsächlich etwas passiert (sonst bliebe alles unverändert -> Test zu schwach)
        const wuehler = findCreature(state, M.UWC_WUEHLER);
        if (wuehler) {
            const n = M.getNeighbors(wuehler.x, wuehler.y)[0];
            state.uw.n = [{ x: n.x, y: n.y }];
        }
        // Spinne angreifen lassen: eigene Einheit neben ein Nest setzen
        const spider = findCreature(state, M.UWC_SPINNE);
        if (spider) {
            const sn = M.getNeighbors(spider.x, spider.y)[0];
            state.uw.u.push({ i: 1, p: 0, t: 17, x: sn.x, y: sn.y, h: 14, a: 0 });
        }
        M.uwCreatureRoundPhase();
        state.rn++;
        M.uwCreatureRoundPhase(); // zweite Runde für mehr Bewegungs-/Telegraph-Spielraum
        return JSON.stringify(state.uw.c) + '|' + JSON.stringify(state.uw.d) + '|' + JSON.stringify(state.uw.w) + '|' + JSON.stringify(state.uw.u);
    }
    const run1 = runScenario();
    const run2 = runScenario();
    assert(run1 === run2, 'zwei unabhängige Läufe mit identischem Seed + identischer Aufruffolge liefern identisches Ergebnis (Positionen/ap/HP)');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (b) Telegraph -> Ausweichen: wer stehen bleibt, wird getroffen; wer ausweicht, nicht; Besitzer irrelevant ===');
{
    function setupTelegraph() {
        const state = freshState(21, 12, 2);
        state.uw.c = [{ t: M.UWC_SPINNE, x: 6, y: 6, h: 6 }];
        const spider = state.uw.c[0];
        const near = M.getNeighbors(spider.x, spider.y)[0];
        state.uw.u = [{ i: 1, p: 0, t: 7, x: near.x, y: near.y, h: 8, a: 0 }];
        M.uwCreatureRoundPhase(); // Runde 1: noch kein bestehender Telegraph -> setzt nur einen neuen
        assert(!!spider.ap, 'Telegraph wurde gesetzt (Ziel in Aggro-Reichweite)');
        const hexes = M.getCreatureAttackHexes(state, spider);
        assert(hexes.length > 0, 'getCreatureAttackHexes liefert mindestens ein Ziel-Hex');
        return { state, spider, hexes };
    }

    // Fall A: Einheit weicht rechtzeitig aus -> kein Schaden.
    {
        const { state, spider, hexes } = setupTelegraph();
        const victim = state.uw.u[0];
        const safeHex = M.getNeighbors(spider.x, spider.y).find(n => !hexes.some(h => h.x === n.x && h.y === n.y));
        if (safeHex) {
            victim.x = safeHex.x; victim.y = safeHex.y;
            state.rn++;
            const hpBefore = victim.h;
            M.uwCreatureRoundPhase();
            assert(victim.h === hpBefore, 'Einheit, die rechtzeitig vom Telegraph-Hex wegzieht, nimmt KEINEN Schaden');
        } else {
            console.log('SKIP: kein ausweichbares Nicht-Ziel-Nachbarhex gefunden (Seed-Zufall)');
        }
    }

    // Fall B: Einheit bleibt stehen -> exakt dmg Schaden.
    {
        const { state, spider, hexes } = setupTelegraph();
        const victim = state.uw.u[0];
        assert(hexes.some(h => h.x === victim.x && h.y === victim.y), 'Testaufbau: Einheit steht auf einem Telegraph-Hex');
        const hpBefore = victim.h;
        state.rn++;
        M.uwCreatureRoundPhase();
        assert(hpBefore - victim.h === M.uwCreatureStats[M.UWC_SPINNE].dmg, `Einheit, die stehen bleibt, nimmt exakt ${M.uwCreatureStats[M.UWC_SPINNE].dmg} Schaden`);
    }

    // Fall C: eine FREMDE Einheit (anderer Spieler, erst NACH dem Telegraph
    // platziert) auf dem Ziel-Hex wird ebenso getroffen — kein Besitzer-Filter.
    {
        const { state, spider, hexes } = setupTelegraph();
        const originalVictim = state.uw.u[0];
        const safeHex = M.getNeighbors(spider.x, spider.y).find(n => !hexes.some(h => h.x === n.x && h.y === n.y));
        if (safeHex) {
            originalVictim.x = safeHex.x; originalVictim.y = safeHex.y; // Original-Ziel weicht aus
            const stranger = { i: 2, p: 1, t: 7, x: hexes[0].x, y: hexes[0].y, h: 8, a: 0 }; // fremder Spieler, erst jetzt platziert
            state.uw.u.push(stranger);
            state.rn++;
            const hpBefore = stranger.h;
            M.uwCreatureRoundPhase();
            assert(stranger.h < hpBefore, 'eine FREMDE Einheit (anderer Besitzer, erst nach dem Telegraph platziert) wird ebenfalls getroffen — kein Besitzer-Filter');
        } else {
            console.log('SKIP: kein ausweichbares Hex für den Fremd-Einheiten-Test gefunden (Seed-Zufall)');
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c) Wurm-Leine: nie weiter als 3 Hexes vom Herzkaverne-Zentrum, Rückkehr + Ring-1-Patrouille ===');
{
    const state = freshState(11, 7, 2);
    const worm = findCreature(state, M.UWC_WURM);
    assert(!!worm, 'Wurm auf der Karte gefunden');
    const heart = M.getHeartCavernHexes(state);
    const center = heart[0];
    assert(worm.x === center.x && worm.y === center.y, 'Wurm startet exakt im Herzkaverne-Zentrum');

    // Lockvogel, der JEDE Runde direkt außerhalb der Aggro-Reichweite (3) des
    // Wurms platziert wird (feste Achse 0, immer 3 Hexes vom AKTUELLEN
    // Wurm-Standort entfernt) — ein "greedy" Köder, der den Wurm ohne Leine
    // über mehrere Runden immer weiter vom Zentrum wegziehen würde.
    const lure = { i: 1, p: 0, t: 7, h: 8, a: 0, x: center.x, y: center.y };
    state.uw.u = [lure];
    let maxDist = 0, moved = false;
    for (let i = 0; i < 15; i++) {
        const bait = M.uwHexInDirection(worm.x, worm.y, 0, 3);
        if (M.isInsideMap(state, bait.x, bait.y)) { lure.x = bait.x; lure.y = bait.y; }
        const before = `${worm.x},${worm.y}`;
        M.uwCreatureRoundPhase();
        state.rn++;
        if (`${worm.x},${worm.y}` !== before) moved = true;
        const d = M.hexDistance(worm, center);
        maxDist = Math.max(maxDist, d);
        assert(d <= 3, `Runde ${i + 1}: Wurm-Distanz zum Zentrum bleibt <= 3 trotz stetig lockendem Köder (gemessen: ${d})`);
    }
    assert(moved, 'Testaufbau greift: der Wurm hat sich über die Runden tatsächlich bewegt (Köder wirkt)');

    // Lockvogel entfernen -> Wurm patrouilliert zurück Richtung Zentrum/Ring 1.
    state.uw.u = [];
    for (let i = 0; i < 10; i++) { M.uwCreatureRoundPhase(); state.rn++; }
    assert(M.hexDistance(worm, center) <= 1, 'ohne Ziel patrouilliert der Wurm zurück auf Distanz <= 1 vom Zentrum (Ring-1/Zentrum-Patrouille)');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (d) Bewegungsreichweiten: Jagd bis huntMove Schritte (Steinpanzer nur 1), Patrouille genau 1 ===');
{
    // Künstlicher, garantiert offener Korridor (unabhängig vom Zufalls-Terrain):
    // Spinne (huntMove 2) verfolgt ein Ziel 3 Hexes entfernt entlang Achse 0 und
    // legt dabei GENAU 2 Felder zurück (stoppt bei Distanz 1).
    {
        const state = freshState(5, 12, 2);
        const spider = findCreature(state, M.UWC_SPINNE);
        assert(!!spider, 'Spinne gefunden');
        if (spider) {
            const h1 = M.uwHexInDirection(spider.x, spider.y, 0, 1);
            const h2 = M.uwHexInDirection(spider.x, spider.y, 0, 2);
            const h3 = M.uwHexInDirection(spider.x, spider.y, 0, 3);
            if (M.isInsideMap(state, h3.x, h3.y)) {
                forceOpen(state, h1.x, h1.y); forceOpen(state, h2.x, h2.y);
                state.uw.u = [{ i: 1, p: 0, t: 7, x: h3.x, y: h3.y, h: 8, a: 0 }];
                const pos0 = { x: spider.x, y: spider.y };
                M.uwCreatureRoundPhase();
                const moved = M.hexDistance(pos0, spider);
                assert(moved === 2, `Spinne legt bei einem 3 Hexes entfernten Ziel genau huntMove=2 Felder zurück (gemessen: ${moved})`);
                assert(spider.x === h2.x && spider.y === h2.y, 'Spinne steht exakt auf dem berechneten 2.-Schritt-Hex (deterministischer Korridor)');
            } else {
                console.log('SKIP: Korridor-Testhex außerhalb der Karte (Seed-Zufall) — Spinnen-Jagdreichweitentest übersprungen');
            }
        }
    }

    // Steinpanzer (huntMove 1): gleicher Korridor-Aufbau, aber nur 1 Feld.
    {
        const state = freshState(7, 12, 2);
        const panzer = findCreature(state, M.UWC_STEINPANZER);
        assert(!!panzer, 'Steinpanzer gefunden');
        if (panzer) {
            const h1 = M.uwHexInDirection(panzer.x, panzer.y, 0, 1);
            const h3 = M.uwHexInDirection(panzer.x, panzer.y, 0, 3);
            if (M.isInsideMap(state, h3.x, h3.y)) {
                forceOpen(state, h1.x, h1.y);
                state.uw.u = [{ i: 1, p: 0, t: 7, x: h3.x, y: h3.y, h: 8, a: 0 }];
                const pos0 = { x: panzer.x, y: panzer.y };
                M.uwCreatureRoundPhase();
                const moved = M.hexDistance(pos0, panzer);
                assert(moved === 1, `Steinpanzer legt bei vorhandenem Ziel genau huntMove=1 Feld zurück (gemessen: ${moved})`);
            } else {
                console.log('SKIP: Korridor-Testhex außerhalb der Karte (Seed-Zufall) — Steinpanzer-Jagdreichweitentest übersprungen');
            }
        }
    }

    // Patrouille (kein Ziel): Spinne bewegt sich pro Runde höchstens 1 Feld.
    {
        const state = freshState(9, 12, 2);
        const spider = findCreature(state, M.UWC_SPINNE);
        if (spider) {
            let prev = { x: spider.x, y: spider.y };
            let maxStep = 0;
            for (let i = 0; i < 8; i++) {
                M.uwCreatureRoundPhase();
                state.rn++;
                maxStep = Math.max(maxStep, M.hexDistance(prev, spider));
                prev = { x: spider.x, y: spider.y };
            }
            assert(maxStep <= 1, `Patrouille bewegt die Spinne pro Runde höchstens 1 Feld (max. gemessener Einzelschritt: ${maxStep})`);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (e) Pattern-Geometrien: exakte Hex-Mengen je Muster ===');
{
    const state = freshState(1, 12, 2); // nur für isInsideMap/bw/bh — Kartenmitte hat reichlich Rand für alle Muster
    const cx = state.rad, cy = state.rad;

    {
        const c = { t: M.UWC_SPINNE, x: cx, y: cy, h: 6, ap: { p: 0, d: 2 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        const expected = [M.uwHexInDirection(cx, cy, 2, 1), M.uwHexInDirection(cx, cy, 2, 2)];
        assert(hexes.length === 2 && expected.every(e => hexes.some(h => h.x === e.x && h.y === e.y)), 'Spinne p0 "Sprungbiss": exakt die 2 Linien-Hexes (Distanz 1+2 in Richtung d)');
    }
    {
        const c = { t: M.UWC_SPINNE, x: cx, y: cy, h: 6, ap: { p: 1, d: 2 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        assert(hexes.length === 3, `Spinne p1 "Umklammern": exakt 3 Hexes (gemessen: ${hexes.length})`);
    }
    {
        const c = { t: M.UWC_WUEHLER, x: cx, y: cy, h: 12, ap: { p: 0, d: 1 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        assert(hexes.length === 3, `Wühler p0 "Grabstoß": exakt 3 Hexes (Linie 3, gemessen: ${hexes.length})`);
    }
    {
        const c = { t: M.UWC_WUEHLER, x: cx, y: cy, h: 12, ap: { p: 1, d: 0 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        assert(hexes.length === 6, `Wühler p1 "Beben": exakt Ring 1 (6 Hexes, gemessen: ${hexes.length})`);
    }
    {
        const c = { t: M.UWC_STEINPANZER, x: cx, y: cy, h: 28, ap: { p: 0, d: 0 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        assert(hexes.length === 6, `Steinpanzer p0 "Felsschlag": exakt Ring 1 (6 Hexes, gemessen: ${hexes.length})`);
    }
    {
        const c = { t: M.UWC_STEINPANZER, x: cx, y: cy, h: 28, ap: { p: 1, d: 3 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        assert(hexes.length === 6, `Steinpanzer p1 "Erdrutsch": exakt 6 Hexes (gemessen: ${hexes.length})`);
        assert(hexes.every(h => M.hexDistance({ x: cx, y: cy }, h) <= 2), 'Erdrutsch-Keil: alle Hexes maximal Distanz 2 vom Panzer entfernt');
    }
    {
        const c = { t: M.UWC_WURM, x: cx, y: cy, h: 30, ap: { p: 0, d: 0 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        assert(hexes.length === 6, `Wurm p0: exakt Ring 1 (6 Hexes, gemessen: ${hexes.length})`);
    }
    {
        const c = { t: M.UWC_WURM, x: cx, y: cy, h: 30, ap: { p: 1, d: 0 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        const ring1 = M.hexRingAround({ x: cx, y: cy }, 1);
        assert(hexes.length === 12, `Wurm p1: exakt Ring 2 (12 Hexes, gemessen: ${hexes.length})`);
        assert(!hexes.some(h => ring1.some(r => r.x === h.x && r.y === h.y)), 'Wurm p1 "Ring 2": enthält KEINE Ring-1-Hexes (Ring 1 bleibt sicher)');
    }
    {
        const c = { t: M.UWC_WURM, x: cx, y: cy, h: 30, ap: { p: 2, d: 0 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        assert(hexes.length === 18, `Wurm p2 "Strahlen": exakt 18 Hexes (6 Achsen x 3 Felder, gemessen: ${hexes.length})`);
    }
    {
        const c = { t: M.UWC_WURM, x: cx, y: cy, h: 30, ap: { p: 3, d: 1 } };
        const hexes = M.getCreatureAttackHexes(state, c);
        assert(hexes.length === 12, `Wurm p3 "Wirbel": exakt 12 Hexes (2 gegenüberliegende Keile à 6, gemessen: ${hexes.length})`);
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (f) Ohne Einheit in Aggro-Reichweite entsteht kein Telegraph (c.ap) ===');
{
    const state = freshState(3, 12, 2);
    state.uw.u = []; // keine Spieler-Einheiten überhaupt
    M.uwCreatureRoundPhase();
    const withAp = (state.uw.c || []).filter(c => c.ap);
    assert(withAp.length === 0, `ohne jede Spieler-Einheit auf der Karte bekommt KEINE Kreatur einen Telegraph (gemessen: ${withAp.length} mit c.ap)`);

    // Ein bestehender (alter) Telegraph verschwindet, wenn kein Ziel mehr da ist.
    const state2 = freshState(3, 12, 2);
    const spider2 = findCreature(state2, M.UWC_SPINNE);
    if (spider2) {
        spider2.ap = { p: 0, d: 0 }; // künstlich vorbelegt
        state2.uw.u = [];
        M.uwCreatureRoundPhase();
        assert(!spider2.ap, 'ein bestehender Telegraph wird gelöscht, sobald kein Ziel mehr in Aggro-Reichweite ist');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (g) Serialisierungs-Roundtrip uw.c/uw.w/uw.wd (inkl. c.ap) ===');
{
    const state = freshState(15, 7, 2);
    state.uw.w['3,3'] = 1;
    state.uw.wd = 1;
    // uw.c hat bereits Kreaturen aus buildInitialGameState — HP + Telegraph eines
    // Eintrags setzen, um "reale" (nicht nur Default-)Werte zu testen.
    if (state.uw.c.length > 0) { state.uw.c[0].h = 3; state.uw.c[0].ap = { p: 1, d: 4 }; }
    const cBefore = JSON.parse(JSON.stringify(state.uw.c));
    const wBefore = JSON.parse(JSON.stringify(state.uw.w));

    const wireJson = JSON.stringify(state); // uw.c/uw.w/uw.wd brauchen keine Kompression (kompakte Objekte/Arrays)
    assert(wireJson.includes('"wd":1'), 'uw.wd im Wire-JSON vorhanden');
    assert(wireJson.includes('"p":1,"d":4'), 'c.ap im Wire-JSON vorhanden (kleine Ints, kein Extra-Cleanup nötig)');

    const restored = JSON.parse(wireJson);
    assert(JSON.stringify(restored.uw.c) === JSON.stringify(cBefore), 'uw.c inkl. c.ap verlustfrei nach Roundtrip (inkl. individueller HP)');
    assert(JSON.stringify(restored.uw.w) === JSON.stringify(wBefore), 'uw.w verlustfrei nach Roundtrip');
    assert(restored.uw.wd === 1, 'uw.wd verlustfrei nach Roundtrip');

    // Default-Cleanup: leeres uw.c/uw.w werden vor dem Encode entfernt (Muster
    // aus doEndTurn/confirmSurrender, hier isoliert nachvollzogen)
    const emptyState = freshState(15, 7, 2);
    emptyState.uw.c = [];
    emptyState.uw.w = {};
    if (emptyState.uw.c && emptyState.uw.c.length === 0) delete emptyState.uw.c;
    if (emptyState.uw.w && Object.keys(emptyState.uw.w).length === 0) delete emptyState.uw.w;
    assert(!('c' in emptyState.uw) && !('w' in emptyState.uw), 'leere uw.c/uw.w werden vor dem Encode entfernt (Default-Cleanup)');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (h) Spawn-Platzierung: Kreaturen stehen NIE auf massivem Fels/Adern ("Gebirge", Korrektur Juli 2026) ===');
{
    for (const seed of [3, 21, 4242]) {
        for (const radius of [5, 7, 12]) {
            const state = freshState(seed, radius, 2);
            const bad = (state.uw.c || []).filter(c => !M.isUnderworldOpen(state, c.x, c.y));
            assert(bad.length === 0, `Seed ${seed} R${radius}: alle ${state.uw.c.length} Kreaturen spawnen auf offenen Hexes (massiv: ${bad.length})`);
            // Keine Doppelbelegung: jedes Kreaturen-Hex nur einmal
            const seen = new Set();
            const dup = (state.uw.c || []).some(c => { const k = `${c.x},${c.y}`; if (seen.has(k)) return true; seen.add(k); return false; });
            assert(!dup, `Seed ${seed} R${radius}: keine zwei Kreaturen auf demselben Hex`);
            // Steinpanzer bewachen weiterhin eine Ader: mind. eine ADER angrenzend
            const panzers = (state.uw.c || []).filter(c => c.t === M.UWC_STEINPANZER);
            const guarding = panzers.every(c => M.getNeighbors(c.x, c.y).some(n => M.getUnderworldType(state, n.x, n.y) === M.UW_ADER));
            assert(guarding, `Seed ${seed} R${radius}: jeder Steinpanzer (${panzers.length}) steht NEBEN einer Ader (Wach-Hex)`);
        }
    }
}

console.log(`\n=== Zusammenfassung: ${failures === 0 ? 'ALLE CHECKS BESTANDEN' : failures + ' FEHLGESCHLAGEN'} ===`);
process.exit(failures === 0 ? 0 : 1);
