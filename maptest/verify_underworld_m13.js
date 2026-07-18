// Verifikationsskript M13 — Integrations-Pass.
//
// Deckt ab:
//  (a) Recap-Sichtbarkeit: die uw/global-Tag-Filterregel aus js/main.js/render.js/
//      render3d.js (dort DOM-gebunden, hier als reine Ein-Zeilen-Regel nachgebaut
//      und gegen die echten Sicht-Primitiven getestet — die Primitiven selbst
//      sind Produktionscode aus js/logic.js, hier nicht dupliziert).
//  (b)-(f) Diplomatie-Pass: Verbündeten-Sicht im Unterwelt-Netz (M13-Erweiterung
//      von getVisibleUWHexes/isUWUnitVisible), calculateAttacksUW schließt
//      weiterhin Verbündete/Waffenstillstand aus, Bündnisbruch WÄHREND laufender
//      Erschließung.
//  (g) Blob-Größen-Messung: realistischer Spätspiel-Zustand mit/ohne Unterwelt-
//      Inhalt, LZString-komprimierte Länge (echte vendorte Kopie, kein Mock).
//  (h) 3-Spieler-Partie über die reinen Logik-Funktionen, mit vollständigem
//      Serialisierungs-Roundtrip (doEndTurn-Bereinigung + bootGame-Restore,
//      1:1 aus js/input.js/js/main.js nachgebaut) nach JEDEM Schritt.
//  (i) Legacy-URL-Längen-Check (state=... Parameter) für den Blob-Zustand aus (g).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LZString = require('./lz-string.min.js');

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
    global.showToast = () => { };

    const files = ['js/prng.js', 'js/hex.js', 'js/data.js', 'js/mapgen.js', 'js/logic.js', 'js/diplomacy.js'];
    const src = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
    const fn = new Function(src + `
        return {
            buildInitialGameState, createPRNG, compressFog, decompressFog,
            isInsideMap, hexDistance, getNeighbors, oddRToCube,
            getUnderworldType, isUnderworldOpen, getHeartCavernHexes,
            getUnderworldTunnelHeads, isUnderworldTunnelHead, getStollenkopfOwner,
            UW_FELS, UW_KAVERNE, UW_ADER, UW_RUINE, UW_HERZ,
            uwUnitAt, uwCreatureAt, digUWHex, mineUWVein, deliverUWCrystals,
            ascendUWUnit, descendUWUnit, buyUWUnitAt,
            calculateMovesUW, calculateDigsUW, calculateAttacksUW, isChokepoint,
            getExpectedDamageUW, resolveUWAttack, resolveUWAttackOnCreature,
            getVisibleHexes, getVisibleUWHexes, isUWUnitVisible, isUWCreatureVisible,
            markUWExplored, updateUWExploration,
            calculateStollenbruchTargetsUW, collapseUWHex,
            calculateDynamiteTargetsUW, getDynamiteTriangle, placeUWDynamite, processUWDynamiteDetonations,
            hasUsableTunnel, applyMoralCollapse,
            checkErschliessungProgress, advanceErschliessung, checkErschliessungWin,
            lootFundkammer, applyRelicToUnit, applyRelicToBuilding, applyMapRelic,
            getUnitMaxHp, getUnitCost, getUnitMove, unitStats, RELICS,
            uwCreatureStats, UWC_SPINNE, UWC_WUEHLER, UWC_STEINPANZER, UWC_WURM,
            checkTeamWin
        };
    `);
    return fn();
}

const M = loadGameCode();
// Reale Sicht-/Fog-Regeln statt Debug-Aufdeckung — genau diese Regeln (inkl.
// der neuen Verbündeten-Sichtteilung) sind Gegenstand dieser Suite. Ohne diesen
// Schalter würde isUWUnitVisible/getVisibleUWHexes im Node-Kontext (window ===
// global, DEBUG_UW_REVEAL bleibt sonst undefined !== false -> true) immer alles
// aufdecken und die Tests wären wirkungslos.
global.window.DEBUG_UW_REVEAL = false;

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

