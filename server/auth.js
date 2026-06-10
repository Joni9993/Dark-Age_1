const jwt = require('jsonwebtoken');
const { scrypt, randomBytes, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);
const JWT_SECRET  = () => process.env.JWT_SECRET;

// ── Password hashing (crypto.scrypt, no external deps) ────────────────────────

async function hashPassword(password) {
    const salt    = randomBytes(16).toString('hex');
    const derived = await scryptAsync(password, salt, 64);
    return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
    const [salt, storedHash] = stored.split(':');
    const derived = await scryptAsync(password, salt, 64);
    return timingSafeEqual(Buffer.from(storedHash, 'hex'), derived);
}

// ── JWT ───────────────────────────────────────────────────────────────────────

function signJwt(profileId) {
    return jwt.sign({ profileId }, JWT_SECRET(), { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht eingeloggt' });
    try {
        const payload = jwt.verify(header.slice(7), JWT_SECRET());
        req.profileId = payload.profileId;
        next();
    } catch {
        res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
    }
}

module.exports = { hashPassword, verifyPassword, signJwt, authMiddleware };
