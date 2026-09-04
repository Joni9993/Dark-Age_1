const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const { notifyPlayer } = require('../push');
const { rateFinishedGame } = require('../rating');
const { shuffleSeats } = require('../seating');
const { buildStartState } = require('../mapgen');
const LZString = require('lz-string');

// Apply server-side eliminations to a parsed state object.
// Returns true if the state was modified.
function applyEliminationsToState(state, eliminatedSlots) {
    let modified = false;
    for (const slot of eliminatedSlots) {
        if (!state.p[slot] || state.p[slot].dead === 1) continue;
        state.p[slot].dead = 1;
        state.u = state.u.filter(u => u.p !== slot);
        for (const k of Object.keys(state.v || {})) {
            if (state.v[k] === slot) delete state.v[k];
        }
        if (state.wa) state.wa = state.wa.filter(w => w.o !== slot);
        if (state.tw) state.tw = state.tw.filter(t => t.o !== slot);
        if (state.tu) state.tu = state.tu.filter(t => t.o !== slot);
        modified = true;
    }
    return modified;
}

// ── Helper ────────────────────────────────────────────────────────────────────
async function getGamePlayers(gameId) {
    const { rows } = await pool.query(
        // profile_id mit ausgeliefert (Aug 2026, Lobby-Kick) — der Client
        // braucht ihn als Ziel für POST :id/kick, vorher war der Slot die
        // einzige clientseitige Kennung eines Lobby-Spielers.
        `SELECT gp.slot, gp.eliminated, gp.invite_status, p.id AS profile_id, p.username
         FROM game_players gp JOIN profiles p ON p.id = gp.profile_id
         WHERE gp.game_id = $1 ORDER BY gp.slot`, [gameId]
    );
    return rows;
}

// Nach dem Entfernen eines Lobby-Spielers (Kick oder freiwilliges Verlassen)
// müssen die restlichen Slots wieder lückenlos 0..n-1 sein — sonst hält
// join/invite (COALESCE(MAX(slot),-1)+1) eine Lobby mit einer freien Lücke
// fälschlich für voll, sobald ein mittlerer Slot frei wurde. Zwischenschritt
// über negative Slots, damit der PRIMARY KEY (game_id, slot) beim Umsortieren
// nicht kollidiert (gleiches Muster wie shuffleSeats beim Spielstart).
// Muss innerhalb derselben Transaktion laufen wie das DELETE, mit der
// games-Zeile FOR UPDATE gesperrt — sonst könnte ein gleichzeitiger Join
// zwischen Delete und Renumbering in die Lücke greifen.
async function renumberLobbySlots(client, gameId) {
    const { rows: seats } = await client.query(
        'SELECT profile_id FROM game_players WHERE game_id = $1 ORDER BY slot', [gameId]
    );
    await client.query('UPDATE game_players SET slot = -slot - 1 WHERE game_id = $1', [gameId]);
    for (let i = 0; i < seats.length; i++) {
        await client.query(
            'UPDATE game_players SET slot = $1 WHERE game_id = $2 AND profile_id = $3',
            [i, gameId, seats[i].profile_id]
        );
    }
}

