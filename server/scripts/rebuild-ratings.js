#!/usr/bin/env node
// Berechnet alle Ratings aus der Spielhistorie neu.
//
//   node server/scripts/rebuild-ratings.js              # ab RATING_EPOCH (Standard)
//   node server/scripts/rebuild-ratings.js --all        # ALLE beendeten Partien
//   node server/scripts/rebuild-ratings.js --since 2026-01-01
//
// Nötig, wenn Rating-Parameter (TAU, INACTIVITY_C, PROVISIONAL_GAMES …) geändert
// wurden oder die Altpartien doch eingerechnet werden sollen (--all). Setzt alle
// profiles-Ratingspalten und rating_history zurück und spielt die Partien in
// chronologischer Reihenfolge neu ein.
//
// Läuft gegen die DATABASE_URL aus der Umgebung — im Container also z.B.:
//   docker exec darkages node server/scripts/rebuild-ratings.js

require('dotenv').config();
const { pool } = require('../db');
const { rebuildAllRatings, RATING_EPOCH } = require('../rating');

(async () => {
    const args = process.argv.slice(2);
    const sinceIdx = args.indexOf('--since');
    const since = args.includes('--all') ? '1970-01-01'
                : sinceIdx >= 0          ? args[sinceIdx + 1]
                : RATING_EPOCH;

    console.log(`Rating-Rebuild ab ${since} …`);
    const summary = await rebuildAllRatings({ since });
    console.log(`Fertig: ${summary.rated} von ${summary.total} Partien gewertet.`);
    if (Object.keys(summary.skipped).length) {
        console.log('Übersprungen:');
        for (const [reason, n] of Object.entries(summary.skipped)) {
            console.log(`  ${reason}: ${n}`);
        }
    }

    const { rows } = await pool.query(
        `SELECT username, ROUND(rating)::int AS rating, ROUND(rd)::int AS rd, games_rated
         FROM profiles WHERE games_rated > 0
         ORDER BY rating DESC LIMIT 20`
    );
    if (rows.length) {
        console.log('\nRangliste:');
        for (const r of rows) {
            console.log(`  ${String(r.rating).padStart(5)} ±${String(r.rd).padStart(3)}  ` +
                        `${r.username} (${r.games_rated} Partien)`);
        }
    }
    await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
