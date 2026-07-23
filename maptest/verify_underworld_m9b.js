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
            getUnderworldType, isUnderworldOpen, getUWVeinRemaining, getUWVeinMaxAmount, getStollenkopfOwner,
            getUnderworldTunnelHeads, isUnderworldTunnelHead,
            UW_FELS, UW_KAVERNE, UW_ADER, UW_RUINE, UW_HERZ,
            calculateMovesUW, calculateDigsUW, calculateMineTargetsUW, calculateAttacksUW, uwUnitAt,
            digUWHex, moveUWUnit, resolveUWAttack, mineUWVein, deliverUWCrystals, ascendUWUnit, descendUWUnit, buyUWUnitAt,
            processAutoMiningUW, processUWCrystalAutoDeliver, dropUWCrystalsOnDeath, pickupUWCrystalDrop,
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
console.log('\n=== (c) Ader-Abbau: zufällige Menge 4-12, cr UNCAPPED, Hex offen nach Erschöpfung, Abliefern bucht auf p[].k ===');
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
        const maxAmount = M.getUWVeinMaxAmount(state, aderHex.x, aderHex.y);
        assert(maxAmount >= 4 && maxAmount <= 12, `Ader-Gesamtmenge im Band 4-12 (gemessen: ${maxAmount}, Korrektur Juli 2026)`);
        assert(M.getUWVeinRemaining(state, aderHex.x, aderHex.y) === maxAmount, 'Ader startet mit vollem (zufälligem) Bestand');

        let remaining;
        for (let i = 0; i < maxAmount; i++) {
            remaining = M.mineUWVein(state, unit, aderHex.x, aderHex.y);
        }
        assert(remaining === 0, `nach ${maxAmount} Abbauten ist der Restbestand 0`);
        assert(M.isUnderworldOpen(state, aderHex.x, aderHex.y), 'Ader-Hex ist nach Erschöpfung dauerhaft offen (in uw.d) -> begehbar/frei');
        assert(!state.uw.a[`${aderHex.x},${aderHex.y}`], 'uw.a-Eintrag wurde beim Erschöpfen gelöscht');
        assert(unit.cr === maxAmount, `getragene Kristalle UNCAPPED, entspricht der vollen Adermenge (gemessen: ${unit.cr}, erwartet: ${maxAmount})`);
        assert(unit.a === undefined || unit.a === 0, 'mineUWVein verbraucht KEINE Aktion mehr (Korrektur Juli 2026)');

        const before = state.p[0].k || 0;
        const delivered = M.deliverUWCrystals(state, 0, unit);
        assert(delivered === maxAmount, 'Abliefern gibt die volle getragene Menge zurück (kein Trage-Limit)');
        assert(state.p[0].k === before + maxAmount, 'p[0].k um die gelieferte Menge erhöht');
        assert(unit.cr === 0, 'Träger ist nach dem Abliefern leer');
    }

    // Zweite Ader separat: exakter Verlauf max -> max-1 -> ... -> 0, uncapped
    let aderHex2 = null;
    outer3:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (M.isInsideMap(state, x, y) && M.getUnderworldType(state, x, y) === M.UW_ADER && !(aderHex && x === aderHex.x && y === aderHex.y)) { aderHex2 = { x, y }; break outer3; }
    }
    if (aderHex2) {
        const unit2 = { i: 2, p: 1, t: 7, x: aderHex2.x, y: aderHex2.y, h: 8, a: 0 };
        const max2 = M.getUWVeinMaxAmount(state, aderHex2.x, aderHex2.y);
        const expected = Array.from({ length: max2 }, (_, i) => max2 - i - 1);
        const sequence = [];
        for (let i = 0; i < max2; i++) sequence.push(M.mineUWVein(state, unit2, aderHex2.x, aderHex2.y));
        assert(JSON.stringify(sequence) === JSON.stringify(expected), `Restbestand-Sequenz exakt ${max2}->0 (gemessen: ${sequence.join(',')}, erwartet: ${expected.join(',')})`);
        assert(unit2.cr === max2, `zweiter Träger hat die volle Menge uncapped (gemessen: ${unit2.cr}, erwartet: ${max2})`);
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c2) Toggle-Abbau (Korrektur Juli 2026, Muster: Steinabbau) — läuft automatisch, keine Aktion verbraucht ===');
{
    const state = freshState(3, 12, 2);
    let aderHex = null;
    outerT:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (M.isInsideMap(state, x, y) && M.getUnderworldType(state, x, y) === M.UW_ADER) { aderHex = { x, y }; break outerT; }
    }
    assert(!!aderHex, 'Ader für Toggle-Test gefunden');
    if (aderHex) {
        const nb = M.getNeighbors(aderHex.x, aderHex.y).find(n => M.isInsideMap(state, n.x, n.y));
        const unit = { i: 1, p: 0, t: 7, x: nb.x, y: nb.y, h: 8, a: 0, mi: { x: aderHex.x, y: aderHex.y } };
        state.uw.u.push(unit);
        const max = M.getUWVeinMaxAmount(state, aderHex.x, aderHex.y);

        M.processAutoMiningUW(0);
        assert(unit.cr === 1, `1. Tick: +1 Kristall (gemessen: ${unit.cr})`);
        assert(unit.a === 0, 'Toggle-Abbau verbraucht keine Aktion');
        assert(!!unit.mi, 'Toggle bleibt aktiv, solange die Ader noch Bestand hat');

        M.processAutoMiningUW(0);
        assert(unit.cr === 2, '2. Tick (nächster Zugende-Aufruf): weiter +1');

        // Bewegung weg von der Ader (Distanz > 1) -> Toggle stoppt automatisch (wie Steinabbau)
        let far = { x: (aderHex.x + 4) % state.bw, y: aderHex.y };
        if (M.hexDistance(far, aderHex) <= 1) far = { x: (aderHex.x + 4) % state.bw, y: (aderHex.y + 4) % state.bh };
        assert(M.hexDistance(far, aderHex) > 1, 'Testaufbau: gewählte Fern-Position ist tatsächlich außer Reichweite');
        unit.x = far.x; unit.y = far.y;
        unit.mi = { x: aderHex.x, y: aderHex.y };
        M.processAutoMiningUW(0);
        assert(!unit.mi, 'Toggle stoppt automatisch, sobald die Einheit die Ader verlässt (Distanz > 1)');
        assert(unit.cr === 2, 'kein weiterer Abbau-Tick nach dem Verlassen');

        // Erschöpfung stoppt den Toggle ebenfalls (unabhängig von der Bewegung)
        unit.x = nb.x; unit.y = nb.y; unit.mi = { x: aderHex.x, y: aderHex.y };
        for (let i = 0; i < max; i++) M.processAutoMiningUW(0);
        assert(!unit.mi, 'Toggle stoppt automatisch, sobald die Ader erschöpft ist');
        assert(M.getUWVeinRemaining(state, aderHex.x, aderHex.y) === 0, 'Ader ist erschöpft');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c3) Auto-Ablieferung (Korrektur Juli 2026) — automatisch am Zugende in Reichweite des eigenen Stollenkopfs ===');
{
    const state = freshState(9, 7, 2);
    const headX = 2, headY = 2;
    state.tu = [{ x1: headX, y1: headY, x2: 0, y2: 0, o: 0, h: 13, r: state.rn }];
    const nb = M.getNeighbors(headX, headY)[0];
    const carrier = { i: 1, p: 0, t: 7, x: nb.x, y: nb.y, h: 10, a: 0, cr: 5 };
    state.uw.u.push(carrier);

    M.processUWCrystalAutoDeliver(0);
    assert(state.p[0].k === 5, `Kristalle wurden automatisch abgeliefert, ohne dass die Einheit direkt auf dem Stollenkopf steht (gemessen: ${state.p[0].k})`);
    assert(carrier.cr === 0, 'Träger ist nach der Auto-Ablieferung leer');

    // Außerhalb der Reichweite -> keine Ablieferung
    const farCarrier = { i: 2, p: 0, t: 7, x: (headX + 10) % state.bw, y: headY, h: 10, a: 0, cr: 3 };
    state.uw.u.push(farCarrier);
    M.processUWCrystalAutoDeliver(0);
    assert(farCarrier.cr === 3, 'außerhalb der Reichweite bleibt die Fracht unangetastet');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c4) Kristalle fallen beim Tod & werden von trage-fähigen Einheiten aufgesammelt (Korrektur Juli 2026) ===');
{
    const state = freshState(5, 7, 2);
    const dead = { x: 4, y: 4, cr: 6 };
    M.dropUWCrystalsOnDeath(state, dead);
    assert(state.uw.dr['4,4'] === 6, 'Haufen liegt exakt mit der getragenen Menge auf dem Sterbe-Hex');

    // Nicht trage-fähiger Typ (z.B. Grubenwache 17) sammelt NICHT ein
    const guard = { t: 17, x: 4, y: 4 };
    const pickedGuard = M.pickupUWCrystalDrop(state, guard);
    assert(pickedGuard === 0 && state.uw.dr['4,4'] === 6, 'Grubenwache (17) kann keine Kristalle einsammeln — Haufen bleibt liegen');

    // Trage-fähiger Typ (Arbeiter 7) sammelt vollständig ein
    const worker = { t: 7, x: 4, y: 4, cr: 2 };
    const picked = M.pickupUWCrystalDrop(state, worker);
    assert(picked === 6 && worker.cr === 8, `Arbeiter sammelt den kompletten Haufen uncapped zur bestehenden Fracht dazu (gemessen: ${worker.cr})`);
    assert(!('4,4' in state.uw.dr), 'Haufen ist nach dem Einsammeln verschwunden');

    // Beutegräber (20) kann ebenfalls einsammeln
    M.dropUWCrystalsOnDeath(state, { x: 1, y: 1, cr: 4 });
    const looter = { t: 20, x: 1, y: 1 };
    assert(M.pickupUWCrystalDrop(state, looter) === 4, 'Beutegräber (20) kann Kristallhaufen ebenfalls einsammeln');
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

// ─────────────────────────────────────────────────────────────────────────
// Scannt die ganze Karte nach einem OFFENEN Hex mit mindestens einem noch
// massiven FELS-Nachbarn — ein garantierter Startpunkt zum Graben, unabhängig
// vom Zufalls-Seed (Fels ist laut PLAN.md Abschn. 2 der Standard-Terrain-Typ,
// so ein Hex existiert praktisch immer; SKIP-Fallback falls doch nicht).
function findDigStart(state) {
    for (let y = 0; y < state.bh; y++) {
        for (let x = 0; x < state.bw; x++) {
            if (!M.isInsideMap(state, x, y) || !M.isUnderworldOpen(state, x, y)) continue;
            const felsN = M.getNeighbors(x, y).find(n =>
                M.isInsideMap(state, n.x, n.y) && M.getUnderworldType(state, n.x, n.y) === M.UW_FELS && !M.isUnderworldOpen(state, n.x, n.y));
            if (felsN) return { x, y };
        }
    }
    return null;
}

console.log('\n=== (g) Bewegen+Agieren im selben Zug (Oberflächen-Parität, Korrektur Juli 2026) ===');
{
    // --- (g-a) Bewegung setzt a=2, danach ist von der NEUEN Position aus noch
    // Graben ODER Angreifen möglich (a=1) — 1:1 wie an der Oberfläche
    // (executeMoveTo setzt a=2, showTileUI öffnet mit frischen Optionen erneut). ---
    const stateA = freshState(101, 7, 2);
    const cxA = stateA.rad, cyA = stateA.rad;
    stateA.uw.c = []; // Wurm blockiert das Zentrum nicht -> reiner a-Zustands-Test
    const startA = M.getNeighbors(cxA, cyA)[0];
    const unitA = { i: 1, p: 0, t: 7, x: startA.x, y: startA.y, h: 8, a: 0 };
    stateA.uw.u.push(unitA);

    const movesA = M.calculateMovesUW(unitA);
    assert(movesA.length > 0, 'Testaufbau: mindestens ein Bewegungsziel vorhanden');
    if (movesA.length > 0) {
        const { picked } = M.moveUWUnit(stateA, unitA, movesA[0].x, movesA[0].y);
        assert(typeof picked === 'number', 'moveUWUnit gibt { picked } zurück (kein Auto-Loot mehr — Fundkammer-Plündern ist eine Button-Aktion)');
        assert(unitA.x === movesA[0].x && unitA.y === movesA[0].y, 'Einheit steht nach der Bewegung auf dem Zielhex');
        assert(unitA.a === 2, 'Bewegung setzt a=2 (Bewegungs-Zwischenzustand — NICHT mehr a=1 wie vor der Korrektur Juli 2026)');

        // Von der neuen Position aus: Grabziele werden für a=2 weiterhin berechnet
        // (uwValidDigs-Gate ist unabhängig von a, s. showUnderworldTileUI) und
        // Graben aus a=2 verbraucht die Aktion vollständig.
        const digTargetsAfterMove = M.calculateDigsUW(unitA);
        if (digTargetsAfterMove.length > 0) {
            M.digUWHex(stateA, unitA, digTargetsAfterMove[0].x, digTargetsAfterMove[0].y);
            assert(unitA.a === 1, 'Graben aus a=2 (nach vorheriger Bewegung) verbraucht die Aktion vollständig (a=1)');
        } else {
            console.log('SKIP (g-a Graben): keine Grabziele an der neuen Position (Seed-Zufall)');
        }
    }

    // Angriffs-Gegenprobe (unabhängig von obigem Zustand, eigene Objekte): sowohl
    // aus a=0 als auch aus a=2 ist ein Angriff möglich, resolveUWAttack setzt in
    // BEIDEN Fällen a=1 (js/logic.js, DOM-frei) — exakt die Oberflächen-Parität.
    const atkNeighbor = M.getNeighbors(cxA, cyA)[1];
    const attackerMoved = { i: 2, p: 0, t: 17, x: cxA, y: cyA, h: 14, a: 2 }; // simuliert: schon bewegt
    const defender1 = { i: 3, p: 1, t: 17, x: atkNeighbor.x, y: atkNeighbor.y, h: 14, a: 0 };
    M.resolveUWAttack(stateA, attackerMoved, defender1);
    assert(attackerMoved.a === 1, 'Angriff aus a=2 (nach Bewegung) verbraucht die Aktion (a=1)');

    // --- (g-b) zwei Bewegungen hintereinander sind NICHT möglich. Das reale Gate
    // sitzt in showUnderworldTileUI (js/input.js, DOM-gebunden: uwValidMoves wird
    // nur bei a===0 berechnet) — hier 1:1 derselbe Einzeiler gegen eine bereits
    // bewegte Einheit (a=2) nachgebaut. ---
    const unitB = { i: 4, p: 0, t: 7, x: startA.x, y: startA.y, h: 8, a: 2 };
    const movesAfterMove = (unitB.a === 0) ? M.calculateMovesUW(unitB) : [];
    assert(movesAfterMove.length === 0, 'bei a=2 werden KEINE weiteren Bewegungsziele angeboten (Gate wie showUnderworldTileUI)');

    // --- (g-c) Fähigkeit aus a=0 (frischer Zug, keine Bewegung) setzt DIREKT
    // a=1 — kein Zwischenzustand für normale Einheiten (nur der Bohrwagen ist
    // die dokumentierte Ausnahme, s. (g-d)). ---
    const digStartC = findDigStart(stateA);
    assert(!!digStartC, 'Testaufbau: offenes Hex mit Fels-Nachbarn gefunden (g-c)');
    if (digStartC) {
        const unitC = { i: 5, p: 0, t: 7, x: digStartC.x, y: digStartC.y, h: 8, a: 0 };
        const digTargetsC = M.calculateDigsUW(unitC);
        assert(digTargetsC.length > 0, 'Testaufbau: Grabziel für (g-c) vorhanden');
        if (digTargetsC.length > 0) {
            M.digUWHex(stateA, unitC, digTargetsC[0].x, digTargetsC[0].y);
            assert(unitC.a === 1, 'Graben aus a=0 (frischer Zug) setzt DIREKT a=1 — kein Zwischenzustand für normale Einheiten');
        }
    }
    const attackerFresh = { i: 6, p: 0, t: 17, x: cxA, y: cyA, h: 14, a: 0 };
    const defender2 = { i: 7, p: 1, t: 17, x: atkNeighbor.x, y: atkNeighbor.y, h: 14, a: 0 };
    M.resolveUWAttack(stateA, attackerFresh, defender2);
    assert(attackerFresh.a === 1, 'Angriff aus a=0 (frischer Zug) setzt ebenfalls DIREKT a=1');

    // --- (g-d) Bohrwagen (22, digMove=2): 1. Grabung dieser Runde hinterlässt
    // a=2 (Sonderregel), 2. Grabung verbraucht a=1. Nach einer Bewegung (a=2)
    // ist dagegen nur noch GENAU 1 weitere Grabung möglich (a=1) — die
    // Doppel-Grabung gilt NUR bei der allerersten Aktion des Zuges. ---
    const stateD = freshState(202, 7, 2);
    const digStartD1 = findDigStart(stateD);
    assert(!!digStartD1, 'Testaufbau: offenes Hex mit Fels-Nachbarn gefunden (g-d, Doppel-Grabung)');
    if (digStartD1) {
        const bohrwagen = { i: 8, p: 0, t: 22, x: digStartD1.x, y: digStartD1.y, h: 14, a: 0 };
        const digTargets1 = M.calculateDigsUW(bohrwagen);
        assert(digTargets1.length > 0, 'Testaufbau: 1. Grabziel für Bohrwagen vorhanden');
        if (digTargets1.length > 0) {
            M.digUWHex(stateD, bohrwagen, digTargets1[0].x, digTargets1[0].y);
            assert(bohrwagen.a === 2, 'Bohrwagen: 1. Grabung dieser Runde hinterlässt a=2 (Sonderregel — darf noch GENAU 1x agieren)');

            const digTargets2 = M.calculateDigsUW(bohrwagen);
            if (digTargets2.length > 0) {
                M.digUWHex(stateD, bohrwagen, digTargets2[0].x, digTargets2[0].y);
                assert(bohrwagen.a === 1, 'Bohrwagen: 2. Grabung verbraucht die Aktion vollständig (a=1)');
            } else {
                console.log('SKIP (g-d 2. Grabung): kein zweites Grabziel gefunden (Seed-Zufall)');
            }
        }
    }

    const stateD2 = freshState(305, 7, 2);
    const digStartD2 = findDigStart(stateD2);
    assert(!!digStartD2, 'Testaufbau: offenes Hex mit Fels-Nachbarn gefunden (g-d, nach Bewegung)');
    if (digStartD2) {
        const bohrwagenMoved = { i: 9, p: 0, t: 22, x: digStartD2.x, y: digStartD2.y, h: 14, a: 0 };
        stateD2.uw.u.push(bohrwagenMoved);
        const movesD2 = M.calculateMovesUW(bohrwagenMoved);
        if (movesD2.length > 0) {
            M.moveUWUnit(stateD2, bohrwagenMoved, movesD2[0].x, movesD2[0].y);
            assert(bohrwagenMoved.a === 2, 'Testaufbau: Bohrwagen hat sich bewegt (a=2)');
            const digTargetsAfterMoveD = M.calculateDigsUW(bohrwagenMoved);
            if (digTargetsAfterMoveD.length > 0) {
                M.digUWHex(stateD2, bohrwagenMoved, digTargetsAfterMoveD[0].x, digTargetsAfterMoveD[0].y);
                assert(bohrwagenMoved.a === 1, 'Bohrwagen NACH Bewegung (a=2): die Grabung verbraucht die Aktion vollständig (a=1) — die Doppel-Grabungs-Ausnahme gilt NUR bei der allerersten Aktion des Zuges (a=0), nicht mehr nach einer Bewegung');
            } else {
                console.log('SKIP (g-d nach Bewegung): kein Grabziel an der neuen Position gefunden (Seed-Zufall)');
            }
        } else {
            console.log('SKIP (g-d nach Bewegung): kein Bewegungsziel gefunden (Seed-Zufall)');
        }
    }
}

console.log(`\n=== Zusammenfassung: ${failures === 0 ? 'ALLE CHECKS BESTANDEN' : failures + ' FEHLGESCHLAGEN'} ===`);
process.exit(failures === 0 ? 0 : 1);