// ── GET /api/games  — my game list ───────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT gp.slot, gp.eliminated, gp.invite_status,
                g.id, g.name, g.status, g.current_slot, g.max_players, g.updated_at, g.ranked,
                cp.username AS current_player_username
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         LEFT JOIN game_players cp_gp ON cp_gp.game_id = g.id AND cp_gp.slot = g.current_slot
         LEFT JOIN profiles cp ON cp.id = cp_gp.profile_id
         WHERE gp.profile_id = $1 AND gp.left_game = FALSE AND gp.list_hidden = FALSE
           -- Beendete Spiele bleiben 14 Tage sichtbar (Niederlage-Rückblick, Aug 2026)
           -- statt sofort zu verschwinden — sonst wäre defeatLog für den Verlierer genau
           -- dann unerreichbar, wenn er ihn am ehesten nachschauen will. Kein Enddatum wäre
           -- eine unbegrenzt wachsende Liste für aktive Spieler; 14 Tage sind großzügig genug
           -- für "nach dem Spiel in Ruhe reinschauen", ohne die Liste dauerhaft zu belasten.
           -- list_hidden lässt Spieler ein beendetes Spiel früher selbst ausblenden.
           AND (g.status != 'finished' OR g.updated_at > NOW() - INTERVAL '14 days')
         ORDER BY g.updated_at DESC`,
        [req.profileId]
    );
    res.json(rows);
});

// ── POST /api/games  — create lobby ──────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
    const { max_players = 2, map_radius = 7, team_mode = 'ffa', name: requestedName, ranked } = req.body;
    if (max_players < 2 || max_players > 6) return res.status(400).json({ error: 'Ungültige Spieleranzahl' });

    const validTeamModes = { ffa: true, diplomacy: true, teams2: true, teams3: true };
    if (!validTeamModes[team_mode]) return res.status(400).json({ error: 'Ungültiger Diplomatie/Team-Modus' });
    const teamSize = team_mode === 'teams2' ? 2 : team_mode === 'teams3' ? 3 : 0;
    if (teamSize > 0 && (max_players % teamSize !== 0 || max_players / teamSize < 2)) {
        return res.status(400).json({ error: 'Team-Größe passt nicht zur Spieleranzahl' });
    }
    if (team_mode === 'diplomacy' && max_players < 3) {
        return res.status(400).json({ error: 'Freie Diplomatie braucht mindestens 3 Spieler' });
    }

    const { rows: [profile] } = await pool.query('SELECT username FROM profiles WHERE id = $1', [req.profileId]);
    const trimmedName = typeof requestedName === 'string' ? requestedName.trim().slice(0, 60) : '';
    const name = trimmedName || `${profile.username}s Spiel`;

    const { rows: [game] } = await pool.query(
        `INSERT INTO games (name, host_id, max_players, map_radius, team_mode, ranked)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name, req.profileId, max_players, map_radius, team_mode, ranked === true]
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
        'SELECT slot, eliminated, invite_status FROM game_players WHERE game_id = $1 AND profile_id = $2',
        [req.params.id, req.profileId]
    );
    if (!myRow) return res.status(403).json({ error: 'Kein Zugriff' });

    res.json({
        ...game, players,
        my_slot: myRow.slot, my_eliminated: myRow.eliminated,
        my_invite_status: myRow.invite_status
    });
});

// "Die Partie läuft" an alle Mitspieler, mit "du bist dran" für den, der nach
// dem Mischen auf Slot 0 sitzt (Sept 2026, Jonathans Meldung: Vincent startete,
// er selbst hatte den ersten Zug und erfuhr davon nichts).
//
// Der Startknopf verschickte bis dahin GAR KEINEN Push — die "du bist
// dran"-Nachricht hing allein an POST /:id/turn, griff also erst ab dem
// ZWEITEN Zug. Wer den ersten Zug hatte, wurde als Einziger nie benachrichtigt,
// und ausgerechnet der hält die Partie auf. Seit die Sitzplätze gemischt werden
// (server/seating.js) trifft das nicht mehr planbar den Host, sondern
// irgendwen.
//
// `actorId` (Host beim Hand-Start, der Zusagende beim Auto-Start) bleibt außen
// vor: der hat die Partie gerade selbst ausgelöst und sieht sie auf dem Schirm.
function notifyGameStarted(gameId, gameName, seats, firstProfileId, actorId) {
    const url = `${process.env.APP_URL}?game=${gameId}`;
    for (const seat of seats) {
        if (seat.profile_id === actorId) continue;
        notifyPlayer(seat.profile_id, 'Dark Ages',
            seat.profile_id === firstProfileId
                ? `"${gameName}" ist gestartet — du machst den ersten Zug!`
                : `"${gameName}" ist gestartet — viel Erfolg!`,
            url).catch(() => {});
    }
}

