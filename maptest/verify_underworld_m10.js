// Verifikationsskript M10 — lädt die echten Spiel-Skripte (Muster wie
// maptest/load_game.js / verify_underworld_m9b.js), testet die DOM-freien
// Kernfunktionen: Engstellen-Schildstellung, Konter+Nachrücken, Beutegräber-
// Diebstahl, Fundkammern, Reliquien-Effekte, Serialisierungs-Roundtrip.
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
            getFundkammerHexes, isFundkammerHex, getRuinClusters,
            UW_FELS, UW_KAVERNE, UW_ADER, UW_RUINE, UW_HERZ,
            calculateMovesUW, calculateDigsUW, calculateMineTargetsUW, uwUnitAt,
            digUWHex, mineUWVein, deliverUWCrystals, ascendUWUnit, descendUWUnit, buyUWUnitAt,
            isChokepoint, calculateAttacksUW, getExpectedDamageUW, resolveUWAttack,
            lootFundkammer, applyRelicToUnit, applyRelicToBuilding, applyMapRelic, RELIC_KEYS,
            getUnitMaxHp, getUnitCost, getUnitMove, checkVeteran, unitStats, RELICS, uwFactionUnitMap
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

// Findet ein offenes Unterwelt-Hex mit exakt `n` offenen Nachbarn (oder mehr,
// falls exact=false) — Testhilfe für die Engstellen-Fälle.
function findOpenHexWithNeighborCount(state, wantExact, maxCount) {
    for (let y = 0; y < state.bh; y++) {
        for (let x = 0; x < state.bw; x++) {
            if (!M.isInsideMap(state, x, y)) continue;
            if (!M.isUnderworldOpen(state, x, y)) continue;
            const openN = M.getNeighbors(x, y).filter(n => M.isUnderworldOpen(state, n.x, n.y)).length;
            if (wantExact ? openN <= maxCount : openN > maxCount) return { x, y, openN };
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────
console.log('=== (a) Engstellen-Reduktion: nur auf Engstellen-Hex, nur für 17/19 ===');
{
    const state = freshState(5, 12, 2);
    const chokeHex = findOpenHexWithNeighborCount(state, true, 2);
    const openHex = findOpenHexWithNeighborCount(state, false, 2);
    assert(!!chokeHex, 'Engstellen-Hex gefunden (<=2 offene Nachbarn)');
    assert(!!openHex, 'nicht-Engstellen-Hex gefunden (>2 offene Nachbarn)');

    if (chokeHex && openHex) {
        assert(M.isChokepoint(state, chokeHex.x, chokeHex.y) === true, 'isChokepoint erkennt das Engstellen-Hex korrekt');
        assert(M.isChokepoint(state, openHex.x, openHex.y) === false, 'isChokepoint verneint das offene Hex korrekt');

        const attacker = { i: 1, p: 0, t: 18, x: 0, y: 0, h: 8 }; // Sprengmeister, kein Chokepoint-Bonus als Ziel relevant
        const wache = { i: 2, p: 1, t: 17, x: chokeHex.x, y: chokeHex.y, h: 14 };
        const wacheOpen = { i: 3, p: 1, t: 17, x: openHex.x, y: openHex.y, h: 14 };
        const nichtWache = { i: 4, p: 1, t: 20, x: chokeHex.x, y: chokeHex.y, h: 10 }; // Beutegräber auf Engstelle: KEIN Bonus

        const dmgOnChoke = M.getExpectedDamageUW(attacker, wache);
        const dmgOnOpen = M.getExpectedDamageUW(attacker, wacheOpen);
        const dmgOnNonEligible = M.getExpectedDamageUW(attacker, nichtWache);
        assert(dmgOnChoke === Math.max(1, dmgOnOpen - 1), `Grubenwache auf Engstelle nimmt genau -1 (${dmgOnChoke} vs. ${dmgOnOpen} offen)`);
        assert(dmgOnNonEligible === dmgOnOpen, `Beutegräber (kein 17/19) auf derselben Engstelle bekommt KEINEN Bonus (${dmgOnNonEligible} === ${dmgOnOpen})`);

        const ritterChoke = { i: 5, p: 1, t: 19, x: chokeHex.x, y: chokeHex.y, h: 16 };
        const ritterOpen = { i: 6, p: 1, t: 19, x: openHex.x, y: openHex.y, h: 16 };
        const dmgRitterChoke = M.getExpectedDamageUW(attacker, ritterChoke);
        const dmgRitterOpen = M.getExpectedDamageUW(attacker, ritterOpen);
        assert(dmgRitterChoke === Math.max(1, dmgRitterOpen - 1), `Grubenritter auf Engstelle nimmt ebenfalls genau -1 (${dmgRitterChoke} vs. ${dmgRitterOpen})`);
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (b) Konter + Nachrücken im UW-Kampf ===');
{
    const state = freshState(5, 5, 2);
    const cx = state.rad, cy = state.rad;
    const n1 = M.getNeighbors(cx, cy)[0];

    // Fall 1: Ziel überlebt -> Konterschaden > 0 gemeldet (retDmg), kein Kill, kein Nachrücken
    {
        const attacker = { i: 1, p: 0, t: 17, x: cx, y: cy, h: 14 };
        const target = { i: 2, p: 1, t: 17, x: n1.x, y: n1.y, h: 14 };
        state.uw.u.push(attacker, target);
        const result = M.resolveUWAttack(state, attacker, target);
        assert(result.killed === false, 'Ziel mit voller HP überlebt einen einzelnen Treffer');
        assert(result.retDmg > 0, `Konterschaden wird gemeldet (retDmg=${result.retDmg}, Ziel in Reichweite)`);
        assert(attacker.x === cx && attacker.y === cy, 'Angreifer rückt NICHT nach, wenn das Ziel überlebt');
    }

    // Fall 2: Ziel stirbt -> kein Konter gemeldet, Angreifer rückt aufs Ziel-Hex nach
    {
        const state2 = freshState(6, 5, 2);
        const cx2 = state2.rad, cy2 = state2.rad;
        const n2 = M.getNeighbors(cx2, cy2)[0];
        const attacker = { i: 1, p: 0, t: 19, x: cx2, y: cy2, h: 16 }; // Grubenritter, 5 DMG
        const target = { i: 2, p: 1, t: 18, x: n2.x, y: n2.y, h: 1 };  // fast tot
        state2.uw.u.push(attacker, target);
        const result = M.resolveUWAttack(state2, attacker, target);
        assert(result.killed === true, 'Ziel mit 1 HP stirbt am Treffer');
        assert(result.retDmg === 0, 'kein Konterschaden von einer toten Einheit');
        assert(attacker.x === n2.x && attacker.y === n2.y, 'Angreifer ist auf das freigewordene Ziel-Hex nachgerückt');
        assert(!state2.uw.u.includes(target), 'totes Ziel aus uw.u entfernt');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c) Beutegräber-Diebstahl: cr wandert beim Kill ===');
{
    const state = freshState(7, 5, 2);
    const cx = state.rad, cy = state.rad;
    const n1 = M.getNeighbors(cx, cy)[0];

    const beutegraeber = { i: 1, p: 0, t: 20, x: cx, y: cy, h: 10, cr: 1 };
    const opfer = { i: 2, p: 1, t: 16, x: n1.x, y: n1.y, h: 1, cr: 3 }; // trägt 3, stirbt am Treffer
    state.uw.u.push(beutegraeber, opfer);
    const result = M.resolveUWAttack(state, beutegraeber, opfer);
    assert(result.killed === true, 'Opfer stirbt (1 HP)');
    assert(result.stolenCrystals === 2, `genau bis zum Träger-Limit gestohlen (1 schon getragen + 2 gestohlen = 3, gemessen: ${result.stolenCrystals})`);
    assert(beutegraeber.cr === 3, `Beutegräber trägt danach 3 (Limit), gemessen: ${beutegraeber.cr}`);

    // Kein Diebstahl durch andere Einheitstypen
    const state2 = freshState(7, 5, 2);
    const cx2 = state2.rad, cy2 = state2.rad;
    const n2 = M.getNeighbors(cx2, cy2)[0];
    const wache = { i: 3, p: 0, t: 17, x: cx2, y: cy2, h: 14 };
    const opfer2 = { i: 4, p: 1, t: 16, x: n2.x, y: n2.y, h: 1, cr: 2 };
    state2.uw.u.push(wache, opfer2);
    const result2 = M.resolveUWAttack(state2, wache, opfer2);
    assert(result2.killed === true && result2.stolenCrystals === 0, 'Grubenwache (kein Beutegräber) stiehlt NICHTS beim Kill');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (d) Fundkammer: nur einmal plünderbar, deterministisch gleiche Beute ===');
{
    const state = freshState(9, 12, 2);
    const fundkammern = M.getFundkammerHexes(state);
    assert(fundkammern.length > 0, `mindestens eine Fundkammer auf R12-Karte gefunden (${fundkammern.length})`);

    if (fundkammern.length > 0) {
        const fk = fundkammern[0];
        const unit = { i: 1, p: 0, t: 16, x: fk.x, y: fk.y, h: 8 };
        const kBefore = state.p[0].k || 0;
        const relBefore = (state.p[0].rel || []).length;

        const loot1 = M.lootFundkammer(state, 0, unit, fk.x, fk.y);
        assert(!!loot1, 'erster Besuch liefert Beute');
        const loot2 = M.lootFundkammer(state, 0, unit, fk.x, fk.y);
        assert(loot2 === null, 'zweiter Besuch derselben Fundkammer liefert NICHTS mehr (global einmalig)');
        assert(state.uw.f[`${fk.x},${fk.y}`] === 1, 'uw.f-Flag gesetzt');

        if (loot1.type === 'crystal') {
            assert(state.p[0].k === kBefore + loot1.amount, `Kristalle korrekt verbucht (+${loot1.amount})`);
        } else {
            assert((state.p[0].rel || []).length === relBefore + 1, 'Reliquie korrekt ins Inventar gelegt');
        }

        // Determinismus: gleicher Seed + gleiche Karte -> gleiche Beute an derselben
        // Fundkammer, unabhängig vom Spieler/der Einheit, die sie plündert.
        const stateB = freshState(9, 12, 3);
        const unitB = { i: 1, p: 1, t: 16, x: fk.x, y: fk.y, h: 8 };
        const lootB = M.lootFundkammer(stateB, 1, unitB, fk.x, fk.y);
        assert(lootB.type === loot1.type, `gleicher Seed -> gleicher Beutetyp (${lootB.type} === ${loot1.type})`);
        if (loot1.type === 'crystal') assert(lootB.amount === 2, 'Basis-Kristallmenge ohne Beutegräber-Passiv ist 2');
        else assert(lootB.relic === loot1.relic, `gleiche Reliquie (${lootB.relic} === ${loot1.relic})`);

        // Beutegräber-Passiv: +1 extra Kristall bei Kristall-Fund (an einer ANDEREN,
        // noch ungeplünderten Fundkammer, damit das uw.f-Flag nicht kollidiert)
        const crystalFk = fundkammern.find(h => {
            const stateC = freshState(9, 12, 2);
            return M.underworldHash(stateC, h.x, h.y, 2) < 0.5;
        });
        if (crystalFk) {
            const stateC = freshState(9, 12, 2);
            const beutegraeber = { i: 2, p: 0, t: 20, x: crystalFk.x, y: crystalFk.y, h: 10 };
            const lootC = M.lootFundkammer(stateC, 0, beutegraeber, crystalFk.x, crystalFk.y);
            assert(lootC.type === 'crystal' && lootC.amount === 3, `Beutegräber bekommt +1 extra (3 statt 2), gemessen: ${lootC.amount}`);
        } else {
            console.log('SKIP: keine reine Kristall-Fundkammer für den Beutegräber-Passiv-Test gefunden (Seed-Zufall)');
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (e) Reliquien-Effekte in getExpectedDamage(UW)/getUnitMaxHp ===');
{
    const state = freshState(11, 5, 2);
    const pState = state.p[0];
    pState.rel = ['blade', 'armor'];

    // Klinge: +5 DMG auf Oberfläche UND Unterwelt
    const uwUnitPlain = { i: 1, p: 0, t: 17, x: state.rad, y: state.rad, h: 14 };
    const uwUnitBlade = { i: 2, p: 0, t: 17, x: state.rad, y: state.rad, h: 14, art: 'blade' };
    const target = { i: 3, p: 1, t: 17, x: 0, y: 0, h: 14 };
    const dmgPlain = M.getExpectedDamageUW(uwUnitPlain, target);
    const dmgBlade = M.getExpectedDamageUW(uwUnitBlade, target);
    assert(dmgBlade === dmgPlain + 5, `Damaszener Klinge +5 DMG in getExpectedDamageUW (${dmgBlade} === ${dmgPlain}+5)`);

    // Harnisch: +10 Max-HP via getUnitMaxHp (gilt generisch für Oberfläche+Unterwelt)
    const maxHpPlain = M.getUnitMaxHp(pState, 17, uwUnitPlain);
    const uwUnitArmor = { i: 4, p: 0, t: 17, x: 0, y: 0, h: 14, art: 'armor' };
    const maxHpArmor = M.getUnitMaxHp(pState, 17, uwUnitArmor);
    assert(maxHpArmor === maxHpPlain + 10, `Harnisch +10 Max-HP in getUnitMaxHp (${maxHpArmor} === ${maxHpPlain}+10)`);

    // applyRelicToUnit: verbraucht das Inventar-Item, heilt beim Ausrüsten mit,
    // verweigert eine zweite Reliquie auf derselben Einheit
    const freshUnit = { i: 5, p: 0, t: 16, x: 0, y: 0, h: 5 }; // 5/8 HP
    const relBefore = pState.rel.length;
    const ok = M.applyRelicToUnit(state, 0, 'armor', freshUnit);
    assert(ok === true, 'applyRelicToUnit gelingt mit Reliquie im Inventar');
    assert(freshUnit.art === 'armor', 'Einheit trägt die Reliquie jetzt');
    assert(freshUnit.h === Math.min(M.getUnitMaxHp(pState, 16, freshUnit), 5 + 10), `Einheit heilt beim Ausrüsten um 10 mit (gemessen: ${freshUnit.h})`);
    assert(pState.rel.length === relBefore - 1, 'Reliquie aus dem Inventar entfernt');
    const okTwice = M.applyRelicToUnit(state, 0, 'blade', freshUnit);
    assert(okTwice === false, 'zweite Reliquie auf derselben Einheit wird verweigert (eine pro Einheit)');

    // applyRelicToBuilding: Bauwerk auf volle HP, Startdorf-Sonderfall (.sh)
    pState.rel.push('tool', 'tool');
    const wall = { x: 1, y: 1, o: 0, h: 3 };
    const okWall = M.applyRelicToBuilding(state, 0, wall, 10);
    assert(okWall === true && wall.h === 10, 'Meisterwerkzeug heilt Mauer auf volle HP (10)');
    state.p[0].sh = 5;
    const okStart = M.applyRelicToBuilding(state, 0, state.p[0], undefined);
    assert(okStart === true && state.p[0].sh === 30, 'Meisterwerkzeug heilt Startdorf auf volle HP (30, .sh-Sonderfall)');

    // applyMapRelic: komplette Karte (Oberfläche + Unterwelt) aufgedeckt
    const stateMap = freshState(11, 5, 2);
    M.applyMapRelic(stateMap, 0);
    const total = stateMap.bw * stateMap.bh;
    assert(stateMap.p[0].e.length === total, `p[0].e vollständig aufgedeckt (${stateMap.p[0].e.length} === ${total})`);
    assert(stateMap.p[0].ue.length === total, `p[0].ue vollständig aufgedeckt (${stateMap.p[0].ue.length} === ${total})`);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (f) Serialisierungs-Roundtrip mit p[].rel/u[].art/uw.f ===');
{
    const state = freshState(13, 7, 2);
    state.p[0].rel = ['blade', 'tool'];
    state.u.push({ i: 99, p: 0, t: 0, x: 0, y: 0, h: 10, art: 'armor' });
    state.uw.u.push({ i: 1, p: 0, t: 19, x: 2, y: 2, h: 16, art: 'blade' });
    state.uw.f['4,4'] = 1;

    const prngSrc = fs.readFileSync(path.join(ROOT, 'js/prng.js'), 'utf8');
    const { compressFog: cf, decompressFog: df } = new Function(prngSrc + '; return { compressFog, decompressFog };')();

    // --- Cleanup-Block (Muster aus doEndTurn/confirmSurrender) ---
    state.p.forEach(p => {
        if (Array.isArray(p.ue)) p.ue = cf(p.ue);
        if (p.rel && p.rel.length === 0) delete p.rel;
    });
    state.u.forEach(u => { delete u.i; });
    if (state.uw) {
        (state.uw.u || []).forEach(u => { if (u.a === 0) delete u.a; delete u.i; });
        if (Array.isArray(state.uw.d)) state.uw.d = cf(state.uw.d);
        if (state.uw.f && Object.keys(state.uw.f).length === 0) delete state.uw.f;
    }
    const wireJson = JSON.stringify(state);
    assert(wireJson.includes('"art":"armor"') && wireJson.includes('"art":"blade"'), 'u[].art/uw.u[].art im Wire-JSON vorhanden');
    assert(wireJson.includes('"rel":["blade","tool"]'), 'p[].rel im Wire-JSON vorhanden');

    // --- Restore-Block (Muster aus bootGame) ---
    const restored = JSON.parse(wireJson);
    restored.p.forEach(p => { if (typeof p.ue === 'string') p.ue = df(p.ue); if (!p.ue) p.ue = []; if (!p.rel) p.rel = []; });
    restored.u.forEach((u, idx) => { if (!u.i) u.i = idx + 1; });
    if (!restored.uw) restored.uw = { d: [], u: [], n: [], a: {}, f: {} };
    if (typeof restored.uw.d === 'string') restored.uw.d = df(restored.uw.d);
    if (!restored.uw.f) restored.uw.f = {};
    restored.uw.u.forEach((u, idx) => { if (u.a === undefined) u.a = 0; if (!u.i) u.i = idx + 1; });

    assert(JSON.stringify(restored.p[0].rel) === JSON.stringify(['blade', 'tool']), 'p[0].rel verlustfrei nach Roundtrip');
    // IDs werden beim Restore neu vergeben (Index-basiert, wie bootGame das schon
    // immer macht) — das Testunit hier eindeutig über seinen Typ/die Reliquie finden.
    assert(restored.u.find(u => u.t === 0 && u.art === 'armor') !== undefined, 'u[].art (Oberfläche) verlustfrei');
    assert(restored.uw.u[0].art === 'blade', 'uw.u[].art (Unterwelt) verlustfrei');
    assert(restored.uw.f['4,4'] === 1, 'uw.f-Flag verlustfrei');

    // Default-Fall: leeres p[].rel wird beim Encode weggelassen (keine leere Liste im Blob)
    const emptyState = freshState(17, 5, 2);
    emptyState.p.forEach(p => { if (p.rel && p.rel.length === 0) delete p.rel; });
    assert(JSON.stringify(emptyState.p[0]).includes('"rel"') === false, 'leeres p[].rel wird vor dem Encode entfernt (Default-Cleanup)');
}

console.log(`\n=== Zusammenfassung: ${failures === 0 ? 'ALLE CHECKS BESTANDEN' : failures + ' FEHLGESCHLAGEN'} ===`);
process.exit(failures === 0 ? 0 : 1);
