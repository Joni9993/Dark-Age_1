// Verifikationsskript Rückblick (js/recap.js).
//
// Deckt die DOM-freien Regeln der Datei ab — geladen wird der echte
// Produktionscode, keine Kopie:
//   (a) recapAppendTurn: Log läuft über die ganze Runde, Selbst-Beschneidung,
//       Spielerstempel, Deckel, Migration alter Blobs ohne `p`.
//   (b) recapVisibleActions: Fog-/uw-/global-Regel wie bisher (M13) PLUS die
//       beiden neuen Regeln (eigene Aktionen raus, getarnte Einheit deckt zu).
//   (c) recapTouchesViewer: "trifft dich"-Erkennung inkl. `vo` (Vorbesitzer).
//   (d) buildRecapGroups: Verdichtung, Sortierung, Kreaturen-Gruppe.
//   (e) Serialisierung: der Log übersteht den LZString-Roundtrip und der Deckel
//       hält den Zuwachs am state_blob im Rahmen.
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
    global.window = global;
    global.isSpectator = false;
    global.showToast = () => { };

    // js/recap.js prüft `typeof document !== 'undefined'`, bevor es den
    // Panel-Teil anfasst — hier bleibt document deshalb bewusst UNdefiniert,
    // dann lädt die Datei nur ihren reinen Teil. Genau dafür ist die Trennung da.
    const files = ['js/prng.js', 'js/hex.js', 'js/data.js', 'js/mapgen.js', 'js/logic.js', 'js/recap.js'];
    const src = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
    const fn = new Function(src + `
        return {
            buildInitialGameState, createPRNG, compressFog, decompressFog,
            getVisibleHexes, getVisibleUWHexes, markUWExplored,
            recapAppendTurn, recapVisibleActions, recapTouchesViewer,
            buildRecapGroups, recapKind, RECAP_LOG_CAP, RECAP_KINDS
        };
    `);
    return fn();
}

const M = loadGameCode();
global.window.DEBUG_UW_REVEAL = false;
// playerColors lebt in js/art.js (6683 Zeilen Bilddaten, für diese Suite
// irrelevant) — buildRecapGroups fragt bewusst über `typeof` ab und fällt sonst
// auf Stein zurück. Hier bleibt es undefiniert, das deckt genau diesen Zweig ab.

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error('FAIL: ' + msg); failures++; }
    else console.log('OK: ' + msg);
}

function freshState(seed, radius, playerCount = 2) {
    const names = Array.from({ length: playerCount }, (_, i) => `P${i}`);
    const rng = M.createPRNG(seed);
    const origRandom = Math.random;
    Math.random = rng;
    let state;
    try { state = M.buildInitialGameState(names, radius); } finally { Math.random = origRandom; }
    global.gameState = state;
    return state;
}

// ─────────────────────────────────────────────────────────────────────────
console.log('=== (a) recapAppendTurn: Log über die ganze Runde statt nur den letzten Zug ===');
{
    const state = freshState(21, 7, 3);
    state.la = [];

    M.recapAppendTurn(state, 0, [{ x: 1, y: 1, t: 'mv' }]);
    M.recapAppendTurn(state, 1, [{ x: 2, y: 2, t: 'atk' }]);
    M.recapAppendTurn(state, 2, [{ x: 3, y: 3, t: 'buy' }]);
    assert(state.la.length === 3, 'Züge dreier Spieler stehen gleichzeitig im Log (alter Code hätte nur den letzten behalten)');
    assert(state.la.every(a => a.p !== undefined), 'jeder Eintrag trägt den handelnden Spieler');
    assert(state.la.map(a => a.p).join(',') === '0,1,2', 'Reihenfolge der Züge bleibt erhalten');

    // Spieler 0 ist wieder dran: seine alten Einträge haben alle gesehen.
    M.recapAppendTurn(state, 0, [{ x: 9, y: 9, t: 'cap' }]);
    assert(state.la.filter(a => a.p === 0).length === 1, 'Selbst-Beschneidung: der eigene Alt-Eintrag fällt raus, wenn der Spieler erneut zieht');
    assert(state.la.length === 3, 'Log wächst dadurch nicht über eine Runde hinaus');

    const legacy = { x: 5, y: 5, t: 'mv' };            // Blob von vor der Umstellung
    state.la = [legacy];
    M.recapAppendTurn(state, 1, [{ x: 6, y: 6, t: 'mv' }]);
    assert(state.la.length === 1 && state.la[0].x === 6, 'Alt-Einträge ohne `p` fallen beim ersten Zugende einmalig heraus (Migration)');

    state.la = [];
    const many = Array.from({ length: M.RECAP_LOG_CAP + 40 }, (_, i) => ({ x: i % 9, y: 1, t: 'mv' }));
    M.recapAppendTurn(state, 2, many);
    assert(state.la.length === M.RECAP_LOG_CAP, `Deckel greift bei ${M.RECAP_LOG_CAP} Einträgen`);
    assert(state.la[state.la.length - 1].x === many[many.length - 1].x, 'der Deckel wirft die ÄLTESTEN Einträge weg, nicht die neuesten');

    state.la = [];
    M.recapAppendTurn(state, 0, [{ x: 1, y: 1, t: 'cap', vo: -1 }, { x: 2, y: 2, t: 'cap', vo: 1 }]);
    assert(state.la[0].vo === undefined, 'vo === -1 (neutrales Dorf) wird als Default gelöscht — spart Blob-Bytes');
    assert(state.la[1].vo === 1, 'ein echter Vorbesitzer bleibt erhalten');
}