// Der eigentliche Spielstart, gemeinsam genutzt von POST /:id/start (Host
// drückt) und tryAutoStart (letzte Zusage trifft ein, Sept 2026). Erwartet eine
// laufende Transaktion, in der die games-Zeile bereits FOR UPDATE gesperrt und
// als Lobby bestätigt ist. Gibt { ok, error?, seats } zurück; der Aufrufer
// entscheidet über COMMIT/ROLLBACK und die Antwort.
async function finalizeStart(client, gameId, teamMode, seed, stateBlob) {
    const { rows: seats } = await client.query(
        `SELECT gp.slot, gp.profile_id, p.username
         FROM game_players gp JOIN profiles p ON p.id = gp.profile_id
         WHERE gp.game_id = $1 AND gp.profile_id IS NOT NULL
         ORDER BY gp.slot FOR UPDATE OF gp`,
        [gameId]
    );

    // Team-Modus muss zur tatsächlichen Spielerzahl passen (Sept 2026).
    // buildInitialGameState (js/mapgen.js) überspringt die Team-Zuweisung
    // still, wenn count nicht durch die Teamgröße teilbar ist — aus einem
    // 3v3 würde dann ohne jede Meldung ein Jeder-gegen-jeden, und
    // server/rating.js wertet es auch so (`state.at === 1` fehlt). Erreichbar
    // war das schon über Kick und Verlassen; seit man eine Einladung ablehnen
    // kann, ist es der Normalfall statt der Ausnahme, deshalb steht die
    // Prüfung hier — auf der Serverseite, weil nur sie beim Start die
    // endgültige Belegung kennt.
    const teamSize = teamMode === 'teams2' ? 2 : teamMode === 'teams3' ? 3 : 0;
    if (teamSize > 0 && (seats.length % teamSize !== 0 || seats.length / teamSize < 2)) {
        return { ok: false, seats, error: `Feste ${teamSize}er-Teams brauchen eine durch ${teamSize} teilbare Spielerzahl (mindestens ${teamSize * 2}) — aktuell sind es ${seats.length}` };
    }

    let finalBlob = stateBlob;
    // Wer nach dem Mischen auf Slot 0 sitzt, also zuerst am Zug ist — die
    // Einträge in `seats` tragen noch die ALTE Belegung, ihr .slot taugt dafür
    // nicht (der Auto-Start schickt genau diesem Spieler ein "du bist dran").
    let firstProfileId = seats.length ? seats[0].profile_id : null;
    if (seats.length > 1) {
        const { blob, assignments } = shuffleSeats(seats, stateBlob);
        finalBlob = blob;
        const first = assignments.find(a => a.slot === 0);
        if (first) firstProfileId = first.profile_id;

        // Slots umschreiben. Erst aus dem PK-Bereich schieben, sonst kollidiert
        // PRIMARY KEY (game_id, slot) mitten in der Permutation.
        const ids = seats.map(s => s.profile_id);
        await client.query(
            'UPDATE game_players SET slot = -slot - 1 WHERE game_id = $1 AND profile_id = ANY($2)',
            [gameId, ids]
        );
        for (const a of assignments) {
            await client.query(
                'UPDATE game_players SET slot = $1 WHERE game_id = $2 AND profile_id = $3',
                [a.slot, gameId, a.profile_id]
            );
        }
    }

    await client.query(
        `UPDATE games SET status = 'active', seed = $1, state_blob = $2,
         current_slot = 0, round = 1, updated_at = NOW() WHERE id = $3`,
        [seed, finalBlob, gameId]
    );
    return { ok: true, seats, firstProfileId };
}

// ── POST /api/games/:id/start  — host starts game ────────────────────────────
router.post('/:id/start', authMiddleware, async (req, res) => {
    const { seed, state_blob } = req.body;

    // Sitzplätze mischen (Aug 2026). Vorher bekam der Host beim Anlegen fest
    // Slot 0 und war damit in JEDER Partie zuerst am Zug — in allen 49
    // auswertbaren 1v1-Partien saß der Host auf Slot 0. Ein Rating würde diesen
    // strukturellen Vorteil sonst als Spielstärke verbuchen.
    // Der Client baut state.p[] in Slot-Reihenfolge aus den Spielernamen; alles
    // Übrige in p[i] (Startdorf, Ressourcen, Team-Zuordnung via `al`) gehört zum
    // Sitzplatz und nicht zur Person. Es genügt daher, die Namen passend zur
    // neuen Slot-Belegung mitzutauschen.
    //
    // Die Lobby-Prüfung liegt bewusst INNERHALB der Transaktion (FOR UPDATE auf
    // der games-Zeile): zwei gleichzeitige Start-Klicks würden sonst beide
    // durchlaufen und die Sitzplätze zweimal permutieren.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [game] } = await client.query(
            `SELECT id, name, ranked, team_mode FROM games
              WHERE id = $1 AND host_id = $2 AND status = 'lobby' FOR UPDATE`,
            [req.params.id, req.profileId]
        );
        if (!game) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Nicht der Host oder Spiel nicht in Lobby' });
        }

        // Zusage-Pflicht, aber NUR für gewertete Partien (Sept 2026): dort
        // kostet ein erzwungenes Aufgeben je nach RD zweistellig bis dreistellig
        // Rating-Punkte (server/rating.js wertet left_game als Niederlage gegen
        // alle), das darf niemand ohne Zustimmung aufgedrückt bekommen. In einer
        // normalen Partie wäre dieselbe Wartepflicht nur Reibung ohne Gegenwert —
        // dort gilt eine offene Einladung mit dem Start als angenommen, wie
        // bisher. Die Prüfung liegt in derselben Transaktion wie der Start
        // (games-Zeile FOR UPDATE), sonst könnte eine Zusage/Absage dazwischen
        // rutschen.
        const { rows: [{ pending }] } = await client.query(
            `SELECT COUNT(*)::int AS pending FROM game_players
              WHERE game_id = $1 AND invite_status = 'pending'`,
            [req.params.id]
        );
        if (game.ranked && pending > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: pending === 1
                    ? 'Ein eingeladener Spieler hat noch nicht zugesagt'
                    : `${pending} eingeladene Spieler haben noch nicht zugesagt`
            });
        }
        if (pending > 0) {
            await client.query(
                `UPDATE game_players SET invite_status = 'accepted'
                  WHERE game_id = $1 AND invite_status = 'pending'`,
                [req.params.id]
            );
        }

        const started = await finalizeStart(client, req.params.id, game.team_mode, seed, state_blob);
        if (!started.ok) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: started.error });
        }

        await client.query('COMMIT');
        notifyGameStarted(req.params.id, game.name, started.seats, started.firstProfileId, req.profileId);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Spielstart fehlgeschlagen', req.params.id, err);
        return res.status(500).json({ error: 'Spielstart fehlgeschlagen' });
    } finally {
        client.release();
    }

    res.json({ ok: true });
});

