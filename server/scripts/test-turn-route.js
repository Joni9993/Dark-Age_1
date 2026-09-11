// Prüft POST /api/games/:id/turn gegen eine gestubbte DB — kein Postgres nötig:
//   node server/scripts/test-turn-route.js
// Gegenstand ist die Zugweitergabe-Prüfung (server/turnorder.js) an der echten
// Route, inklusive der Frage, ob bei einer Abweisung wirklich NICHTS geschrieben
// wird. Gestubbt sind nur die Ränder (DB, Auth, Push, Rating) — Router und
// Prüflogik laufen im Original.
process.env.APP_URL = 'http://test.local';
const LZString = require('lz-string');

function stubModule(relPath, exports) {
    const p = require.resolve(relPath);
    require.cache[p] = { id: p, filename: p, loaded: true, exports, children: [], paths: [] };
}

let lastUpdate = null;
stubModule('../db', { pool: { query: async (sql, params) => {
    if (/FROM games g JOIN game_players/.test(sql)) return { rows: [{ current_slot: 0, name: 'Testpartie', round: 5, slot: 0 }] };
    if (/UPDATE games SET state_blob/.test(sql)) { lastUpdate = params; return { rows: [] }; }
    return { rows: [] };
} } });
stubModule('../auth', { authMiddleware: (req, _res, next) => { req.profileId = 'user-1'; next(); }, hashPassword: null });
stubModule('../push', { notifyPlayer: async () => {} });
stubModule('../rating', { rateFinishedGame: async () => {} });
stubModule('../mapgen', { buildStartState: () => ({}) });
stubModule('../seating', { shuffleSeats: () => [] });

const express = require('express');
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/games', require('../routes/games'));

const blob = (state) => LZString.compressToEncodedURIComponent(JSON.stringify(state));

async function post(body) {
    const res = await fetch(`http://127.0.0.1:${port}/api/games/g1/turn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json };
}

let failed = 0;
function check(name, actual, expected) {
    const ok = actual === expected; if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  (erwartet ${expected}, war ${actual})`}`);
}

let port;
const server = app.listen(0, async () => {
    port = server.address().port;

    // Ehrlicher Zug: Slot 0 ist dran, gibt an 1 ab.
    const good = { cp: 1, rn: 5, p: [{ n: 'Danny' }, { n: 'Jonathan' }], u: [], v: {} };
    let r = await post({ state_blob: blob(good), next_slot: 1, next_round: 5 });
    check('ehrlicher Zug wird angenommen', r.status, 200);
    check('Zustand wurde geschrieben', lastUpdate !== null, true);

    // Dannys Fall: Slot 0 hat auch Jonathans Zug gespielt und gibt an sich selbst zurück.
    lastUpdate = null;
    const doubled = { cp: 0, rn: 6, p: [{ n: 'Danny' }, { n: 'Jonathan' }], u: [], v: {} };
    r = await post({ state_blob: blob(doubled), next_slot: 0, next_round: 6 });
    check('fremd gespielter Zug wird abgewiesen', r.status, 409);
    check('dabei wurde nichts geschrieben', lastUpdate, null);

    // Blob und Nutzlast widersprechen sich.
    r = await post({ state_blob: blob(good), next_slot: 0, next_round: 5 });
    check('Blob/next_slot-Widerspruch wird abgewiesen', r.status, 409);

    // Toter Spieler darf übersprungen werden.
    const skipDead = { cp: 2, rn: 5, p: [{ n: 'A' }, { n: 'B', dead: 1 }, { n: 'C' }], u: [], v: {} };
    r = await post({ state_blob: blob(skipDead), next_slot: 2, next_round: 5 });
    check('toter Spieler darf übersprungen werden', r.status, 200);

    // Unlesbarer Blob blockiert nicht (fail-open, wie die Eliminierungs-Nachbereitung).
    r = await post({ state_blob: 'kein-gueltiger-blob', next_slot: 1, next_round: 5 });
    check('unlesbarer Blob blockiert nicht', r.status, 200);

    server.close();
    console.log(failed === 0 ? '\nAlle Prüfungen bestanden.' : `\n${failed} fehlgeschlagen.`);
    process.exit(failed === 0 ? 0 : 1);
});
