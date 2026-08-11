const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../auth');

// GET /api/leaderboard — all registered players, ranked by games won.
// A "win" is a finished game where the player's slot is listed in g.winner_slots
// (the actual winner(s) — a team win or Erschließungs-Sieg leaves a losing
// opponent non-eliminated, so "not eliminated" alone is NOT a win). For games
// finished before this fix (winner_slots IS NULL), fall back to the old,
// imprecise heuristic (sole non-eliminated, non-departed participant) so
// historical stats don't just disappear.
router.get('/', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT p.id, p.username,
                COUNT(g.id) FILTER (
                    WHERE (g.winner_slots IS NOT NULL AND gp.slot = ANY(g.winner_slots))
                       OR (g.winner_slots IS NULL AND gp.eliminated = FALSE AND gp.left_game = FALSE)
                )::int AS wins
         FROM profiles p
         LEFT JOIN game_players gp ON gp.profile_id = p.id
         LEFT JOIN games g ON g.id = gp.game_id AND g.status = 'finished'
         GROUP BY p.id, p.username
         ORDER BY wins DESC, p.username ASC
         LIMIT 100`
    );
    res.json(rows);
});

module.exports = router;
