const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const { notifyPlayer } = require('../push');

// ── Helper ────────────────────────────────────────────────────────────────────
async function getGamePlayers(gameId) {
    const { rows } = await pool.query(
        `SELECT gp.slot, gp.eliminated, p.username
         FROM game_players gp JOIN profiles p ON p.id = gp.profile_id
         WHERE gp.game_id = $1 ORDER BY gp.slot`, [gameId]
    );
    return rows;
}

// ── GET /api/games  — my game list ───────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT gp.slot, gp.eliminated,
                g.id, g.name, g.status, g.current_slot, g.max_players, g.updated_at,
                cp.username AS current_player_username
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         LEFT JOIN game_players cp_gp ON cp_gp.game_id = g.id AND cp_gp.slot = g.current_slot
         LEFT JOIN profiles cp ON cp.id = cp_gp.profile_id
         WHERE gp.profile_id = $1 AND g.status != 'finished'
         ORDER BY g.updated_at DESC`,
        [req.profileId]
    );
    res.json(rows);
});

// ── POST /api/games  — create lobby ──────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
    const { max_players = 2, map_radius = 7 } = req.body;
    if (max_players < 2 || max_players > 6) return res.status(400).json({ error: 'Ungültige Spieleranzahl' });

    const { rows: [profile] } = await pool.query('SELECT username FROM profiles WHERE id = $1', [req.profileId]);
    const name = `${profile.username}s Spiel`;

    const { rows: [game] } = await pool.query(
        `INSERT INTO games (name, host_id, max_players, map_radius)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, req.profileId, max_players, map_radius]
    );
    await pool.query(
        'INSERT INTO game_players (game_id, slot, profile_id) VALUES ($1, 0, $2)',
        [game.id, req.profileId]
    );
    res.json(game);
});

// ── GET /api/games/:id ────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
    const { rows: [game] } = await pool.query(
        'SELECT * FROM games WHERE id = $1', [req.params.id]
    );
    if (!game) return res.status(404).json({ error: 'Spiel nicht gefunden' });

    const players = await getGamePlayers(req.params.id);
    const me = players.find(p => false); // will fetch separately

    const { rows: [myRow] } = await pool.query(
        'SELECT slot, eliminated FROM game_players WHERE game_id = $1 AND profile_id = $2',
        [req.params.id, req.profileId]
    );
    if (!myRow) return res.status(403).json({ error: 'Kein Zugriff' });

    res.json({ ...game, players, my_slot: myRow.slot, my_eliminated: myRow.eliminated });
});

// ── POST /api/games/:id/start  — host starts game ────────────────────────────
router.post('/:id/start', authMiddleware, async (req, res) => {
    const { seed, state_blob } = req.body;
    const { rows: [game] } = await pool.query(
        'SELECT * FROM games WHERE id = $1 AND host_id = $2 AND status = $3',
        [req.params.id, req.profileId, 'lobby']
    );
    if (!game) return res.status(403).json({ error: 'Nicht der Host oder Spiel nicht in Lobby' });

    await pool.query(
        `UPDATE games SET status = 'active', seed = $1, state_blob = $2,
         current_slot = 0, round = 1, updated_at = NOW() WHERE id = $3`,
        [seed, state_blob, req.params.id]
    );
    res.json({ ok: true });
});

// ── POST /api/games/:id/turn  — submit a turn ────────────────────────────────
router.post('/:id/turn', authMiddleware, async (req, res) => {
    const { state_blob, next_slot, next_round, eliminated_slots = [], game_finished = false } = req.body;

    // Verify it's this player's turn
    const { rows: [row] } = await pool.query(
        `SELECT g.current_slot, g.name, gp.slot
         FROM games g JOIN game_players gp ON gp.game_id = g.id
         WHERE g.id = $1 AND gp.profile_id = $2 AND g.status = 'active'`,
        [req.params.id, req.profileId]
    );
    if (!row) return res.status(403).json({ error: 'Kein Zugriff oder Spiel nicht aktiv' });
    if (row.current_slot !== row.slot) return res.status(403).json({ error: 'Nicht dein Zug' });

    // Find newly eliminated players before marking them
    let newlyEliminated = [];
    if (eliminated_slots.length > 0) {
        const { rows } = await pool.query(
            'SELECT slot, profile_id FROM game_players WHERE game_id = $1 AND slot = ANY($2) AND eliminated = FALSE',
            [req.params.id, eliminated_slots]
        );
        newlyEliminated = rows;
        await pool.query(
            'UPDATE game_players SET eliminated = TRUE WHERE game_id = $1 AND slot = ANY($2)',
            [req.params.id, eliminated_slots]
        );
    }

    // Write new state
    const newStatus = game_finished ? 'finished' : 'active';
    await pool.query(
        `UPDATE games SET state_blob = $1, current_slot = $2, round = $3, status = $4, updated_at = NOW()
         WHERE id = $5`,
        [state_blob, next_slot, next_round, newStatus, req.params.id]
    );

    const url = `${process.env.APP_URL}?game=${req.params.id}`;

    if (game_finished) {
        // Notify winners (non-eliminated, non-submitter players)
        pool.query(
            'SELECT profile_id FROM game_players WHERE game_id = $1 AND eliminated = FALSE AND profile_id != $2',
            [req.params.id, req.profileId]
        ).then(({ rows: winners }) => {
            for (const w of winners) {
                notifyPlayer(w.profile_id, 'Dark Ages', `Spiel beendet! Du hast "${row.name}" gewonnen!`, url).catch(() => {});
            }
        }).catch(() => {});
    } else {
        // Notify next player
        pool.query(
            'SELECT profile_id FROM game_players WHERE game_id = $1 AND slot = $2 AND eliminated = FALSE',
            [req.params.id, next_slot]
        ).then(({ rows: [nextPlayer] }) => {
            if (!nextPlayer) return;
            notifyPlayer(nextPlayer.profile_id, 'Dark Ages', `Du bist dran in ${row.name}!`, url).catch(() => {});
        }).catch(() => {});
    }

    // Notify newly eliminated players (excluding the submitter who already sees the result)
    for (const elim of newlyEliminated) {
        if (elim.profile_id === req.profileId) continue;
        notifyPlayer(elim.profile_id, 'Dark Ages', `Du wurdest in "${row.name}" besiegt!`, url).catch(() => {});
    }

    res.json({ ok: true });
});

