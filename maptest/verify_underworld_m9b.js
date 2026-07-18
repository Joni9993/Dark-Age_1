// Verifikationsskript M9b — lädt die echten Spiel-Skripte (Muster wie
// maptest/load_game.js / verify_underworld.js aus M9a), testet die DOM-freien
// Kernfunktionen: Bewegung (nur offene Hexes), Graben, Adernabbau + Abliefern,
// Serialisierungs-Roundtrip, Stollenkopf-Ableitung.
const fs = require('fs');
const path = require('path');
const ROOT = require('path').join(__dirname, '..');

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
            buildInitialGameState, createPRNG, isInsideMap, hexDistance, getNeighbors,
            getUnderworldType, isUnderworldOpen, getUWVeinRemaining, getStollenkopfOwner,
            getUnderworldTunnelHeads, isUnderworldTunnelHead,
            UW_FELS, UW_KAVERNE, UW_ADER, UW_RUINE, UW_HERZ,
            calculateMovesUW, calculateDigsUW, calculateMineTargetsUW, uwUnitAt,
            digUWHex, mineUWVein, deliverUWCrystals, ascendUWUnit, descendUWUnit, buyUWUnitAt,
            getUnitMaxHp, getUnitCost, getUnitMove, unitStats
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

// gameState global setzen (getNeighbors/calculateMovesUW etc. lesen ambient global,
// gleiches Muster wie die restliche Spiellogik — siehe hex.js/logic.js)
function useState(state) { global.gameState = state; }

function freshState(seed = 1, radius = 5, playerCount = 2) {
    const names = Array.from({ length: playerCount }, (_, i) => `P${i}`);
    const rng = M.createPRNG(seed);
    const origRandom = Math.random;
    Math.random = rng;
    let state;
    try { state = M.buildInitialGameState(names, radius); } finally { Math.random = origRandom; }
    useState(state);
    return state;
}