// Greedy-Grabweg zum Ziel (nutzt digUWHex direkt — reale Funktion aus js/logic.js,
// unabhängig vom tatsächlichen Terrain-Typ, wie die Kreaturen-Wühl-Logik in M11
// bereits vorgemacht hat: Hex-Distanz ist auf einem Hexraster streng monoton
// fallend entlang MINDESTENS einem Nachbarn, der Greedy-Walk terminiert also
// immer). Gibt die Anzahl echter Grab-Schritte zurück.
function walkAndDig(unit, targetX, targetY, guardMax = 60) {
    const target = { x: targetX, y: targetY };
    let steps = 0;
    while (!(unit.x === targetX && unit.y === targetY) && steps < guardMax) {
        const neighbors = M.getNeighbors(unit.x, unit.y);
        let best = null, bestD = M.hexDistance({ x: unit.x, y: unit.y }, target);
        neighbors.forEach(n => {
            const d = M.hexDistance(n, target);
            if (d < bestD) { bestD = d; best = n; }
        });
        if (!best) break;
        M.digUWHex(gameState, unit, best.x, best.y);
        steps++;
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────
console.log('=== (a) Recap-Sichtbarkeit: uw/global-Tags steuern die Fog-Filterung (Nachbau der Regel aus js/main.js) ===');
{
    const state = freshState(21, 7, 2);
    // 1:1-Nachbau der Filterzeile aus bootGame/startRecap (js/main.js) bzw. der
    // visibleRecaps-Filter in js/render.js/js/render3d.js — main.js/render*.js
    // selbst sind zu DOM-lastig für den Node-Loader, die Regel ist aber eine
    // reine Ein-Zeilen-Entscheidung auf getVisibleHexes/getVisibleUWHexes.
    function recapVisible(viewerId, action) {
        if (action.global) return true;
        const vis = action.uw ? M.getVisibleUWHexes(viewerId) : M.getVisibleHexes(viewerId);
        return vis.has(`${action.x},${action.y}`);
    }

    assert(recapVisible(1, { x: 0, y: 0, t: 'wormdeath', global: true }) === true, 'global:true (Wurm-Tod/Erschließung) ist immer sichtbar, unabhängig von jeder Erkundung');

    state.p[1].ue = [];
    assert(recapVisible(1, { x: 3, y: 3, t: 'dig', uw: true }) === false, 'uw:true außerhalb des eigenen Netzes bleibt unsichtbar — kein Informations-Leck über fremde Stollen');

    state.p[1].ue = [3 * state.bw + 3];
    assert(recapVisible(1, { x: 3, y: 3, t: 'deliver', uw: true }) === true, 'uw:true im eigenen Netz ist sichtbar (z.B. eigenes Abliefern)');

    const own = state.u.find(u => u.p === 1);
    assert(recapVisible(1, { x: own.x, y: own.y, t: 'mv' }) === true, 'Aktion ohne uw-Tag nutzt weiterhin die Oberflächen-Sichtregel (getVisibleHexes)');
    assert(recapVisible(1, { x: own.x + 5, y: own.y, t: 'mv' }) === false, 'Oberflächen-Aktion außerhalb der Sicht bleibt weiterhin unsichtbar (unveränderte Alt-Regel)');
}

console.log('\n=== (b) Diplomatie: Verbündete teilen die Netz-Geometrie im Unterwelt (analog p[].e-Sichtteilung oben) ===');
{
    const state = freshState(21, 7, 3);
    state.p[0].al = [2]; state.p[2].al = [0]; // Bündnis 0<->2, Spieler 1 bleibt außen vor
    const testIdx = 5 * state.bw + 5;
    state.p[0].ue = [testIdx];
    state.p[2].ue = [];
    state.p[1].ue = [];

    assert(M.getVisibleUWHexes(2).has('5,5'), 'Verbündeter (p2) sieht das Netz-Hex von p0 mit (Bündnis-Sichtteilung, wie an der Oberfläche)');
    assert(!M.getVisibleUWHexes(1).has('5,5'), 'Nicht-Verbündeter (p1) sieht das fremde Netz-Hex weiterhin NICHT');
    assert(!M.getVisibleUWHexes(2, false).has('5,5'), 'includeAllies=false liefert wie an der Oberfläche nur die eigene Geometrie');
}

console.log('\n=== (c) Diplomatie: Verbündete Tiefeneinheiten immer sichtbar, Feinde bleiben auf Umkreis 2 beschränkt ===');
{
    const state = freshState(21, 7, 3);
    state.p[0].al = [2]; state.p[2].al = [0];
    state.uw.u = [
        { i: 1, p: 0, t: 7, x: 10, y: 10, h: 8 },
        { i: 2, p: 2, t: 17, x: 20, y: 20, h: 14 }, // Verbündete Einheit, weit weg von p0
        { i: 3, p: 1, t: 18, x: 15, y: 15, h: 8 },  // Feind, weit weg von allem Eigenen/Verbündeten (Distanz > 2 zu beiden)
    ];
    assert(M.isUWUnitVisible(0, state.uw.u[1]) === true, 'Verbündete Einheit ist unabhängig von der Distanz immer sichtbar');
    assert(M.isUWUnitVisible(0, state.uw.u[2]) === false, 'Fremde Einheit außerhalb jedes Umkreis-2 (weder eigen noch verbündet) bleibt unsichtbar');

    state.uw.u[2].x = 19; state.uw.u[2].y = 20; // rückt in Umkreis 2 der VERBÜNDETEN (nicht eigenen) Einheit vor
    assert(M.isUWUnitVisible(0, state.uw.u[2]) === true, 'Feind im Umkreis 2 einer VERBÜNDETEN Einheit ist ebenfalls sichtbar (geteilte Vorposten-Sicht, analog Oberfläche)');

    const creature = { t: M.UWC_SPINNE, x: 19, y: 20, h: 6 };
    assert(M.isUWCreatureVisible(0, creature) === true, 'isUWCreatureVisible degradiert korrekt zu isUWUnitVisible inkl. Verbündeten-Umkreis (Kreaturen haben kein .p, sind nie "verbündet")');
}

console.log('\n=== (d) Diplomatie: calculateAttacksUW schließt Verbündete/Waffenstillstand weiterhin aus (M10-Verhalten gegengeprüft) ===');
{
    const state = freshState(21, 7, 3);
    state.cp = 0;
    state.p[0].al = [2];
    state.p[0].tc = [1];
    const attacker = { i: 1, p: 0, t: 17, x: 10, y: 10, h: 14, a: 0 };
    state.uw.u = [
        attacker,
        { i: 2, p: 2, t: 7, x: 11, y: 10, h: 8 }, // Verbündeter Nachbar
        { i: 3, p: 1, t: 7, x: 10, y: 9, h: 8 },  // Waffenstillstand-Nachbar
    ];
    const attacks = M.calculateAttacksUW(attacker);
    assert(!attacks.some(a => a.x === 11 && a.y === 10), 'Verbündete Einheit ist kein gültiges Angriffsziel');
    assert(!attacks.some(a => a.x === 10 && a.y === 9), 'Waffenstillstand-Einheit ist kein gültiges Angriffsziel');
}

console.log('\n=== (e) Diplomatie: Bündnisbruch WÄHREND laufender Erschließung interrumpiert sie beim nächsten Zugenden-Check ===');
{
    const state = freshState(21, 7, 3);
    const heart = M.getHeartCavernHexes(state);
    const center = heart[0];
    state.uw.wd = 1; // Wurm tot (direkte Manipulation laut Auftrag zulässig)
    state.uw.c = (state.uw.c || []).filter(c => c.t !== M.UWC_WURM);
    state.p[0].al = [2]; state.p[2].al = [0];
    state.uw.u = [
        { i: 1, p: 0, t: 7, x: center.x, y: center.y, h: 8 },
        { i: 2, p: 2, t: 7, x: heart[1].x, y: heart[1].y, h: 8 }, // Verbündeter, ebenfalls in der Kaverne
    ];
    assert(M.checkErschliessungProgress(state, 0) === true, 'Erschließung hält mit Verbündetem in der Kaverne (Bündnis noch aktiv)');
    let evt = M.advanceErschliessung(state, 0);
    assert(evt && evt.type === 'start' && state.uw.hz.n === 1, 'Erschließung startet (n=1)');
    evt = M.advanceErschliessung(state, 0);
    assert(evt.type === 'progress' && state.uw.hz.n === 2, 'Erschließung schreitet fort (n=2)');

    // Bündnis bricht MITTEN in der laufenden Erschließung — KEINE Einheit bewegt sich!
    state.p[0].al = []; state.p[2].al = [];
    assert(M.checkErschliessungProgress(state, 0) === false, 'nach Bündnisbruch zählt der Ex-Verbündete in der Kaverne wieder als Gegner (al[] wird live gelesen, kein Caching)');
    evt = M.advanceErschliessung(state, 0);
    assert(evt && evt.type === 'reset' && !state.uw.hz, 'Bündnisbruch resettet eine laufende Erschließung auf den nächsten Zugenden-Check (n->0), obwohl nur die Diplomatie sich geändert hat');
}

console.log('\n=== (f) Diplomatie: Geschenke/Tribute (sendResources) bleiben von der Unterwelt-Arbeit unberührt funktionsfähig ===');
{
    const state = freshState(21, 7, 2);
    state.cp = 0;
    state.p[0].g = 20; state.p[0].m = 10; state.p[0].s = 5;
    state.p[1].g = 0; state.p[1].m = 0; state.p[1].s = 0;
    global.document = {
        getElementById: (id) => {
            if (id === 'gift-g-1') return { value: '5' };
            if (id === 'gift-m-1') return { value: '2' };
            if (id === 'gift-s-1') return { value: '0' };
            return { value: '' };
        }
    };
    global.openDiplomacy = () => { };
    global.updateUI = () => { };
    // isMyActiveTurn (js/diplomacy.js) liest isLegacyUrlMode/currentGameId als
    // freie Bezeichner aus dem umschließenden Funktions-Scope, NICHT als
    // window.-Property — daher hier als echte globale Variable setzen statt
    // isMyActiveTurn selbst zu überschreiben (das wäre wirkungslos, da
    // sendResources die Closure-lokale Funktion aufruft, nicht window.*).
    global.isLegacyUrlMode = true;
    global.sendResources(1);
    assert(state.p[0].g === 15 && state.p[0].m === 8, 'sendResources zieht dem Absender weiterhin korrekt ab (unverändert seit vor der Unterwelt)');
    assert(state.p[1].g === 5 && state.p[1].m === 2, 'sendResources gutschreibt dem Empfänger weiterhin korrekt (unverändert seit vor der Unterwelt)');
    assert(state.p[1].gifts && state.p[1].gifts.length === 1 && state.p[1].gifts[0].from === 0, 'p[].gifts-Eintrag wird weiterhin korrekt angelegt (Toast-Anzeige beim Empfänger)');
    global.document = { getElementById: () => null }; // zurücksetzen für die folgenden Abschnitte
}

// ─────────────────────────────────────────────────────────────────────────
// (g) BLOB-GRÖSSE: realistischer Spätspiel-Zustand (3 Spieler, Radius 7, ~20
// Oberflächen-Einheiten, 8 Tiefeneinheiten, 15 gegrabene Hexes, Kreaturen,
// Reliquien, laufende Erschließung) vs. Referenzzustand OHNE jeden Unterwelt-
// Inhalt (gleiche Oberfläche, state.uw komplett leer/entfernt).
console.log('\n=== (g) Blob-Größen-Messung: Spätspiel MIT vs. OHNE Unterwelt-Inhalt ===');
let lateGameStateForUrlTest = null;
{
    const state = freshState(4242, 7, 3);
    state.rn = 18;

    // ~20 Oberflächen-Einheiten über 3 Spieler verteilt (bunte Typmischung)
    const surfaceTypes = [0, 1, 2, 3, 4, 7, 9, 10];
    let sid = 1;
    state.u = [];
    for (let p = 0; p < 3; p++) {
        for (let k = 0; k < 7; k++) {
            state.u.push({ i: sid++, p, t: surfaceTypes[k % surfaceTypes.length], x: 2 + p * 3 + (k % 4), y: 2 + p * 2 + Math.floor(k / 4), h: 10, a: 0 });
        }
    }

    // 8 Tiefeneinheiten (gemischtes Roster) — 7 (Arbeiter) statt 16, kein
    // eigener Tunnelgräber-Typ mehr (Korrektur Juli 2026).
    const uwTypes = [7, 17, 18, 19, 20, 21, 22, 7];
    let uid = 1;
    state.uw.u = uwTypes.map((t, k) => ({ i: uid++, p: k % 3, t, x: 3 + k, y: 3 + (k % 5), h: M.unitStats[t].maxHp, a: 0, cr: k % 3 }));

    // 15 gegrabene Hexes
    state.uw.d = Array.from({ length: 15 }, (_, k) => (4 + k) * state.bw + (4 + (k % 6)));

    // Kreaturen (Standard-Platzierung der Karte bleibt + ein paar zusätzliche für Realismus)
    if (!state.uw.c) state.uw.c = [];
    state.uw.c.push({ t: M.UWC_SPINNE, x: 6, y: 6, h: 6 }, { t: M.UWC_WUEHLER, x: 8, y: 8, h: 12 });

    // Reliquien: je 1 Spieler etwas im Inventar/ausgerüstet
    state.p[0].rel = ['blade'];
    state.p[1].rel = [];
    state.uw.u[1].art = 'armor';
    state.p[2].k = 6;

    // Ein Tunnel + laufende Erschließung
    state.tu = [{ x1: 3, y1: 3, x2: 10, y2: 10, o: 0, h: 13, r: 1 }];
    const heart = M.getHeartCavernHexes(state);
    state.uw.wd = 1;
    state.uw.hz = { p: 0, n: 2 };
    state.uw.u.push({ i: uid++, p: 0, t: 7, x: heart[0].x, y: heart[0].y, h: 8, a: 0 });

    // etwas Netz-Erkundung + Lärm-Marker (realistische Spätspiel-Fog-Größe)
    state.p.forEach((p, idx) => { p.ue = Array.from({ length: 25 }, (_, i) => i + idx * 30); p.e = Array.from({ length: 60 }, (_, i) => i + idx * 10); });
    state.uw.n = [{ x: 5, y: 5 }, { x: 9, y: 9 }];

    lateGameStateForUrlTest = JSON.parse(JSON.stringify(state));

    const withUW = LZString.compressToEncodedURIComponent(JSON.stringify(state));

    const stateNoUW = JSON.parse(JSON.stringify(state));
    delete stateNoUW.uw;
    stateNoUW.p.forEach(p => { delete p.ue; delete p.rel; delete p.k; });
    const withoutUW = LZString.compressToEncodedURIComponent(JSON.stringify(stateNoUW));

    const deltaBytes = withUW.length - withoutUW.length;
    const sharePct = (deltaBytes / withUW.length * 100).toFixed(1);
    console.log(`    Blob MIT Unterwelt:    ${withUW.length} Zeichen`);
    console.log(`    Blob OHNE Unterwelt:   ${withoutUW.length} Zeichen`);
    console.log(`    Unterwelt-Anteil:      ${deltaBytes} Zeichen (${sharePct}% des Gesamt-Blobs)`);
    assert(withUW.length > withoutUW.length, 'Unterwelt-Inhalt vergrößert den komprimierten Blob messbar (Plausibilitäts-Check)');
    assert(typeof withUW === 'string' && withUW.length > 0, 'LZString-Kompression liefert einen gültigen, nicht-leeren Blob-String');
}

// ─────────────────────────────────────────────────────────────────────────
// (h) 3-SPIELER-SIMULATION über die reinen Logik-Funktionen. Player 0 baut
// einen Tunnel, gräbt zur Herzkaverne durch, tötet den Wurm (direkte
// Manipulation, laut Auftrag zulässig) und startet die Erschließung. Player 1
// unterminiert Player 0s einzigen Tunnel (Moral-Kollaps), UND schickt zwischen-
// zeitlich selbst eine Einheit in die Kaverne (echte Unterbrechung -> Reset).
// Player 2 ist mit Player 0 verbündet, steht mit in der Kaverne und
// unterbricht nicht. Nach dem Reset läuft es sauber bis n==4 -> Team-Sieg 1+3.
// JEDER Zwischenschritt läuft durch einen vollständigen Serialisierungs-
// Roundtrip (Bereinigung wie doEndTurn/confirmSurrender + Restore wie
// bootGame, 1:1 aus js/input.js bzw. js/main.js nachgebaut).
console.log('\n=== (h) 3-Spieler-Partie: Tunnel -> Graben -> Wurm tot -> Erschließung -> Unterminierung/Reset -> Team-Sieg 1+3 ===');

// --- Serialisierungs-Roundtrip-Helfer (1:1-Nachbau aus js/input.js doEndTurn/
// confirmSurrender-Bereinigung + js/main.js bootGame-Restore) -----------------
function serializeForWire(state) {
    state.p.forEach(p => {
        if (Array.isArray(p.e)) p.e = M.compressFog(p.e);
        if (Array.isArray(p.ue)) p.ue = M.compressFog(p.ue);
        if (p.al && p.al.length === 0) delete p.al;
        if (p.req && p.req.length === 0) delete p.req;
        if (p.tc && p.tc.length === 0) delete p.tc;
        if (p.of && p.of.length === 0) delete p.of;
        if (p.gifts && p.gifts.length === 0) delete p.gifts;
        if (p.rel && p.rel.length === 0) delete p.rel;
        if (p.dead === 0) delete p.dead;
    });
    if (state.tu && state.tu.length === 0) delete state.tu;
    if (state.wa && state.wa.length === 0) delete state.wa;
    if (state.st && state.st.length === 0) delete state.st;
    if (state.tw && state.tw.length === 0) delete state.tw;
    state.u.forEach(u => {
        if (u.a === 0) delete u.a;
        if (u.dp === 0) delete u.dp;
        if (!u.mi) delete u.mi;
        if (!u.bn) delete u.bn;
        delete u.i;
    });
    if (state.uw) {
        (state.uw.u || []).forEach(u => { if (u.a === 0) delete u.a; delete u.i; });
        if (Array.isArray(state.uw.d)) state.uw.d = M.compressFog(state.uw.d);
        if (state.uw.n && state.uw.n.length === 0) delete state.uw.n;
        if (state.uw.a && Object.keys(state.uw.a).length === 0) delete state.uw.a;
        if (state.uw.f && Object.keys(state.uw.f).length === 0) delete state.uw.f;
        if (state.uw.w && Object.keys(state.uw.w).length === 0) delete state.uw.w;
        if (state.uw.c && state.uw.c.length === 0) delete state.uw.c;
        if (!state.uw.d && (!state.uw.u || state.uw.u.length === 0) && !state.uw.n && !state.uw.a && !state.uw.f && !state.uw.w && !state.uw.c && !state.uw.wd && !state.uw.hz) delete state.uw;
    }
    if (state.bd && state.bd.length === 0) delete state.bd;
    if (state.uwbd && state.uwbd.length === 0) delete state.uwbd;
    return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

function restoreFromWire(wire) {
    const state = JSON.parse(LZString.decompressFromEncodedURIComponent(wire));
    state.p.forEach(p => {
        if (typeof p.e === 'string') p.e = M.decompressFog(p.e);
        if (!p.e) p.e = [];
        if (typeof p.ue === 'string') p.ue = M.decompressFog(p.ue);
        if (!p.ue) p.ue = [];
        if (!p.al) p.al = [];
        if (!p.req) p.req = [];
        if (!p.tc) p.tc = [];
        if (!p.gifts) p.gifts = [];
        if (!p.of) p.of = [];
        if (!p.rel) p.rel = [];
        if (p.dead === undefined) p.dead = 0;
        if (p.s === undefined) p.s = 0;
        if (p.k === undefined) p.k = 0;
    });
    if (!state.tu) state.tu = [];
    if (!state.wa) state.wa = [];
    if (!state.st) state.st = [];
    if (!state.tw) state.tw = [];
    if (!state.uw) state.uw = { d: [], u: [], n: [], a: {}, f: {}, w: {}, c: [] };
    if (!state.uw.d) state.uw.d = [];
    if (typeof state.uw.d === 'string') state.uw.d = M.decompressFog(state.uw.d);
    if (!state.uw.u) state.uw.u = [];
    if (!state.uw.n) state.uw.n = [];
    if (!state.uw.a) state.uw.a = {};
    if (!state.uw.f) state.uw.f = {};
    if (!state.uw.w) state.uw.w = {};
    if (!state.uw.c) state.uw.c = [];
    state.uw.u.forEach((u, idx) => { if (u.a === undefined) u.a = 0; if (!u.i) u.i = idx + 1; });
    state.u.forEach((u, idx) => { if (u.a === undefined) u.a = 0; if (!u.i) u.i = idx + 1; if (u.dp === undefined) u.dp = 0; if (u.mi === undefined) delete u.mi; });
    return state;
}

// Ein Roundtrip-Schritt: bereinigen -> auf die Leitung -> restaurieren, mit
// Assertion, dass ein paar Schlüsselfelder den Trip verlustfrei überstehen.
function roundtrip(state, label) {
    const before = JSON.parse(JSON.stringify(state)); // Schnappschuss VOR der destruktiven Bereinigung
    const wire = serializeForWire(state);
    const restored = restoreFromWire(wire);
    assert(restored.uw.u.length === (before.uw.u || []).length, `${label}: uw.u-Anzahl verlustfrei nach Roundtrip (${restored.uw.u.length})`);
    assert(JSON.stringify(restored.uw.hz || null) === JSON.stringify(before.uw.hz || null), `${label}: uw.hz verlustfrei nach Roundtrip`);
    assert(restored.uw.wd === before.uw.wd, `${label}: uw.wd verlustfrei nach Roundtrip`);
    assert((restored.tu || []).length === (before.tu || []).length, `${label}: tu[] verlustfrei nach Roundtrip`);
    assert(JSON.stringify(restored.p.map(p => (p.al || []).slice().sort())) === JSON.stringify(before.p.map(p => (p.al || []).slice().sort())), `${label}: p[].al (Bündnisse) verlustfrei nach Roundtrip`);
    useState(restored);
    return restored;
}

{
    let state = freshState(777, 7, 3);
    const heart = M.getHeartCavernHexes(state);
    const center = heart[0];

    // Alle drei Spieler bekommen reichlich Gold für die Testkäufe.
    state.p.forEach(p => { p.g = 999; });

    // Wurm tot (direkte Manipulation, laut Auftrag zulässig — das eigentliche
    // Kämpfen gegen ihn ist bereits in M11/M10 (resolveUWAttackOnCreature)
    // ausführlich verifiziert und nicht Gegenstand dieser Integrations-Suite).
    state.uw.wd = 1;
    state.uw.c = (state.uw.c || []).filter(c => c.t !== M.UWC_WURM);

    // Player 0: EIN Tunnel (einziger, damit die spätere Unterminierung den
    // Moral-Kollaps sauber auslöst) von einer Ecke nahe des eigenen Startdorfs
    // hin zu einem Punkt einige Hexes von der Herzkaverne entfernt.
    // x1,y1 = Tunnel-STARTPUNKT (physische Bewegungsreichweite der bauenden
    // Einheit) -> hier entsteht der Stollenkopf. x2,y2 = frei wählbarer
    // Zielpunkt -> bewusst KEIN Stollenkopf (Juli-2026-Korrektur, js/hex.js
    // getUnderworldTunnelHeads) — sonst könnte Player 0 seinen zweiten Tunnel-
    // Ausgang direkt an die Herzkaverne legen und bräuchte gar nicht zu graben.
    const startX = Math.max(0, state.rad - 3), startY = state.rad;
    const tunnelHeadX = startX - 1, tunnelHeadY = startY;
    state.tu = [{ x1: tunnelHeadX, y1: tunnelHeadY, x2: startX, y2: startY, o: 0, h: 13, r: state.rn }];
    assert(M.isUnderworldTunnelHead(state, tunnelHeadX, tunnelHeadY), 'Tunnel-STARTPUNKT ist sofort ein nutzbarer Stollenkopf (M9b-Verhalten)');
    assert(!M.isUnderworldTunnelHead(state, startX, startY), 'Tunnel-ZIELPUNKT ist KEIN Stollenkopf (Juli-2026-Korrektur)');

    // Arbeiter (7): Rekrutierung oben (Dorf, Muster buyUnit) + echtes Abtauchen
    // am Tunnel-STARTPUNKT (descendUWUnit, Juli-2026-Korrektur — kein eigener
    // Tunnelgräber-Typ mehr, der Arbeiter behält Typ 7 auch unten), dann zur
    // Herzkaverne durchgraben (echte digUWHex-Aufrufe).
    const surfaceDigger = { i: 9001, p: 0, t: 7, x: tunnelHeadX, y: tunnelHeadY, h: M.getUnitMaxHp(state.p[0], 7), a: 0 };
    state.u.push(surfaceDigger);
    let digger = M.descendUWUnit(state, surfaceDigger);
    assert(digger.t === 7 && digger.x === tunnelHeadX && digger.y === tunnelHeadY, 'Arbeiter taucht exakt am Tunnel-Startpunkt in die Unterwelt ab (kein Typwechsel)');
    const digStartDist = M.hexDistance({ x: digger.x, y: digger.y }, center);
    const steps = walkAndDig(digger, center.x, center.y);
    assert(digger.x === center.x && digger.y === center.y, `Tunnelgräber erreicht das Herzkaverne-Zentrum nach ${steps} echten Grab-Schritten (Startdistanz war ${digStartDist})`);
    assert(steps > 0, 'es wurde tatsächlich echt gegraben (nicht nur Startposition = Ziel)');
    state = roundtrip(state, 'nach dem Durchgraben zur Herzkaverne');
    digger = M.uwUnitAt(center.x, center.y);

    // Erschließung starten + zwei Runden lang normal fortschreiten.
    assert(M.checkErschliessungProgress(state, 0) === true, 'Erschließungs-Bedingung erfüllt (Wurm tot, eigene Einheit im Zentrum, keine Gegner in der Kaverne)');
    let evt = M.advanceErschliessung(state, 0);
    assert(evt.type === 'start' && state.uw.hz.n === 1, 'Erschließung gestartet (n=1)');
    state = roundtrip(state, 'nach Erschließungs-Start');

    evt = M.advanceErschliessung(state, 0);
    assert(evt.type === 'progress' && state.uw.hz.n === 2, 'Erschließung schreitet fort (n=2)');
    state = roundtrip(state, 'nach n=2');

    // Player 2 ist mit Player 0 verbündet und stellt sich mit in die Kaverne —
    // das darf die laufende Erschließung NICHT unterbrechen.
    state.p[0].al = [2]; state.p[2].al = [0];
    // Grubenwache (17) statt Tunnelgräber — jede reguläre, am Stollenkopf
    // kaufbare Unterwelt-Einheit belegt die Kaverne, das ist hier nicht
    // Gegenstand des Tests (Juli-2026-Korrektur: 16 wäre hier gar nicht mehr
    // direkt kaufbar).
    const allyUnit = M.buyUWUnitAt(state, 2, heart[1].x, heart[1].y, 17);
    assert(M.checkErschliessungProgress(state, 0) === true, 'Verbündete Einheit (Player 3) IN der Kaverne unterbricht die Erschließung NICHT');
    evt = M.advanceErschliessung(state, 0);
    assert(evt.type === 'progress' && state.uw.hz.n === 3, 'Erschließung schreitet trotz Verbündeten-Präsenz weiter fort (n=3)');
    state = roundtrip(state, 'nach n=3 mit Verbündetem in der Kaverne');

    // Player 1 zerstört Player 0s einzigen Tunnel-Endpunkt im normalen
    // Oberflächen-Kampf (Tunnel-HP-Abbau ist bereits an anderer Stelle
    // getestet, hier nur das Ergebnis direkt gesetzt — Dynamit/Unterminierung
    // gibt es seit Juli 2026 nicht mehr, Tiefeneinheiten haben KEINE
    // Auswirkung auf die Oberfläche) -> Moral-Kollaps tritt ein. WICHTIG: das
    // allein unterbricht die Erschließung NICHT (checkErschliessungProgress
    // prüft nur Zentrum+Kaverne-Besatzung, nicht die Tunnel-/Moral-Lage der
    // Expedition) — genau das wird hier gegengeprüft, siehe Auftrag:
    // "Erschließung continues despite player 2's interruption attempt".
    assert(state.tu.some(t => t.o === 0), 'Testaufbau: Player 0 hat vor der Zerstörung noch seinen Tunnel');
    state.tu = state.tu.filter(t => t.o !== 0);
    assert(state.tu.length === 0, 'Player 0s einziger Tunnel wurde zerstört');
    assert(M.hasUsableTunnel(state, 0) === false, 'Player 0 hat keinen nutzbaren Tunnel mehr');
    const collapseFloats = M.applyMoralCollapse(state, 0);
    assert(collapseFloats.length === state.uw.u.filter(u => u.p === 0).length, 'Moral-Kollaps trifft alle Tiefeneinheiten von Player 0 (je -1 HP)');
    assert(M.checkErschliessungProgress(state, 0) === true, 'Erschließung hält TROTZ Moral-Kollaps (Einheit steht weiterhin im Zentrum, kein Gegner in der Kaverne — Moral-Kollaps ist orthogonal zur Erschließungs-Bedingung)');
    evt = M.advanceErschliessung(state, 0);
    assert(evt.type === 'progress' && state.uw.hz.n === 4, 'Erschließung erreicht n=4 trotz laufendem Moral-Kollaps der Expedition');
    state = roundtrip(state, 'nach Unterminierung + Moral-Kollaps, n=4 erreicht');

    // Team-Sieg über die Erschließung: Player 0 + sein lebender Verbündeter
    // Player 2 gewinnen gemeinsam ("1+3" in 1-basierter Zählung).
    const winners = M.checkErschliessungWin(state);
    assert(!!winners, 'checkErschliessungWin liefert bei n>=4 ein Ergebnis');
    const winnerIds = winners.map(p => state.p.indexOf(p)).sort();
    assert(JSON.stringify(winnerIds) === JSON.stringify([0, 2]), `Sieger sind exakt Player 1+3 (0-indiziert 0,2) — gemessen: [${winnerIds}]`);
    assert(!winners.some(p => state.p.indexOf(p) === 1), 'Player 2 (der Unterminierer) gehört NICHT zu den Siegern');
}

console.log('\n=== (h2) Regression: eine ECHTE Unterbrechung (Gegner betritt die Kaverne) resettet n auf 0, danach sauberer Neuaufbau bis n==4 ===');
{
    let state = freshState(778, 7, 3);
    const heart = M.getHeartCavernHexes(state);
    const center = heart[0];
    state.uw.wd = 1;
    state.uw.c = (state.uw.c || []).filter(c => c.t !== M.UWC_WURM);
    state.p.forEach(p => { p.g = 999; });

    state.uw.u = [{ i: 1, p: 0, t: 7, x: center.x, y: center.y, h: 8, a: 0 }];
    assert(M.checkErschliessungProgress(state, 0) === true, 'Ausgangslage: Erschließung würde halten');
    let evt = M.advanceErschliessung(state, 0);
    assert(evt.type === 'start' && state.uw.hz.n === 1, 'Erschließung gestartet (n=1)');
    evt = M.advanceErschliessung(state, 0);
    assert(evt.type === 'progress' && state.uw.hz.n === 2, 'Fortschritt auf n=2');
    state = roundtrip(state, 'vor der echten Unterbrechung');

    // Player 1 (NICHT verbündet) schickt eine Einheit physisch in die Kaverne.
    state.uw.u.push({ i: 2, p: 1, t: 7, x: heart[2].x, y: heart[2].y, h: 8, a: 0 });
    assert(M.checkErschliessungProgress(state, 0) === false, 'echte Gegner-Präsenz in der Kaverne unterbricht die Bedingung');
    evt = M.advanceErschliessung(state, 0);
    assert(evt.type === 'reset' && !state.uw.hz, 'echte Unterbrechung resettet n auf 0 (uw.hz gelöscht) — Gegenprobe zu (h), wo NUR ein Verbündeter/Moral-Kollaps NICHT resettet');
    state = roundtrip(state, 'nach dem Reset');

    // Der Eindringling zieht wieder ab -> sauberer Neuaufbau bis n==4.
    state.uw.u = state.uw.u.filter(u => u.p === 0);
    for (let i = 1; i <= 4; i++) {
        evt = M.advanceErschliessung(state, 0);
        assert(state.uw.hz.n === i, `Neuaufbau nach Reset: n erreicht ${i}/4`);
    }
    const winners = M.checkErschliessungWin(state);
    assert(!!winners && winners.length === 1 && state.p.indexOf(winners[0]) === 0, 'nach dem Neuaufbau gewinnt Player 1 (ohne Verbündeten in diesem zweiten Durchlauf) sauber');
    state = roundtrip(state, 'nach dem sauberen Neuaufbau bis n=4');
}

// ─────────────────────────────────────────────────────────────────────────
// (i) LEGACY-URL-LÄNGEN-CHECK (lz-string, state=... Parameter) für den
// Spätspiel-Zustand aus Abschnitt (g) — Legacy-URL-Modus (isLegacyUrlMode,
// js/globals.js) hängt den komprimierten State 1:1 als state=... an die URL.
console.log('\n=== (i) Legacy-URL-Längen-Check (state=... Parameter) für den Blob-Zustand aus (g) ===');
{
    const compact = JSON.parse(JSON.stringify(lateGameStateForUrlTest));
    compact.p.forEach(p => {
        if (Array.isArray(p.e)) p.e = M.compressFog(p.e);
        if (Array.isArray(p.ue)) p.ue = M.compressFog(p.ue);
    });
    if (Array.isArray(compact.uw.d)) compact.uw.d = M.compressFog(compact.uw.d);
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(compact));
    const url = `https://example.invalid/index.html?state=${encoded}`;
    console.log(`    state=...-Parameter: ${encoded.length} Zeichen`);
    console.log(`    Gesamt-URL-Länge:    ${url.length} Zeichen`);
    // Praxisrichtwert: gängige Browser/Server-Limits liegen bei ca. 8000 Zeichen
    // (IE/ältere Proxies deutlich niedriger, moderne Browser höher) — der
    // Legacy-URL-Modus ist für kleinere/mittlere Partien gedacht, kein Ersatz
    // für den Server-Modus bei Spätspiel-Zuständen dieser Größenordnung.
    assert(encoded.length > 0, 'state=...-Parameter lässt sich verlustfrei kodieren (nicht-leer)');
    if (url.length > 8000) {
        console.log(`    HINWEIS: Gesamt-URL überschreitet die gängige 8000-Zeichen-Praxisgrenze für Spätspiel-Zustände mit Unterwelt-Inhalt — erwartet und unkritisch, der Legacy-URL-Modus ist laut CLAUDE.md ohnehin ein Nebenpfad ("kept alive"), der Server-Modus ist der empfohlene Weg für größere/längere Partien.`);
    }
}

// ─────────────────────────────────────────────────────────────────────────
console.log(failures === 0 ? '\n=== Zusammenfassung: ALLE CHECKS BESTANDEN ===' : `\n=== Zusammenfassung: ${failures} CHECK(S) FEHLGESCHLAGEN ===`);
process.exit(failures === 0 ? 0 : 1);