// ── DELETE /api/games/:id  — host deletes lobby ───────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
    const { rows: [game] } = await pool.query(
        'SELECT id, status FROM games WHERE id = $1 AND host_id = $2',
        [req.params.id, req.profileId]
    );
    if (!game) return res.status(403).json({ error: 'Nicht der Host' });
    if (game.status !== 'lobby') return res.status(400).json({ error: 'Nur Lobbys können gelöscht werden' });

    await pool.query('DELETE FROM game_players WHERE game_id = $1', [req.params.id]);
    await pool.query('DELETE FROM games WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
});

// ── GET /api/lobby/:token  — public lobby preview ────────────────────────────
router.get('/lobby/:token', async (req, res) => {
    const { rows: [game] } = await pool.query(
        'SELECT id, name, status, max_players FROM games WHERE invite_token = $1',
        [req.params.token]
    );
    if (!game) return res.status(404).json({ error: 'Lobby nicht gefunden' });
    const players = await getGamePlayers(game.id);
    res.json({ ...game, players });
});

// ── POST /api/lobby/:token/join ───────────────────────────────────────────────
router.post('/lobby/:token/join', authMiddleware, async (req, res) => {
    const { rows: [game] } = await pool.query(
        'SELECT id, max_players, status FROM games WHERE invite_token = $1',
        [req.params.token]
    );
    if (!game) return res.status(404).json({ error: 'Lobby nicht gefunden' });
    if (game.status !== 'lobby') return res.status(400).json({ error: 'Spiel bereits gestartet' });

    // Already in?
    const { rows: [existing] } = await pool.query(
        'SELECT 1 FROM game_players WHERE game_id = $1 AND profile_id = $2',
        [game.id, req.profileId]
    );
    if (existing) return res.json({ game_id: game.id });

    const { rows: [{ next_slot }] } = await pool.query(
        'SELECT COALESCE(MAX(slot), -1) + 1 AS next_slot FROM game_players WHERE game_id = $1',
        [game.id]
    );
    if (next_slot >= game.max_players) return res.status(400).json({ error: 'Lobby ist voll' });

    await pool.query(
        'INSERT INTO game_players (game_id, slot, profile_id) VALUES ($1, $2, $3)',
        [game.id, next_slot, req.profileId]
    );
    res.json({ game_id: game.id });
});

// ── POST /api/games/:id/invite  — host invites by username ───────────────────
router.post('/:id/invite', authMiddleware, async (req, res) => {
    const username = (req.body.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Kein Name angegeben' });

    const { rows: [game] } = await pool.query(
        'SELECT name, max_players, status FROM games WHERE id = $1 AND host_id = $2',
        [req.params.id, req.profileId]
    );
    if (!game) return res.status(403).json({ error: 'Nicht der Host' });
    if (game.status !== 'lobby') return res.status(400).json({ error: 'Spiel bereits gestartet' });

    const { rows: [friend] } = await pool.query(
        'SELECT id FROM profiles WHERE username = $1', [username]
    );
    if (!friend) return res.status(404).json({ error: 'Spieler nicht gefunden' });

    const { rows: [existing] } = await pool.query(
        'SELECT 1 FROM game_players WHERE game_id = $1 AND profile_id = $2',
        [req.params.id, friend.id]
    );
    if (existing) return res.status(409).json({ error: 'Spieler bereits in der Lobby' });

    const { rows: [{ next_slot }] } = await pool.query(
        'SELECT COALESCE(MAX(slot), -1) + 1 AS next_slot FROM game_players WHERE game_id = $1',
        [req.params.id]
    );
    if (next_slot >= game.max_players) return res.status(400).json({ error: 'Lobby ist voll' });

    await pool.query(
        'INSERT INTO game_players (game_id, slot, profile_id) VALUES ($1, $2, $3)',
        [req.params.id, next_slot, friend.id]
    );

    // Push notification to invited player (non-blocking)
    const url = `${process.env.APP_URL}?game=${req.params.id}`;
    notifyPlayer(friend.id, 'Dark Ages', `Du wurdest zu "${game.name}" eingeladen!`, url).catch(() => {});

    res.json({ ok: true });
});

module.exports = router;
