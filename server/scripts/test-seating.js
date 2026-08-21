#!/usr/bin/env node
// Tests für die Sitzplatz-Permutation beim Spielstart (server/seating.js).
//   node server/scripts/test-seating.js
//
// Die zentrale Invariante: nach dem Mischen muss für JEDEN Slot gelten, dass der
// Name in state.p[slot].n zu genau dem Profil gehört, das die Datenbank auf
// diesem Slot führt. Geht das auseinander, spielt jemand unter fremdem Namen
// bzw. mit der Armee eines anderen.

const LZString = require('lz-string');
const { shuffleSeats } = require('../seating');

let pass = 0, fail = 0;
function check(name, cond, info = '') {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else      { fail++; console.log(`  FAIL ${name} ${info}`); }
}

// Minimaler State, wie ihn buildInitialGameState liefert: p[] in Slot-Reihenfolge.
function makeState(names, extra = {}) {
    return {
        sd: 1234, rn: 1, cp: 0,
        p: names.map((n, i) => ({
            n, g: 100, m: 0, s: 0,
            sv: `${i},${i}`,          // Startdorf — gehört zum Sitzplatz
            al: extra.al?.[i] ?? []   // Team-Zuordnung — ebenfalls sitzplatzgebunden
        })),
        v: {}, u: []
    };
}
const pack   = st => LZString.compressToEncodedURIComponent(JSON.stringify(st));
const unpack = b  => JSON.parse(LZString.decompressFromEncodedURIComponent(b));

const seatsFor = names => names.map((u, i) => ({ slot: i, profile_id: `id-${u}`, username: u }));

// Deterministischer RNG, damit Permutationen reproduzierbar sind
const seededRng = (seed) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

console.log('Sitzplatz-Permutation');

// ── 1. Invariante über viele Zufallspermutationen ────────────────────────────
{
    let allOk = true;
    let everMoved = false;

    for (let trial = 0; trial < 500; trial++) {
        const names = ['Christian', 'Joni', 'Vince', 'Phil', 'lingu', 'Urso']
            .slice(0, 2 + (trial % 5));
        const seats = seatsFor(names);
        const original = makeState(names);
        const { blob, assignments } = shuffleSeats(seats, pack(original), seededRng(trial + 1));
        const st = unpack(blob);

        // Kernprüfung: DB-Sitzplatz und Name im State müssen zusammenpassen
        for (const a of assignments) {
            const expectedName = seats.find(s => s.profile_id === a.profile_id).username;
            if (st.p[a.slot].n !== expectedName) { allOk = false; }
        }
        // Jedes Profil genau einmal, jeder Slot genau einmal
        if (new Set(assignments.map(a => a.profile_id)).size !== names.length) allOk = false;
        if (new Set(assignments.map(a => a.slot)).size !== names.length) allOk = false;
        // Namen sind eine echte Permutation der Ausgangsnamen
        const got = st.p.map(p => p.n).slice().sort();
        if (JSON.stringify(got) !== JSON.stringify(names.slice().sort())) allOk = false;
        // Sitzplatzgebundene Daten dürfen NICHT mitwandern
        original.p.forEach((p, i) => { if (st.p[i].sv !== p.sv) allOk = false; });

        if (assignments.some(a => a.profile_id !== `id-${names[a.slot]}`)) everMoved = true;
    }

    check('Name im State passt in 500 Durchläufen immer zum DB-Sitzplatz', allOk);
    check('Startdörfer bleiben am Sitzplatz (wandern nicht mit)', allOk);
    check('es wird tatsächlich gemischt (nicht immer Identität)', everMoved);
}

// ── 2. Verteilung: sitzt der Host wirklich nicht mehr immer auf Slot 0? ──────
{
    const names = ['Host', 'Gast'];
    const seats = seatsFor(names);
    const blob = pack(makeState(names));

    let hostOnSlot0 = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
        const { assignments } = shuffleSeats(seats, blob);
        if (assignments.find(a => a.slot === 0).profile_id === 'id-Host') hostOnSlot0++;
    }
    const share = hostOnSlot0 / N;
    check('Host startet in ~50% der 1v1-Partien', Math.abs(share - 0.5) < 0.03,
        `(${(share * 100).toFixed(1)}%)`);
}

// ── 3. Teams bleiben intakt ──────────────────────────────────────────────────
{
    // Feste Teams stehen als Slot-Listen in al[] — sie sind sitzplatzgebunden und
    // müssen die Permutation unverändert überstehen.
    const names = ['A', 'B', 'C', 'D'];
    const al = [[2], [3], [0], [1]];        // Teams {0,2} und {1,3}
    const seats = seatsFor(names);
    const blob = pack(makeState(names, { al }));
    const st = unpack(shuffleSeats(seats, blob, seededRng(7)).blob);

    check('Team-Zuordnung (al) unverändert',
        JSON.stringify(st.p.map(p => p.al)) === JSON.stringify(al));
    check('Teamgrößen bleiben erhalten',
        st.p.every(p => p.al.length === 1));
}

// ── 4. Randfälle ─────────────────────────────────────────────────────────────
{
    const solo = seatsFor(['Allein']);
    const blob = pack(makeState(['Allein']));
    const r = shuffleSeats(solo, blob);
    check('ein Spieler: Blob unverändert', r.blob === blob);
    check('ein Spieler: Zuordnung unverändert',
        r.assignments.length === 1 && r.assignments[0].slot === 0);

    check('leere Liste wirft nicht', (() => {
        try { shuffleSeats([], blob); return true; } catch (_) { return false; }
    })());

    check('kaputter Blob wirft klar', (() => {
        try { shuffleSeats(seatsFor(['A', 'B']), 'kein-gueltiger-blob'); return false; }
        catch (_) { return true; }
    })());
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
