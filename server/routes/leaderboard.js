const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const { PROVISIONAL_GAMES } = require('../rating');

// GET /api/leaderboard — alle registrierten Spieler, sortiert nach Glicko-2-Rating.
//
// Sortierung: etablierte Spieler (>= PROVISIONAL_GAMES gewertete Partien) zuerst
// nach Rating, danach die vorläufigen. Ohne diese Trennung stünde ein Spieler
// nach einem einzigen Glückstreffer über jemandem mit 50 Partien — genau das
// Problem, das die reine Siegzählung vorher hatte.
//
// `wins`/`games` sind bewusst die HISTORISCHE Bilanz über alle beendeten Partien
// (inkl. der Zeit vor Einführung des Ratings), damit im Leaderboard nichts
// verschwindet, was die Spieler kennen. Das Rating selbst startet dagegen bei
// allen frisch (kein Backfill, siehe RATING_EPOCH in server/rating.js) — ein
// Spieler kann also viele Siege und noch 0 gewertete Partien haben.
// Sieg-Definition wie zuvor: winner_slots, mit Rückfall auf die alte Heuristik
// für Partien von vor diesem Feld.
router.get('/', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT p.id, p.username,
                ROUND(p.rating)::int AS rating,
                ROUND(p.rd)::int     AS rd,
                p.games_rated,
                (p.games_rated >= $1) AS established,
                COUNT(g.id) FILTER (
                    WHERE (g.winner_slots IS NOT NULL AND gp.slot = ANY(g.winner_slots))
                       OR (g.winner_slots IS NULL AND gp.eliminated = FALSE AND gp.left_game = FALSE)
                )::int AS wins,
                COUNT(g.id)::int AS games
         FROM profiles p
         LEFT JOIN game_players gp ON gp.profile_id = p.id
         LEFT JOIN games g ON g.id = gp.game_id AND g.status = 'finished'
         GROUP BY p.id, p.username, p.rating, p.rd, p.games_rated
         ORDER BY (p.games_rated >= $1) DESC, p.rating DESC, p.username ASC
         LIMIT 100`,
        [PROVISIONAL_GAMES]
    );
    res.json(rows);
});

// GET /api/leaderboard/me/history — eigener Rating-Verlauf (letzte 50 Partien)
router.get('/me/history', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT rh.game_id, g.name AS game_name, rh.won,
                ROUND(rh.rating_before)::int AS rating_before,
                ROUND(rh.rating_after)::int  AS rating_after,
                ROUND(rh.rating_after - rh.rating_before)::int AS delta,
                rh.opponents, rh.created_at
         FROM rating_history rh
         LEFT JOIN games g ON g.id = rh.game_id
         WHERE rh.profile_id = $1
         ORDER BY rh.created_at DESC
         LIMIT 50`,
        [req.profileId]
    );
    res.json(rows);
});

module.exports = router;