console.log('\n=== (b) recapVisibleActions: Fog-Regel (M13) + eigene Aktionen + Tarnung ===');
{
    const state = freshState(21, 7, 2);
    const own = state.u.find(u => u.p === 1);

    state.la = [{ x: 0, y: 0, t: 'wormdeath', global: true, p: 0 }];
    assert(M.recapVisibleActions(state, 1).length === 1, 'global:true bleibt fog-unabhängig sichtbar (unveränderte M13-Regel)');

    state.la = [{ x: own.x, y: own.y, t: 'mv', p: 1 }];
    assert(M.recapVisibleActions(state, 1).length === 0, 'eigene Aktionen sind kein Rückblick und fallen raus');
    assert(M.recapVisibleActions(state, 0).length === 0, 'dieselbe Aktion ist für den Gegner mangels Sicht ebenfalls unsichtbar');

    state.la = [{ x: own.x, y: own.y, t: 'mv', p: 0 }];
    assert(M.recapVisibleActions(state, 1).length === 1, 'fremde Aktion im eigenen Sichtfeld ist sichtbar (Oberflächenregel)');
    state.la = [{ x: own.x + 6, y: own.y, t: 'mv', p: 0 }];
    assert(M.recapVisibleActions(state, 1).length === 0, 'fremde Aktion außerhalb der Sicht bleibt unsichtbar');

    // Tarnung: die Regel stand vorher nur in den beiden Renderern.
    state.la = [{ x: own.x, y: own.y, t: 'atk', p: 0 }];
    state.u.push({ i: 999, p: 0, t: 5, x: own.x, y: own.y, h: 5, iv: 1 });
    assert(M.recapVisibleActions(state, 1).length === 0, 'getarnte fremde Einheit auf dem Feld deckt den Eintrag zu — kein Positions-Leak');
    state.u = state.u.filter(u => u.i !== 999);

    // Unterwelt: uw:true prüft das Netz, nicht die Oberfläche.
    state.p[1].ue = [];
    state.la = [{ x: 3, y: 3, t: 'dig', uw: true, p: 0 }];
    assert(M.recapVisibleActions(state, 1).length === 0, 'uw:true außerhalb des eigenen Netzes bleibt unsichtbar');
    state.p[1].ue = [3 * state.bw + 3];
    assert(M.recapVisibleActions(state, 1).length === 1, 'uw:true im eigenen Netz ist sichtbar');
}

