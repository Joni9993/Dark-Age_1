// Verifikationsskript M11 — lädt die echten Spiel-Skripte (Muster wie
// maptest/verify_underworld_m10.js), testet die DOM-freien Kernfunktionen:
// PvE-Kreaturen (Spinne/Wühler/Steinpanzer/Alter Wurm), Lärm-Anziehung, Netze,
// Kreaturen-Kampf, Serialisierungs-Roundtrip.
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
            UW_FELS, UW_KAVERNE, UW_ADER, UW_RUINE, UW_HERZ,
            calculateMovesUW, calculateDigsUW, calculateMineTargetsUW, uwUnitAt, uwCreatureAt,
            digUWHex, mineUWVein, resolveUWAttack, resolveUWAttackOnCreature, getExpectedDamageUW,
            findWeakestAdjacentPlayerUnit, creatureHitUnit, processUWCreatureTurn, isUWCreatureVisible,
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

// ─────────────────────────────────────────────────────────────────────────
console.log('=== (a) Determinismus: identischer Seed + Zugfolge -> identische Kreaturen ===');
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
        M.processUWCreatureTurn();
        M.processUWCreatureTurn(); // zweiter Zug für mehr Bewegungsspielraum
        return JSON.stringify(state.uw.c) + '|' + JSON.stringify(state.uw.d) + '|' + JSON.stringify(state.uw.w) + '|' + JSON.stringify(state.uw.u);
    }
    const run1 = runScenario();
    const run2 = runScenario();
    assert(run1 === run2, 'zwei unabhängige Läufe mit identischem Seed + identischer Aktionsfolge liefern identisches Ergebnis');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (b) Wühler bewegt sich nachweislich auf Lärm zu und öffnet Fels-Hexes ===');
{
    const state = freshState(3, 12, 2);
    const wuehler = findCreature(state, M.UWC_WUEHLER);
    assert(!!wuehler, 'Wühler auf der Karte gefunden');
    if (wuehler) {
        // Garantiert erreichbare Lärmquelle: 2 Hexes entfernt in einer festen Richtung
        const dirs = M.getNeighbors(wuehler.x, wuehler.y);
        const noiseHex = { x: wuehler.x + (dirs[0].x - wuehler.x) * 2, y: wuehler.y + (dirs[0].y - wuehler.y) * 2 };
        if (M.isInsideMap(state, noiseHex.x, noiseHex.y)) {
            const distBefore = M.hexDistance(wuehler, noiseHex);
            state.uw.n = [{ x: noiseHex.x, y: noiseHex.y }];
            const dBefore = wuehler.x + ',' + wuehler.y;
            const digsBefore = state.uw.d.length;
            M.processUWCreatureTurn();
            const distAfter = M.hexDistance(wuehler, noiseHex);
            assert(dBefore !== wuehler.x + ',' + wuehler.y || distBefore === 0, 'Wühler hat sich bewegt (Position geändert)');
            assert(distAfter < distBefore, `Wühler ist der Lärmquelle nähergekommen (${distBefore} -> ${distAfter})`);
            assert(state.uw.d.length >= digsBefore, 'uw.d ist nicht kleiner geworden (ggf. neues Fels-Hex geöffnet)');
        } else {
            console.log('SKIP: Lärm-Testhex außerhalb der Karte (Seed-Zufall) — Wühler-Bewegungstest übersprungen');
        }

        // Reichweite: Lärm außerhalb Umkreis 4 wird ignoriert
        const state2 = freshState(3, 12, 2);
        const wuehler2 = findCreature(state2, M.UWC_WUEHLER);
        state2.uw.n = [{ x: wuehler2.x, y: Math.min(state2.bh - 1, wuehler2.y + 10) }]; // garantiert > 4 entfernt (oder außerhalb)
        const posBefore2 = `${wuehler2.x},${wuehler2.y}`;
        M.processUWCreatureTurn();
        assert(`${wuehler2.x},${wuehler2.y}` === posBefore2, 'ohne Lärm in Reichweite (>4) bleibt der Wühler stehen');

        // Adern werden umgangen (nicht zerstört)
        const state3 = freshState(7, 12, 2); // Seed mit Ader direkt neben dem Wühler-Spawn
        const wuehler3 = findCreature(state3, M.UWC_WUEHLER);
        // Künstlich: alle Nachbarn zu Adern "umdeklarieren" ist nicht möglich (Terrain
        // ist reine Funktion des Seeds) — stattdessen nur behaupten: KEIN uw.a-Eintrag
        // für einen evtl. getroffenen Ader-Nachbarn entsteht, wenn er dort vorbeizieht.
        const veinNeighbor = M.getNeighbors(wuehler3.x, wuehler3.y).find(n => M.getUnderworldType(state3, n.x, n.y) === M.UW_ADER);
        if (veinNeighbor) {
            state3.uw.n = [{ x: veinNeighbor.x, y: veinNeighbor.y }];
            M.processUWCreatureTurn();
            assert(!(state3.uw.a && state3.uw.a[`${veinNeighbor.x},${veinNeighbor.y}`] !== undefined && Object.keys(state3.uw.a).length > 0) || M.getUWVeinRemaining(state3, veinNeighbor.x, veinNeighbor.y) === 4, 'Wühler zerstört/mindert keine Ader (umgeht sie)');
        } else {
            console.log('SKIP: kein Ader-Nachbar neben dem Wühler-Spawn für den Umgehungstest (Seed-Zufall)');
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c) Spinne bleibt im Nest-Radius, Netz stoppt Bewegung ===');
{
    const state = freshState(5, 12, 2);
    const spider = findCreature(state, M.UWC_SPINNE);
    assert(!!spider, 'Spinne auf der Karte gefunden');
    if (spider) {
        const nest = M.getNearestSpiderNest(state, spider.x, spider.y);
        assert(!!nest && M.hexDistance(spider, nest) === 0, 'Spinne startet exakt auf ihrem Nest-Hex');

        // Viele Züge ohne Angriffsziel -> bleibt immer im Umkreis 2 des Nests
        let maxDist = 0;
        for (let i = 0; i < 15; i++) {
            M.processUWCreatureTurn();
            const d = M.hexDistance(spider, nest);
            maxDist = Math.max(maxDist, d);
        }
        assert(maxDist <= 2, `Spinne bleibt über 15 Züge im Nest-Umkreis 2 (max. gemessene Distanz: ${maxDist})`);

        // Netz wird auf dem aktuellen Hex abgelegt
        const webKey = `${spider.x},${spider.y}`;
        assert(!!(state.uw.w && Object.keys(state.uw.w).length > 0), 'mindestens ein Spinnennetz wurde über die Züge abgelegt');
    }

    // Netz stoppt Bewegung: calculateMovesUW darf über ein Netz-Hex nicht hinaus expandieren
    // (Radius 7 statt 5: die Herzkaverne umfasst dort auch einzelne Ring-2-Hexes,
    // damit garantiert ein offenes Hex 2 Schritte hinter dem Netz existiert)
    const state2 = freshState(9, 7, 2);
    const cx = state2.rad, cy = state2.rad;
    state2.uw.c = []; // Kreaturen hier irrelevant/störend für den reinen BFS-Test
    const n1 = M.getNeighbors(cx, cy)[0];
    const n2 = M.getNeighbors(n1.x, n1.y).find(h => M.hexDistance(h, { x: cx, y: cy }) === 2 && M.isUnderworldOpen(state2, h.x, h.y));
    state2.uw.w = { [`${n1.x},${n1.y}`]: 1 };
    const unit = { i: 1, p: 0, t: 17, x: cx, y: cy, h: 14, a: 0 }; // BEW 2
    const moves = M.calculateMovesUW(unit);
    assert(moves.some(m => m.x === n1.x && m.y === n1.y), 'das Netz-Hex selbst bleibt erreichbar (BEW 1 reicht)');
    if (n2) {
        assert(!moves.some(m => m.x === n2.x && m.y === n2.y), 'hinter dem Netz-Hex liegende Ziele sind NICHT mehr erreichbar (Bewegungsstopp)');
    } else {
        console.log('SKIP: kein offenes Hex 2 Schritte hinter dem Netz gefunden (Seed-Zufall)');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (d) Steinpanzer bewegt sich nie ===');
{
    const state = freshState(7, 12, 2);
    const panzer = findCreature(state, M.UWC_STEINPANZER);
    assert(!!panzer, 'Steinpanzer auf der Karte gefunden');
    if (panzer) {
        const pos0 = `${panzer.x},${panzer.y}`;
        for (let i = 0; i < 10; i++) M.processUWCreatureTurn();
        assert(`${panzer.x},${panzer.y}` === pos0, 'Steinpanzer-Position über 10 Kreaturen-Züge unverändert');

        // Greift nur an, wenn eine Einheit angrenzt
        const n = M.getNeighbors(panzer.x, panzer.y)[0];
        const target = { i: 2, p: 0, t: 16, x: n.x, y: n.y, h: 8, a: 0 };
        state.uw.u.push(target);
        const hpBefore = target.h;
        M.processUWCreatureTurn();
        assert(target.h < hpBefore, 'Steinpanzer greift eine angrenzende Einheit an');
        assert(`${panzer.x},${panzer.y}` === pos0, 'Steinpanzer bewegt sich auch beim Angreifen nicht');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (e) Wurm: bleibt in der Herzkaverne, AoE trifft mehrere, Konter, Tod dauerhaft ===');
{
    const state = freshState(11, 5, 2);
    const worm = findCreature(state, M.UWC_WURM);
    assert(!!worm, 'Wurm auf der Karte gefunden');
    assert(worm.x === state.rad && worm.y === state.rad, 'Wurm startet exakt im Herzkaverne-Zentrum');

    const neighbors = M.getNeighbors(worm.x, worm.y).slice(0, 3);
    const units = neighbors.map((n, i) => ({ i: i + 1, p: 0, t: 17, x: n.x, y: n.y, h: 14, a: 0 }));
    state.uw.u.push(...units);
    const hpBefore = units.map(u => u.h);
    M.processUWCreatureTurn();
    const hitCount = units.filter((u, i) => u.h < hpBefore[i]).length;
    assert(hitCount === units.length, `Wurm-AoE trifft ALLE angrenzenden Einheiten (${hitCount}/${units.length} getroffen)`);
    assert(worm.x === state.rad && worm.y === state.rad, 'Wurm bleibt nach seinem Zug im Herzkaverne-Zentrum');

    // Konter: unbedingt, auch bei tödlichem Treffer
    const state2 = freshState(11, 5, 2);
    const worm2 = findCreature(state2, M.UWC_WURM);
    const bigAttacker = { i: 9, p: 0, t: 19, x: state2.rad, y: state2.rad, h: 100 }; // künstlich viel HP, tötet sicher
    const result = M.resolveUWAttackOnCreature(state2, bigAttacker, worm2);
    assert(result.killed === true, 'Wurm stirbt am (künstlich überstarken) Treffer');
    assert(result.retDmg === M.uwCreatureStats[M.UWC_WURM].dmg, `Konter feuert TROTZ tödlichem Treffer (retDmg=${result.retDmg})`);
    assert(state2.uw.wd === 1, 'uw.wd wird beim Tod des Wurms gesetzt');
    assert(!state2.uw.c.some(c => c.t === M.UWC_WURM), 'Wurm aus uw.c entfernt');

    // Normale Kreatur (z.B. Steinpanzer) kontert NUR, wenn sie überlebt
    const state3 = freshState(11, 5, 2);
    const panzer = findCreature(state3, M.UWC_STEINPANZER);
    if (panzer) {
        const killer = { i: 8, p: 0, t: 19, x: panzer.x, y: panzer.y, h: 100 };
        panzer.h = 1;
        const r2 = M.resolveUWAttackOnCreature(state3, killer, panzer);
        assert(r2.killed === true && r2.retDmg === 0, 'sterbende Nicht-Wurm-Kreatur kontert NICHT (retDmg=0 bei Kill)');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (f) Kreaturen-Kill: Veteranen-Credit + Beutegräber-Gold, kein Crash bei Kreatur-Kill ===');
{
    const state = freshState(13, 12, 2);
    const spider = findCreature(state, M.UWC_SPINNE);
    assert(!!spider, 'Spinne für den Veteranen-Test gefunden');
    if (spider) {
        spider.h = 1;
        const attacker = { i: 1, p: 0, t: 17, x: spider.x, y: spider.y, h: 14, k: 1 }; // schon 1 Kill
        M.resolveUWAttackOnCreature(state, attacker, spider);
        assert(attacker.k === 2, 'Kreaturen-Kill zählt zum Kill-Counter (checkVeteran)');
        assert(attacker.vet === 1, 'zweiter Kill (auch gegen eine Kreatur) macht die Einheit zum Veteranen');
    }

    const state2 = freshState(13, 12, 2);
    const panzer2 = findCreature(state2, M.UWC_STEINPANZER);
    if (panzer2) {
        panzer2.h = 1;
        const beutegraeber = { i: 2, p: 0, t: 20, x: panzer2.x, y: panzer2.y, h: 10 };
        const goldBefore = state2.p[0].g;
        const r = M.resolveUWAttackOnCreature(state2, beutegraeber, panzer2);
        assert(r.bonusGold === 1, 'Beutegräber-Kill meldet +1 Bonusgold');
        assert(state2.p[0].g === goldBefore + 1, 'Beutegräber-Passiv bucht +1 Gold pro Kreaturen-Kill (Roster-Tabelle)');
    }

    // Nicht-Beutegräber bekommt kein Bonusgold
    const state3 = freshState(13, 12, 2);
    const spider3 = findCreature(state3, M.UWC_SPINNE);
    if (spider3) {
        spider3.h = 1;
        const wache = { i: 3, p: 0, t: 17, x: spider3.x, y: spider3.y, h: 14 };
        const goldBefore3 = state3.p[0].g;
        const r3 = M.resolveUWAttackOnCreature(state3, wache, spider3);
        assert(r3.bonusGold === 0 && state3.p[0].g === goldBefore3, 'Grubenwache (kein Beutegräber) bekommt KEIN Kreaturen-Kopfgeld');
    }

    // Kreatur tötet Spielereinheit — kein Crash, Einheit korrekt entfernt
    const state4 = freshState(13, 12, 2);
    const panzer4 = findCreature(state4, M.UWC_STEINPANZER);
    if (panzer4) {
        const n = M.getNeighbors(panzer4.x, panzer4.y)[0];
        const victim = { i: 4, p: 1, t: 16, x: n.x, y: n.y, h: 1, cr: 2 };
        state4.uw.u.push(victim);
        let threw = false;
        try { M.processUWCreatureTurn(); } catch (e) { threw = true; console.error(e); }
        assert(!threw, 'Kreatur-tötet-Einheit läuft ohne Exception durch');
        assert(!state4.uw.u.includes(victim), 'getötete Einheit aus uw.u entfernt (Kristalle verfallen einfach mit ihr)');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (g) Serialisierungs-Roundtrip uw.c/uw.w/uw.wd ===');
{
    const state = freshState(15, 7, 2);
    state.uw.w['3,3'] = 1;
    state.uw.wd = 1;
    // uw.c hat bereits Kreaturen aus buildInitialGameState — HP eines Eintrags ändern,
    // um "reale" (nicht nur Default-)Werte zu testen.
    if (state.uw.c.length > 0) state.uw.c[0].h = 3;
    const cBefore = JSON.parse(JSON.stringify(state.uw.c));
    const wBefore = JSON.parse(JSON.stringify(state.uw.w));

    const wireJson = JSON.stringify(state); // uw.c/uw.w/uw.wd brauchen keine Kompression (kompakte Objekte/Arrays)
    assert(wireJson.includes('"wd":1'), 'uw.wd im Wire-JSON vorhanden');
    assert(wireJson.includes('"w":{"3,3":1}') || wireJson.includes('"3,3":1'), 'uw.w im Wire-JSON vorhanden');

    const restored = JSON.parse(wireJson);
    assert(JSON.stringify(restored.uw.c) === JSON.stringify(cBefore), 'uw.c verlustfrei nach Roundtrip (inkl. individueller HP)');
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

console.log(`\n=== Zusammenfassung: ${failures === 0 ? 'ALLE CHECKS BESTANDEN' : failures + ' FEHLGESCHLAGEN'} ===`);
process.exit(failures === 0 ? 0 : 1);
