// ── Glicko-2 Rating für Dark Ages ────────────────────────────────────────────
//
// Warum Glicko-2 und nicht klassisches Elo: die Spielerbasis ist klein und sehr
// ungleich aktiv (ein Vielspieler mit ~50 Partien, der Median liegt bei 1–5).
// Reines Elo gäbe einem Spieler nach einer einzigen Partie eine Zahl, die auf
// der Rangliste genauso verbindlich aussieht wie die eines Vielspielers. Glicko-2
// führt zusätzlich eine Unsicherheit (RD) mit: wenige Partien → hohes RD →
// "vorläufig", und längere Inaktivität lässt RD wieder wachsen, statt einen
// zufälligen Altwert für immer einzufrieren.
//
// Nach außen bleibt es ein Elo-artiges System: angezeigt wird eine Zahl um 1500.
//
// Ratings sind bewusst eine reine Funktion der Spielhistorie: `rating_history`
// hält jeden einzelnen Schritt, die Spalten auf `profiles` sind nur ein Cache.
// Damit lässt sich die komplette Rangliste jederzeit neu berechnen
// (scripts/rebuild-ratings.js) — Parameteränderungen sind keine Einbahnstraße.

const { pool } = require('./db');
const LZString = require('lz-string');

// ── Systemkonstanten ─────────────────────────────────────────────────────────
const SCALE           = 173.7178;   // Umrechnung Elo-Skala ↔ Glicko-2-Skala
const DEFAULT_RATING  = 1500;
const DEFAULT_RD      = 350;
const DEFAULT_VOL     = 0.06;
const TAU             = 0.5;        // Volatilitäts-Dämpfung (0.3–1.2; kleiner = ruhiger)
const EPSILON         = 0.000001;   // Konvergenzschwelle der Volatilitäts-Iteration
const MAX_RD          = 350;
const MIN_RD          = 30;

// Ab wie vielen gewerteten Partien gilt ein Spieler als etabliert (nicht mehr
// "vorläufig"). Darunter wird er im Leaderboard hinten einsortiert und markiert.
const PROVISIONAL_GAMES = 5;

// Kein Backfill (Entscheidung Aug 2026): alle starten bei 1500, Partien von vor
// diesem Datum bleiben ungewertet. Die Altpartien bleiben unangetastet in der DB
// — wer sie doch einrechnen will, setzt RATING_EPOCH zurück und ruft
// rebuildAllRatings() auf. Deshalb steht das hier als Datum und nicht als
// "ab jetzt halt nicht mehr werten"-Nebenwirkung im Code.
const RATING_EPOCH = process.env.RATING_EPOCH || '2026-08-21';

// Inaktivitäts-Verfall: RD wächst pro angefangener Periode ohne Partie.
// Die Glickman-Originalformel (RD wächst nur mit der Volatilität σ≈0.06) wäre
// hier praktisch wirkungslos — ein Jahr Pause hebt RD von 50 nur auf ~62. Für
// eine Gruppe, die schubweise spielt, nutzen wir stattdessen die (ältere)
// Glicko-1-Form mit eigener Konstante c. Tunable, wirkt beim nächsten Rebuild.
const INACTIVITY_C            = 40;  // RD-Zuwachs pro Periode
const INACTIVITY_PERIOD_DAYS  = 30;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ── Glicko-2 Kernmathematik ──────────────────────────────────────────────────

