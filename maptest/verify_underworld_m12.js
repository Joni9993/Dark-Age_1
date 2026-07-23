// Verifikationsskript M12 — lädt die echten Spiel-Skripte (Muster wie
// maptest/verify_underworld_m11.js), testet die DOM-freien Kernfunktionen:
// Dynamit (ersetzt Unterminierung, Korrektur Juli 2026), Stollenbruch,
// Moral-Kollaps, Erschließung + Sieg.
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
            buildInitialGameState, createPRNG, isInsideMap, hexDistance, getNeighbors,
            getUnderworldType, isUnderworldOpen, getHeartCavernHexes, getStollenkopfOwner,
            UW_FELS, UW_KAVERNE, UW_ADER, UW_RUINE, UW_HERZ,
            uwUnitAt, uwCreatureAt, digUWHex, calculateStollenbruchTargetsUW, collapseUWHex,
            calculateDynamiteTargetsUW, getDynamiteTriangle, placeUWDynamite, processUWDynamiteDetonations,
            resolveUWAttack, resolveUWAttackOnCreature,
            hasUsableTunnel, applyMoralCollapse,
            checkErschliessungProgress, advanceErschliessung, checkErschliessungWin, ERSCHLIESSUNG_TARGET,
            getUnitMaxHp, getUnitCost, unitStats, uwCreatureStats, UWC_WURM
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

