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
            getVisibleHexes, getVisibleUWHexes, markUWExplored, killPlayer,
            recapAppendTurn, recapVisibleActions, recapTouchesViewer,
            buildRecapGroups, recapKind, recapUnitName, recapVictimLabel, recapAoE,
            finalizeDefeatLogs, finalizeGameEndLogs,
            RECAP_LOG_CAP, RECAP_KINDS, unitStats, uwCreatureStats
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

    // Der wichtigste Fall: ZERSTÖRTES Ziel. Auf dem Hex steht dann nichts
    // Eigenes mehr — ohne vp bliebe ausgerechnet der Kill unmarkiert.
    assert(M.recapTouchesViewer(state, { x: 40, y: 40, t: 'atk', vk: 'unit', vp: 1, kl: 1 }, 1) === true,
        'ein zerstörtes eigenes Ziel zählt als Treffer, obwohl auf dem Feld nichts Eigenes mehr steht');
    assert(M.recapTouchesViewer(state, { x: 40, y: 40, t: 'atk', vk: 'unit', vp: 0, kl: 1 }, 1) === false,
        'ein zerstörtes FREMDES Ziel dagegen nicht');
    assert(M.recapTouchesViewer(state, { x: 40, y: 40, t: 'atk', vp: -1 }, 1) === false,
        'vp === -1 (kein Besitzer) trifft niemanden');
}

console.log('\n=== (d) buildRecapGroups: Verdichtung und Sortierung ===');
{
    const state = freshState(21, 7, 3);
    const own = state.u.find(u => u.p === 2);
    const nb = { x: own.x + 1, y: own.y };

    state.la = [
        { x: own.x, y: own.y, t: 'mv', ut: 2, p: 0 },
        { x: nb.x, y: nb.y, t: 'mv', ut: 2, p: 0 },
        // trifft mich: Angriff auf meine eigene Einheit
        { x: own.x, y: own.y, t: 'atk', au: 3, dm: 6, vk: 'unit', vt: own.t, vp: 2, kl: 1, p: 0 },
        { x: nb.x, y: nb.y, t: 'mv', ut: 1, p: 1 }
    ];
    const groups = M.buildRecapGroups(state, 2);

    assert(groups.length === 2, 'zwei Urheber = zwei Gruppen');
    assert(groups[0].pid === 0, 'der Spieler, der mich getroffen hat, steht oben');
    assert(groups[0].hits === 1, 'die Trefferzahl der Gruppe stimmt');

    const p0 = groups[0].rows;
    assert(p0[0].t === 'atk' && p0[0].hit === true, 'innerhalb der Gruppe steht der Treffer vor allem anderen');

    const mvRow = p0.find(r => r.t === 'mv');
    assert(mvRow.hexes.length === 2, 'gleichartige Aktionen DESSELBEN Einheitentyps werden zu EINER Zeile verdichtet');
    assert(mvRow.label === 'Pferd bewegt', `die Zeile nennt die Einheit statt eines generischen "Bewegung" (ist: "${mvRow.label}")`);
    assert(mvRow.count === 2, 'die Anzahl haengt als eigenes Feld an der Zeile (im Panel als "x2"), nicht im Text');
    assert(mvRow.unit === 2, 'die Zeile traegt den Einheitentyp fuers Sprite-Symbol');
    assert(mvRow.hexes[0].x === own.x && mvRow.hexes[1].x === nb.x, 'die Zeile traegt alle ihre Felder mit — das Panel steppt sie durch');
    assert(mvRow.prio > p0[0].prio, 'Bewegung sortiert hinter Kampf');

    assert(groups.every(g => g.pid >= 0 && g.name === state.p[g.pid].n), 'jede Gruppe traegt einen echten Spielernamen');
    assert(groups.every(g => g.color === '#7d838f'), 'ohne playerColors (js/art.js hier nicht geladen) faellt die Gruppenfarbe auf Stein zurueck');

    assert(M.buildRecapGroups(state, 0).every(g => g.pid !== 0), 'aus Sicht von Spieler 0 fehlt Spieler 0 — man sieht nie den eigenen Zug');

    assert(M.recapKind('gibtsnicht').one === 'Aktion',
        'unbekannte Aktionsart faellt auf eine generische Beschriftung zurueck statt zu werfen');

    // Bewegungen zweier VERSCHIEDENER Einheitentypen duerfen nicht in eine Zeile
    // fallen — sonst waere die Einheit in der Zeile wieder geraten.
    const twoTypes = M.buildRecapGroups(state, 2).find(g => g.pid === 1);
    assert(twoTypes.rows.length === 1 && twoTypes.rows[0].unit === 1, 'ein anderer Einheitentyp bekommt eine eigene Zeile');
}

