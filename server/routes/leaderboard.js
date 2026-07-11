const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../auth');

// GET /api/leaderboard — all registered players, ranked by games won.
// A "win" is a finished game where the player was the sole non-eliminated,
// non-departed participant (same rule used for the winner notification in games.js).
router.get('/', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT p.id, p.username, COUNT(g.id)::int AS wins
         FROM profiles p
         LEFT JOIN game_players gp ON gp.profile_id = p.id AND gp.eliminated = FALSE AND gp.left_game = FALSE
         LEFT JOIN games g ON g.id = gp.game_id AND g.status = 'finished'
         GROUP BY p.id, p.username
         ORDER BY wins DESC, p.username ASC
         LIMIT 100`
    );
    res.json(rows);
});

module.exports = router;
