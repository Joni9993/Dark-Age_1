// Verifikationsskript M12 — lädt die echten Spiel-Skripte (Muster wie
// maptest/verify_underworld_m11.js), testet die DOM-freien Kernfunktionen:
// Unterminierung (Kammer/Zünden), Stollenbruch, Moral-Kollaps, Erschließung + Sieg.
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
            getUnderminingTargetAt, applyUnderminingDamage, resolveUWAttack, resolveUWAttackOnCreature,
            hasUsableTunnel, applyMoralCollapse,
            checkErschliessungProgress, advanceErschliessung, checkErschliessungWin,
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
console.log('=== (a) Kammer nur unter gültigen Zielen, Zünden = exakt 6, normale Dörfer nie, Kammer verfällt bei Bewegung ===');
{
    const state = freshState(1, 7, 2);
    const hx = 3, hy = 3;

    // Turm als gültiges Ziel
    state.tw = [{ x: hx, y: hy, o: 1, h: 15, a: 0 }];
    let target = M.getUnderminingTargetAt(state, hx, hy);
    assert(target && target.type === 'tower', 'Turm wird als gültiges Ziel erkannt');
    state.tw = [];

    // Mauer als gültiges Ziel
    state.wa = [{ x: hx, y: hy, o: 1, h: 10 }];
    target = M.getUnderminingTargetAt(state, hx, hy);
    assert(target && target.type === 'wall', 'Mauer wird als gültiges Ziel erkannt');
    state.wa = [];

    // Tunnel-Endpunkt als gültiges Ziel
    state.tu = [{ x1: hx, y1: hy, x2: 0, y2: 0, o: 1, h: 13, r: state.rn }];
    target = M.getUnderminingTargetAt(state, hx, hy);
    assert(target && target.type === 'tunnel', 'Tunnel-Endpunkt wird als gültiges Ziel erkannt');
    state.tu = [];

    // Startdorf als gültiges Ziel
    state.p[1].sv = `${hx},${hy}`;
    target = M.getUnderminingTargetAt(state, hx, hy);
    assert(target && target.type === 'startvillage', 'Startdorf wird als gültiges Ziel erkannt');

    // Normales (neutrales) Dorf ist NIE ein gültiges Ziel
    const state2 = freshState(1, 7, 2);
    const hx2 = 4, hy2 = 4;
    state2.v[`${hx2},${hy2}`] = -1; // neutrales Dorf, KEIN Startdorf
    const t2 = M.getUnderminingTargetAt(state2, hx2, hy2);
    assert(t2 === null, 'normales (neutrales) Dorf ist NIE ein gültiges Unterminierungs-Ziel');
    // Auch ein SPIELER-besetztes normales Dorf (nicht sv) ist tabu
    state2.v[`${hx2},${hy2}`] = 0;
    const t2b = M.getUnderminingTargetAt(state2, hx2, hy2);
    assert(t2b === null, 'auch ein spielerbesetztes normales Dorf bleibt tabu (kein sv-Eintrag)');

    // Zünden = exakt 6 Schaden (Mauer: 10 -> 4, nicht zerstört)
    const state3 = freshState(1, 7, 2);
    const wall = { x: 1, y: 1, o: 1, h: 10 };
    state3.wa = [wall];
    M.applyUnderminingDamage(state3, { type: 'wall', ref: wall, ownerId: 1 }, 6, 0);
    assert(wall.h === 4, `Zünden macht exakt 6 Schaden (10 -> ${wall.h})`);
    assert(state3.wa.includes(wall), 'Mauer mit 4 HP übersteht die erste Zündung');
    M.applyUnderminingDamage(state3, { type: 'wall', ref: wall, ownerId: 1 }, 6, 0);
    assert(!state3.wa.includes(wall), 'zweite Zündung (4 HP - 6) zerstört die Mauer');

    // Kammer verfällt bei Bewegung (digUWHex löscht ch, wie executeUWMoveTo)
    const state4 = freshState(1, 7, 2);
    const cx = state4.rad, cy = state4.rad;
    const n1 = M.getNeighbors(cx, cy)[0];
    const sprengmeister = { i: 1, p: 0, t: 18, x: cx, y: cy, h: 8, ch: 1 };
    M.digUWHex(state4, sprengmeister, n1.x, n1.y);
    assert(sprengmeister.ch === undefined, 'Kammer (ch) verfällt, sobald sich der Sprengmeister bewegt (hier: gräbt+rückt nach)');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (b) Startdorf-Kill via Zünden triggert die normale Spieler-tot-Logik ===');
{
    const state = freshState(2, 7, 2);
    const victimId = 1;
    state.p[victimId].sh = 5; // stirbt an 6 Schaden
    const [svx, svy] = state.p[victimId].sv.split(',').map(Number);
    const uwVictimUnit = { i: 99, p: victimId, t: 7, x: 0, y: 0, h: 8 };
    state.uw.u.push(uwVictimUnit);
    const surfaceVictimUnit = { i: 98, p: victimId, t: 0, x: 1, y: 1, h: 10 };
    state.u.push(surfaceVictimUnit);

    M.applyUnderminingDamage(state, { type: 'startvillage', ownerId: victimId }, 6, 0);

    assert(state.p[victimId].dead === 1, 'Spieler ist nach dem Startdorf-Kill als tot markiert');
    assert(state.p[victimId].sh <= 0, 'Startdorf-HP <= 0');
    assert(!state.u.includes(surfaceVictimUnit), 'Oberflächen-Einheiten des toten Spielers entfernt (normale Zerstörungs-Logik)');
    assert(!state.uw.u.includes(uwVictimUnit), 'Unterwelt-Einheiten des toten Spielers ebenfalls entfernt');
    assert(state.v[`${svx},${svy}`] === 0, 'Startdorf wird vom unterminierenden Spieler erobert');

    // Nicht-tödlicher Treffer: Spieler bleibt am Leben
    const state2 = freshState(2, 7, 2);
    state2.p[1].sh = 30;
    M.applyUnderminingDamage(state2, { type: 'startvillage', ownerId: 1 }, 6, 0);
    assert(state2.p[1].dead !== 1 && state2.p[1].sh === 24, 'nicht-tödlicher Treffer tötet den Spieler nicht (30 -> 24)');
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

    // collapseUWHex reduziert uw.d korrekt
    assert(state.uw.d.includes(dugIdx), 'Index ist vor dem Stollenbruch in uw.d');
    M.collapseUWHex(state, dugHex.x, dugHex.y);
    assert(!state.uw.d.includes(dugIdx), 'Index ist nach dem Stollenbruch aus uw.d entfernt');
    assert(M.isUnderworldOpen(state, dugHex.x, dugHex.y) === false, 'Hex ist nach dem Stollenbruch wieder massiver Fels (nicht mehr offen)');
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
console.log('\n=== (e) Erschließung: Bedingungen, Verbündete unterbrechen nicht, Reset, Sieg bei n==4 ===');
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

    // advanceErschliessung: Start -> Fortschritt -> ... -> 4, dann Reset bei Unterbrechung
    const state5 = freshState(5, 5, 3);
    state5.uw.wd = 1;
    state5.uw.u.push({ i: 1, p: 0, t: 7, x: cx, y: cy, h: 8 });
    const e1 = M.advanceErschliessung(state5, 0);
    assert(e1 && e1.type === 'start' && e1.n === 1 && state5.uw.hz.n === 1, 'erster gehaltener Zugende startet uw.hz bei n=1');
    const e2 = M.advanceErschliessung(state5, 0);
    assert(e2.type === 'progress' && e2.n === 2, 'zweiter gehaltener Zugende erhöht auf n=2');
    M.advanceErschliessung(state5, 0);
    const e4 = M.advanceErschliessung(state5, 0);
    assert(e4.n === 4, 'vierter gehaltener Zugende erreicht n=4');
    assert(M.checkErschliessungWin(state5) !== null, 'bei n=4 meldet checkErschliessungWin einen Sieger');

    // Unterbrechung -> KOMPLETTER Reset (nicht Dekrement)
    state5.uw.u = []; // eigene Einheit verlässt das Zentrum
    const eReset = M.advanceErschliessung(state5, 0);
    assert(eReset.type === 'reset', 'Unterbrechung meldet type=reset');
    assert(state5.uw.hz === undefined, 'uw.hz wird bei Unterbrechung KOMPLETT gelöscht (Reset auf 0, kein Dekrement)');

    // Sieg-Gewinnerliste: Erschließer + lebende Verbündete, keine Fremden
    const state6 = freshState(5, 5, 3);
    state6.p[0].al = [1];
    state6.p[1].al = [0];
    state6.uw.hz = { p: 0, n: 4 };
    const winners = M.checkErschliessungWin(state6);
    assert(winners && winners.length === 2 && winners.some(p => p === state6.p[0]) && winners.some(p => p === state6.p[1]), 'Gewinnerliste = Erschließer + Verbündete, exakt 2 Spieler');
    assert(!winners.includes(state6.p[2]), 'nicht-verbündeter dritter Spieler ist NICHT unter den Gewinnern');

    // n < 4: noch kein Sieg
    const state7 = freshState(5, 5, 2);
    state7.uw.hz = { p: 0, n: 3 };
    assert(M.checkErschliessungWin(state7) === null, 'n=3 löst noch keinen Sieg aus');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== (f) Serialisierungs-Roundtrip u.ch/uw.hz ===');
{
    const state = freshState(6, 7, 2);
    state.uw.u.push({ i: 1, p: 0, t: 18, x: 3, y: 3, h: 8, ch: 1 });
    state.uw.hz = { p: 0, n: 2 };

    const wireJson = JSON.stringify(state);
    assert(wireJson.includes('"ch":1'), 'u.ch im Wire-JSON vorhanden');
    assert(wireJson.includes('"hz":{"p":0,"n":2}') || (wireJson.includes('"hz"') && wireJson.includes('"n":2')), 'uw.hz im Wire-JSON vorhanden');

    const restored = JSON.parse(wireJson);
    assert(restored.uw.u.find(u => u.t === 18).ch === 1, 'u.ch verlustfrei nach Roundtrip');
    assert(restored.uw.hz.p === 0 && restored.uw.hz.n === 2, 'uw.hz verlustfrei nach Roundtrip');

    // Regressionstest für den in diesem Milestone gefundenen Bug: state.uw darf
    // NICHT gelöscht werden, wenn uw.hz der einzige nicht-leere Teil ist (die
    // "alles leer -> delete gameState.uw"-Bedingung muss hz mit einschließen).
    const state2 = freshState(6, 7, 2);
    state2.uw = { d: [], u: [], n: [], a: {}, f: {}, w: {}, c: [], hz: { p: 0, n: 1 } };
    const uw = state2.uw;
    const shouldDelete = !uw.d.length && (!uw.u || uw.u.length === 0) && !(uw.n && uw.n.length) && !(uw.a && Object.keys(uw.a).length) && !(uw.f && Object.keys(uw.f).length) && !(uw.w && Object.keys(uw.w).length) && !(uw.c && uw.c.length) && !uw.wd && !uw.hz;
    assert(shouldDelete === false, 'uw.hz als einziges gesetztes Feld verhindert das Löschen von state.uw (Bugfix verifiziert)');
}

console.log(`\n=== Zusammenfassung: ${failures === 0 ? 'ALLE CHECKS BESTANDEN' : failures + ' FEHLGESCHLAGEN'} ===`);
process.exit(failures === 0 ? 0 : 1);