// ─────────────────────────────────────────────────────────────────────────
console.log('=== (a) Dynamit-Platzierung: JEDES angrenzende Hex (Korrektur Juli 2026), Dreieck-Geometrie, 1 Zug verbraucht ===');
{
    const state = freshState(1, 7, 2);
    // Ein offenes Hex mit einem massiven Fels-Nachbarn suchen (NICHT das Karten-
    // zentrum verwenden — dessen unmittelbare Nachbarn gehören selbst zur
    // Herzkaverne, sind also nie Fels).
    let placerHex = null, felsTarget = null;
    outerA:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (!M.isInsideMap(state, x, y) || !M.isUnderworldOpen(state, x, y)) continue;
        const fels = M.getNeighbors(x, y).find(n => M.getUnderworldType(state, n.x, n.y) === M.UW_FELS && !M.isUnderworldOpen(state, n.x, n.y)
            && M.getDynamiteTriangle(x, y, n.x, n.y).length === 3); // volles Dreieck nötig, Kartenrand liefert oft nur 2
        if (fels) { placerHex = { x, y }; felsTarget = fels; break outerA; }
    }
    assert(!!felsTarget, 'Testaufbau: offenes Hex mit massivem Fels-Nachbarn gefunden');
    if (felsTarget) {
        const sprengmeister = { i: 1, p: 0, t: 18, x: placerHex.x, y: placerHex.y, h: 8, a: 0 };
        state.uw.u.push(sprengmeister);

        const targets = M.calculateDynamiteTargetsUW(sprengmeister);
        assert(targets.some(t => t.x === felsTarget.x && t.y === felsTarget.y), 'massives Fels-Nachbarhex erscheint als Dynamit-Ziel');
        // Korrektur Juli 2026 (Jonathan): Dynamit ist nicht mehr auf massives Fels
        // beschränkt — JEDES Nachbar-Hex ist ein gültiges Ziel, unabhängig von Typ/
        // Offen-Zustand (auch bereits offene Gänge/Kavernen/Adern).
        const allNeighbors = M.getNeighbors(placerHex.x, placerHex.y);
        assert(targets.length === allNeighbors.length, `alle ${allNeighbors.length} Nachbar-Hexes sind gültige Dynamit-Ziele, nicht nur massiver Fels (gemessen: ${targets.length})`);
        const openNeighbor = allNeighbors.find(n => M.isUnderworldOpen(state, n.x, n.y));
        if (openNeighbor) {
            assert(targets.some(t => t.x === openNeighbor.x && t.y === openNeighbor.y), 'ein bereits OFFENES Nachbar-Hex ist ebenfalls ein gültiges Dynamit-Ziel');
        }

        const nonSprengmeister = { t: 7, x: placerHex.x, y: placerHex.y };
        assert(M.calculateDynamiteTargetsUW(nonSprengmeister).length === 0, 'nur der Sprengmeister (18) darf Dynamit legen — andere Typen liefern 0 Ziele');

        const triangle = M.getDynamiteTriangle(sprengmeister.x, sprengmeister.y, felsTarget.x, felsTarget.y);
        assert(triangle.length === 3, `Dreieck besteht aus 3 Hexes (gemessen: ${triangle.length})`);
        assert(triangle[0].x === felsTarget.x && triangle[0].y === felsTarget.y, 'erstes Dreieck-Hex ist das gewählte Ziel-Hex');
        const otherTwo = triangle.slice(1);
        const bothAdjacentToBoth = otherTwo.every(h =>
            M.hexDistance(h, { x: sprengmeister.x, y: sprengmeister.y }) === 1 && M.hexDistance(h, felsTarget) === 1);
        assert(bothAdjacentToBoth, 'die beiden weiteren Dreieck-Hexes sind sowohl zum Platzierer als auch zum Ziel benachbart (echtes Dreieck)');

        M.placeUWDynamite(state, sprengmeister, felsTarget.x, felsTarget.y);
        assert(state.uw.dy.length === 1, 'Ladung liegt in uw.dy');
        assert(state.uw.dy[0].p === 0, 'Ladung ist Spieler 0 zugeordnet');
        assert(JSON.stringify(state.uw.dy[0].hexes) === JSON.stringify(triangle), 'gespeichertes Dreieck entspricht der berechneten Geometrie');
        assert(sprengmeister.a === 1, 'Platzieren verbraucht die Aktion');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (b) Detonation: 6 Schaden pro Hex (AoE, auch eigene Einheiten), Fels wird offen, NIE Auswirkung auf tu/wa/tw/p[].sh ===');
{
    const state = freshState(1, 7, 2);
    // Wieder ein offenes Hex mit massivem Fels-Nachbarn suchen (nicht das
    // Kartenzentrum, siehe Kommentar in Test (a)).
    let placerHex = null, felsTarget = null;
    outerB:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (!M.isInsideMap(state, x, y) || !M.isUnderworldOpen(state, x, y)) continue;
        const fels = M.getNeighbors(x, y).find(n => M.getUnderworldType(state, n.x, n.y) === M.UW_FELS && !M.isUnderworldOpen(state, n.x, n.y)
            && M.getDynamiteTriangle(x, y, n.x, n.y).length === 3);
        if (fels) { placerHex = { x, y }; felsTarget = fels; break outerB; }
    }
    assert(!!felsTarget, 'Testaufbau: offenes Hex mit massivem Fels-Nachbarn gefunden');
    if (felsTarget) {
        const sprengmeister = { i: 1, p: 0, t: 18, x: placerHex.x, y: placerHex.y, h: 8, a: 0 };
        state.uw.u.push(sprengmeister);
        const triangle = M.getDynamiteTriangle(sprengmeister.x, sprengmeister.y, felsTarget.x, felsTarget.y);
        assert(triangle.length === 3, 'Testaufbau: volles 3er-Dreieck vorhanden');

        // Auf jedem der 3 Hexes steht eine Einheit — auch eine EIGENE (Friendly
        // Fire wie beim Feuersturm der Bombenballon oben) — plus eine Kreatur.
        const ownVictim = { i: 2, p: 0, t: 7, x: triangle[0].x, y: triangle[0].y, h: 5 };
        const enemyVictim = { i: 3, p: 1, t: 17, x: triangle[1].x, y: triangle[1].y, h: 14 };
        state.uw.u.push(ownVictim, enemyVictim);
        state.uw.c.push({ t: M.UWC_WURM, x: triangle[2].x, y: triangle[2].y, h: 6 });

        // Tunnel-Endpunkt zufällig auf einem der 3 Hexes -> darf NICHT beschädigt werden.
        const tunnelWall = { x1: triangle[0].x, y1: triangle[0].y, x2: 0, y2: 0, o: 1, h: 13, r: state.rn };
        state.tu = [tunnelWall];
        const shBefore = state.p[1].sh;

        M.placeUWDynamite(state, sprengmeister, felsTarget.x, felsTarget.y);
        const felsWasOpen = triangle.map(h => M.isUnderworldOpen(state, h.x, h.y));

        // Detonation läuft erst, wenn der PLATZIERENDE Spieler (0) wieder dran ist.
        let floats = M.processUWDynamiteDetonations(1);
        assert(floats.length === 0, 'kein anderer Spieler löst die fremde Ladung aus');
        assert(state.uw.dy.length === 1, 'Ladung bleibt bestehen, solange der Besitzer nicht am Zug ist');

        floats = M.processUWDynamiteDetonations(0);
        assert(state.uw.dy.length === 0, 'Ladung ist nach der Detonation verbraucht');
        assert(!state.uw.u.some(u => u.i === 2), 'eigene Einheit im Dreieck stirbt ebenfalls (Friendly Fire, 6 DMG auf 5 HP)');
        const survivor = state.uw.u.find(u => u.i === 3);
        assert(survivor && survivor.h === 8, `feindliche Einheit nimmt exakt 6 Schaden (14 -> ${survivor ? survivor.h : 'tot'})`);
        assert(!state.uw.c.some(c => c.x === triangle[2].x && c.y === triangle[2].y), 'Kreatur (Alter Wurm) im Dreieck stirbt (6 Schaden auf 6 HP) — geprüft an ihrer Position, da der ECHTE Wurm der Karte anderswo weiterlebt');
        assert(state.uw.wd === 1, 'Wurm-Tod durch Dynamit setzt uw.wd genau wie ein Kampf-Tod (Erschließung sonst für immer blockiert)');
        // Ader-Hexes im Dreieck sind von der "wird offen"-Regel ausgenommen
        // (Korrektur Juli 2026, s. Test b2) — hier nur für Nicht-Ader-Hexes prüfen.
        triangle.forEach((h, i) => {
            if (M.getUnderworldType(state, h.x, h.y) === M.UW_ADER) return;
            if (!felsWasOpen[i]) assert(M.isUnderworldOpen(state, h.x, h.y) === true, `Fels-Hex ${i} ist nach der Detonation offen ("Gebirge wegsprengen")`);
        });
        assert(tunnelWall.h === 13, 'Tunnel-HP UNVERÄNDERT — Dynamit rührt nie an Oberflächen-Strukturen');
        assert(state.p[1].sh === shBefore, 'Startdorf-HP UNVERÄNDERT — keinerlei Auswirkung auf das Spiel oben');
    }

    // Verwaiste Ladung eines ausgeschiedenen Spielers wird beim Aufräumen entfernt.
    const state2 = freshState(1, 7, 2);
    state2.uw.dy = [{ p: 1, hexes: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }] }];
    state2.p[1].dead = 1;
    M.processUWDynamiteDetonations(0);
    assert(state2.uw.dy.length === 0, 'Ladung eines ausgeschiedenen Spielers verfällt, statt für immer im State zu hängen');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (b2) Detonation lässt Kristaladern im Dreieck unangetastet (Korrektur Juli 2026) ===');
{
    // Über mehrere Seeds suchen, bis ein Dynamit-Dreieck gefunden ist, dessen
    // NICHT-Ziel-Hex (einer der beiden "geteilten Nachbarn") eine Ader ist —
    // das Ziel-Hex selbst ist laut calculateDynamiteTargetsUW immer FELS.
    let found = null;
    for (let seed = 1; seed < 40 && !found; seed++) {
        const state = freshState(seed, 7, 2);
        outerB2:
        for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
            if (!M.isInsideMap(state, x, y) || !M.isUnderworldOpen(state, x, y)) continue;
            const felsTarget = M.getNeighbors(x, y).find(n => M.getUnderworldType(state, n.x, n.y) === M.UW_FELS && !M.isUnderworldOpen(state, n.x, n.y));
            if (!felsTarget) continue;
            const triangle = M.getDynamiteTriangle(x, y, felsTarget.x, felsTarget.y);
            if (triangle.length !== 3) continue;
            const aderHex = triangle.slice(1).find(h => M.getUnderworldType(state, h.x, h.y) === M.UW_ADER && !M.isUnderworldOpen(state, h.x, h.y));
            if (aderHex) { found = { state, placerHex: { x, y }, felsTarget, triangle, aderHex }; break outerB2; }
        }
    }
    assert(!!found, 'Testaufbau: Seed mit Ader im Dynamit-Dreieck gefunden');
    if (found) {
        const { state, placerHex, felsTarget, triangle, aderHex } = found;
        const sprengmeister = { i: 1, p: 0, t: 18, x: placerHex.x, y: placerHex.y, h: 8, a: 0 };
        state.uw.u.push(sprengmeister);
        // Eine Einheit auf der Ader steht -> muss trotzdem AoE-Schaden nehmen.
        const victimOnAder = { i: 2, p: 1, t: 7, x: aderHex.x, y: aderHex.y, h: 5 };
        state.uw.u.push(victimOnAder);

        M.placeUWDynamite(state, sprengmeister, felsTarget.x, felsTarget.y);
        M.processUWDynamiteDetonations(0);

        assert(M.isUnderworldOpen(state, aderHex.x, aderHex.y) === false, 'Ader-Hex im Dreieck bleibt NACH der Detonation massiv (wird nicht geöffnet)');
        assert(!state.uw.a || state.uw.a[`${aderHex.x},${aderHex.y}`] === undefined || state.uw.a[`${aderHex.x},${aderHex.y}`] > 0, 'Ader-Restbestand wird durch Dynamit nicht zerstört/geleert');
        assert(!state.uw.u.some(u => u.i === 2), 'Einheit auf der Ader nimmt trotzdem 6 AoE-Schaden (5 HP -> tot)');
        assert(M.isUnderworldOpen(state, felsTarget.x, felsTarget.y) === true, 'das eigentliche Fels-Ziel-Hex wird weiterhin ganz normal geöffnet');
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (c) Stollenbruch nur auf gegrabene, unbesetzte Hexes, uw.d korrekt reduziert ===');
{
    const state = freshState(3, 7, 2);
    // Bewusst NICHT im Herzkaverne-Zentrum platziert — dessen Nachbarn sind
    // natürlich offen (UW_HERZ) und daher nie durch Stollenbruch verfüllbar;
    // hier muss ein echtes, zuvor gegrabenes FELS-Hex getestet werden.
    let sprengmeister = null, dugHex = null;
    outer:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (!M.isInsideMap(state, x, y) || M.getUnderworldType(state, x, y) !== M.UW_FELS) continue;
        const felsNeighbor = M.getNeighbors(x, y).find(n => M.getUnderworldType(state, n.x, n.y) === M.UW_FELS);
        if (felsNeighbor) { sprengmeister = { i: 1, p: 0, t: 18, x, y, h: 8 }; dugHex = felsNeighbor; break outer; }
    }
    assert(!!sprengmeister, 'Testaufbau: FELS-Hex mit FELS-Nachbar gefunden');
    const dugIdx = dugHex.y * state.bw + dugHex.x;
    state.uw.d.push(dugIdx);

    let targets = M.calculateStollenbruchTargetsUW(sprengmeister);
    assert(targets.some(t => t.x === dugHex.x && t.y === dugHex.y), 'gegrabenes Nachbar-Hex erscheint als Stollenbruch-Ziel');

    // Ein Stollenkopf (offen via tu[], nicht via uw.d) ist NICHT verfüllbar, auch
    // wenn isUnderworldOpen für ihn ebenfalls true liefert — deterministisch über
    // einen künstlich gesetzten Tunnel-Endpunkt auf einem weiteren FELS-Nachbarn.
    const otherFelsNeighbor = M.getNeighbors(sprengmeister.x, sprengmeister.y).find(n => M.getUnderworldType(state, n.x, n.y) === M.UW_FELS && !(n.x === dugHex.x && n.y === dugHex.y));
    if (otherFelsNeighbor) {
        state.tu = [{ x1: otherFelsNeighbor.x, y1: otherFelsNeighbor.y, x2: 0, y2: 0, o: 0, h: 13, r: state.rn }];
        assert(M.getStollenkopfOwner(state, otherFelsNeighbor.x, otherFelsNeighbor.y) === 0, 'Testaufbau: Nachbar-Hex ist jetzt ein Stollenkopf');
        assert(M.isUnderworldOpen(state, otherFelsNeighbor.x, otherFelsNeighbor.y) === true, 'Testaufbau: Stollenkopf ist offen');
        const targetsWithHead = M.calculateStollenbruchTargetsUW(sprengmeister);
        assert(!targetsWithHead.some(t => t.x === otherFelsNeighbor.x && t.y === otherFelsNeighbor.y), 'ein Stollenkopf (offen via tu[], nicht uw.d) ist KEIN Stollenbruch-Ziel');
        state.tu = [];
    } else {
        console.log('SKIP: kein zweiter FELS-Nachbar für den Stollenkopf-Teiltest gefunden (Seed-Zufall)');
    }

    // Besetztes gegrabenes Hex ist kein gültiges Ziel
    state.uw.u.push({ i: 2, p: 1, t: 7, x: dugHex.x, y: dugHex.y, h: 8 });
    targets = M.calculateStollenbruchTargetsUW(sprengmeister);
    assert(!targets.some(t => t.x === dugHex.x && t.y === dugHex.y), 'besetztes gegrabenes Hex ist NICHT verfüllbar');
    state.uw.u = [];

    // Nur Sprengmeister (18) darf Stollenbruch nutzen
    const nonSprengmeister = { i: 3, p: 0, t: 7, x: sprengmeister.x, y: sprengmeister.y, h: 8 };
    assert(M.calculateStollenbruchTargetsUW(nonSprengmeister).length === 0, 'nur der Sprengmeister (18) darf Stollenbruch — andere Typen liefern 0 Ziele');

    // collapseUWHex reduziert uw.d korrekt UND verbraucht die Aktion (a=1,
    // Oberflächen-Parität, Korrektur Juli 2026 — collapseUWHex nimmt jetzt die
    // agierende Einheit als Parameter, wie placeUWDynamite).
    assert(state.uw.d.includes(dugIdx), 'Index ist vor dem Stollenbruch in uw.d');
    M.collapseUWHex(state, sprengmeister, dugHex.x, dugHex.y);
    assert(!state.uw.d.includes(dugIdx), 'Index ist nach dem Stollenbruch aus uw.d entfernt');
    assert(M.isUnderworldOpen(state, dugHex.x, dugHex.y) === false, 'Hex ist nach dem Stollenbruch wieder massiver Fels (nicht mehr offen)');
    assert(sprengmeister.a === 1, 'Stollenbruch verbraucht die Aktion (a=1)');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (d) Moral-Kollaps: nur bei 0 nutzbaren Tunneln, genau -1 HP pro eigenem Zugbeginn ===');
{
    const state = freshState(4, 7, 2);
    state.uw.u.push({ i: 1, p: 0, t: 7, x: 1, y: 1, h: 8 }, { i: 2, p: 0, t: 17, x: 2, y: 2, h: 14 });
    state.tu = []; // kein Tunnel -> Kollaps sollte greifen

    assert(M.hasUsableTunnel(state, 0) === false, 'ohne Tunnel: hasUsableTunnel === false');
    const floats = M.applyMoralCollapse(state, 0);
    assert(floats.length === 2, `Moral-Kollaps trifft beide eigenen Tiefeneinheiten (${floats.length}/2)`);
    assert(floats.every(f => f.val === 1), 'jeder Float meldet exakt 1 HP Verlust');
    assert(state.uw.u.find(u => u.i === 1).h === 7 && state.uw.u.find(u => u.i === 2).h === 13, 'HP tatsächlich um genau 1 reduziert (8->7, 14->13)');

    // Mit nutzbarem Tunnel: kein Kollaps
    const state2 = freshState(4, 7, 2);
    state2.uw.u.push({ i: 1, p: 0, t: 7, x: 1, y: 1, h: 8 });
    state2.tu = [{ x1: 0, y1: 0, x2: 5, y2: 5, o: 0, h: 13, r: state2.rn }];
    assert(M.hasUsableTunnel(state2, 0) === true, 'mit nutzbarem Tunnel: hasUsableTunnel === true');
    const floats2 = M.applyMoralCollapse(state2, 0);
    assert(floats2.length === 0 && state2.uw.u[0].h === 8, 'mit nutzbarem Tunnel bleibt die HP unverändert');

    // Tunnel im Bau (r > rn) zählt NICHT als nutzbar
    const state3 = freshState(4, 7, 2);
    state3.uw.u.push({ i: 1, p: 0, t: 7, x: 1, y: 1, h: 8 });
    state3.tu = [{ x1: 0, y1: 0, x2: 5, y2: 5, o: 0, h: 13, r: state3.rn + 1 }];
    assert(M.hasUsableTunnel(state3, 0) === false, 'Tunnel im Bau (r > rn) zählt nicht als nutzbar');
    const floats3 = M.applyMoralCollapse(state3, 0);
    assert(floats3.length === 1, 'Kollaps greift trotz vorhandenem, aber unfertigem Tunnel');

    // Fremder Tunnel schützt nicht
    const state4 = freshState(4, 7, 2);
    state4.uw.u.push({ i: 1, p: 0, t: 7, x: 1, y: 1, h: 8 });
    state4.tu = [{ x1: 0, y1: 0, x2: 5, y2: 5, o: 1, h: 13, r: state4.rn }]; // gehört Spieler 1, nicht 0
    const floats4 = M.applyMoralCollapse(state4, 0);
    assert(floats4.length === 1, 'ein FREMDER Tunnel schützt nicht vor Moral-Kollaps');

    // Tod durch Moral-Kollaps: Einheit mit 1 HP stirbt normal
    const state5 = freshState(4, 7, 2);
    state5.uw.u.push({ i: 1, p: 0, t: 7, x: 1, y: 1, h: 1 });
    M.applyMoralCollapse(state5, 0);
    assert(state5.uw.u.length === 0, 'Einheit mit 1 HP stirbt durch Moral-Kollaps und wird aus uw.u entfernt');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (e) Erschließung: Bedingungen, Verbündete unterbrechen nicht, Reset, Sieg bei n==ERSCHLIESSUNG_TARGET ===');
{
    const state = freshState(5, 5, 3);
    const cx = state.rad, cy = state.rad;

    // Solange der Wurm lebt: kein Fortschritt
    state.uw.u.push({ i: 1, p: 0, t: 7, x: cx, y: cy, h: 8 });
    assert(M.checkErschliessungProgress(state, 0) === false, 'kein Fortschritt solange der Alte Wurm lebt (uw.wd nicht 1)');

    state.uw.wd = 1;
    assert(M.checkErschliessungProgress(state, 0) === true, 'mit totem Wurm + eigener Einheit im Zentrum + leerer Kaverne: Fortschritt möglich');

    // Zentrum leer -> kein Fortschritt
    const state2 = freshState(5, 5, 3);
    state2.uw.wd = 1;
    assert(M.checkErschliessungProgress(state2, 0) === false, 'kein Fortschritt ohne eigene Einheit im Herzkaverne-Zentrum');

    // Feind irgendwo in der Kaverne (nicht nur im Zentrum) unterbricht
    const state3 = freshState(5, 5, 3);
    state3.uw.wd = 1;
    state3.uw.u.push({ i: 1, p: 0, t: 7, x: cx, y: cy, h: 8 });
    const heartHexes = M.getHeartCavernHexes(state3);
    const otherHeartHex = heartHexes.find(h => !(h.x === cx && h.y === cy));
    state3.uw.u.push({ i: 2, p: 1, t: 17, x: otherHeartHex.x, y: otherHeartHex.y, h: 14 });
    assert(M.checkErschliessungProgress(state3, 0) === false, 'ein FEIND irgendwo in der Herzkaverne (nicht nur im Zentrum) unterbricht');

    // Verbündeter in der Kaverne unterbricht NICHT
    const state4 = freshState(5, 5, 3);
    state4.uw.wd = 1;
    state4.p[0].al = [1];
    state4.p[1].al = [0];
    state4.uw.u.push({ i: 1, p: 0, t: 7, x: cx, y: cy, h: 8 });
    state4.uw.u.push({ i: 2, p: 1, t: 17, x: otherHeartHex.x, y: otherHeartHex.y, h: 14 });
    assert(M.checkErschliessungProgress(state4, 0) === true, 'ein VERBÜNDETER in der Herzkaverne unterbricht NICHT');

    // advanceErschliessung: Start -> Fortschritt -> ... -> ERSCHLIESSUNG_TARGET, dann Reset bei Unterbrechung
    const state5 = freshState(5, 5, 3);
    state5.uw.wd = 1;
    state5.uw.u.push({ i: 1, p: 0, t: 7, x: cx, y: cy, h: 8 });
    const e1 = M.advanceErschliessung(state5, 0);
    assert(e1 && e1.type === 'start' && e1.n === 1 && state5.uw.hz.n === 1, 'erster gehaltener Zugende startet uw.hz bei n=1');
    const e2 = M.advanceErschliessung(state5, 0);
    assert(e2.type === 'progress' && e2.n === 2, 'zweiter gehaltener Zugende erhöht auf n=2');
    let eLast;
    for (let i = 2; i < M.ERSCHLIESSUNG_TARGET; i++) {
        eLast = M.advanceErschliessung(state5, 0);
    }
    assert(eLast.n === M.ERSCHLIESSUNG_TARGET, `letzter gehaltener Zugende erreicht n=${M.ERSCHLIESSUNG_TARGET}`);
    assert(M.checkErschliessungWin(state5) !== null, `bei n=${M.ERSCHLIESSUNG_TARGET} meldet checkErschliessungWin einen Sieger`);

    // Unterbrechung -> KOMPLETTER Reset (nicht Dekrement)
    state5.uw.u = []; // eigene Einheit verlässt das Zentrum
    const eReset = M.advanceErschliessung(state5, 0);
    assert(eReset.type === 'reset', 'Unterbrechung meldet type=reset');
    assert(state5.uw.hz === undefined, 'uw.hz wird bei Unterbrechung KOMPLETT gelöscht (Reset auf 0, kein Dekrement)');

    // Sieg-Gewinnerliste: Erschließer + lebende Verbündete, keine Fremden
    const state6 = freshState(5, 5, 3);
    state6.p[0].al = [1];
    state6.p[1].al = [0];
    state6.uw.hz = { p: 0, n: M.ERSCHLIESSUNG_TARGET };
    const winners = M.checkErschliessungWin(state6);
    assert(winners && winners.length === 2 && winners.some(p => p === state6.p[0]) && winners.some(p => p === state6.p[1]), 'Gewinnerliste = Erschließer + Verbündete, exakt 2 Spieler');
    assert(!winners.includes(state6.p[2]), 'nicht-verbündeter dritter Spieler ist NICHT unter den Gewinnern');

    // n < ERSCHLIESSUNG_TARGET: noch kein Sieg
    const state7 = freshState(5, 5, 2);
    state7.uw.hz = { p: 0, n: M.ERSCHLIESSUNG_TARGET - 1 };
    assert(M.checkErschliessungWin(state7) === null, `n=${M.ERSCHLIESSUNG_TARGET - 1} löst noch keinen Sieg aus`);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (f) Serialisierungs-Roundtrip uw.dy/uw.hz ===');
{
    const state = freshState(6, 7, 2);
    state.uw.u.push({ i: 1, p: 0, t: 18, x: 3, y: 3, h: 8 });
    state.uw.dy = [{ p: 0, hexes: [{ x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }] }];
    state.uw.hz = { p: 0, n: 2 };

    const wireJson = JSON.stringify(state);
    assert(wireJson.includes('"dy"'), 'uw.dy im Wire-JSON vorhanden');
    assert(wireJson.includes('"hz":{"p":0,"n":2}') || (wireJson.includes('"hz"') && wireJson.includes('"n":2')), 'uw.hz im Wire-JSON vorhanden');

    const restored = JSON.parse(wireJson);
    assert(restored.uw.dy.length === 1 && restored.uw.dy[0].p === 0 && restored.uw.dy[0].hexes.length === 3, 'uw.dy verlustfrei nach Roundtrip (Besitzer + volles Dreieck)');
    assert(restored.uw.hz.p === 0 && restored.uw.hz.n === 2, 'uw.hz verlustfrei nach Roundtrip');

    // Regressionstest (Muster aus M12 übernommen): state.uw darf NICHT gelöscht
    // werden, wenn uw.dy oder uw.hz der einzige nicht-leere Teil ist.
    const state2 = freshState(6, 7, 2);
    state2.uw = { d: [], u: [], n: [], a: {}, f: {}, w: {}, dr: {}, c: [], dy: [{ p: 0, hexes: [] }] };
    const uw2 = state2.uw;
    const shouldDelete2 = !uw2.d.length && (!uw2.u || uw2.u.length === 0) && !(uw2.n && uw2.n.length) && !(uw2.a && Object.keys(uw2.a).length) && !(uw2.f && Object.keys(uw2.f).length) && !(uw2.w && Object.keys(uw2.w).length) && !(uw2.dr && Object.keys(uw2.dr).length) && !(uw2.c && uw2.c.length) && !uw2.wd && !uw2.hz && !(uw2.dy && uw2.dy.length);
    assert(shouldDelete2 === false, 'uw.dy als einziges gesetztes Feld verhindert das Löschen von state.uw');

    const state3 = freshState(6, 7, 2);
    state3.uw = { d: [], u: [], n: [], a: {}, f: {}, w: {}, dr: {}, c: [], hz: { p: 0, n: 1 } };
    const uw3 = state3.uw;
    const shouldDelete3 = !uw3.d.length && (!uw3.u || uw3.u.length === 0) && !(uw3.n && uw3.n.length) && !(uw3.a && Object.keys(uw3.a).length) && !(uw3.f && Object.keys(uw3.f).length) && !(uw3.w && Object.keys(uw3.w).length) && !(uw3.dr && Object.keys(uw3.dr).length) && !(uw3.c && uw3.c.length) && !uw3.wd && !uw3.hz && !(uw3.dy && uw3.dy.length);
    assert(shouldDelete3 === false, 'uw.hz als einziges gesetztes Feld verhindert das Löschen von state.uw (Bugfix verifiziert)');
}

console.log(`\n=== Zusammenfassung: ${failures === 0 ? 'ALLE CHECKS BESTANDEN' : failures + ' FEHLGESCHLAGEN'} ===`);
process.exit(failures === 0 ? 0 : 1);
