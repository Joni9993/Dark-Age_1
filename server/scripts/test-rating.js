#!/usr/bin/env node
// Tests für die Rating-Logik — ohne Datenbank, reine Funktionen.
//   node server/scripts/test-rating.js
//
// Deckt ab: Glicko-2 gegen das Referenzbeispiel aus Glickmans Paper, sowie die
// spielspezifische Übersetzung "Partie → paarweise Ergebnisse" (Sieger, FFA-
// Reihenfolge über eliminated_round, feste Teams, Aufgeber, Erschließungs-Sieg).

const {
    glicko2Update, applyInactivity, rankOf, buildPairings, DEFAULT_RD
} = require('../rating');

let pass = 0, fail = 0;
function check(name, cond, info = '') {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else      { fail++; console.log(`  FAIL ${name} ${info}`); }
}
function section(t) { console.log(`\n${t}`); }

// Hilfskonstruktor für einen Teilnehmer, wie ihn rateFinishedGame aus der DB liest
const P = (slot, o = {}) => ({
    slot, profile_id: `p${slot}`,
    eliminated: false, left_game: false, eliminated_round: null,
    rating: 1500, rd: DEFAULT_RD, volatility: 0.06, ...o
});

// Summe der gewichteten Punkte eines Spielers (1 = alles gewonnen, 0 = alles verloren)
const scoreOf = (pairings, id) =>
    (pairings.get(id) || []).reduce((s, o) => s + o.score * o.weight, 0);

// ── 1. Glicko-2 gegen die Referenz ───────────────────────────────────────────
section('Glicko-2 Referenzbeispiel (Glickman)');
{
    const out = glicko2Update({ rating: 1500, rd: 200, volatility: 0.06 }, [
        { rating: 1400, rd: 30,  score: 1, weight: 1 },
        { rating: 1550, rd: 100, score: 0, weight: 1 },
        { rating: 1700, rd: 300, score: 0, weight: 1 }
    ]);
    check('Rating 1464.06', Math.abs(out.rating - 1464.06) < 0.1, `(${out.rating.toFixed(2)})`);
    check('RD 151.52',      Math.abs(out.rd - 151.52) < 0.1,      `(${out.rd.toFixed(2)})`);
    check('Volatilität',    Math.abs(out.volatility - 0.059996) < 0.0001);
}

// ── 2. 1v1 ───────────────────────────────────────────────────────────────────
section('1v1');
{
    const parts = [P(0), P(1, { eliminated: true, eliminated_round: 12 })];
    const pr = buildPairings(parts, new Set([0]), new Map());
    check('Sieger bekommt vollen Punkt', scoreOf(pr, 'p0') === 1);
    check('Verlierer bekommt null',      scoreOf(pr, 'p1') === 0);
    check('genau ein Gegner je Spieler', pr.get('p0').length === 1 && pr.get('p1').length === 1);
}

// ── 3. Aufgeber zählt als Niederlage ─────────────────────────────────────────
section('Aufgeben (left_game)');
{
    // Aufgeber ist NICHT eliminiert worden, hat aber verlassen — darf trotzdem
    // nicht besser dastehen als jemand, der regulär rausgeflogen ist.
    const parts = [P(0), P(1, { left_game: true, eliminated: true })];
    const pr = buildPairings(parts, new Set([0]), new Map());
    check('Aufgeber verliert gegen Sieger', scoreOf(pr, 'p1') === 0);

    const spaeterRaus = P(1, { eliminated: true, eliminated_round: 3 });
    const aufgeber    = P(2, { left_game: true, eliminated: true });
    check('Aufgeber schlechter als früh Eliminierter',
        rankOf(aufgeber, new Set([0])) > rankOf(spaeterRaus, new Set([0])));
}

// ── 4. FFA-Reihenfolge über eliminated_round ─────────────────────────────────
section('6-Spieler-FFA mit Ausscheidungsreihenfolge');
{
    const parts = [
        P(0),                                                    // Sieger
        P(1, { eliminated: true, eliminated_round: 18 }),         // 2.
        P(2, { eliminated: true, eliminated_round: 14 }),         // 3.
        P(3, { eliminated: true, eliminated_round: 9  }),         // 4.
        P(4, { eliminated: true, eliminated_round: 5  }),         // 5.
        P(5, { eliminated: true, eliminated_round: 2  })          // 6.
    ];
    const pr = buildPairings(parts, new Set([0]), new Map());
    const scores = parts.map(p => scoreOf(pr, p.profile_id));

    check('Sieger 1.0', Math.abs(scores[0] - 1) < 1e-9, `(${scores[0]})`);
    check('Letzter 0.0', Math.abs(scores[5] - 0) < 1e-9, `(${scores[5]})`);
    check('streng absteigend nach Ausscheiden',
        scores.every((s, i) => i === 0 || s < scores[i - 1] + 1e-9),
        `(${scores.map(s => s.toFixed(2)).join(' > ')})`);

    // Downweighting: eine Partie = ein Informationsgewicht, egal wie viele Gegner
    const totalWeight = pr.get('p0').reduce((s, o) => s + o.weight, 0);
    check('Gesamtgewicht = 1 Partie', Math.abs(totalWeight - 1) < 1e-9, `(${totalWeight})`);

    // Ein FFA-Sieg darf das Rating nicht stärker bewegen als fünf Einzelsiege
    const ffa  = glicko2Update({ rating: 1500, rd: 200, volatility: 0.06 }, pr.get('p0'));
    const duel = glicko2Update({ rating: 1500, rd: 200, volatility: 0.06 },
        [{ rating: 1500, rd: DEFAULT_RD, score: 1, weight: 1 }]);
    check('FFA-Sieg bewegt wie ~eine Partie',
        Math.abs((ffa.rating - 1500) - (duel.rating - 1500)) < 25,
        `(FFA +${(ffa.rating - 1500).toFixed(0)} vs 1v1 +${(duel.rating - 1500).toFixed(0)})`);
}

