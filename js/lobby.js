// ── Lobby & Home ──────────────────────────────────────────────────────────────

let _lobbyPollTimer    = null;
let _currentLobbyGame  = null;

// ── Home Screen ───────────────────────────────────────────────────────────────

async function showHomeScreen() {
    _stopLobbyPoll();
    if (window.closeRecap) closeRecap();   // Rückblick-Panel liegt fixed über allem

    window.history.replaceState({}, '', window.location.pathname);
    document.getElementById('defeat-banner').style.display  = 'none';
    document.getElementById('login-screen').style.display   = 'none';
    document.getElementById('lobby-screen').style.display   = 'none';
    document.getElementById('friends-panel').style.display  = 'none';
    document.getElementById('profile-screen').style.display  = 'none';
    document.getElementById('gamemode-overlay').classList.remove('open');
    _pendingRanked = null;
    setupScreen.style.display                               = 'none';
    canvasWrapper.style.display                             = 'none'; document.body.classList.remove('in-game');
    uiContainer.style.display                               = 'none';
    gameHud.style.display                                   = 'none';
    intermissionScreen.style.display                        = 'none';
    winScreen.style.display                                 = 'none';
    closeGameMenu();
    document.getElementById('home-screen').style.display    = 'flex';
    // Vollhöhen-Layout ohne Seiten-Scroll (css/game.css, body.app-view)
    document.body.classList.add('app-view');
    document.getElementById('home-username').textContent    = currentProfile?.username ?? '';
    await refreshGameList();
    await refreshLeaderboardPanel();
}

async function refreshGameList() {
    const container = document.getElementById('game-list');
    container.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Lade...</p>';

    try {
        const rows = await api.get('/api/games');
        if (!rows.length) {
            container.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Noch keine Spiele. Erstelle oder tritt einem Spiel bei!</p>';
            return;
        }
        container.innerHTML = '';
        for (const row of rows) {
            const myTurn   = row.status === 'active' && row.current_slot === row.slot && !row.eliminated;
            const spectator = row.eliminated;
            // Offene Einladung (Sept 2026): der Host hat mich in seine Lobby
            // geschrieben, ich habe aber noch nicht zugesagt. Bei einer
            // Ranked-Partie kann er ohne meine Zusage nicht starten
            // (server/routes/games.js POST :id/start).
            const invited = row.status === 'lobby' && row.invite_status === 'pending';
            let badge = '';
            // Beendete Spiele bleiben in der Liste (server/routes/games.js liefert sie
            // jetzt mit) statt zu verschwinden, sobald das Spiel vorbei ist — sonst wäre
            // der Niederlage-Rückblick (defeatLog) für den Verlierer genau in dem Moment
            // unerreichbar, in dem er ihn am ehesten in Ruhe nachschauen will.
            if (row.status === 'finished') badge = '<span class="game-badge finished-badge">Beendet</span>';
            else if (invited)                 badge = `<span class="game-badge invite-badge">${icon('pact', 'ic-14')} Einladung</span>`;
            else if (row.status === 'lobby')  badge = '<span class="game-badge lobby-badge">Lobby</span>';
            else if (spectator)           badge = '<span class="game-badge spectator-badge">Zuschauer</span>';
            else if (myTurn)              badge = '<span class="game-badge turn-badge">Du bist dran!</span>';
            else                          badge = `<span class="game-badge wait-badge">Warte auf ${escHtml(row.current_player_username || '?')}...</span>`;

            // Der Papierkorb war bei Lobbys Host-only (slot 0) — ein
            // beigetretener oder eingeladener Spieler kam aus der Liste heraus
            // gar nicht mehr raus, sondern nur über "Lobby verlassen" zwei
            // Ebenen tiefer. Jetzt hat jeder seinen Ausstieg auf der Karte;
            // welcher es ist, entscheidet die Rolle: der Host löst die Lobby
            // auf, alle anderen verlassen sie (POST :id/leave).
            const lobbyAction = row.status !== 'lobby' ? row.status
                : (row.slot === 0 ? 'lobby' : 'lobby-leave');
            const deleteTitle = lobbyAction === 'lobby' ? 'Lobby löschen'
                : lobbyAction === 'lobby-leave' ? (invited ? 'Einladung ablehnen' : 'Lobby verlassen')
                : row.status === 'finished' ? 'Aus Liste entfernen' : 'Spiel aufgeben';
            const deleteBtn = `<button class="game-delete-btn" title="${deleteTitle}" onclick="event.stopPropagation();deleteGame('${escHtml(row.id)}','${lobbyAction}')">${icon('trash', 'ic-14')}</button>`;

            // Zusagen direkt auf der Karte — die Einladung anzunehmen ist der
            // mit Abstand häufigste Fall und soll keinen Umweg über den
            // Lobby-Screen brauchen. Ablehnen läuft bewusst über denselben
            // Papierkorb wie das Verlassen (eine Geste für "ich bin raus"),
            // hier steht deshalb nur der Haken.
            const acceptBtn = invited
                ? `<button class="game-accept-btn" title="Einladung annehmen" onclick="event.stopPropagation();respondToInvite('${escHtml(row.id)}', true)">${icon('check', 'ic-14')}</button>`
                : '';

            // Beide Modi als Tag sichtbar, nicht nur Ranked — sonst ist "kein Badge"
            // die einzige Kennzeichnung für Normal, und die geht in der Liste unter
            // (Jonathans Meldung: man erkennt den Modus laufender Spiele gar nicht).
            const rankedBadge = row.ranked
                ? `<span class="game-badge ranked-badge">${icon('crown', 'ic-14')} Ranked</span>`
                : `<span class="game-badge normal-badge">${icon('sword', 'ic-14')} Normal</span>`;

            const card = document.createElement('div');
            // Beendete Spiele optisch abgesetzt (gedimmt) von laufenden — sonst sieht
            // man den Unterschied zum "Beendet"-Badge erst beim genauen Hinsehen.
            card.className = 'game-card' + (myTurn ? ' game-card-active' : '')
                + (row.status === 'finished' ? ' game-card-finished' : '')
                + (invited ? ' game-card-invite' : '');
            // Beide Badges in einem Wrapper — sonst spreizt .game-card (space-between)
            // sie als eigene Flex-Kinder ungleichmäßig statt sie zusammenzuhalten.
            card.innerHTML = `<span class="game-card-name">${escHtml(row.name)}</span><span class="game-card-badges">${rankedBadge}${badge}</span>${acceptBtn}${deleteBtn}`;
            card.addEventListener('click', () => {
                if (row.status === 'lobby') openLobbyScreen(row.id);
                else openGame(row.id);
            });
            container.appendChild(card);
        }
    } catch (err) {
        container.innerHTML = `<p style="color:var(--red)">Fehler: ${escHtml(err.message)}</p>`;
    }
}