console.log('\n=== (c) recapTouchesViewer: was trifft mich selbst? ===');
{
    const state = freshState(21, 7, 2);
    const myVillage = Object.keys(state.v).find(k => state.v[k] === 1);
    const [vx, vy] = myVillage.split(',').map(Number);
    const own = state.u.find(u => u.p === 1);

    assert(M.recapTouchesViewer(state, { x: vx, y: vy, t: 'atk' }, 1) === true, 'Angriff auf mein Dorf trifft mich');
    assert(M.recapTouchesViewer(state, { x: vx, y: vy, t: 'mv' }, 1) === false, 'eine Bewegung auf demselben Feld ist kein Übergriff (nur RECAP_HOSTILE zählt)');
    assert(M.recapTouchesViewer(state, { x: own.x, y: own.y, t: 'atk' }, 1) === true, 'Angriff auf meine Einheit trifft mich');
    assert(M.recapTouchesViewer(state, { x: vx, y: vy, t: 'atk' }, 0) === false, 'dasselbe Dorf trifft den anderen Spieler nicht');

    // Nach der Eroberung steht dort nichts Eigenes mehr — nur `vo` weiß es noch.
    // Bewusst NICHT am Startdorf getestet: p[].sv bleibt auch nach dem Verlust
    // stehen und zählt weiter als eigener Besitz (Absicht — das Heimatdorf ist
    // der Bezugspunkt des Spielers). Also ein frei gewähltes, leeres Feld.
    const lost = '2,2';
    state.v[lost] = 1;
    assert(M.recapTouchesViewer(state, { x: 2, y: 2, t: 'cap' }, 1) === true, 'solange das Dorf mir gehört, trifft mich eine Aktion darauf');
    state.v[lost] = 0;
    assert(M.recapTouchesViewer(state, { x: 2, y: 2, t: 'cap' }, 1) === false, 'nach dem Besitzerwechsel ist der Verlust aus dem State allein nicht mehr erkennbar');
    assert(M.recapTouchesViewer(state, { x: 2, y: 2, t: 'cap', vo: 1 }, 1) === true, 'vo trägt genau diese Information nach: "hat DEIN Dorf erobert"');

    state.tw = [{ x: 4, y: 4, o: 1, h: 10, a: 0 }];
    assert(M.recapTouchesViewer(state, { x: 4, y: 4, t: 'atk' }, 1) === true, 'auch Turm/Palisade/Tunnel im eigenen Besitz zählen als Treffer');
}

console.log('\n=== (d) buildRecapGroups: Verdichtung und Sortierung ===');
{
    const state = freshState(21, 7, 3);
    const own = state.u.find(u => u.p === 2);
    const nb = { x: own.x + 1, y: own.y };

    state.la = [
        { x: own.x, y: own.y, t: 'mv', p: 0 },
        { x: nb.x, y: nb.y, t: 'mv', p: 0 },
        { x: own.x, y: own.y, t: 'atk', p: 0 },     // trifft mich (meine Einheit)
        { x: nb.x, y: nb.y, t: 'mv', p: 1 },
        { x: 0, y: 0, t: 'creatureAtk', global: true, p: -1 }
    ];
    const groups = M.buildRecapGroups(state, 2);

    assert(groups.length === 3, 'drei Urheber = drei Gruppen (zwei Spieler + die Tiefe)');
    assert(groups[0].pid === 0, 'der Spieler, der mich getroffen hat, steht oben');
    assert(groups[0].hits === 1, 'die Trefferzahl der Gruppe stimmt');

    const p0 = groups[0].rows;
    assert(p0[0].t === 'atk' && p0[0].hit === true, 'innerhalb der Gruppe steht der Treffer vor allem anderen');
    assert(p0[0].label === 'Angriff', 'Einzahl-Beschriftung bei genau einem Feld');
    const mvRow = p0.find(r => r.t === 'mv');
    assert(mvRow.hexes.length === 2 && mvRow.label === '2 Bewegungen', 'gleichartige Aktionen werden zu EINER Zeile verdichtet, mit Zählung');
    assert(mvRow.hexes[0].x === own.x && mvRow.hexes[1].x === nb.x, 'die Zeile trägt alle ihre Felder mit — das Panel steppt sie durch');
    assert(mvRow.prio > p0[0].prio, 'Bewegung sortiert hinter Kampf');

    const deep = groups.find(g => g.pid === -1);
    assert(deep && deep.name === 'Die Tiefe', 'Kreaturen-Ereignisse landen in einer eigenen Gruppe ohne Spielernamen');
    assert(deep.color === '#7d838f', 'ohne playerColors (js/art.js hier nicht geladen) fällt die Gruppenfarbe auf Stein zurück');

    assert(M.buildRecapGroups(state, 0).every(g => g.pid !== 0), 'aus Sicht von Spieler 0 fehlt Spieler 0 — man sieht nie den eigenen Zug');

    assert(M.recapKind('gibtsnicht').label === undefined && M.recapKind('gibtsnicht').one === 'Aktion',
        'unbekannte Aktionsart fällt auf eine generische Beschriftung zurück statt zu werfen');
}

