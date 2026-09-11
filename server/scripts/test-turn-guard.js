// Prüft die Zugweitergabe-Regel (server/turnorder.js) — keine DB, kein Server.
//   node server/scripts/test-turn-guard.js
const { isValidHandover } = require('../turnorder');

let failed = 0;
function check(name, actual, expected) {
    const ok = actual === expected;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  (erwartet ${expected}, war ${actual})`}`);
}

// p[]: 0 = lebt, 1 = tot (im eingereichten Blob)
const st = (...dead) => ({ p: dead.map(d => (d ? { dead: 1 } : {})) });

// ── Der Normalfall ───────────────────────────────────────────────────────────
check('2 Spieler: 0 gibt an 1 ab',            isValidHandover(st(0, 0), 0, 1), true);
check('2 Spieler: 1 gibt an 0 ab (Rundenwechsel)', isValidHandover(st(0, 0), 1, 0), true);
check('4 Spieler: 2 gibt an 3 ab',            isValidHandover(st(0, 0, 0, 0), 2, 3), true);

// ── Tote überspringen ────────────────────────────────────────────────────────
check('3 Spieler, 1 ist tot: 0 gibt an 2 ab', isValidHandover(st(0, 1, 0), 0, 2), true);
check('4 Spieler, 1+2 tot: 0 gibt an 3 ab',   isValidHandover(st(0, 1, 1, 0), 0, 3), true);
check('letzter Überlebender behält den Zug',  isValidHandover(st(0, 1, 1), 0, 0), true);

// ── Dannys Fall: zwei Züge in einem Upload ───────────────────────────────────
// Der Client blieb nach einem fehlgeschlagenen Upload auf dem bereits
// weitergedrehten Zustand stehen; ein zweites "Zug beenden" hätte den Zug des
// Gegners mit hochgeladen. Genau das muss hier scheitern.
check('2 Spieler: 0 überspringt lebenden 1',  isValidHandover(st(0, 0), 0, 0), false);
check('3 Spieler: 0 überspringt lebenden 1',  isValidHandover(st(0, 0, 0), 0, 2), false);
check('4 Spieler: 0 überspringt zwei Lebende', isValidHandover(st(0, 0, 0, 0), 0, 3), false);
check('3 Spieler: 0 springt zurück auf sich', isValidHandover(st(0, 0, 0), 0, 0), false);

// ── Brand-Tod am Zugbeginn ───────────────────────────────────────────────────
// Stirbt der neue aktive Spieler noch im selben Zugende an einem Brand-Tick,
// zeigt cp auf einen Toten. Das ist gültig — die Eliminierungs-Nachbereitung in
// routes/games.js dreht danach weiter.
check('nächster Spieler stirbt am Brand',     isValidHandover(st(0, 1), 0, 1), true);

// ── Kaputte Eingaben ─────────────────────────────────────────────────────────
check('Slot außerhalb der Spielerliste',      isValidHandover(st(0, 0), 0, 7), false);
check('Slot ist keine Zahl',                  isValidHandover(st(0, 0), 0, '1'), false);
check('unlesbarer Zustand blockiert nicht',   isValidHandover(null, 0, 1), true);
check('Zustand ohne p[] blockiert nicht',     isValidHandover({}, 0, 1), true);

console.log(failed === 0 ? '\nAlle Prüfungen bestanden.' : `\n${failed} Prüfung(en) fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