// ── Create Game ───────────────────────────────────────────────────────────────

// Modus-Wahl der aktuell laufenden "+ Neues Spiel"-Erstellung (js/lobby.js
// chooseGameMode → handleCreateGame). Nur zwischen den beiden Schritten gültig,
// kein persistenter State.
let _pendingRanked = null;

function showCreateGameModal() {
    // Fixed Vollbild-Overlay wie #surrender-overlay — body.app-view betrifft
    // nur .screen-box-Layouts und muss hier nicht angefasst werden.
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('gamemode-overlay').classList.add('open');
}

function closeGameModeOverlay() {
    document.getElementById('gamemode-overlay').classList.remove('open');
    showHomeScreen();
}

// Zweiter Schritt: Modus ist gewählt, jetzt der bestehende Setup-Screen
// (Kartengröße/Spieleranzahl/Teams). "← Zurück" dort führt eine Stufe zurück
// in dieses Overlay statt direkt nach Hause (js/lobby.js setup-back-btn).
function chooseGameMode(ranked) {
    _pendingRanked = ranked === true;
    document.getElementById('gamemode-overlay').classList.remove('open');
    document.body.classList.remove('app-view');

    const badge = document.getElementById('setup-mode-badge');
    badge.className = 'setup-mode-badge ' + (_pendingRanked ? 'is-ranked' : 'is-normal');
    badge.innerHTML = _pendingRanked
        ? `${icon('crown', 'ic-14')} Ranked`
        : `${icon('sword', 'ic-14')} Normal`;

    document.getElementById('player-names-container').style.display = 'none';
    document.getElementById('start-game-btn').style.display = 'none';
    document.getElementById('setup-back-btn').style.display = 'block';
    document.getElementById('create-game-confirm-btn').style.display = 'block';
    setupScreen.style.display = 'flex';
    updateTeamModeOptions();
}

// setup-back-btn (index.html onclick) — zurück zur Modus-Wahl, wenn diese
// gerade offen war (Server-Erstellung), sonst wie zuvor zum Hauptmenü (Legacy-
// Pfad zeigt den Setup-Screen ohne Modus-Wahl, siehe js/auth.js).
function handleSetupBack() {
    setupScreen.style.display = 'none';
    if (_pendingRanked !== null) {
        _pendingRanked = null;
        document.getElementById('gamemode-overlay').classList.add('open');
    } else {
        showHomeScreen();
    }
}