console.log('\n=== (d2) Angriffszeilen: wer, wen, wie viel, tot? ===');
{
    const state = freshState(21, 7, 2);
    const mine = state.u.find(u => u.p === 1);
    const vx = mine.x, vy = mine.y;

    // Zwei Angriffe desselben Angreifers auf verschiedene Ziele: die duerfen
    // NICHT zusammenfallen — der Schaden und das Ziel unterscheiden sich, und
    // genau das ist die Information, die den Rueckblick lesenswert macht.
    state.la = [
        { x: vx, y: vy, t: 'atk', au: 1, dm: 5, vk: 'unit', vt: mine.t, vp: 1, p: 0 },
        { x: vx, y: vy, t: 'atk', au: 1, dm: 7, vk: 'unit', vt: mine.t, vp: 1, kl: 1, p: 0 }
    ];
    const rows = M.buildRecapGroups(state, 1)[0].rows;
    assert(rows.length === 2, 'Angriffe werden nie gebuendelt — je Angriff eine Zeile');
    assert(rows.every(r => r.actor === 'Bogen'), 'die Zeile nennt den Angreifer beim Namen');
    assert(rows.every(r => r.victim === 'dein ' + M.unitStats[mine.t].name), '"dein …" macht sichtbar, dass es die eigene Einheit war');
    assert(rows.some(r => r.dmg === 5) && rows.some(r => r.dmg === 7), 'der Schaden steht je Zeile');
    assert(rows.filter(r => r.killed).length === 1, 'nur der toedliche Angriff ist als Kill markiert');
    assert(rows.every(r => r.unit === 1 && r.victimUnit === mine.t), 'Angreifer- und Ziel-Sprite haengen an der Zeile');

    // Gebaeude/Palisade/Turm/Tunnel haben keinen Einheitentyp, aber einen Namen.
    const kinds = { building: 'dein Hauptgebaeude', wall: 'deine Palisade', tower: 'deinen Turm', tunnel: 'deinen Tunnel' };
    Object.keys(kinds).forEach(vk => {
        state.la = [{ x: vx, y: vy, t: 'atk', au: 6, dm: 3, vk, vp: 1, p: 0 }];
        const r = M.buildRecapGroups(state, 1)[0].rows[0];
        assert(r.victim.indexOf('dein') === 0 && r.victimUnit === undefined,
            `Zielart "${vk}" wird benannt ("${r.victim}") und traegt kein Einheiten-Sprite`);
    });

    // Fremdes Ziel: kein "dein".
    state.la = [{ x: vx, y: vy, t: 'atk', au: 6, dm: 3, vk: 'tower', vp: 0, p: 0 }];
    assert(M.buildRecapGroups(state, 1)[0].rows[0].victim === 'Turm', 'ein fremdes Ziel bekommt kein "dein" davor');

    // Flaechenangriff / Alt-Blob ohne Zieldetails: der Angreifer steht trotzdem da.
    state.la = [{ x: vx, y: vy, t: 'atk', au: 9, p: 0 }];
    const aoe = M.buildRecapGroups(state, 1)[0].rows[0];
    assert(aoe.victim === null && aoe.label === 'Elefant greift an', 'ohne Zieldetails (Flaechenangriff, alter Blob) bleibt wenigstens der Angreifer stehen');
    state.la = [{ x: vx, y: vy, t: 'atk', p: 0 }];
    assert(M.buildRecapGroups(state, 1)[0].rows[0].label === 'Einheit greift an', 'ganz ohne Angaben faellt die Zeile auf einen neutralen Text zurueck statt "undefined" zu zeigen');
}

