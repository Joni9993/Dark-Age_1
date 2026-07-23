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
            calculateMovesUW, calculateDigsUW, calculateMineTargetsUW, uwUnitAt, moveUWUnit,
            digUWHex, mineUWVein, deliverUWCrystals, ascendUWUnit, descendUWUnit, buyUWUnitAt,
            isChokepoint, calculateAttacksUW, getExpectedDamageUW, resolveUWAttack,
            lootFundkammer, lootFundkammerAction, applyRelicToUnit, applyRelicToBuilding, applyMapRelic, RELIC_KEYS,
            getUnitMaxHp, getUnitCost, getUnitMove, checkVeteran, unitStats, RELICS, uwFactionUnitMap,
            getVisibleHexes
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
console.log('=== (a) isChokepoint-Erkennung (Schildstellungs-Passiv von 17/19 entfernt, Juli 2026) ===');
{
    const state = freshState(5, 12, 2);
    const chokeHex = findOpenHexWithNeighborCount(state, true, 2);
    const openHex = findOpenHexWithNeighborCount(state, false, 2);
    assert(!!chokeHex, 'Engstellen-Hex gefunden (<=2 offene Nachbarn)');
    assert(!!openHex, 'nicht-Engstellen-Hex gefunden (>2 offene Nachbarn)');

    if (chokeHex && openHex) {
        assert(M.isChokepoint(state, chokeHex.x, chokeHex.y) === true, 'isChokepoint erkennt das Engstellen-Hex korrekt');
        assert(M.isChokepoint(state, openHex.x, openHex.y) === false, 'isChokepoint verneint das offene Hex korrekt');

        // Grubenwache/Grubenritter erleiden auf Engstellen KEINEN Bonus mehr —
        // getExpectedDamageUW ist unabhängig vom Ziel-Hex.
        const attacker = { i: 1, p: 0, t: 18, x: 0, y: 0, h: 8 };
        const wache = { i: 2, p: 1, t: 17, x: chokeHex.x, y: chokeHex.y, h: 14 };
        const wacheOpen = { i: 3, p: 1, t: 17, x: openHex.x, y: openHex.y, h: 14 };
        assert(M.getExpectedDamageUW(attacker, wache) === M.getExpectedDamageUW(attacker, wacheOpen), 'Grubenwache bekommt auf Engstelle keinen Schadensbonus mehr (Passiv entfernt)');

        const ritterChoke = { i: 5, p: 1, t: 19, x: chokeHex.x, y: chokeHex.y, h: 16 };
        const ritterOpen = { i: 6, p: 1, t: 19, x: openHex.x, y: openHex.y, h: 16 };
        assert(M.getExpectedDamageUW(attacker, ritterChoke) === M.getExpectedDamageUW(attacker, ritterOpen), 'Grubenritter bekommt auf Engstelle keinen Schadensbonus mehr (Passiv entfernt)');
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

    // Fall 3: Grubenritter-Sturmangriff (Korrektur Juli 2026) — nach einem Kill
    // einmalig frisches a=0 statt 1; ein zweiter Kill im SELBEN Zug löst den
    // Bonus NICHT nochmal aus (sm-Sperre, keine Kill-Ketten).
    {
        const state3 = freshState(8, 5, 2);
        const cx3 = state3.rad, cy3 = state3.rad;
        const n3a = M.getNeighbors(cx3, cy3)[0];
        const n3b = M.getNeighbors(n3a.x, n3a.y).find(n => !(n.x === cx3 && n.y === cy3));

        const ritter = { i: 1, p: 0, t: 19, x: cx3, y: cy3, h: 16 };
        const target1 = { i: 2, p: 1, t: 18, x: n3a.x, y: n3a.y, h: 1 };
        const target2 = { i: 3, p: 1, t: 18, x: n3b.x, y: n3b.y, h: 1 };
        state3.uw.u.push(ritter, target1, target2);

        const r1 = M.resolveUWAttack(state3, ritter, target1);
        assert(r1.killed === true, 'Sturmangriff-Test: erster Kill gelingt');
        assert(ritter.a === 0, 'nach dem ersten Kill: a zurückgesetzt auf 0 (Sturmangriff ausgelöst)');
        assert(ritter.sm === 1, 'nach dem ersten Kill: sm-Sperre gesetzt');
        assert(ritter.x === n3a.x && ritter.y === n3a.y, 'Ritter auf das erste Ziel-Hex nachgerückt');

        const r2 = M.resolveUWAttack(state3, ritter, target2);
        assert(r2.killed === true, 'Sturmangriff-Test: zweiter Kill im selben Zug gelingt ebenfalls');
        assert(ritter.a === 1, 'nach dem zweiten Kill im selben Zug: KEIN erneuter Sturmangriff (sm-Sperre greift, a bleibt 1)');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (b2) Grubenwache "Wache": mv-Flag unterscheidet Bewegen von reinem Angreifen ===');
{
    const state = freshState(23, 5, 2);
    const cx = state.rad, cy = state.rad;
    const n1 = M.getNeighbors(cx, cy)[0];

    // Bewegen setzt mv=1 (heal-Bedingung "!u.mv" in doEndTurn greift NICHT mehr)
    const wache1 = { i: 1, p: 0, t: 17, x: cx, y: cy, h: 10 };
    M.moveUWUnit(state, wache1, n1.x, n1.y);
    assert(wache1.mv === 1, 'Grubenwache nach Bewegung: mv-Flag gesetzt (keine Heilung am Rundenende)');

    // Reines Angreifen (ohne vorherige Bewegung) setzt mv NICHT — die Heilung
    // bleibt möglich, auch wenn die Grubenwache diesen Zug zugeschlagen hat.
    const wache2 = { i: 2, p: 0, t: 17, x: cx, y: cy, h: 10 };
    const target = { i: 3, p: 1, t: 18, x: n1.x, y: n1.y, h: 8 };
    state.uw.u.push(wache2, target);
    M.resolveUWAttack(state, wache2, target);
    assert(!wache2.mv, 'Grubenwache nach reinem Angriff (keine Bewegung): mv-Flag NICHT gesetzt (Heilung bleibt möglich)');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c) Beutegräber-Diebstahl: cr wandert beim Kill ===');
{
    const state = freshState(7, 5, 2);
    const cx = state.rad, cy = state.rad;
    const n1 = M.getNeighbors(cx, cy)[0];

    const beutegraeber = { i: 1, p: 0, t: 20, x: cx, y: cy, h: 10, cr: 1 };
    const opfer = { i: 2, p: 1, t: 7, x: n1.x, y: n1.y, h: 1, cr: 3 }; // trägt 3, stirbt am Treffer
    state.uw.u.push(beutegraeber, opfer);
    const result = M.resolveUWAttack(state, beutegraeber, opfer);
    assert(result.killed === true, 'Opfer stirbt (1 HP)');
    assert(result.stolenCrystals === 3, `komplette Fracht des Opfers gestohlen, UNCAPPED (gemessen: ${result.stolenCrystals}, erwartet: 3)`);
    assert(beutegraeber.cr === 4, `Beutegräber trägt danach 1 (eigene) + 3 (gestohlen) = 4, kein Limit mehr (gemessen: ${beutegraeber.cr})`);

    // Kein Diebstahl durch andere Einheitstypen — die Fracht fällt stattdessen
    // als Haufen zu Boden (Korrektur Juli 2026, dropUWCrystalsOnDeath), der
    // Killer sammelt sie beim Nachrücken NICHT automatisch ein (Grubenwache
    // kann laut PLAN keine Kristalle tragen).
    const state2 = freshState(7, 5, 2);
    const cx2 = state2.rad, cy2 = state2.rad;
    const n2 = M.getNeighbors(cx2, cy2)[0];
    const wache = { i: 3, p: 0, t: 17, x: cx2, y: cy2, h: 14 };
    const opfer2 = { i: 4, p: 1, t: 7, x: n2.x, y: n2.y, h: 1, cr: 2 };
    state2.uw.u.push(wache, opfer2);
    const result2 = M.resolveUWAttack(state2, wache, opfer2);
    assert(result2.killed === true && result2.stolenCrystals === 0, 'Grubenwache (kein Beutegräber) stiehlt NICHTS beim Kill');
    assert(state2.uw.dr[`${n2.x},${n2.y}`] === 2, 'Opfer-Fracht liegt stattdessen als herrenloser Haufen auf dem Sterbe-Hex');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (d) Fundkammer: nur einmal plünderbar, deterministisch gleiche Beute ===');
{
    const state = freshState(9, 12, 2);
    const fundkammern = M.getFundkammerHexes(state);
    assert(fundkammern.length > 0, `mindestens eine Fundkammer auf R12-Karte gefunden (${fundkammern.length})`);

    if (fundkammern.length > 0) {
        const fk = fundkammern[0];
        const unit = { i: 1, p: 0, t: 7, x: fk.x, y: fk.y, h: 8 };
        const kBefore = state.p[0].k || 0;
        const relBefore = (state.p[0].rel || []).length;

        const loot1 = M.lootFundkammer(state, 0, unit, fk.x, fk.y);
        assert(!!loot1, 'erster Besuch liefert Beute');
        const loot2 = M.lootFundkammer(state, 0, unit, fk.x, fk.y);
        assert(loot2 === null, 'zweiter Besuch derselben Fundkammer liefert NICHTS mehr (global einmalig)');
        assert(state.uw.f[`${fk.x},${fk.y}`] === 1, 'uw.f-Flag gesetzt');

        if (loot1.type === 'crystal') {
            assert(state.p[0].k === kBefore + loot1.amount, `Kristalle korrekt verbucht (+${loot1.amount})`);
        } else if (loot1.relic === 'map') {
            assert((state.p[0].rel || []).length === relBefore, '"map"-Fund landet NICHT im Inventar (wirkt sofort)');
        } else {
            assert((state.p[0].rel || []).length === relBefore + 1, 'Reliquie korrekt ins Inventar gelegt');
        }

        // Determinismus: gleicher Seed + gleiche Karte -> gleiche Beute an derselben
        // Fundkammer, unabhängig vom Spieler/der Einheit, die sie plündert.
        const stateB = freshState(9, 12, 3);
        const unitB = { i: 1, p: 1, t: 7, x: fk.x, y: fk.y, h: 8 };
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

        // Button-Aktion statt Auto-Loot (Korrektur Juli 2026): Bewegung AUF ein
        // Fundkammer-Hex plündert NICHT mehr — erst lootFundkammerAction (der
        // Kern des "🏺 Fundkammer plündern"-Buttons) plündert und verbraucht
        // dabei die restlichen Aktionen des Zuges (a=1, wie "Dorf einnehmen").
        const stateD = freshState(9, 12, 2);
        useState(stateD);
        const unitD = { i: 3, p: 0, t: 7, x: fk.x, y: fk.y, h: 8, a: 0 };
        stateD.uw.u.push(unitD);
        const moveResult = M.moveUWUnit(stateD, unitD, fk.x, fk.y);
        assert(moveResult.loot === undefined && !(stateD.uw.f && stateD.uw.f[`${fk.x},${fk.y}`]), 'Bewegung auf die Fundkammer plündert NICHT mehr automatisch');
        const lootD = M.lootFundkammerAction(stateD, unitD);
        assert(!!lootD && stateD.uw.f[`${fk.x},${fk.y}`] === 1, 'lootFundkammerAction plündert die Fundkammer unter der Einheit');
        assert(unitD.a === 1, 'Plündern verbraucht die restlichen Aktionen der Einheit (a=1)');
        const lootD2 = M.lootFundkammerAction(stateD, unitD);
        assert(lootD2 === null, 'zweiter Button-Druck liefert nichts mehr (uw.f-Flag)');
        const offHex = M.getNeighbors(fk.x, fk.y).find(n => !M.isFundkammerHex(stateD, n.x, n.y));
        if (offHex) {
            const unitOff = { i: 4, p: 0, t: 7, x: offHex.x, y: offHex.y, h: 8, a: 0 };
            assert(M.lootFundkammerAction(stateD, unitOff) === null && unitOff.a === 0, 'lootFundkammerAction auf Nicht-Fundkammer-Hex tut nichts');
        }

        // "map"-Fund wirkt sofort (Fix Juli 2026): deckt beide Ebenen komplett
        // auf statt nutzlos als Ausrüst-Item im Inventar zu landen. Passende
        // Fundkammer per Seed-Suche (Beute ist seed-deterministisch).
        let mapCase = null;
        for (let seed = 1; seed <= 30 && !mapCase; seed++) {
            const s = freshState(seed, 12, 2);
            for (const h of M.getFundkammerHexes(s)) {
                if (M.underworldHash(s, h.x, h.y, 2) >= 0.5) {
                    const ri = Math.min(M.RELIC_KEYS.length - 1, Math.floor(M.underworldHash(s, h.x, h.y, 3) * M.RELIC_KEYS.length));
                    if (M.RELIC_KEYS[ri] === 'map') { mapCase = { seed, h }; break; }
                }
            }
        }
        if (mapCase) {
            const stateE = freshState(mapCase.seed, 12, 2);
            const unitE = { i: 5, p: 0, t: 7, x: mapCase.h.x, y: mapCase.h.y, h: 8 };
            const lootE = M.lootFundkammer(stateE, 0, unitE, mapCase.h.x, mapCase.h.y);
            assert(!!lootE && lootE.relic === 'map' && lootE.instant === true, '"map"-Fund liefert instant-Flag');
            assert((stateE.p[0].rel || []).length === 0, '"map"-Fund landet nicht im Inventar');
            const total = stateE.bw * stateE.bh;
            assert(stateE.p[0].e.length === total && stateE.p[0].ue.length === total, '"map"-Fund deckt Oberfläche + Unterwelt komplett auf');
        } else {
            console.log('SKIP: keine "map"-Fundkammer in Seeds 1-30 gefunden (Seed-Zufall)');
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
    const freshUnit = { i: 5, p: 0, t: 7, x: 0, y: 0, h: 5 }; // 5/10 HP (Arbeiter)
    const relBefore = pState.rel.length;
    const ok = M.applyRelicToUnit(state, 0, 'armor', freshUnit);
    assert(ok === true, 'applyRelicToUnit gelingt mit Reliquie im Inventar');
    assert(freshUnit.art === 'armor', 'Einheit trägt die Reliquie jetzt');
    assert(freshUnit.h === Math.min(M.getUnitMaxHp(pState, 7, freshUnit), 5 + 10), `Einheit heilt beim Ausrüsten um 10 mit (gemessen: ${freshUnit.h})`);
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

    // Fix Juli 2026: die Karte gibt permanente 100%-LIVE-Sicht (p.mr +
    // getVisibleHexes), nicht nur einmalige Erkundung — vorher blieben Felder
    // außerhalb der eigenen Sichtweite abgedunkelt.
    assert(stateMap.p[0].mr === 1, 'p[0].mr-Flag gesetzt (permanente Sicht)');
    const insideCount = (() => {
        let n = 0;
        for (let y = 0; y < stateMap.bh; y++)
            for (let x = 0; x < stateMap.bw; x++)
                if (M.isInsideMap(stateMap, x, y)) n++;
        return n;
    })();
    const visWith = M.getVisibleHexes(0);
    assert(visWith.size === insideCount, `getVisibleHexes liefert mit mr ALLE Karten-Hexes (${visWith.size} === ${insideCount})`);
    const visWithout = M.getVisibleHexes(1);
    assert(visWithout.size < insideCount, `Spieler ohne Karte sieht weiterhin nur seinen Ausschnitt (${visWithout.size} < ${insideCount})`);

    // Verbündeten-Fall: Bündnisse teilen die volle Sicht der Karte mit.
    stateMap.p[1].al = [0];
    const visAlly = M.getVisibleHexes(1);
    assert(visAlly.size === insideCount, `Verbündeter des Karten-Besitzers erbt die 100%-Sicht (${visAlly.size} === ${insideCount})`);
    stateMap.p[1].al = [];
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