// Dämpfungsfaktor: je unsicherer der Gegner, desto weniger Aussagekraft hat das
// Ergebnis gegen ihn.
function gFactor(phi) {
    return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

// Iterative Bestimmung der neuen Volatilität (Illinois-Variante der Regula falsi,
// wie in Glickmans Paper beschrieben).
function newVolatility(phi, sigma, delta, v) {
    const a = Math.log(sigma * sigma);
    const phi2 = phi * phi;
    const delta2 = delta * delta;

    const f = (x) => {
        const ex = Math.exp(x);
        const num = ex * (delta2 - phi2 - v - ex);
        const den = 2 * Math.pow(phi2 + v + ex, 2);
        return num / den - (x - a) / (TAU * TAU);
    };

    let A = a;
    let B;
    if (delta2 > phi2 + v) {
        B = Math.log(delta2 - phi2 - v);
    } else {
        let k = 1;
        while (k < 100 && f(a - k * TAU) < 0) k++;
        B = a - k * TAU;
    }

    let fA = f(A);
    let fB = f(B);
    let guard = 0;
    while (Math.abs(B - A) > EPSILON && guard++ < 100) {
        const C = A + ((A - B) * fA) / (fB - fA);
        const fC = f(C);
        if (fC * fB <= 0) { A = B; fA = fB; }
        else             { fA = fA / 2; }
        B = C; fB = fC;
    }
    return Math.exp(A / 2);
}

// Ein Rating-Update für EINEN Spieler gegen alle seine Gegner einer Partie.
// results: [{ rating, rd, score, weight }] — score 1 = Sieg, 0.5 = gleichauf, 0 = Niederlage.
function glicko2Update(player, results) {
    if (!results.length) return { ...player };

    const mu  = (player.rating - DEFAULT_RATING) / SCALE;
    const phi = player.rd / SCALE;

    let vInv = 0;
    let dSum = 0;
    for (const r of results) {
        const muJ  = (r.rating - DEFAULT_RATING) / SCALE;
        const phiJ = r.rd / SCALE;
        const gJ   = gFactor(phiJ);
        const E    = 1 / (1 + Math.exp(-gJ * (mu - muJ)));
        const w    = r.weight ?? 1;
        vInv += w * gJ * gJ * E * (1 - E);
        dSum += w * gJ * (r.score - E);
    }
    if (vInv <= 0) return { ...player };

    const v        = 1 / vInv;
    const delta    = v * dSum;
    const sigmaNew = newVolatility(phi, player.volatility, delta, v);
    const phiStar  = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
    const phiNew   = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const muNew    = mu + phiNew * phiNew * dSum;

    return {
        rating:     muNew * SCALE + DEFAULT_RATING,
        rd:         clamp(phiNew * SCALE, MIN_RD, MAX_RD),
        volatility: sigmaNew
    };
}

// RD wächst mit der Zeit ohne Partie — siehe INACTIVITY_C oben.
function applyInactivity(player, lastRatedAt, now) {
    if (!lastRatedAt) return player;
    const days = (now.getTime() - new Date(lastRatedAt).getTime()) / 86400000;
    const periods = Math.floor(days / INACTIVITY_PERIOD_DAYS);
    if (periods < 1) return player;
    return {
        ...player,
        rd: Math.min(MAX_RD, Math.sqrt(player.rd * player.rd + INACTIVITY_C * INACTIVITY_C * periods))
    };
}

// ── Partie → paarweise Ergebnisse ────────────────────────────────────────────

// Rang innerhalb einer Partie; kleiner = besser.
//   Sieger                                  → 0
//   Verlierer, nie eliminiert               → 1   (Spiel endete unter ihm weg,
//                                                  z.B. Erschließungs-/Team-Sieg)
//   Verlierer, eliminiert                   → später eliminiert ist besser
//   Aufgeber (left_game)                    → schlechtester Rang
//
// Aufgeben zählt bewusst als Niederlage gegen alle: bei Async-Partien über
// Wochen wäre "aussteigen, um das Rating zu retten" sonst die beste Strategie.
function rankOf(p, winnerSet) {
    if (winnerSet.has(p.slot)) return 0;
    if (p.left_game)           return Number.MAX_SAFE_INTEGER;
    if (p.eliminated_round == null) return 1;
    return 1e6 - p.eliminated_round;
}

// Teammitglieder aus dem State lesen (feste Teams: state.at === 1, Verbündete
// als Slot-Liste in p[i].al). Bei freier Diplomatie sind Bündnisse wechselhaft
// und werden bewusst NICHT als Teams behandelt — dort zählt nur winner_slots.
function readFixedTeams(stateBlob) {
    const teams = new Map();
    try {
        const st = JSON.parse(LZString.decompressFromEncodedURIComponent(stateBlob));
        if (st && st.at === 1 && Array.isArray(st.p)) {
            st.p.forEach((pl, i) => teams.set(i, new Set(Array.isArray(pl.al) ? pl.al : [])));
        }
    } catch (_) { /* kein/kaputter State → keine Teams, Wertung läuft trotzdem */ }
    return teams;
}

// Baut für jeden Teilnehmer die Liste seiner gewerteten Gegner.
// Mehrspieler-Partien werden heruntergewichtet: jeder Spieler bekommt insgesamt
// das Informationsgewicht EINER Partie (weight = 1/Gegnerzahl), sonst zählte ein
// 6-Spieler-Spiel wie fünf Einzelpartien.
function buildPairings(parts, winnerSet, teams) {
    const out = new Map();
    for (const a of parts) {
        const opponents = parts.filter(b =>
            b.profile_id !== a.profile_id &&
            !(teams.get(a.slot)?.has(b.slot))          // Teamkollegen nicht gegeneinander werten
        );
        const weight = opponents.length ? 1 / opponents.length : 0;
        const rankA = rankOf(a, winnerSet);
        out.set(a.profile_id, opponents.map(b => {
            const rankB = rankOf(b, winnerSet);
            const score = rankA < rankB ? 1 : rankA > rankB ? 0 : 0.5;
            return { rating: b.rating, rd: b.rd, score, weight };
        }));
    }
    return out;
}

// ── Öffentliche API ──────────────────────────────────────────────────────────

// Wertet eine beendete Partie. Idempotent: liegt für das Spiel bereits Historie
// vor, passiert nichts (die Route kann also gefahrlos doppelt aufrufen).
async function rateFinishedGame(gameId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [game] } = await client.query(
            `SELECT id, status, winner_slots, state_blob FROM games WHERE id = $1 FOR UPDATE`,
            [gameId]
        );
        if (!game)                      { await client.query('ROLLBACK'); return { skipped: 'not_found' }; }
        if (game.status !== 'finished') { await client.query('ROLLBACK'); return { skipped: 'not_finished' }; }

        const { rows: already } = await client.query(
            'SELECT 1 FROM rating_history WHERE game_id = $1 LIMIT 1', [gameId]
        );
        if (already.length) { await client.query('ROLLBACK'); return { skipped: 'already_rated' }; }

        const { rows: parts } = await client.query(
            `SELECT gp.slot, gp.profile_id, gp.eliminated, gp.left_game, gp.eliminated_round,
                    p.rating, p.rd, p.volatility, p.games_rated, p.last_rated_at
             FROM game_players gp JOIN profiles p ON p.id = gp.profile_id
             WHERE gp.game_id = $1 AND gp.profile_id IS NOT NULL
             ORDER BY gp.slot`,
            [gameId]
        );
        if (parts.length < 2) { await client.query('ROLLBACK'); return { skipped: 'too_few_players' }; }

        // Sieger: bevorzugt winner_slots. Fehlt es (Altspiele), fällt es auf die
        // alte Heuristik zurück — die ist bei genau einem Überlebenden eindeutig,
        // sonst wird die Partie lieber gar nicht gewertet als falsch.
        let winners = Array.isArray(game.winner_slots) && game.winner_slots.length
            ? game.winner_slots
            : parts.filter(p => !p.eliminated && !p.left_game).map(p => p.slot);
        const winnerSet = new Set(winners);
        if (winnerSet.size === 0 || winnerSet.size >= parts.length) {
            await client.query('ROLLBACK');
            return { skipped: 'ambiguous_winner' };
        }

        const now   = new Date();
        const teams = readFixedTeams(game.state_blob);

        // Inaktivitäts-Verfall VOR der Wertung, auf dem Stand aller Teilnehmer.
        const before = new Map();
        for (const p of parts) {
            const decayed = applyInactivity(
                { rating: Number(p.rating), rd: Number(p.rd), volatility: Number(p.volatility) },
                p.last_rated_at, now
            );
            before.set(p.profile_id, decayed);
            p.rating = decayed.rating;
            p.rd     = decayed.rd;
        }

        const pairings = buildPairings(parts, winnerSet, teams);

        // Alle Spieler simultan aus demselben Vorher-Stand berechnen (so ist eine
        // Partie eine Glicko-Rating-Periode und die Reihenfolge egal).
        const results = [];
        for (const p of parts) {
            const prev    = before.get(p.profile_id);
            const oppList = pairings.get(p.profile_id) || [];
            const next    = glicko2Update({ ...prev, volatility: Number(p.volatility) }, oppList);
            const scored  = oppList.reduce((s, o) => s + o.score * o.weight, 0);
            results.push({ p, prev, next, scored, opponents: oppList.length });
        }

        for (const r of results) {
            await client.query(
                `UPDATE profiles
                    SET rating = $1, rd = $2, volatility = $3,
                        games_rated = games_rated + 1, last_rated_at = $4
                  WHERE id = $5`,
                [r.next.rating, r.next.rd, r.next.volatility, now, r.p.profile_id]
            );
            await client.query(
                `INSERT INTO rating_history
                    (game_id, profile_id, rating_before, rating_after, rd_before, rd_after,
                     volatility_before, volatility_after, score, opponents, won)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (game_id, profile_id) DO NOTHING`,
                [gameId, r.p.profile_id, r.prev.rating, r.next.rating, r.prev.rd, r.next.rd,
                 r.prev.volatility, r.next.volatility, r.scored, r.opponents,
                 winnerSet.has(r.p.slot)]
            );
        }

        await client.query('COMMIT');
        return {
            rated: results.length,
            changes: results.map(r => ({
                profile_id: r.p.profile_id,
                delta: Math.round(r.next.rating - r.prev.rating)
            }))
        };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

// Komplette Neuberechnung aus der Spielhistorie. Bei dieser Datenmenge (< 100
// Partien) Millisekunden — das ist die Rückversicherung dafür, dass Parameter
// oder Backfill-Entscheidungen später revidierbar bleiben.
async function rebuildAllRatings({ since = RATING_EPOCH } = {}) {
    await pool.query(`
        UPDATE profiles SET rating = $1, rd = $2, volatility = $3,
                            games_rated = 0, last_rated_at = NULL
    `, [DEFAULT_RATING, DEFAULT_RD, DEFAULT_VOL]);
    await pool.query('DELETE FROM rating_history');

    const { rows } = await pool.query(
        `SELECT id FROM games
          WHERE status = 'finished' ${since ? 'AND updated_at >= $1' : ''}
          ORDER BY updated_at ASC`,
        since ? [since] : []
    );

    const summary = { total: rows.length, rated: 0, skipped: {} };
    for (const g of rows) {
        const r = await rateFinishedGame(g.id);
        if (r.rated) summary.rated++;
        else summary.skipped[r.skipped] = (summary.skipped[r.skipped] || 0) + 1;
    }
    return summary;
}

module.exports = {
    rateFinishedGame,
    rebuildAllRatings,
    glicko2Update,
    applyInactivity,
    // exportiert für Tests (scripts/test-rating.js) — reine Funktionen ohne DB
    rankOf,
    buildPairings,
    DEFAULT_RATING, DEFAULT_RD, DEFAULT_VOL, PROVISIONAL_GAMES, RATING_EPOCH
};