console.log('\n=== (d2b) Flaechenschaden: je getroffenem Ziel eine eigene Zeile ===');
{
    const state = freshState(21, 7, 2);
    const a = state.u.find(u => u.p === 1);
    const b = { i: 900, p: 1, t: 1, x: a.x + 1, y: a.y, h: 10 };
    state.u.push(b);
    const wall = { x: a.x, y: a.y + 1, o: 1, h: 2 };
    state.wa = [wall];

    // Feuersturm-Muster: Sammler anlegen, bei jedem Schadensblock melden, flushen.
    const hits = M.recapAoE({ au: 15 });
    const acts = [];
    a.h -= 3; hits.unit(a, 3);
    b.h -= 3; hits.unit(b, 3);
    wall.h -= 3; hits.wall(wall, 3);           // 2 HP -> zerstoert
    hits.building(1, 4, 4, 3, false);
    const n = hits.flush(acts, 9, 9);

    assert(n === 4 && acts.length === 4, 'ein Eintrag je getroffenem Ziel, nicht einer auf dem Mittelpunkt');
    assert(acts.every(x => x.t === 'atk' && x.au === 15), 'alle tragen dieselbe Angreifer-Einheit');
    assert(acts[0].x === a.x && acts[0].y === a.y && acts[1].x === b.x,
        'jeder Eintrag sitzt auf dem Feld SEINES Ziels — davon haengen Fog-Filter und Karten-Hervorhebung ab');
    assert(acts.find(x => x.vk === 'wall').kl === 1, 'ein zerstoertes Ziel wird als Kill markiert');
    assert(acts.find(x => x.vk === 'unit' && x.vt === a.t).kl === undefined, 'ueberlebende Ziele nicht');
    assert(acts.find(x => x.vk === 'building').vp === 1, 'das Hauptgebaeude traegt seinen Besitzer');

    // Und die Zeilen daraus lesen sich wie Einzelangriffe.
    state.la = M.recapAppendTurn(state, 0, acts);
    const rows = M.buildRecapGroups(state, 1)[0].rows;
    assert(rows.length >= 3, `aus dem Flaechenangriff werden ${rows.length} eigene Zeilen`);
    assert(rows.every(r => r.actor === 'Bombenballon'), 'jede nennt den Verursacher');
    assert(rows.some(r => r.victim === 'deine Palisade' && r.killed), 'die zerstoerte Palisade steht als eigene Zeile mit Kill-Marke');

    // Trifft die Faehigkeit nichts, bleibt genau ein Eintrag auf dem Mittelpunkt.
    const empty = M.recapAoE({ au: 9 });
    const acts2 = [];
    assert(empty.flush(acts2, 5, 6) === 0 && acts2.length === 1 && acts2[0].x === 5 && acts2[0].y === 6,
        'ohne Treffer bleibt ein Eintrag auf dem Mittelpunkt — "Elefant greift an" verschwindet nicht');
    state.la = [Object.assign({ p: 0 }, acts2[0])];
    assert(M.buildRecapGroups(state, 1)[0].rows[0].label === 'Elefant greift an', 'und wird als solcher beschriftet');
}

console.log('\n=== (d2c) Turmschuss: das Bauwerk als Angreifer ===');
{
    const state = freshState(21, 7, 2);
    const mine = state.u.find(u => u.p === 1);
    // ab statt au: hinter einem Turmschuss steht keine Einheit.
    state.la = [{ x: mine.x, y: mine.y, t: 'atk', ab: 'tower', dm: 5, vk: 'unit', vt: mine.t, vp: 1, kl: 1, p: 0 }];
    const row = M.buildRecapGroups(state, 1)[0].rows[0];
    assert(row.actor === 'Turm', 'der Angreifer heisst "Turm", nicht "Einheit"');
    assert(row.ic === 'tower', 'die Zeile bekommt das Turm-Symbol statt eines Einheiten-Sprites');
    assert(row.unit === undefined, 'und traegt kein Einheiten-Sprite (es gibt keine Einheit)');
    assert(row.victim === 'dein ' + M.unitStats[mine.t].name && row.dmg === 5 && row.killed,
        'Ziel, Schaden und Kill stehen wie bei jedem anderen Angriff');
}