// ── POST /api/games/:id/turn  — submit a turn ────────────────────────────────
router.post('/:id/turn', authMiddleware, async (req, res) => {
    const { state_blob, next_slot, next_round, eliminated_slots = [], game_finished = false, winner_slots = null } = req.body;

    // Verify it's this player's turn
    const { rows: [row] } = await pool.query(
        `SELECT g.current_slot, g.name, g.round, gp.slot
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
        // eliminated_round: wer später ausscheidet, steht in der Partie-Rangliste
        // besser da — daraus macht das Rating aus einer FFA-Partie eine echte
        // Reihenfolge statt nur "einer gewinnt". COALESCE, damit ein einmal
        // gesetzter Wert nie überschrieben wird.
        await pool.query(
            `UPDATE game_players SET eliminated = TRUE,
                    eliminated_round = COALESCE(eliminated_round, $3)
               WHERE game_id = $1 AND slot = ANY($2)`,
            [req.params.id, eliminated_slots, row.round]
        );
    }

    // Re-apply any server-side eliminations (e.g. from /abandon) the client may not have seen
    let finalBlob = state_blob;
    let finalNextSlot = next_slot;
    let finalNextRound = next_round;
    try {
        const { rows: serverElimRows } = await pool.query(
            'SELECT slot FROM game_players WHERE game_id = $1 AND eliminated = TRUE',
            [req.params.id]
        );
        const serverElimSlots = serverElimRows.map(r => r.slot);
        if (serverElimSlots.length > 0) {
            const decoded = LZString.decompressFromEncodedURIComponent(state_blob);
            const stateObj = JSON.parse(decoded);
            const modified = applyEliminationsToState(stateObj, serverElimSlots);
            if (modified) {
                // If next_slot is now dead, advance to next alive player
                if (stateObj.p[finalNextSlot] && stateObj.p[finalNextSlot].dead === 1) {
                    let guard = 0;
                    let ns = finalNextSlot;
                    let nr = finalNextRound;
                    do {
                        ns = (ns + 1) % stateObj.p.length;
                        if (ns === 0) nr++;
                        guard++;
                    } while (stateObj.p[ns] && stateObj.p[ns].dead === 1 && guard < stateObj.p.length);
                    finalNextSlot = ns;
                    finalNextRound = nr;
                    stateObj.cp = ns;
                    stateObj.rn = nr;
                }
                finalBlob = LZString.compressToEncodedURIComponent(JSON.stringify(stateObj));
            }
        }
    } catch (_) {}

    // Write new state
    const newStatus = game_finished ? 'finished' : 'active';
    await pool.query(
        `UPDATE games SET state_blob = $1, current_slot = $2, round = $3, status = $4, winner_slots = $5, updated_at = NOW()
         WHERE id = $6`,
        [finalBlob, finalNextSlot, finalNextRound, newStatus, game_finished ? winner_slots : null, req.params.id]
    );

    const url = `${process.env.APP_URL}?game=${req.params.id}`;

    if (game_finished) {
        // Glicko-2-Wertung. Läuft nach dem Schreiben der Eliminierungen, damit
        // eliminated_round bereits steht. Idempotent (siehe rating.js) und
        // bewusst fehlertolerant: ein Rating-Problem darf keinen Zug scheitern
        // lassen.
        try { await rateFinishedGame(req.params.id); }
        catch (e) { console.error('Rating fehlgeschlagen für Spiel', req.params.id, e); }

        // Notify all other (non-submitter) players — but only the actual
        // winners get "gewonnen". Bugfix (Aug 2026): a Team-/Erschließungs-win
        // ends the game while a losing opponent is still `eliminated = FALSE`
        // (they weren't defeated, the game just ended out from under them), so
        // "non-eliminated" alone no longer implies "winner" the way it does for
        // the last-survivor case. Fall back to the old (imprecise) behavior only
        // if the client didn't send winner_slots (shouldn't happen post-fix).
        pool.query(
            'SELECT profile_id, slot, eliminated FROM game_players WHERE game_id = $1 AND profile_id != $2',
            [req.params.id, req.profileId]
        ).then(({ rows: others }) => {
            for (const o of others) {
                if (o.eliminated) continue; // already notified via the newlyEliminated loop below
                const isWinner = Array.isArray(winner_slots) ? winner_slots.includes(o.slot) : true;
                const msg = isWinner
                    ? `Spiel beendet! Du hast "${row.name}" gewonnen!`
                    : `Spiel beendet! "${row.name}" ist vorbei — du hast diesmal nicht gewonnen.`;
                notifyPlayer(o.profile_id, 'Dark Ages', msg, url).catch(() => {});
            }
        }).catch(() => {});
    } else {
        // Notify next player
        pool.query(
            'SELECT profile_id FROM game_players WHERE game_id = $1 AND slot = $2 AND eliminated = FALSE',
            [req.params.id, finalNextSlot]
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

// ── POST /api/games/:id/kick  — host removes another player from the lobby ────
router.post('/:id/kick', authMiddleware, async (req, res) => {
    const { profile_id } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'Kein Spieler angegeben' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [game] } = await client.query(
            `SELECT id, host_id, name FROM games WHERE id = $1 AND status = 'lobby' FOR UPDATE`,
            [req.params.id]
        );
        if (!game || game.host_id !== req.profileId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Nicht der Host oder Spiel nicht in Lobby' });
        }
        // Der Host wirft sich nicht selbst raus — dafür gibt es DELETE :id
        // (löscht die ganze Lobby), ein "Kick" des Hosts hinterließe eine
        // Lobby ohne Host und ohne definierten Nachfolger.
        if (profile_id === game.host_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Der Host kann sich nicht selbst rauswerfen — Lobby stattdessen löschen' });
        }

        const { rowCount } = await client.query(
            'DELETE FROM game_players WHERE game_id = $1 AND profile_id = $2',
            [req.params.id, profile_id]
        );
        if (!rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Spieler nicht in der Lobby' });
        }
        await renumberLobbySlots(client, req.params.id);
        await client.query('COMMIT');

        notifyPlayer(profile_id, 'Dark Ages', `Du wurdest aus "${game.name}" entfernt.`, process.env.APP_URL).catch(() => {});
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Kick fehlgeschlagen', req.params.id, err);
        res.status(500).json({ error: 'Kick fehlgeschlagen' });
    } finally {
        client.release();
    }
});

// ── POST /api/games/:id/leave  — non-host player leaves the lobby voluntarily ─
router.post('/:id/leave', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [game] } = await client.query(
            `SELECT id, host_id FROM games WHERE id = $1 AND status = 'lobby' FOR UPDATE`,
            [req.params.id]
        );
        if (!game) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Spiel nicht in Lobby' });
        }
        // Der Host verlässt seine eigene Lobby nicht — DELETE :id löst sie auf.
        if (game.host_id === req.profileId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Der Host kann die Lobby nicht verlassen — stattdessen löschen' });
        }

        const { rowCount } = await client.query(
            'DELETE FROM game_players WHERE game_id = $1 AND profile_id = $2',
            [req.params.id, req.profileId]
        );
        if (!rowCount) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Nicht in der Lobby' });
        }
        await renumberLobbySlots(client, req.params.id);
        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Lobby verlassen fehlgeschlagen', req.params.id, err);
        res.status(500).json({ error: 'Verlassen fehlgeschlagen' });
    } finally {
        client.release();
    }
});

// ── POST /api/games/:id/hide  — any participant removes a FINISHED game from
// their own list ─────────────────────────────────────────────────────────────
// Anders als DELETE /:id (Host-only, Lobby-only, löscht das ganze Spiel):
// jeder Teilnehmer, nur bei bereits beendeten Spielen, betrifft nur die eigene
// Zeile (list_hidden) — die anderen Spieler sehen das Spiel unverändert weiter.
router.post('/:id/hide', authMiddleware, async (req, res) => {
    const { rows: [game] } = await pool.query('SELECT status FROM games WHERE id = $1', [req.params.id]);
    if (!game) return res.status(404).json({ error: 'Spiel nicht gefunden' });
    if (game.status !== 'finished') return res.status(400).json({ error: 'Nur beendete Spiele können ausgeblendet werden' });

    const { rowCount } = await pool.query(
        'UPDATE game_players SET list_hidden = TRUE WHERE game_id = $1 AND profile_id = $2',
        [req.params.id, req.profileId]
    );
    if (!rowCount) return res.status(403).json({ error: 'Kein Zugriff' });
    res.json({ ok: true });
});

// ── POST /api/games/:id/abandon  — any player surrenders from menu ────────────
router.post('/:id/abandon', authMiddleware, async (req, res) => {
    const { rows: [playerRow] } = await pool.query(
        `SELECT gp.slot, gp.eliminated, g.status, g.state_blob, g.current_slot, g.round, g.name
         FROM game_players gp JOIN games g ON g.id = gp.game_id
         WHERE gp.game_id = $1 AND gp.profile_id = $2`,
        [req.params.id, req.profileId]
    );
    if (!playerRow) return res.status(403).json({ error: 'Nicht im Spiel' });
    if (playerRow.status !== 'active') return res.status(400).json({ error: 'Spiel nicht aktiv' });
    if (playerRow.eliminated) return res.status(400).json({ error: 'Bereits aufgegeben' });

    const slot = playerRow.slot;

    let state;
    try {
        const decoded = LZString.decompressFromEncodedURIComponent(playerRow.state_blob);
        state = JSON.parse(decoded);
    } catch (e) {
        return res.status(500).json({ error: 'Spielstand konnte nicht geladen werden' });
    }

    applyEliminationsToState(state, [slot]);

    const alivePlayers = state.p.filter(p => p.dead !== 1);
    const gameFinished = alivePlayers.length <= 1;

    let nextSlot = state.cp;
    let nextRound = state.rn;

    if (!gameFinished && state.cp === slot) {
        let guard = 0;
        do {
            nextSlot = (nextSlot + 1) % state.p.length;
            if (nextSlot === 0) nextRound++;
            guard++;
        } while (state.p[nextSlot].dead === 1 && guard < state.p.length);
        state.cp = nextSlot;
        state.rn = nextRound;
    }

    const newBlob = LZString.compressToEncodedURIComponent(JSON.stringify(state));
    const newStatus = gameFinished ? 'finished' : 'active';
    // Sole-survivor win only (this route doesn't detect team/Erschließungs-wins
    // triggered indirectly by an abandon) — mirrors alivePlayers.length === 1 above.
    const winnerSlots = gameFinished ? [state.p.indexOf(alivePlayers[0])] : null;

    await pool.query(
        `UPDATE games SET state_blob = $1, current_slot = $2, round = $3, status = $4, winner_slots = $5, updated_at = NOW() WHERE id = $6`,
        [newBlob, nextSlot, nextRound, newStatus, winnerSlots, req.params.id]
    );
    // left_game zählt im Rating als Niederlage gegen alle Mitspieler — bei
    // Async-Partien über Wochen wäre "aussteigen, um das Rating zu retten" sonst
    // die beste Strategie (siehe rankOf in rating.js).
    await pool.query(
        `UPDATE game_players SET eliminated = TRUE, left_game = TRUE,
                eliminated_round = COALESCE(eliminated_round, $3)
           WHERE game_id = $1 AND profile_id = $2`,
        [req.params.id, req.profileId, playerRow.round]
    );

    if (gameFinished) {
        try { await rateFinishedGame(req.params.id); }
        catch (e) { console.error('Rating fehlgeschlagen für Spiel', req.params.id, e); }
    }

    const abandoningName = state.p[slot].n;
    const url = `${process.env.APP_URL}?game=${req.params.id}`;

    pool.query(
        'SELECT profile_id FROM game_players WHERE game_id = $1 AND profile_id != $2',
        [req.params.id, req.profileId]
    ).then(({ rows: others }) => {
        for (const o of others) {
            const msg = gameFinished
                ? `${abandoningName} hat aufgegeben — Spiel beendet!`
                : `${abandoningName} hat "${playerRow.name}" aufgegeben!`;
            notifyPlayer(o.profile_id, 'Dark Ages', msg, url).catch(() => {});
        }
    }).catch(() => {});

    res.json({ ok: true, game_finished: gameFinished });
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
        'SELECT name, max_players, status, ranked FROM games WHERE id = $1 AND host_id = $2',
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

    // 'pending' statt sofort vollwertiger Mitspieler (Sept 2026): der
    // Eingeladene entscheidet selbst (POST :id/invite/respond). Bei einer
    // Ranked-Partie kann der Host erst starten, wenn alle zugesagt haben —
    // siehe die Prüfung in POST :id/start. Der Beitritt über den
    // Einladungslink bleibt 'accepted' (Default): wer den Link selbst
    // anklickt, hat damit bereits zugesagt.
    await pool.query(
        `INSERT INTO game_players (game_id, slot, profile_id, invite_status)
         VALUES ($1, $2, $3, 'pending')`,
        [req.params.id, next_slot, friend.id]
    );

    // Push notification to invited player (non-blocking)
    const url = `${process.env.APP_URL}?game=${req.params.id}`;
    const kind = game.ranked ? 'Ranked-Partie' : 'Partie';
    notifyPlayer(friend.id, 'Dark Ages', `Einladung zur ${kind} "${game.name}" — annehmen oder ablehnen?`, url).catch(() => {});

    res.json({ ok: true });
});

// Startet die Lobby von selbst, sobald der letzte Eingeladene zugesagt hat
// (Sept 2026, Jonathans Wunsch). Bedingungen bewusst eng:
//
//   · **voll** — solange ein Platz frei ist, will der Host womöglich noch
//     jemanden einladen; "alle da und alle einverstanden" ist das einzige
//     Signal, bei dem nichts mehr zu entscheiden bleibt.
//   · **keine offene Zusage mehr** — auch in einer normalen Partie, obwohl der
//     Host dort manuell jederzeit starten dürfte. Von selbst loszulaufen,
//     während noch jemand gefragt ist, wäre etwas anderes als das, was er
//     zugesagt bekommen hat.
//   · **nur aus dem Zusage-Pfad heraus** — ein Beitritt über den Einladungslink
//     löst das NICHT aus. Dort war der Start bisher die Sache des Hosts, und
//     das bleibt so; die Automatik antwortet nur auf die Frage, die sie selbst
//     gestellt hat.
//
// Der Anfangszustand entsteht dabei serverseitig (server/mapgen.js lädt den
// echten js/mapgen.js) — sonst könnte die Partie nur starten, während der Host
// die App offen hat, und genau das soll die Automatik ja ersparen.
// Fehler werden geschluckt und geloggt: die Zusage selbst ist zu diesem
// Zeitpunkt bereits committet und darf nicht daran scheitern, dass der
// Auto-Start nicht klappt — der Host kann dann von Hand starten.
async function tryAutoStart(gameId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [game] } = await client.query(
            `SELECT id, name, max_players, map_radius, team_mode
               FROM games WHERE id = $1 AND status = 'lobby' FOR UPDATE`,
            [gameId]
        );
        if (!game) { await client.query('ROLLBACK'); return null; }

        const { rows: [counts] } = await client.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE invite_status = 'pending')::int AS pending
               FROM game_players WHERE game_id = $1`,
            [gameId]
        );
        if (counts.pending > 0 || counts.total < game.max_players || counts.total < 2) {
            await client.query('ROLLBACK');
            return null;
        }

        // Namen in Slot-Reihenfolge — dieselbe Reihenfolge, in der auch
        // handleStartGame (js/lobby.js) den Zustand baut. Gemischt wird danach
        // ohnehin in finalizeStart.
        const { rows: names } = await client.query(
            `SELECT p.username FROM game_players gp JOIN profiles p ON p.id = gp.profile_id
              WHERE gp.game_id = $1 AND gp.profile_id IS NOT NULL ORDER BY gp.slot`,
            [gameId]
        );
        const { seed, blob } = buildStartState(names.map(n => n.username), game.map_radius, game.team_mode);

        const started = await finalizeStart(client, gameId, game.team_mode, seed, blob);
        if (!started.ok) {
            // Teamgröße passt nicht — kein Fehler, nur kein Auto-Start. Der
            // Host sieht den Grund an seinem Startknopf.
            await client.query('ROLLBACK');
            return null;
        }
        await client.query('COMMIT');
        return { game, seats: started.seats, firstProfileId: started.firstProfileId };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Auto-Start fehlgeschlagen', gameId, err);
        return null;
    } finally {
        client.release();
    }
}

