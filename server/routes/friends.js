const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../auth');

// GET /api/friends
router.get('/', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT f.requester_id, f.addressee_id, f.status,
                r.username AS requester_username,
                a.username AS addressee_username
         FROM friendships f
         JOIN profiles r ON r.id = f.requester_id
         JOIN profiles a ON a.id = f.addressee_id
         WHERE f.requester_id = $1 OR f.addressee_id = $1`,
        [req.profileId]
    );
    res.json(rows);
});

// POST /api/friends/request  { username }
router.post('/request', authMiddleware, async (req, res) => {
    const username = (req.body.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Kein Name angegeben' });

    const { rows: [target] } = await pool.query(
        'SELECT id FROM profiles WHERE username = $1', [username]
    );
    if (!target) return res.status(404).json({ error: 'Spieler nicht gefunden' });
    if (target.id === req.profileId) return res.status(400).json({ error: 'Du kannst dich nicht selbst hinzufügen' });

    try {
        await pool.query(
            'INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)',
            [req.profileId, target.id]
        );
        res.json({ ok: true });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Anfrage bereits gesendet' });
        throw err;
    }
});

// POST /api/friends/accept/:requesterId
router.post('/accept/:requesterId', authMiddleware, async (req, res) => {
    const { rowCount } = await pool.query(
        `UPDATE friendships SET status = 'accepted'
         WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
        [req.params.requesterId, req.profileId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
    res.json({ ok: true });
});

// DELETE /api/friends/:otherId
router.delete('/:otherId', authMiddleware, async (req, res) => {
    const { rowCount } = await pool.query(
        `DELETE FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1)`,
        [req.profileId, req.params.otherId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Freundschaft nicht gefunden' });
    res.json({ ok: true });
});

module.exports = router;
