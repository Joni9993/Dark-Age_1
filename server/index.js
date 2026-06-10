require('dotenv').config();
const express = require('express');
const path    = require('path');
const { initSchema } = require('./db');
const { initPush }   = require('./push');

const app = express();
app.use(express.json({ limit: '4mb' })); // state_blob can be large

// Serve the game (static files one level up)
app.use(express.static(path.join(__dirname, '..')));

// API routes
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/games',   require('./routes/games'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/push',    require('./routes/push'));

// SPA fallback: any non-API route returns index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Global error handler
app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Serverfehler' });
});

const PORT = process.env.PORT || 3000;

(async () => {
    await initSchema();
    initPush();
    app.listen(PORT, () => console.log(`Dark Ages läuft auf http://localhost:${PORT}`));
})();