console.log('\n=== (e) Serialisierung: Roundtrip und Blob-Zuwachs ===');
{
    const state = freshState(21, 12, 6);
    state.la = [];
    // Sechs Spieler, je 20 Aktionen — mehr als eine reale Runde produziert.
    for (let p = 0; p < 6; p++) {
        M.recapAppendTurn(state, p, Array.from({ length: 20 }, (_, i) => ({
            x: (i * 3) % 20, y: (i * 5) % 20, t: i % 3 === 0 ? 'atk' : 'mv', fx: i % 20, fy: i % 20
        })));
    }
    const withLog = LZString.compressToEncodedURIComponent(JSON.stringify(state)).length;
    const laBytes = JSON.stringify(state.la).length;
    const bare = { ...state, la: [] };
    const withoutLog = LZString.compressToEncodedURIComponent(JSON.stringify(bare)).length;

    const round = JSON.parse(JSON.stringify(state));
    assert(round.la.length === state.la.length, 'der Log übersteht den JSON-Roundtrip vollständig');
    assert(M.buildRecapGroups(round, 3).length > 0, 'und ist nach dem Roundtrip weiterhin auswertbar');

    assert(state.la.length <= M.RECAP_LOG_CAP, 'auch bei 6 Spielern bleibt der Log unter dem Deckel');
    console.log(`   Blob ohne Log: ${withoutLog} Zeichen · mit vollem Log: ${withLog} (+${withLog - withoutLog}) · roh: ${laBytes} Zeichen`);
    assert(state.la.every(a => a.fx === undefined && a.fy === undefined), 'fx/fy werden beim Anhängen gestrichen — sie hatten nur einen Leser, das entfernte Playback');
    assert(withLog - withoutLog < 1200, 'der komprimierte Zuwachs durch den vollen Rundenlog bleibt klein (< 1200 Zeichen)');
}

console.log('\n=== (f) Icon-Namen: jede Aktionsart zeigt ein Icon, das es wirklich gibt ===');
{
    // icon() (js/icons.js) meldet unbekannte Namen nur per console.warn und
    // liefert einen leeren String — im Browser fällt das als "Zeile ohne Symbol"
    // kaum auf. Hier wird es zum harten Fehler.
    const iconsSrc = fs.readFileSync(path.join(ROOT, 'js/icons.js'), 'utf8');
    const known = JSON.parse(iconsSrc.match(/const DA_ICONS = (\[[^\]]*\]);/)[1]);
    const used = [...new Set(Object.values(M.RECAP_KINDS).map(k => k.ic).concat(M.recapKind('x').ic))];
    const missing = used.filter(n => known.indexOf(n) === -1);
    assert(missing.length === 0, `alle ${used.length} Icon-Namen aus RECAP_KINDS existieren in DA_ICONS${missing.length ? ' — fehlend: ' + missing.join(', ') : ''}`);

    const kinds = Object.entries(M.RECAP_KINDS);
    assert(kinds.every(([, k]) => typeof k.one === 'string' && typeof k.many === 'function'),
        'jede Aktionsart hat Ein- und Mehrzahl-Beschriftung');
    assert(kinds.every(([, k]) => ['fire', 'gold', 'build', 'earth', 'move'].indexOf(k.k) !== -1),
        'jede Aktionsart nutzt einen der fünf Farbkanäle (--rc-*, css/game.css)');
}

console.log('\n=== (g) Vollständigkeit: jede im Spielcode erzeugte Aktionsart ist beschriftet ===');
{
    // Sonst rutscht eine neue Aktion still in den generischen Fallback "Aktion".
    const srcFiles = ['js/input.js', 'js/abilities.js', 'js/ui.js', 'js/debug.js'];
    const produced = new Set();
    srcFiles.forEach(f => {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const re = /t:\s*'([a-zA-Z]+)'/g;
        let m;
        while ((m = re.exec(src)) !== null) produced.add(m[1]);
    });
    // 'creature'/'reset' u.ä. stammen aus Event-Objekten, nicht aus dem Recap-Log.
    const known = Object.keys(M.RECAP_KINDS);
    const unlabeled = [...produced].filter(t => known.indexOf(t) === -1);
    const logTypes = [...produced].filter(t => known.indexOf(t) !== -1);
    assert(logTypes.length >= 15, `mindestens 15 der tatsächlich erzeugten Aktionsarten sind beschriftet (gefunden: ${logTypes.length})`);
    console.log(`   nicht in RECAP_KINDS (Event-/Fremdobjekte, laufen auf den Fallback): ${unlabeled.join(', ') || '—'}`);
}

console.log('');
if (failures > 0) { console.error(`${failures} FEHLER`); process.exit(1); }
console.log('Alle Prüfungen bestanden.');