console.log('\n=== (d3) Altlasten aus laufenden Partien: nichtssagende Zeilen gibt es nicht ===');
{
    // Genau der Fall, den Jonathan gemeldet hat: ein Blob, der noch
    // creatureAtk-Eintraege traegt (Kreaturen-Angriffe sind seit Aug 2026 kein
    // Rueckblick-Inhalt mehr). Ohne Filter landen sie auf RECAP_FALLBACK und
    // stehen als "2 Aktionen" ohne erkennbaren Inhalt im Panel.
    const state = freshState(21, 7, 2);
    const own = state.u.find(u => u.p === 1);
    const legacy = [
        { x: own.x, y: own.y, t: 'creatureAtk', uw: true, p: -1 },
        { x: own.x, y: own.y, t: 'creatureAtk', uw: true, p: -1 }
    ];

    state.la = legacy.slice();
    assert(M.recapVisibleActions(state, 1).length === 0, 'entfernte Aktionsarten werden gar nicht erst angezeigt');
    assert(M.buildRecapGroups(state, 1).length === 0, 'es entsteht keine Gruppe und keine "N Aktionen"-Zeile');

    // ... und sie verschwinden dauerhaft, statt bis RECAP_LOG_CAP mitzulaufen:
    // p: -1 fiel unter die alte Selbst-Beschneidung (a.p !== pid) nie heraus.
    M.recapAppendTurn(state, 0, [{ x: 1, y: 1, t: 'mv', ut: 0 }]);
    assert(state.la.length === 1 && state.la[0].t === 'mv', 'das naechste Zugende raeumt sie endgueltig aus dem Log');

    // Gleiches gilt fuer einen Urheber, den es im State nicht gibt.
    state.la = [{ x: own.x, y: own.y, t: 'mv', ut: 0, p: 7 }];
    assert(M.recapVisibleActions(state, 1).length === 0, 'ein Eintrag mit ungueltigem Spielerindex wird verworfen statt zu einer Geistergruppe zu werden');
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
    assert(kinds.every(([, k]) => k.vb === undefined || typeof k.vb === 'string'),
        'vb (Verbform mit Einheit) ist, wo gesetzt, ein String');
    assert(M.RECAP_KINDS.creatureAtk === undefined,
        'Kreaturen-Angriffe stehen nicht mehr im Rueckblick — der Telegraph zeigt sie vorher an');
    assert(kinds.every(([, k]) => ['fire', 'gold', 'build', 'earth', 'move'].indexOf(k.k) !== -1),
        'jede Aktionsart nutzt einen der fünf Farbkanäle (--rc-*, css/game.css)');
}

console.log('\n=== (g) Vollständigkeit: jede im Spielcode erzeugte Aktionsart ist beschriftet ===');
{
    // Sonst rutscht eine neue Aktion still in den generischen Fallback "Aktion".
    // Betrachtet werden NUR die Push-Aufrufe in den Rueckblick-Log, nicht jedes
    // `t:` im Code — sonst zaehlen Einheiten-Tags wie t:'Veteran' mit. Seit
    // recapEntryUsable eine unbeschriftete Art wegwirft, ist das keine
    // Kosmetik mehr: eine vergessene Beschriftung macht die Aktion unsichtbar.
    const srcFiles = ['js/input.js', 'js/abilities.js', 'js/ui.js', 'js/debug.js'];
    const produced = new Set();
    srcFiles.forEach(f => {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const pushRe = /(?:turnActions|\.la)\.push\(\s*\{[\s\S]{0,600}?\}\s*\)/g;
        let m;
        while ((m = pushRe.exec(src)) !== null) {
            const t = /\bt:\s*'([a-zA-Z]+)'/.exec(m[0]);
            if (t) produced.add(t[1]);
        }
    });
    const known = Object.keys(M.RECAP_KINDS);
    const unlabeled = [...produced].filter(t => known.indexOf(t) === -1);
    console.log(`   erzeugte Aktionsarten (${produced.size}): ${[...produced].sort().join(', ')}`);
    assert(produced.size >= 18, `die Suche findet die Push-Stellen wirklich (gefunden: ${produced.size})`);
    assert(unlabeled.length === 0, `JEDE erzeugte Aktionsart steht in RECAP_KINDS${unlabeled.length ? ' — unbeschriftet: ' + unlabeled.join(', ') : ''}`);
    assert(!produced.has('creatureAtk'), 'kein Spielcode erzeugt noch creatureAtk-Recap-Eintraege');
}