// ─────────────────────────────────────────────────────────────────────────
console.log('=== (a) calculateMovesUW bewegt nur über offene Hexes ===');
{
    const state = freshState(7, 5, 2);
    const cx = state.rad, cy = state.rad; // Herzkaverne-Zentrum, immer offen
    // Seit M11 bewacht der Alte Wurm das Herzkaverne-Zentrum und blockiert es wie
    // eine Einheit (gewolltes Design) — für diesen reinen Bewegungs/Offenheits-
    // Test (M9b-Belang) hier entfernt, damit "Zentrum erreichbar" unverfälscht
    // die BFS-Reichweite prüft, nicht die M11-Kreaturen-Blockade.
    state.uw.c = [];
    // Stollenkopf künstlich neben dem Zentrum anlegen (Tunnel-Endpunkt), damit
    // der Test unabhängig von zufälliger Ader/Kaverne-Platzierung ist.
    const heartNeighbors = M.getNeighbors(cx, cy);
    const startHex = heartNeighbors[0];
    state.tu = [{ x1: startHex.x, y1: startHex.y, x2: 0, y2: 0, o: 0, h: 13, r: state.rn }];
    const unit = { i: 1, p: 0, t: 7, x: startHex.x, y: startHex.y, h: 8, a: 0 };
    state.uw.u.push(unit);

    const moves = M.calculateMovesUW(unit);
    assert(moves.length > 0, 'findet mindestens ein Bewegungsziel (Stollenkopf -> Herzkaverne)');
    assert(moves.every(m => M.isUnderworldOpen(state, m.x, m.y)), 'JEDES gefundene Bewegungsziel ist offen (isUnderworldOpen)');
    assert(moves.some(m => m.x === cx && m.y === cy), 'Herzkaverne-Zentrum ist unter den Zielen (BEW 1 reicht bis dahin)');

    // Gegenprobe: ein garantiert massives Fels-Hex weit weg vom offenen Netz
    // darf NIEMALS als Bewegungsziel auftauchen.
    let felsHex = null;
    outer:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (!M.isInsideMap(state, x, y)) continue;
        if (M.getUnderworldType(state, x, y) === M.UW_FELS && !M.isUnderworldOpen(state, x, y) &&
            M.hexDistance({ x, y }, { x: cx, y: cy }) > 3) { felsHex = { x, y }; break outer; }
    }
    assert(felsHex && !moves.some(m => m.x === felsHex.x && m.y === felsHex.y), 'entferntes, ungegrabenes Fels-Hex ist NICHT erreichbar');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (b) Graben öffnet genau das Ziel-Hex und erzeugt Lärm ===');
{
    const state = freshState(7, 5, 2);
    const cx = state.rad, cy = state.rad;
    const start = M.getNeighbors(cx, cy)[0];
    const unit = { i: 1, p: 0, t: 7, x: start.x, y: start.y, h: 8, a: 0 };
    state.uw.u.push(unit);

    // Ziel: ein FELS-Nachbar des Startpunkts
    const digTargets = M.calculateDigsUW ? M.calculateDigsUW(unit) : [];
    let target = digTargets[0];
    if (!target) {
        // Fallback, falls der zufällige Startpunkt zufällig nur offene Nachbarn hat
        target = M.getNeighbors(start.x, start.y).find(n => M.getUnderworldType(state, n.x, n.y) === M.UW_FELS && !M.isUnderworldOpen(state, n.x, n.y));
    }
    assert(!!target, 'mindestens ein FELS-Grabziel neben dem Startpunkt gefunden');
    if (target) {
        assert(!M.isUnderworldOpen(state, target.x, target.y), 'Ziel-Hex ist VOR dem Graben noch massiv');
        M.digUWHex(state, unit, target.x, target.y);
        assert(M.isUnderworldOpen(state, target.x, target.y), 'Ziel-Hex ist NACH dem Graben offen');
        assert(unit.x === target.x && unit.y === target.y, 'Einheit ist ins gegrabene Hex nachgerückt ("durchgefressen")');
        assert(unit.a === 1, 'Aktion verbraucht (a=1)');
        const idx = target.y * state.bw + target.x;
        assert(state.uw.d.includes(idx), 'Ziel-Index steht in uw.d');
        // Nachbar-Hexes, die NICHT gegraben wurden, bleiben unverändert offen/massiv
        const untouched = M.getNeighbors(start.x, start.y).filter(n => !(n.x === target.x && n.y === target.y));
        const stillConsistent = untouched.every(n => M.isUnderworldOpen(state, n.x, n.y) === (M.getUnderworldType(state, n.x, n.y) !== M.UW_FELS || M.isUnderworldTunnelHead(state, n.x, n.y)));
        assert(stillConsistent, 'NUR das Ziel-Hex wurde geöffnet, alle anderen Nachbarn unverändert');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c) Ader-Abbau 4x -> Hex offen, cr korrekt, Abliefern bucht auf p[].k ===');
{
    const state = freshState(3, 12, 2); // großzügige Karte -> genug Adern zum Testen
    // Erste Ader-Hex suchen (unabhängig von Position, reiner Logik-Test)
    let aderHex = null;
    outer2:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (M.isInsideMap(state, x, y) && M.getUnderworldType(state, x, y) === M.UW_ADER) { aderHex = { x, y }; break outer2; }
    }
    assert(!!aderHex, 'mindestens eine Kristallader auf der Karte gefunden (R12)');
    if (aderHex) {
        const unit = { i: 1, p: 0, t: 7, x: aderHex.x, y: aderHex.y, h: 8, a: 0 };
        assert(M.getUWVeinRemaining(state, aderHex.x, aderHex.y) === 4, 'Ader startet mit vollem Bestand (4)');

        let remaining;
        for (let i = 0; i < 4; i++) {
            remaining = M.mineUWVein(state, unit, aderHex.x, aderHex.y);
        }
        assert(remaining === 0, 'nach 4 Abbauten ist der Restbestand 0');
        assert(M.isUnderworldOpen(state, aderHex.x, aderHex.y), 'Ader-Hex ist nach Erschöpfung dauerhaft offen (in uw.d)');
        assert(!state.uw.a[`${aderHex.x},${aderHex.y}`], 'uw.a-Eintrag wurde beim Erschöpfen gelöscht');
        assert(unit.cr === 3, `getragene Kristalle bei max. 3 gedeckelt (gemessen: ${unit.cr})`);

        const before = state.p[0].k || 0;
        const delivered = M.deliverUWCrystals(state, 0, unit);
        assert(delivered === 3, 'Abliefern gibt die getragene Menge zurück');
        assert(state.p[0].k === before + 3, 'p[0].k um die gelieferte Menge erhöht');
        assert(unit.cr === 0, 'Träger ist nach dem Abliefern leer');
    }

    // Zweite Ader separat: exakter Verlauf 4 -> 3 -> 2 -> 1 -> 0
    let aderHex2 = null;
    outer3:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (M.isInsideMap(state, x, y) && M.getUnderworldType(state, x, y) === M.UW_ADER && !(aderHex && x === aderHex.x && y === aderHex.y)) { aderHex2 = { x, y }; break outer3; }
    }
    if (aderHex2) {
        const unit2 = { i: 2, p: 1, t: 7, x: aderHex2.x, y: aderHex2.y, h: 8, a: 0 };
        const sequence = [];
        for (let i = 0; i < 4; i++) sequence.push(M.mineUWVein(state, unit2, aderHex2.x, aderHex2.y));
        assert(JSON.stringify(sequence) === JSON.stringify([3, 2, 1, 0]), `Restbestand-Sequenz exakt 4->3->2->1->0 (gemessen: ${sequence.join(',')})`);
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (d) Serialisierungs-Roundtrip: uw.u/uw.d/p[].k/p[].ue verlustfrei, Defaults entfernt ===');
{
    const state = freshState(11, 7, 3);
    // Unterwelt-Zustand künstlich befüllen
    state.uw.u.push({ i: 1, p: 0, t: 7, x: 3, y: 3, h: 8, a: 0, cr: 2, vet: 1 });
    state.uw.d.push(5, 12, 40);
    state.uw.a['9,9'] = 2;
    state.p[0].k = 7;
    state.p[0].ue = [1, 2, 3, 100];

    // Simuliert exakt die 3 Sync-Stellen-Reihenfolge (compress -> stringify ->
    // decompress), ohne die DOM-gebundenen Teile von doEndTurn/confirmSurrender
    // nachzubauen — reine Serialisierungslogik.
    const compressFog = M.createPRNG ? require(path.join(ROOT, 'js/prng.js')) : null; // nicht genutzt, siehe unten
    // compressFog/decompressFog direkt aus prng.js laden (im obigen Function-Scope
    // eingebettet, hier zusätzlich isoliert für den Roundtrip-Test)
    const prngSrc = fs.readFileSync(path.join(ROOT, 'js/prng.js'), 'utf8');
    const { compressFog: cf, decompressFog: df } = new Function(prngSrc + '; return { compressFog, decompressFog };')();

    const snapshotBefore = JSON.parse(JSON.stringify(state.uw));
    const kBefore = state.p[0].k;
    const ueBefore = [...state.p[0].ue];

    // --- Cleanup-Block (Muster aus doEndTurn/confirmSurrender) ---
    state.p.forEach(p => {
        if (Array.isArray(p.ue)) p.ue = cf(p.ue);
    });
    if (state.uw) {
        (state.uw.u || []).forEach(u => { if (u.a === 0) delete u.a; delete u.i; });
        if (Array.isArray(state.uw.d)) state.uw.d = cf(state.uw.d);
        if (state.uw.n && state.uw.n.length === 0) delete state.uw.n;
        if (state.uw.a && Object.keys(state.uw.a).length === 0) delete state.uw.a;
    }
    const wireJson = JSON.stringify(state);
    assert(typeof state.uw.d === 'string', 'uw.d liegt vor dem Encode als komprimierter String vor');
    assert(typeof state.p[0].ue === 'string', 'p[0].ue liegt vor dem Encode als komprimierter String vor');

    // --- Restore-Block (Muster aus bootGame) ---
    const restored = JSON.parse(wireJson);
    restored.p.forEach(p => { if (typeof p.ue === 'string') p.ue = df(p.ue); if (!p.ue) p.ue = []; });
    if (!restored.uw) restored.uw = { d: [], u: [], n: [], a: {} };
    if (typeof restored.uw.d === 'string') restored.uw.d = df(restored.uw.d);
    if (!restored.uw.u) restored.uw.u = [];
    if (!restored.uw.n) restored.uw.n = [];
    if (!restored.uw.a) restored.uw.a = {};
    restored.uw.u.forEach((u, idx) => { if (u.a === undefined) u.a = 0; if (!u.i) u.i = idx + 1; });

    assert(restored.p[0].k === kBefore, `p[0].k verlustfrei (${restored.p[0].k} === ${kBefore})`);
    assert(JSON.stringify([...restored.p[0].ue].sort((a,b)=>a-b)) === JSON.stringify([...ueBefore].sort((a,b)=>a-b)), 'p[0].ue verlustfrei (Indizes identisch nach Roundtrip)');
    assert(JSON.stringify([...restored.uw.d].sort((a,b)=>a-b)) === JSON.stringify([...snapshotBefore.d].sort((a,b)=>a-b)), 'uw.d verlustfrei (Indizes identisch nach Roundtrip)');
    assert(restored.uw.a['9,9'] === 2, 'uw.a-Eintrag verlustfrei');
    assert(restored.uw.u.length === 1 && restored.uw.u[0].cr === 2 && restored.uw.u[0].vet === 1, 'uw.u-Einheit inkl. cr/vet verlustfrei');
    assert(restored.uw.u[0].a === 0, 'a=0-Default nach Restore korrekt wiederhergestellt (war vor dem Encode gelöscht)');
    assert(restored.uw.u[0].i === 1, 'uw.u-Einheit hat nach Restore wieder eine i-ID');

    // Default-Entfernung: ein komplett unberührter Unterwelt-Zustand darf beim
    // Encode nicht (oder nur minimal) zu Buche schlagen.
    const emptyState = freshState(99, 5, 2);
    if (!emptyState.uw.d && (!emptyState.uw.u || emptyState.uw.u.length === 0) && !emptyState.uw.n && !emptyState.uw.a) { /* n/a hier schon leer */ }
    if (Array.isArray(emptyState.uw.d)) emptyState.uw.d = cf(emptyState.uw.d);
    if (emptyState.uw.n && emptyState.uw.n.length === 0) delete emptyState.uw.n;
    if (emptyState.uw.a && Object.keys(emptyState.uw.a).length === 0) delete emptyState.uw.a;
    if (!emptyState.uw.d && (!emptyState.uw.u || emptyState.uw.u.length === 0) && !emptyState.uw.n && !emptyState.uw.a) delete emptyState.uw;
    assert(emptyState.uw === undefined, 'unberührter Unterwelt-Zustand wird beim Encode komplett weggelassen (Blob-Ersparnis)');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (e) Stollenkopf-Ableitung: Tunnel bauen -> Hex darunter offen + kaufbar, Tunnel zerstört -> zu ===');
{
    const state = freshState(5, 7, 2);
    const targetHex = { x: 3, y: 3 };
    assert(M.getStollenkopfOwner(state, targetHex.x, targetHex.y) === -1, 'ohne Tunnel: kein Stollenkopf');

    state.tu = [{ x1: targetHex.x, y1: targetHex.y, x2: 0, y2: 0, o: 1, h: 13, r: state.rn }]; // r <= rn: nutzbar
    assert(M.getStollenkopfOwner(state, targetHex.x, targetHex.y) === 1, 'nutzbarer Tunnel-Endpunkt -> Stollenkopf des Besitzers (1)');
    assert(M.isUnderworldOpen(state, targetHex.x, targetHex.y) === true, 'Stollenkopf-Hex ist offen, unabhängig vom Terrain-Typ');
    // Regression (Juli 2026): NUR der Tunnel-STARTPUNKT (x1,y1) wird zum
    // Stollenkopf, NICHT der frei wählbare Zielpunkt (x2,y2) — sonst könnten
    // Spieler ihren zweiten Tunnel-Ausgang direkt in die Herzkaverne legen und
    // hätten ungegraben freien Zugang zum Wurm/Sieg-Ort.
    assert(M.getStollenkopfOwner(state, 0, 0) === -1, 'Tunnel-ZIELPUNKT (x2,y2) ist KEIN Stollenkopf');
    assert(M.isUnderworldOpen(state, 0, 0) === (M.getUnderworldType(state, 0, 0) !== M.UW_FELS), 'Tunnel-Zielpunkt ist nicht künstlich offen (nur natürlicher Terrain-Typ zählt)');

    // Kaufbarkeit: buyUWUnitAt darf am Stollenkopf funktionieren — Typ 17
    // (Grubenwache). Es gibt seit Juli 2026 KEINEN eigenen Tunnelgräber-Typ
    // mehr, der hier alternativ testbar wäre (siehe Regression-Block unten).
    const beforeGold = state.p[1].g;
    const unit = M.buyUWUnitAt(state, 1, targetHex.x, targetHex.y, 17);
    assert(unit.t === 17 && unit.x === targetHex.x && unit.y === targetHex.y, 'Grubenwache wird korrekt am Stollenkopf angelegt');
    assert(state.p[1].g === beforeGold - M.getUnitCost(state.p[1], 17), 'Gold wurde um die Einheitenkosten reduziert');

    // Regression (Juli 2026, Jonathan: "es soll einfach nur der Arbeiter sein"):
    // der Arbeiter (7) ist die einzige Brücke zwischen Oberfläche und Unterwelt —
    // rekrutiert oben im Dorf, taucht an seinem eigenen Tunnel-Startpunkt ab
    // (uwDescend). Es gibt KEINEN separaten Unterwelt-Einheitstyp dafür mehr:
    // unitStats[16] existiert nicht mehr, der Arbeiter selbst trägt bewusst
    // kein `isUW` (er lebt genauso oben wie unten). 17-22 bleiben isUW-markiert
    // und ausschließlich am Stollenkopf kaufbar.
    assert(M.unitStats[16] === undefined, 'Es gibt keinen eigenen Tunnelgräber-Typ (16) mehr');
    assert(!M.unitStats[7].isUW, 'Arbeiter (7) ist keine Unterwelt-exklusive Einheit (lebt auf beiden Ebenen)');
    assert(M.unitStats[17].isUW && M.unitStats[18].isUW, 'Grubenwache/Sprengmeister bleiben am Stollenkopf kaufbar (isUW)');

    // Tunnel im Bau (r > rn): NICHT nutzbar/offen
    state.tu = [{ x1: targetHex.x, y1: targetHex.y, x2: 0, y2: 0, o: 1, h: 13, r: state.rn + 1 }];
    assert(M.getStollenkopfOwner(state, targetHex.x, targetHex.y) === -1, 'Tunnel im Bau (r > rn) ist noch KEIN Stollenkopf');

    // Tunnel zerstört (entfernt) -> Hex wieder zu (sofern nicht natürlich offen/gegraben)
    const wasFels = M.getUnderworldType(state, targetHex.x, targetHex.y) === M.UW_FELS;
    state.tu = [];
    if (wasFels) {
        assert(M.isUnderworldOpen(state, targetHex.x, targetHex.y) === false, 'nach Tunnel-Zerstörung: Fels-Hex wieder massiv (kein Stollenkopf mehr, nicht gegraben)');
    } else {
        console.log(`SKIP: Ziel-Hex ist von Natur aus offen (Typ ${M.getUnderworldType(state, targetHex.x, targetHex.y)}) — Offenheits-Rückgang nicht separat testbar an dieser Stelle`);
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (f) Tunnelgräber als einzige Brücke: Rekrutierung oben -> Abtauchen am Startpunkt -> Aufsteigen (Juli 2026) ===');
{
    const state = freshState(6, 7, 2);
    const startX = 3, startY = 3, zielX = 10, zielY = 10;
    state.tu = [{ x1: startX, y1: startY, x2: zielX, y2: zielY, o: 0, h: 13, r: state.rn }];

    // Arbeiter wird OBEN am Tunnel-Startpunkt rekrutiert (Muster: buyUnit im
    // Dorf) — ganz normale Bodeneinheit, kein Fraktions-Lock, bis zum Abtauchen.
    const surfaceUnit = { i: 1, p: 0, t: 7, x: startX, y: startY, h: M.getUnitMaxHp(state.p[0], 7), a: 0 };
    state.u = [surfaceUnit];
    assert(M.getUnitCost(state.p[0], 7) === 2, 'Arbeiter kostet 2 Gold wie im normalen Dorf-Rekrutierungsmenü');

    // Abtauchen (uwDescend, js/abilities.js) NUR am eigenen Tunnel-Startpunkt —
    // die reine Zustandsänderung, die die Aktion ausführt.
    const digger = M.descendUWUnit(state, surfaceUnit);
    assert(state.u.length === 0, 'Arbeiter verschwindet von der Oberfläche');
    assert(state.uw.u.length === 1 && state.uw.u[0] === digger, 'Arbeiter taucht in uw.u auf');
    assert(digger.t === 7 && digger.x === startX && digger.y === startY, 'Typ (7, KEIN Umwandeln!) und Position bleiben beim Abtauchen erhalten');

    // Aufsteigen (uwAscend) wieder zurück an die Oberfläche, am selben Stollenkopf.
    const backUp = M.ascendUWUnit(state, digger);
    assert(state.uw.u.length === 0, 'Arbeiter verschwindet aus der Unterwelt');
    assert(state.u.length === 1 && state.u[0] === backUp, 'Arbeiter taucht wieder in u[] auf');
    assert(backUp.t === 7 && backUp.x === startX && backUp.y === startY, 'Typ und Position bleiben beim Rückweg erhalten');

    // Regression: der Tunnel-ZIELPUNKT (x2,y2) ist kein Stollenkopf — ein dort
    // stehender Tunnelgräber dürfte laut UI (input.js) gar nicht erst abtauchen
    // (siehe getUnderworldTunnelHeads-Kommentar, js/hex.js); hier nur die
    // Stollenkopf-Grundlage dafür gegengeprüft.
    assert(!M.isUnderworldTunnelHead(state, zielX, zielY), 'Tunnel-Zielpunkt bietet keinen Stollenkopf zum Abtauchen');
}

console.log(`\n=== Zusammenfassung: ${failures === 0 ? 'ALLE CHECKS BESTANDEN' : failures + ' FEHLGESCHLAGEN'} ===`);
process.exit(failures === 0 ? 0 : 1);