// ── POST /api/games/:id/invite/respond  — eingeladener Spieler sagt zu/ab ────
// Gegenstück zu POST :id/invite. Zusagen setzt nur das Feld; ABLEHNEN löscht die
// Zeile und nummeriert die Slots neu — genau wie Kick und freiwilliges
// Verlassen. Einen Zustand 'declined' stehen zu lassen wäre teurer als er nützt:
// der Slot bliebe belegt (join/invite rechnen mit MAX(slot)+1), es bräuchte eine
// eigene Aufräumregel, und die Auskunft "hat abgelehnt" bekommt der Host über
// den Push ohnehin.
router.post('/:id/invite/respond', authMiddleware, async (req, res) => {
    const accept = req.body.accept === true;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [game] } = await client.query(
            `SELECT id, host_id, name, ranked FROM games WHERE id = $1 AND status = 'lobby' FOR UPDATE`,
            [req.params.id]
        );
        if (!game) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Spiel nicht in Lobby' });
        }

        // Der Host lehnt seine eigene Lobby nicht ab — das hinterließe eine
        // Lobby ohne Host (gleiche Begründung wie bei Kick und Leave); zum
        // Auflösen gibt es DELETE :id.
        if (game.host_id === req.profileId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Der Host kann die Lobby nicht verlassen — stattdessen löschen' });
        }

        const { rows: [me] } = await client.query(
            'SELECT invite_status FROM game_players WHERE game_id = $1 AND profile_id = $2',
            [req.params.id, req.profileId]
        );
        if (!me) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Nicht eingeladen' });
        }
        // Doppeltes Zusagen ist harmlos (zwei Geräte, doppelter Tap); ein
        // Ablehnen NACH dem Zusagen ist es auch — das ist dann schlicht ein
        // Verlassen der Lobby, wofür POST :id/leave dieselbe Wirkung hat.
        if (accept) {
            await client.query(
                `UPDATE game_players SET invite_status = 'accepted'
                  WHERE game_id = $1 AND profile_id = $2`,
                [req.params.id, req.profileId]
            );
            await client.query('COMMIT');

            // Der Host erfuhr bisher nur von Absagen — eine Zusage passierte
            // lautlos, er musste also selbst nachsehen, ob er starten kann.
            // Nur bei einer echten Zustandsänderung melden, sonst schickt ein
            // doppelter Tap auf zwei Geräten zwei Nachrichten.
            if (me.invite_status === 'pending') {
                const { rows: [who] } = await pool.query('SELECT username FROM profiles WHERE id = $1', [req.profileId]);
                const name = who ? who.username : 'Ein Spieler';
                const url = `${process.env.APP_URL}?game=${req.params.id}`;
                const started = await tryAutoStart(req.params.id);
                if (started) {
                    // Dieselbe Nachricht wie beim Hand-Start — hier hat nur
                    // niemand einen Knopf gedrückt.
                    notifyGameStarted(req.params.id, game.name, started.seats,
                        started.firstProfileId, req.profileId);
                } else {
                    notifyPlayer(game.host_id, 'Dark Ages',
                        `${name} hat die Einladung zu "${game.name}" angenommen.`, url).catch(() => {});
                }
                return res.json({ ok: true, accepted: true, started: !!started });
            }
            return res.json({ ok: true, accepted: true, started: false });
        }

        await client.query(
            'DELETE FROM game_players WHERE game_id = $1 AND profile_id = $2',
            [req.params.id, req.profileId]
        );
        await renumberLobbySlots(client, req.params.id);
        await client.query('COMMIT');

        const { rows: [who] } = await pool.query('SELECT username FROM profiles WHERE id = $1', [req.profileId]);
        notifyPlayer(game.host_id, 'Dark Ages',
            `${who ? who.username : 'Ein Spieler'} hat die Einladung zu "${game.name}" abgelehnt.`,
            process.env.APP_URL).catch(() => {});
        res.json({ ok: true, accepted: false });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Einladungs-Antwort fehlgeschlagen', req.params.id, err);
        res.status(500).json({ error: 'Antwort fehlgeschlagen' });
    } finally {
        client.release();
    }
});

module.exports = router;