console.log('\n=== (h) Niederlage-Rückblick: defeatLog wird beim Tod eingefroren ===');
{
    const state = freshState(21, 7, 2);
    const [vx, vy] = state.p[1].sv.split(',').map(Number);
    state.la = [];

    // Reihenfolge wie im echten Spiel: killPlayer laeuft MITTEN im Zug (friert
    // die Sicht des Sterbenden ein, BEVOR seine Einheiten/Doerfer entfernt
    // werden) — der toedliche Angriff selbst landet erst am Zugende ueber
    // recapAppendTurn im Log, danach erst finalizeDefeatLogs.
    M.killPlayer(state, 1, 0);
    assert(state.p[1].dead === 1, 'killPlayer markiert den Spieler wie bisher als tot');
    assert(Array.isArray(state.p[1]._deathVis) && state.p[1]._deathVis.length > 0,
        'die Sicht des Sterbenden wird VOR dem Aufräumen eingefroren');

    M.recapAppendTurn(state, 0, [
        { x: vx, y: vy, t: 'atk', au: 3, dm: 30, vk: 'building', vp: 1, kl: 1 }
    ]);
    M.finalizeDefeatLogs(state);

    assert(Array.isArray(state.p[1].defeatLog), 'defeatLog wird gesetzt');
    assert(!state.p[1]._deathVis && !state.p[1]._deathVisUW,
        'die temporären Sicht-Sets werden nach dem Einfrieren wieder entfernt');
    assert(state.p[1].defeatLog.some(a => a.vk === 'building' && a.kl === 1),
        'der tödliche Angriff steht im eingefrorenen Log');

    const groups = M.buildRecapGroups(state, 1, state.p[1].defeatLog);
    assert(groups.length === 1 && groups[0].hits === 1,
        'derselbe Verdichtungscode wie beim Live-Rückblick liefert eine Treffer-Gruppe aus dem eingefrorenen Log');

    // Der Sterbende zieht nie wieder — ein zweiter finalizeDefeatLogs-Aufruf
    // (naechstes Zugende eines anderen Spielers) darf defeatLog nicht anfassen.
    M.recapAppendTurn(state, 0, [{ x: vx, y: vy, t: 'mv', ut: 2 }]);
    const before = state.p[1].defeatLog.length;
    M.finalizeDefeatLogs(state);
    assert(state.p[1].defeatLog.length === before,
        'defeatLog wird nur EINMAL eingefroren, spätere Züge ändern es nicht mehr nachträglich');
}

console.log('\n=== (h2) defeatLog respektiert die zum Todeszeitpunkt eingefrorene Sicht ===');
{
    // Dieselbe "+6 = ausserhalb der Sicht"-Distanz wie in (b) — eine fremde
    // Aktion, die der Sterbende beim Sterben gar nicht haette sehen koennen,
    // darf nicht nachtraeglich im Rueckblick auftauchen. Ohne den eingefrorenen
    // Sicht-Snapshot wuerde recapVisibleActionsFrom sonst live neu rechnen und
    // faende NACH killPlayers Aufraeumen gar keine Einheiten/Doerfer mehr vor.
    const state = freshState(21, 7, 3);
    const [dvx, dvy] = state.p[2].sv.split(',').map(Number);
    const far = { x: dvx + 6, y: dvy };

    M.killPlayer(state, 2, 0);
    M.recapAppendTurn(state, 0, [{ x: far.x, y: far.y, t: 'mv', ut: 2 }]);
    M.finalizeDefeatLogs(state);

    assert(state.p[2].defeatLog.length === 0,
        'eine für den Sterbenden zum Todeszeitpunkt unsichtbare fremde Aktion bleibt außen vor');
}

console.log('\n=== (i) defeatLog: Serialisierungs-Roundtrip ===');
{
    const state = freshState(21, 7, 2);
    const [vx, vy] = state.p[1].sv.split(',').map(Number);
    state.la = [];
    M.killPlayer(state, 1, 0);
    M.recapAppendTurn(state, 0, [{ x: vx, y: vy, t: 'atk', au: 3, dm: 30, vk: 'building', vp: 1, kl: 1 }]);
    M.finalizeDefeatLogs(state);

    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(state));
    const decoded = JSON.parse(LZString.decompressFromEncodedURIComponent(encoded));
    assert(Array.isArray(decoded.p[1].defeatLog) && decoded.p[1].defeatLog.length === state.p[1].defeatLog.length,
        'defeatLog übersteht den LZString-Roundtrip wie der Rest des States');
    assert(decoded.p[1]._deathVis === undefined, '_deathVis reist nicht mit — es wird schon bei finalizeDefeatLogs gelöscht');
    assert(M.buildRecapGroups(decoded, 1, decoded.p[1].defeatLog).length === 1,
        'und ist nach dem Roundtrip weiterhin auswertbar');
}

