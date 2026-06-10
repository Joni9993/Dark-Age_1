const router = require('express').Router();
const { pool } = require('../db');
const { hashPassword, verifyPassword, signJwt, authMiddleware } = require('../auth');

// POST /api/auth/login  { username, password }
// First visit → creates account. Returning → verifies password.
router.post('/login', async (req, res) => {
    const username = (req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || username.length < 2)  return res.status(400).json({ error: 'Name mindestens 2 Zeichen' });
    if (username.length > 20)              return res.status(400).json({ error: 'Name maximal 20 Zeichen' });
    if (!/^[a-zA-Z0-9_\-äöüÄÖÜß]+$/.test(username))
                                           return res.status(400).json({ error: 'Ungültige Zeichen im Namen' });
    if (password.length < 4)              return res.status(400).json({ error: 'Passwort mindestens 4 Zeichen' });

    try {
        const { rows } = await pool.query(
            'SELECT id, username, password_hash FROM profiles WHERE username = $1', [username]
        );

        if (rows.length === 0) {
            // New user — create account
            const hash = await hashPassword(password);
            const { rows: [profile] } = await pool.query(
                'INSERT INTO profiles (username, password_hash) VALUES ($1, $2) RETURNING id, username',
                [username, hash]
            );
            return res.json({ token: signJwt(profile.id), profile: { id: profile.id, username: profile.username } });
        }

        // Returning user — verify password
        const valid = await verifyPassword(password, rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: 'Falsches Passwort' });

        res.json({ token: signJwt(rows[0].id), profile: { id: rows[0].id, username: rows[0].username } });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Name bereits vergeben' });
        throw err;
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
    const { rows: [profile] } = await pool.query(
        'SELECT id, username FROM profiles WHERE id = $1', [req.profileId]
    );
    if (!profile) return res.status(404).json({ error: 'Profil nicht gefunden' });
    res.json(profile);
});

module.exports = router;
