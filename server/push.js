const webpush = require('web-push');
const { pool } = require('./db');

let _initialized = false;

function initPush() {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.warn('VAPID keys not set — push notifications disabled.');
        return;
    }
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    _initialized = true;
}

async function notifyPlayer(profileId, title, body, url) {
    if (!_initialized) return;

    const { rows: subs } = await pool.query(
        'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE profile_id = $1',
        [profileId]
    );

    const payload = JSON.stringify({ title, body, url });

    for (const sub of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
            );
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription expired — clean up
                await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
            }
        }
    }
}

module.exports = { initPush, notifyPlayer };