console.log('\n=== (j) Erschließungs-/Team-Sieg: Verlierer bekommen trotzdem ein defeatLog ===');
{
    // checkErschliessungWin/checkTeamWin (js/logic.js, js/diplomacy.js) rufen
    // NIE killPlayer für die Verlierer auf — sie gelten laut server/rating.js
    // bewusst als "nicht besiegt", das Spiel endet nur unter ihnen weg.
    // finalizeGameEndLogs deckt genau diese Lücke.
    const state = freshState(21, 7, 3);
    // Auf dem eigenen Feld von Spieler 1, wie in (b) — sonst hängt der Test von
    // zufälligen Spawn-Abständen ab, ob der Zug überhaupt in Sicht liegt.
    const own = state.u.find(u => u.p === 1);
    state.la = [{ x: own.x, y: own.y, t: 'mv', ut: 3, p: 0 }];

    M.finalizeGameEndLogs(state, [state.p[0]]);

    assert(state.p[0].defeatLog === undefined, 'der Sieger selbst bekommt kein defeatLog');
    assert(Array.isArray(state.p[1].defeatLog) && Array.isArray(state.p[2].defeatLog),
        'alle Nicht-Sieger bekommen ein defeatLog, obwohl sie nie killPlayer durchlaufen haben');
    assert(state.p[1].dead !== 1, 'ihr dead-Flag bleibt unangetastet — "nicht besiegt", nicht "besiegt"');

    const groups = M.buildRecapGroups(state, 1, state.p[1].defeatLog);
    assert(groups.length === 1 && groups[0].pid === 0, 'das eingefrorene Log liest sich wie jeder andere Rückblick');

    // Ein bereits über Kampf gestorbener Spieler wird nicht überschrieben —
    // z.B. Team-Sieg, bei dem einzelne Gegner schon vorher gestorben sind.
    const state2 = freshState(22, 7, 3);
    state2.la = [];
    M.killPlayer(state2, 2, 0);
    M.recapAppendTurn(state2, 0, [{ x: 1, y: 1, t: 'atk', au: 1, dm: 30, vk: 'building', vp: 2, kl: 1 }]);
    M.finalizeDefeatLogs(state2);
    const before = state2.p[2].defeatLog;
    M.finalizeGameEndLogs(state2, [state2.p[0]]);
    assert(state2.p[2].defeatLog === before,
        'ein bereits über killPlayer eingefrorenes Log wird von finalizeGameEndLogs nicht überschrieben');
}

console.log('\n=== (k) Integrations-Guard: finalizeGameEndLogs wird NUR bei tatsächlichem Sieg aufgerufen ===');
{
    // Kritischer Bug bei der ersten Umsetzung: ein unbedingter Aufruf würde
    // bei JEDEM normalen Zugende (der weit überwiegende Fall, kein Sieg) jeden
    // noch aktiven Spieler fälschlich als "Nicht-Sieger" mit leerem
    // winnerIds-Set einfrieren — und wegen des "nur einmal setzen"-Schutzes in
    // finalizeGameEndLogs bliebe defeatLog dann für den Rest der Partie auf
    // diesem bedeutungslosen Schnappschuss hängen. Die Unit-Tests oben testen
    // die Funktion isoliert und hätten das NICHT gefangen — nur ein Blick auf
    // die Aufrufstelle selbst tut das.
    const src = fs.readFileSync(path.join(ROOT, 'js/input.js'), 'utf8');
    const calls = [...src.matchAll(/^.*finalizeGameEndLogs\(.*$/gm)];
    assert(calls.length >= 2, `mindestens 2 Aufrufstellen erwartet (doEndTurn + confirmSurrender), gefunden: ${calls.length}`);
    assert(calls.every(m => /if\s*\(\s*isWin\s*\)/.test(m[0])),
        `jede Aufrufstelle steht hinter einem "if (isWin)"-Guard auf derselben Zeile — ungeschützt: ${calls.filter(m => !/if\s*\(\s*isWin\s*\)/.test(m[0])).map(m => m[0].trim()).join(' | ')}`);
}

console.log('');
if (failures > 0) { console.error(`${failures} FEHLER`); process.exit(1); }
console.log('Alle Prüfungen bestanden.');
