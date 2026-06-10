const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../auth');

// POST /api/push/subscribe  { endpoint, p256dh, auth }
router.post('/subscribe', authMiddleware, async (req, res) => {
    const { endpoint, p256dh, auth } = req.body;
    if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'Fehlende Felder' });

    await pool.query(
        `INSERT INTO push_subscriptions (profile_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = $3, auth = $4, profile_id = $1`,
        [req.profileId, endpoint, p256dh, auth]
    );
    res.json({ ok: true });
});

module.exports = router;