// ── 5. Erschließungs-Sieg: Verlierer wurde nie eliminiert ────────────────────
section('Erschließungs-/Team-Sieg (Verlierer nicht eliminiert)');
{
    const parts = [
        P(0),                                            // gewinnt durch Erschließung
        P(1),                                            // lebt noch, verliert trotzdem
        P(2, { eliminated: true, eliminated_round: 7 })  // vorher rausgeflogen
    ];
    const pr = buildPairings(parts, new Set([0]), new Map());
    check('Sieger 1.0', Math.abs(scoreOf(pr, 'p0') - 1) < 1e-9);
    check('überlebender Verlierer besser als eliminierter',
        scoreOf(pr, 'p1') > scoreOf(pr, 'p2'),
        `(${scoreOf(pr, 'p1').toFixed(2)} vs ${scoreOf(pr, 'p2').toFixed(2)})`);
    check('überlebender Verlierer schlägt Sieger nicht',
        scoreOf(pr, 'p1') < 1);
}

// ── 6. Feste Teams: Teamkollegen nicht gegeneinander werten ──────────────────
section('teams2 (4 Spieler, feste Teams)');
{
    // Teams: {0,2} gewinnt gegen {1,3}
    const teams = new Map([
        [0, new Set([2])], [2, new Set([0])],
        [1, new Set([3])], [3, new Set([1])]
    ]);
    const parts = [
        P(0),
        P(1, { eliminated: true, eliminated_round: 11 }),
        P(2),
        P(3, { eliminated: true, eliminated_round: 6 })
    ];
    const pr = buildPairings(parts, new Set([0, 2]), teams);

    check('je 2 Gegner statt 3', [0, 1, 2, 3].every(i => pr.get(`p${i}`).length === 2));
    check('Teamkollege kommt nicht vor',
        !pr.get('p0').some(o => o.score === 0.5) && pr.get('p0').every(o => o.score === 1));
    check('beide Sieger 1.0',
        Math.abs(scoreOf(pr, 'p0') - 1) < 1e-9 && Math.abs(scoreOf(pr, 'p2') - 1) < 1e-9);
    check('beide Verlierer 0.0',
        Math.abs(scoreOf(pr, 'p1')) < 1e-9 && Math.abs(scoreOf(pr, 'p3')) < 1e-9,
        '(Teamkollegen werden nicht nach Ausscheidungsrunde getrennt)');
}

// ── 7. Unsicherheit dämpft ───────────────────────────────────────────────────
section('Unsicherheit (RD)');
{
    const vsNew = glicko2Update({ rating: 1500, rd: 60, volatility: 0.06 },
        [{ rating: 1500, rd: 350, score: 1, weight: 1 }]);
    const vsEst = glicko2Update({ rating: 1500, rd: 60, volatility: 0.06 },
        [{ rating: 1500, rd: 60, score: 1, weight: 1 }]);
    check('Sieg gegen Unbekannten zählt weniger',
        (vsNew.rating - 1500) < (vsEst.rating - 1500),
        `(+${(vsNew.rating - 1500).toFixed(1)} vs +${(vsEst.rating - 1500).toFixed(1)})`);

    const first = glicko2Update({ rating: 1500, rd: 350, volatility: 0.06 },
        [{ rating: 1500, rd: 350, score: 1, weight: 1 }]);
    check('RD sinkt nach der ersten Partie', first.rd < 350, `(${first.rd.toFixed(0)})`);

    const now = new Date('2026-08-21');
    const rd0 = applyInactivity({ rating: 1600, rd: 60, volatility: 0.06 }, now, now).rd;
    const rd6 = applyInactivity({ rating: 1600, rd: 60, volatility: 0.06 },
        new Date(now.getTime() - 6 * 30 * 86400000), now).rd;
    check('RD wächst bei Inaktivität', rd6 > rd0, `(${rd0.toFixed(0)} → ${rd6.toFixed(0)})`);
    check('RD bleibt <= 350',
        applyInactivity({ rating: 1600, rd: 300, volatility: 0.06 },
            new Date('2015-01-01'), now).rd <= 350);
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