async function handleCreateGame() {
    const maxPlayers = parseInt(playerCountSelect.value);
    const mapRadius  = parseInt(mapSizeSelect.value);
    const teamMode   = teamModeSelect.value;
    const gameName   = document.getElementById('game-name').value.trim();
    const ranked     = _pendingRanked === true;

    const btn = document.getElementById('create-game-confirm-btn');
    btn.disabled = true; btn.textContent = 'Erstelle...';

    try {
        const game = await api.post('/api/games', { max_players: maxPlayers, map_radius: mapRadius, team_mode: teamMode, name: gameName, ranked });
        currentGameId = game.id;
        _pendingRanked = null;
        setupScreen.style.display = 'none';
        await openLobbyScreen(game.id);
    } catch (err) {
        showToast('Fehler: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Spiel erstellen';
    }
}

// ── Lobby Screen ──────────────────────────────────────────────────────────────

async function openLobbyScreen(gameId) {
    currentGameId = gameId;
    document.getElementById('home-screen').style.display = 'none'; document.body.classList.remove('app-view');
    setupScreen.style.display = 'none';

    try {
        const game = await api.get(`/api/games/${gameId}`);
        _currentLobbyGame = game;
        _renderLobbyScreen(game);
        document.getElementById('lobby-screen').style.display = 'flex';
        _startLobbyPoll();
    } catch (err) {
        showToast('Fehler: ' + err.message); showHomeScreen();
    }
}

const TEAM_MODE_LABELS = {
    ffa: 'Kein Bündnis (Jeder für sich)',
    diplomacy: 'Freie Diplomatie',
    teams2: 'Feste 2er-Teams',
    teams3: 'Feste 3er-Teams'
};

function _renderLobbyScreen(game) {
    document.getElementById('lobby-title').textContent = game.name;
    document.getElementById('lobby-team-mode').textContent = TEAM_MODE_LABELS[game.team_mode] || '';
    const rankedEl = document.getElementById('lobby-ranked-mode');
    rankedEl.className = 'lobby-ranked-badge ' + (game.ranked ? 'is-ranked' : 'is-normal');
    rankedEl.innerHTML = game.ranked ? `${icon('crown', 'ic-14')} Ranked` : `${icon('sword', 'ic-14')} Normal`;
    const isHost = game.host_id === currentProfile.id;
    const players = game.players || [];

    const playerList = document.getElementById('lobby-player-list');
    playerList.innerHTML = '';
    for (let i = 0; i < game.max_players; i++) {
        const p = players.find(pl => pl.slot === i);
        const div = document.createElement('div');
        div.className = 'player-slot' + (p ? '' : ' player-slot-empty');
        if (p) {
            const isPlayerHost = p.profile_id === game.host_id;
            const nameSpan = document.createElement('span');
            // "(eingeladen)" statt stiller Gleichbehandlung: für den Host ist es
            // die entscheidende Auskunft, warum sein Startknopf gesperrt ist —
            // ohne die Marke stünde ein Eingeladener in der Liste wie ein
            // zugesagter Mitspieler.
            const pendingMark = p.invite_status === 'pending' ? ' (eingeladen)' : '';
            nameSpan.textContent = `${i + 1}. ${p.username}${isPlayerHost ? ' (Host)' : ''}${pendingMark}`;
            if (pendingMark) nameSpan.style.color = 'var(--text-dim)';
            div.appendChild(nameSpan);
            // Host kann jeden anderen Spieler rauswerfen (Jonathans Meldung: bisher
            // gar keine Möglichkeit, jemanden aus der eigenen Lobby zu entfernen).
            if (isHost && !isPlayerHost) {
                const kickBtn = document.createElement('button');
                kickBtn.className = 'player-slot-kick-btn';
                kickBtn.title = `${p.username} rauswerfen`;
                kickBtn.innerHTML = icon('trash', 'ic-14');
                kickBtn.onclick = () => handleKickPlayer(p.profile_id, p.username);
                div.appendChild(kickBtn);
            }
        } else {
            div.textContent = `${i + 1}. Warte auf Spieler...`;
        }
        playerList.appendChild(div);
    }

    const link = `${window.location.origin}${window.location.pathname}?lobby=${game.invite_token}`;
    document.getElementById('lobby-invite-link').value = link;
    document.getElementById('lobby-player-count').textContent = `${players.length} / ${game.max_players}`;

    const startBtn      = document.getElementById('lobby-start-btn');
    const inviteSection = document.getElementById('lobby-friend-invite');
    const leaveBtn      = document.getElementById('lobby-leave-btn');
    const inviteActions = document.getElementById('lobby-invite-actions');
    // Offene Einladungen: in einer Ranked-Partie sperren sie den Start
    // (server/routes/games.js POST :id/start), in einer normalen gelten sie mit
    // dem Start als angenommen. Der Knopf sagt beides an, statt den Host in
    // einen 409 laufen zu lassen.
    const pending = players.filter(p => p.invite_status === 'pending');
    const iAmPending = game.my_invite_status === 'pending';
    if (isHost) {
        startBtn.style.display = 'block';
        const tooFew = players.length < 2;
        const blocked = game.ranked && pending.length > 0;
        // Feste Teams: die Spielerzahl muss aufgehen, sonst startet die Partie
        // als Jeder-gegen-jeden statt als Team-Spiel (js/mapgen.js überspringt
        // die Zuweisung dann still). Der Server weist das ab — der Knopf sagt
        // es vorher, statt den Host in einen 409 laufen zu lassen.
        const teamSize = game.team_mode === 'teams2' ? 2 : game.team_mode === 'teams3' ? 3 : 0;
        const teamMismatch = teamSize > 0 && (players.length % teamSize !== 0 || players.length / teamSize < 2);
        startBtn.disabled = tooFew || blocked || teamMismatch;
        startBtn.textContent = tooFew ? 'Mindestens 2 Spieler nötig'
            : teamMismatch ? `${teamSize}er-Teams: Spielerzahl passt nicht`
            : blocked ? `Warte auf ${pending.length} Zusage${pending.length === 1 ? '' : 'n'}`
            : 'Spiel starten';
        inviteSection.style.display = 'flex';
        leaveBtn.style.display = 'none';
        inviteActions.style.display = 'none';
    } else {
        startBtn.style.display = 'none';
        inviteSection.style.display = 'none';
        // Beigetretene Spieler konnten die Lobby bisher gar nicht wieder
        // verlassen (Jonathans Meldung: "← Zurück" navigiert nur weg, der
        // game_players-Eintrag blieb bestehen) — mussten also zwangsläufig
        // mitspielen, sobald der Host startete.
        leaveBtn.style.display = iAmPending ? 'none' : 'block';
        inviteActions.style.display = iAmPending ? 'flex' : 'none';
        if (iAmPending) {
            document.getElementById('lobby-invite-hint').textContent = game.ranked
                ? 'Du wurdest zu einer gewerteten Partie eingeladen. Ohne deine Zusage kann der Host nicht starten — ein späteres Aufgeben würde als Niederlage in dein Rating zählen.'
                : 'Du wurdest zu dieser Partie eingeladen.';
        }
    }
}

function _startLobbyPoll() {
    _stopLobbyPoll();
    _lobbyPollTimer = setInterval(async () => {
        if (!currentGameId || document.getElementById('lobby-screen').style.display === 'none') {
            _stopLobbyPoll(); return;
        }
        try {
            const game = await api.get(`/api/games/${currentGameId}`);
            if (game.status === 'active') {
                _stopLobbyPoll();
                document.getElementById('lobby-screen').style.display = 'none';
                await openGame(currentGameId);
                return;
            }
            _renderLobbyScreen(game);
        } catch (err) {
            // Rausgeworfen (403) oder Lobby vom Host gelöscht (404) — ohne diesen
            // Fall würde der Poll bei einem echten Kick einfach weiter ins Leere
            // laufen und der betroffene Spieler bliebe tatenlos auf dem Lobby-
            // Screen hängen. Andere Fehler (Netzwerk-Hänger etc.) sollen den
            // nächsten Poll-Tick einfach erneut versuchen, statt fälschlich
            // "rausgeworfen" zu melden.
            if (err.status === 403 || err.status === 404) {
                _stopLobbyPoll();
                showToast('Du wurdest aus der Lobby entfernt.');
                showHomeScreen();
            }
        }
    }, 5000);
}

function _stopLobbyPoll() {
    if (_lobbyPollTimer) { clearInterval(_lobbyPollTimer); _lobbyPollTimer = null; }
}

async function copyInviteLink() {
    const link = document.getElementById('lobby-invite-link').value;
    try { await navigator.clipboard.writeText(link); showToast('Link kopiert!'); }
    catch (_) { showToast('Link: ' + link); }
}

// ── Friend Picker ─────────────────────────────────────────────────────────────

let _selectedFriendsForInvite = new Set();

async function openFriendsPicker() {
    _selectedFriendsForInvite.clear();
    const list = document.getElementById('friend-picker-list');
    list.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Lade...</p>';
    document.getElementById('friend-picker-overlay').style.display = 'flex';

    try {
        const rows = await api.get('/api/friends');
        const accepted = rows.filter(r => r.status === 'accepted');

        if (!accepted.length) {
            list.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Noch keine Freunde. Füge zuerst Freunde über den Home-Screen hinzu.</p>';
            return;
        }

        list.innerHTML = '';
        for (const r of accepted) {
            const isMine   = r.requester_id === currentProfile.id;
            const username = isMine ? r.addressee_username : r.requester_username;

            const row = document.createElement('div');
            row.className = 'friend-picker-row';
            row.innerHTML = `<span>${escHtml(username)}</span><div class="picker-check"></div>`;
            row.addEventListener('click', () => {
                if (_selectedFriendsForInvite.has(username)) {
                    _selectedFriendsForInvite.delete(username);
                    row.classList.remove('selected');
                } else {
                    _selectedFriendsForInvite.add(username);
                    row.classList.add('selected');
                }
            });
            list.appendChild(row);
        }
    } catch (err) {
        list.innerHTML = `<p style="color:var(--red);font-size:0.85rem;">Fehler: ${escHtml(err.message)}</p>`;
    }
}

function closeFriendsPicker() {
    document.getElementById('friend-picker-overlay').style.display = 'none';
    _selectedFriendsForInvite.clear();
}

async function inviteSelectedFriends() {
    if (_selectedFriendsForInvite.size === 0) { showToast('Niemanden ausgewählt.'); return; }

    const btn = document.getElementById('friend-picker-invite-btn');
    btn.disabled = true; btn.textContent = 'Sende...';

    let ok = 0;
    for (const username of _selectedFriendsForInvite) {
        try {
            await api.post(`/api/games/${currentGameId}/invite`, { username });
            ok++;
        } catch (err) {
            showToast(`${username}: ${err.message}`);
        }
    }

    btn.disabled = false; btn.textContent = 'Einladen';

    if (ok > 0) {
        showToast(`${ok} Spieler eingeladen!`);
        closeFriendsPicker();
        const game = await api.get(`/api/games/${currentGameId}`);
        _renderLobbyScreen(game);
    }
}

async function handleStartGame() {
    const btn = document.getElementById('lobby-start-btn');
    btn.disabled = true; btn.textContent = 'Starte...';

    try {
        const game    = await api.get(`/api/games/${currentGameId}`);
        const names   = game.players.map(p => p.username);
        const initial = buildInitialGameState(names, game.map_radius, game.team_mode);
        const blob    = LZString.compressToEncodedURIComponent(JSON.stringify(initial));

        await api.post(`/api/games/${currentGameId}/start`, { seed: initial.sd, state_blob: blob });

        _stopLobbyPoll();
        document.getElementById('lobby-screen').style.display = 'none';
        await openGame(currentGameId);
    } catch (err) {
        showToast('Fehler: ' + err.message);
        btn.disabled = false; btn.textContent = 'Spiel starten';
    }
}

async function handleKickPlayer(profileId, username) {
    if (!confirm(`${username} aus der Lobby werfen?`)) return;
    try {
        await api.post(`/api/games/${currentGameId}/kick`, { profile_id: profileId });
        const game = await api.get(`/api/games/${currentGameId}`);
        _renderLobbyScreen(game);
    } catch (err) {
        showToast('Fehler: ' + err.message);
    }
}

// Zusage/Absage auf eine Host-Einladung (server/routes/games.js
// POST :id/invite/respond). `fromLobby` unterscheidet nur, wohin es danach
// geht: von der Spielliste aus bleibt man dort, aus dem Lobby-Screen heraus
// führt eine Absage nach Hause und eine Zusage zurück in die aktualisierte
// Lobby.
async function respondToInvite(gameId, accept, fromLobby) {
    if (!accept && !confirm('Einladung ablehnen?')) return;
    try {
        await api.post(`/api/games/${gameId}/invite/respond`, { accept: !!accept });
        showToast(accept ? 'Einladung angenommen — warte auf den Start.' : 'Einladung abgelehnt.');
        if (fromLobby) {
            if (accept) await openLobbyScreen(gameId);
            else { _stopLobbyPoll(); showHomeScreen(); }
        } else {
            await refreshGameList();
        }
    } catch (err) {
        showToast('Fehler: ' + err.message);
    }
}

async function handleLeaveLobby() {
    if (!confirm('Diese Lobby verlassen?')) return;
    try {
        await api.post(`/api/games/${currentGameId}/leave`, {});
        _stopLobbyPoll();
        showHomeScreen();
    } catch (err) {
        showToast('Fehler: ' + err.message);
    }
}

// ── Open / Load Game ──────────────────────────────────────────────────────────

async function openGame(gameId) {
    currentGameId = gameId;
    try {
        const game = await api.get(`/api/games/${gameId}`);

        if (!game.state_blob) { showToast('Spiel hat noch keinen Spielstand.'); showHomeScreen(); return; }

        // Server-Wahrheit, nicht der Blob (der ist clientseitig manipulierbar) —
        // sperrt Undo für die gesamte Spielsitzung (js/ui.js saveUndoState/undoLastAction).
        isRankedGame = game.ranked === true;
        updateUndoButton();
        // Immer sichtbar, nicht nur im Ranked-Fall — sonst gibt es während des
        // Spielens gar keine Stelle, an der der Modus überhaupt steht (der Knopf
        // war vorher komplett ausgeblendet statt "Normal" zu zeigen).
        const rankedMarker = document.getElementById('menu-ranked-marker');
        if (rankedMarker) {
            rankedMarker.style.display = 'flex';
            rankedMarker.classList.toggle('is-normal', !isRankedGame);
            rankedMarker.innerHTML = isRankedGame
                ? `${icon('crown', 'ic-14')} Ranked`
                : `${icon('sword', 'ic-14')} Normal`;
        }

        currentUserSlot = game.my_slot;
        currentTurnSlot = game.current_slot;
        isSpectator     = game.my_eliminated === true;
        const isFinished = game.status === 'finished';

        let decoded = null;
        try { decoded = LZString.decompressFromEncodedURIComponent(game.state_blob); } catch (_) {}
        if (!decoded) { showToast('Fehler beim Laden.'); showHomeScreen(); return; }
        gameState = JSON.parse(decoded);

        // Waiting players see their OWN fog of war, not the active player's view
        if (!isSpectator && currentTurnSlot !== currentUserSlot) {
            gameState.cp = currentUserSlot;
        }

        window.history.replaceState({}, '', `?game=${gameId}`);
        document.getElementById('home-screen').style.display = 'none'; document.body.classList.remove('app-view');
        bootGame();

        // Beendete Partie: bootGame hat bereits den Sieg-/Niederlage-Screen
        // aufgelegt, und DER trägt seit Sept 2026 den Rückblick-Knopf. Das
        // rote Banner wäre hier eine zweite, halb verdeckte Ansage derselben
        // Sache (es liegt mit z-index 150 unter dem Screen) — es bleibt dem
        // Fall vorbehalten, für den es gedacht war: ausgeschieden, während die
        // Partie ohne einen weiterläuft. Der frühere isNonWinningEnd-Zweig
        // (Erschließungs-/Team-Sieg-Verlierer, nie "eliminated") ist damit
        // abgedeckt — der Endscreen fragt selbst, ob man unter den Siegern war.
        if (isFinished) {
            _setReadOnly(true, true);
            if (isSpectator) _activateSpectatorMode(true);
        } else if (isSpectator) {
            _activateSpectatorMode();
            document.getElementById('defeat-banner-title').textContent = 'Du wurdest besiegt';
            document.getElementById('defeat-banner-sub').textContent = 'Der Rückblick-Knopf oben zeigt, wie es dazu kam. Danach kannst du zurückgehen.';
            document.getElementById('defeat-banner').style.display = 'flex';
        } else if (currentTurnSlot !== currentUserSlot) {
            _setReadOnly(true);
        } else {
            _setReadOnly(false);
        }
    } catch (err) {
        showToast('Fehler: ' + err.message); showHomeScreen();
    }
}

// `quiet`: bei einer beendeten Partie liegt der Endscreen darüber — ein Toast
// und eine Kamerafahrt hinter einem Vollbild-Screen sind nur Lärm. Die
// Vollsicht selbst wird trotzdem gesetzt, damit die Endstellung vollständig
// dasteht, sobald man den Screen für den Rückblick beiseiteräumt.
function _activateSpectatorMode(quiet) {
    if (gameState?.p?.[gameState.cp]) {
        const all = [];
        for (let y = 0; y < gameState.bh; y++)
            for (let x = 0; x < gameState.bw; x++)
                all.push(y * gameState.bw + x);
        gameState.p[gameState.cp].e = all;
    }
    _setReadOnly(true, quiet);
    if (quiet) return;
    renderBoard(gameState);
    showToast('Zuschauer-Modus – komplette Karte sichtbar');
}

function _setReadOnly(readonly, quiet) {
    endTurnBtn.disabled = readonly;
    const sb = document.getElementById('menu-surrender-item');
    if (sb) sb.style.display = readonly ? 'none' : '';
    if (readonly && !isSpectator && !quiet) {
        const actualPlayer = (currentTurnSlot !== null && currentTurnSlot !== undefined) ? gameState?.p?.[currentTurnSlot] : null;
        showToast(actualPlayer ? `Warte auf ${actualPlayer.n}s Zug...` : 'Warte auf deinen Zug...');
    }
}

// ── Join Lobby by Token ───────────────────────────────────────────────────────

async function joinLobbyByToken(token) {
    try {
        const { game_id } = await api.post(`/api/games/lobby/${token}/join`);
        currentGameId = game_id;
        const game = await api.get(`/api/games/${game_id}`);
        window.history.replaceState({}, '', window.location.pathname);
        if (game.status === 'active') await openGame(game_id);
        else await openLobbyScreen(game_id);
    } catch (err) {
        showToast(err.message); showHomeScreen();
    }
}

// ── Friends ───────────────────────────────────────────────────────────────────

async function showFriendsPanel() {
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('friends-panel').style.display = 'flex';
    // Auch der Freunde-Screen füllt die Höhe und scrollt nicht selbst —
    // scrollen darf nur die Freundesliste darin (css/game.css, .app-view).
    document.body.classList.add('app-view');
    await refreshFriendsPanel();
}

// ── Profil ────────────────────────────────────────────────────────────────────
//
// Bewusst nur eine Anzeige des Bestehenden: Rating, Unsicherheit (RD), Rang,
// Bilanz und Rating-Verlauf kommen aus /api/leaderboard und
// /api/leaderboard/me/history — beide gab es schon, der Server wurde für diesen
// Screen nicht angefasst. Erfolge/Skins brauchen erst eine Serverseite.
async function showProfileScreen() {
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('profile-screen').style.display = 'flex';
    document.body.classList.add('app-view');

    const nameEl = document.getElementById('profile-name');
    const statusEl = document.getElementById('profile-status');
    const statsEl = document.getElementById('profile-stats');
    const histEl = document.getElementById('profile-history');

    nameEl.textContent = currentProfile?.username ?? '—';
    statusEl.textContent = '';
    statsEl.innerHTML = '';
    histEl.innerHTML = '<p class="profile-empty">Lade...</p>';

    const [rows, history] = await Promise.all([
        api.get('/api/leaderboard').catch(() => []),
        api.get('/api/leaderboard/me/history').catch(() => []),
    ]);

    const me = rows.find(r => r.id === currentProfile?.id);
    const stat = (value, label, cls) =>
        `<div class="profile-stat"><span class="profile-stat-value ${cls || ''}">${value}</span>` +
        `<span class="profile-stat-label">${label}</span></div>`;

    if (me) {
        // Rang zählt nur unter den etablierten Spielern — für vorläufige gibt
        // der Server bewusst keinen aus (zu wenige gewertete Partien).
        const rank = me.established
            ? rows.filter(r => r.established).findIndex(r => r.id === me.id) + 1
            : null;
        statusEl.textContent = me.established
            ? `Rang ${rank} von ${rows.filter(r => r.established).length}`
            : `Vorläufig — noch ${Math.max(0, 5 - me.games_rated)} gewertete Partien bis zum Rang`;

        statsEl.innerHTML =
            stat(me.rating, 'Rating', 'is-gold') +
            stat('±' + me.rd, 'Unsicherheit') +
            stat(`${me.wins}/${me.games}`, 'Siege') +
            stat(me.games_rated, 'gewertet');
    } else {
        statusEl.textContent = 'Noch keine gewerteten Partien';
    }

    if (!history.length) {
        histEl.innerHTML = '<p class="profile-empty">Noch keine gewerteten Partien. '
            + 'Der Verlauf beginnt mit der ersten beendeten Partie.</p>';
        return;
    }

    histEl.innerHTML = history.map(h => {
        const up = h.delta > 0;
        const sign = up ? '+' : (h.delta < 0 ? '−' : '±');
        const date = new Date(h.created_at).toLocaleDateString('de-DE',
            { day: '2-digit', month: '2-digit', year: '2-digit' });
        const opp = h.opponents === 1 ? '1 Gegner' : `${h.opponents} Gegner`;
        return `<div class="hist-row">
            <span class="hist-mark ${h.won ? 'is-win' : 'is-loss'}">${h.won ? 'S' : 'N'}</span>
            <span class="hist-body">
                <span class="hist-name">${escHtml(h.game_name || 'Gelöschte Partie')}</span>
                <span class="hist-meta">${date} · ${opp}</span>
            </span>
            <span class="hist-delta ${up ? 'is-up' : (h.delta < 0 ? 'is-down' : '')}">${sign}${Math.abs(h.delta)}</span>
            <span class="hist-rating">${h.rating_after}</span>
        </div>`;
    }).join('');
}

function hideFriendsPanel() {
    document.getElementById('friends-panel').style.display = 'none';
    showHomeScreen();
}

async function refreshFriendsPanel() {
    const rows = await api.get('/api/friends').catch(() => []);
    const reqList    = document.getElementById('friend-requests-list');
    const friendList = document.getElementById('friends-list');
    reqList.innerHTML = ''; friendList.innerHTML = '';

    for (const r of rows) {
        const isMine    = r.requester_id === currentProfile.id;
        const otherName = isMine ? r.addressee_username : r.requester_username;

        if (r.status === 'pending' && !isMine) {
            const div = document.createElement('div');
            div.className = 'friend-row';
            div.innerHTML = `<span>${escHtml(otherName)} möchte Freund sein</span>
                <button class="action-btn" onclick="acceptFriendRequest('${r.requester_id}')">Annehmen</button>`;
            reqList.appendChild(div);
        } else if (r.status === 'accepted') {
            const otherId = isMine ? r.addressee_id : r.requester_id;
            const div = document.createElement('div');
            div.className = 'friend-row';
            div.innerHTML = `<span>${escHtml(otherName)}</span>
                <button class="game-delete-btn" title="Freund entfernen" onclick="removeFriend('${otherId}','${escHtml(otherName)}')">${icon('trash', 'ic-14')}</button>`;
            friendList.appendChild(div);
        }
    }
    if (!friendList.children.length)
        friendList.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Noch keine Freunde.</p>';
}

async function handleAddFriend() {
    const username = document.getElementById('friend-search-input').value.trim();
    if (!username) return;
    try {
        const result = await api.post('/api/friends/request', { username });
        showToast(result.accepted ? `Du bist jetzt mit ${username} befreundet!` : `Anfrage an ${username} gesendet!`);
        document.getElementById('friend-search-input').value = '';
        await refreshFriendsPanel();
    } catch (err) { showToast(err.message); }
}

async function acceptFriendRequest(requesterId) {
    await api.post(`/api/friends/accept/${requesterId}`).catch(() => {});
    await refreshFriendsPanel();
}

async function removeFriend(otherId, otherName) {
    if (!confirm(`${otherName} aus der Freundesliste entfernen?`)) return;
    try {
        await api.del(`/api/friends/${otherId}`);
        await refreshFriendsPanel();
    } catch (err) { showToast(err.message); }
}

// ── Leaderboard (inline auf dem Home-Screen) ─────────────────────────────────

async function refreshLeaderboardPanel() {
    const [rows, friends] = await Promise.all([
        api.get('/api/leaderboard').catch(() => []),
        api.get('/api/friends').catch(() => [])
    ]);

    // Profil-ID → 'accepted' | 'pending' (egal wer angefragt hat), damit für
    // bestehende Freunde bzw. offene Anfragen kein "+ Freund" mehr erscheint.
    const relation = new Map();
    for (const f of friends) {
        const otherId = f.requester_id === currentProfile?.id ? f.addressee_id : f.requester_id;
        relation.set(otherId, f.status);
    }

    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    // Nur etablierte Spieler bekommen eine Platzziffer — bei vorläufigen ist das
    // Rating noch zu unsicher für einen echten Rang. Der Server liefert sie
    // bereits ans Ende sortiert.
    let rank = 0;

    rows.forEach(row => {
        const isMe = row.id === currentProfile?.id;
        const rel  = relation.get(row.id);

        let action = '';
        if (isMe)                     action = '';
        else if (rel === 'accepted')  action = '<span class="lb-tag">✓ Freund</span>';
        else if (rel === 'pending')   action = '<span class="lb-tag">Angefragt</span>';
        else action = `<button class="action-btn" onclick="addFriendFromLeaderboard('${escHtml(row.username)}')">+ Freund</button>`;

        const rankLabel = row.established ? `#${++rank}` : '–';
        const ratingTitle = row.established
            ? `Rating ±${row.rd} · ${row.games_rated} gewertete Partien`
            : `Vorläufig — zählt ab 5 gewerteten Partien (aktuell ${row.games_rated})`;

        const div = document.createElement('div');
        div.className = 'friend-row' + (row.established ? '' : ' lb-provisional');
        // Name eigener Span → nur er kürzt mit Ellipse, Rating/Bilanz bleiben sichtbar.
        div.innerHTML = `<span class="lb-rank">${rankLabel}</span>
            <span class="lb-name">${escHtml(row.username)}${isMe ? ' (Du)' : ''}</span>
            <span class="lb-rating" title="${escHtml(ratingTitle)}">${row.rating}</span>
            <span class="lb-wins" title="Siege / beendete Partien insgesamt">${row.wins}/${row.games}</span>
            ${action}`;
        list.appendChild(div);
    });
    if (!list.children.length)
        list.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Noch keine Spieler.</p>';

    // Kopfleiste des Home-Screens: eigener Rang + Rating. Die Zeile steht schon
    // in der Liste — hier wird sie nur nach oben gespiegelt, damit man den
    // eigenen Stand sieht, ohne die Bestenliste durchzuscrollen.
    const me = rows.find(r => r.id === currentProfile?.id);
    const nameEl = document.getElementById('home-banner-name');
    const subEl = document.getElementById('home-banner-sub');
    const ratingBox = document.getElementById('home-banner-rating');
    const ratingVal = document.getElementById('home-banner-rating-value');

    if (nameEl) nameEl.textContent = currentProfile?.username || '—';
    if (subEl) {
        if (me && me.established) {
            const myRank = rows.filter(r => r.established).findIndex(r => r.id === me.id) + 1;
            subEl.textContent = `Rang ${myRank} · ${me.wins}/${me.games} Siege`;
        } else if (me) {
            // Vorläufig = noch zu wenige gewertete Partien für einen echten Rang
            subEl.textContent = `Vorläufig · ${me.wins}/${me.games} Siege`;
        } else {
            subEl.textContent = '';
        }
    }
    if (ratingBox && ratingVal) {
        if (me) {
            ratingVal.textContent = me.rating;
            ratingBox.style.display = 'flex';
        } else {
            ratingBox.style.display = 'none';
        }
    }
}

async function addFriendFromLeaderboard(username) {
    try {
        const result = await api.post('/api/friends/request', { username });
        showToast(result.accepted ? `Du bist jetzt mit ${username} befreundet!` : `Anfrage an ${username} gesendet!`);
        await refreshLeaderboardPanel();
    } catch (err) { showToast(err.message); }
}

// ── Server Intermission ───────────────────────────────────────────────────────

function showServerIntermission(nextPlayerName) {
    canvasWrapper.style.display = 'none'; document.body.classList.remove('in-game');
    uiContainer.style.display = 'none';
    gameHud.style.display = 'none';
    document.getElementById('intermission-msg').textContent = `Zug abgeschickt! ${nextPlayerName} ist dran.`;
    document.getElementById('link-box').style.display = 'none';
    document.getElementById('wa-share-btn').style.display = 'none';
    document.getElementById('intermission-back-btn').style.display = 'block';
    intermissionScreen.style.display = 'flex';
}

// ── Delete Game ───────────────────────────────────────────────────────────────

async function deleteGame(gameId, status) {
    if (status === 'active') {
        if (!confirm('Spiel aufgeben? Du wirst als aufgegeben markiert und das Spiel läuft ohne dich weiter.')) return;
        try {
            await api.post(`/api/games/${gameId}/abandon`, {});
            await refreshGameList();
        } catch (err) {
            showToast('Fehler: ' + err.message);
        }
    } else if (status === 'finished') {
        // Rein kosmetisch (server/routes/games.js POST :id/hide, list_hidden) —
        // betrifft nur die eigene Liste, keine Auswirkung auf Wertung/Leaderboard
        // und andere Spieler sehen das Spiel unverändert weiter.
        if (!confirm('Spiel aus deiner Liste entfernen? Andere Spieler sehen es weiterhin.')) return;
        try {
            await api.post(`/api/games/${gameId}/hide`, {});
            await refreshGameList();
        } catch (err) {
            showToast('Fehler: ' + err.message);
        }
    } else if (status === 'lobby-leave') {
        // Nicht-Host in einer Lobby: die eigene Zeile verschwindet, die Lobby
        // bleibt. Deckt zwei Fälle mit einer Geste ab — eine offene Einladung
        // ablehnen und eine bereits angenommene Lobby wieder verlassen.
        if (!confirm('Diese Lobby verlassen? Eine offene Einladung gilt damit als abgelehnt.')) return;
        try {
            await api.post(`/api/games/${gameId}/invite/respond`, { accept: false });
            await refreshGameList();
        } catch (err) {
            showToast('Fehler: ' + err.message);
        }
    } else {
        if (!confirm('Lobby wirklich löschen?')) return;
        try {
            await api.del(`/api/games/${gameId}`);
            await refreshGameList();
        } catch (err) {
            showToast('Fehler: ' + err.message);
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.showHomeScreen        = showHomeScreen;
window.deleteGame            = deleteGame;
window.showCreateGameModal   = showCreateGameModal;
window.closeGameModeOverlay  = closeGameModeOverlay;
window.chooseGameMode        = chooseGameMode;
window.handleSetupBack       = handleSetupBack;
window.handleCreateGame      = handleCreateGame;
window.copyInviteLink        = copyInviteLink;
window.openFriendsPicker     = openFriendsPicker;
window.closeFriendsPicker    = closeFriendsPicker;
window.inviteSelectedFriends = inviteSelectedFriends;
window.handleStartGame       = handleStartGame;
window.showProfileScreen     = showProfileScreen;
window.showFriendsPanel      = showFriendsPanel;
window.hideFriendsPanel      = hideFriendsPanel;
window.handleAddFriend       = handleAddFriend;
window.acceptFriendRequest   = acceptFriendRequest;
