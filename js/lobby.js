// ── Lobby & Home ──────────────────────────────────────────────────────────────

let _lobbyPollTimer    = null;
let _currentLobbyGame  = null;

// ── Home Screen ───────────────────────────────────────────────────────────────

async function showHomeScreen() {
    _stopLobbyPoll();
    window.history.replaceState({}, '', window.location.pathname);
    document.getElementById('defeat-banner').style.display  = 'none';
    document.getElementById('login-screen').style.display   = 'none';
    document.getElementById('lobby-screen').style.display   = 'none';
    document.getElementById('friends-panel').style.display  = 'none';
    setupScreen.style.display                               = 'none';
    canvasWrapper.style.display                             = 'none';
    uiContainer.style.display                               = 'none';
    gameHud.style.display                                   = 'none';
    intermissionScreen.style.display                        = 'none';
    winScreen.style.display                                 = 'none';
    closeGameMenu();
    document.getElementById('home-screen').style.display    = 'flex';
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
            let badge = '';
            if (row.status === 'lobby')  badge = '<span class="game-badge lobby-badge">Lobby</span>';
            else if (spectator)           badge = '<span class="game-badge spectator-badge">Zuschauer</span>';
            else if (myTurn)              badge = '<span class="game-badge turn-badge">Du bist dran!</span>';
            else                          badge = `<span class="game-badge wait-badge">Warte auf ${escHtml(row.current_player_username || '?')}...</span>`;

            const canDelete = row.status === 'lobby' ? row.slot === 0 : row.status === 'active';
            const deleteTitle = row.status === 'lobby' ? 'Lobby löschen' : 'Spiel aufgeben';
            const deleteBtn = canDelete
                ? `<button class="game-delete-btn" title="${deleteTitle}" onclick="event.stopPropagation();deleteGame('${escHtml(row.id)}','${escHtml(row.status)}')">🗑️</button>`
                : '';

            const card = document.createElement('div');
            card.className = 'game-card' + (myTurn ? ' game-card-active' : '');
            card.innerHTML = `<span class="game-card-name">${escHtml(row.name)}</span>${badge}${deleteBtn}`;
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

function showCreateGameModal() {
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('player-names-container').style.display = 'none';
    document.getElementById('start-game-btn').style.display = 'none';
    document.getElementById('setup-back-btn').style.display = 'block';
    document.getElementById('create-game-confirm-btn').style.display = 'block';
    setupScreen.style.display = 'flex';
    updateTeamModeOptions();
}

async function handleCreateGame() {
    const maxPlayers = parseInt(playerCountSelect.value);
    const mapRadius  = parseInt(mapSizeSelect.value);
    const teamMode   = teamModeSelect.value;
    const gameName   = document.getElementById('game-name').value.trim();

    const btn = document.getElementById('create-game-confirm-btn');
    btn.disabled = true; btn.textContent = 'Erstelle...';

    try {
        const game = await api.post('/api/games', { max_players: maxPlayers, map_radius: mapRadius, team_mode: teamMode, name: gameName });
        currentGameId = game.id;
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
    document.getElementById('home-screen').style.display = 'none';
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
    const isHost = game.host_id === currentProfile.id;
    const players = game.players || [];

    const playerList = document.getElementById('lobby-player-list');
    playerList.innerHTML = '';
    for (let i = 0; i < game.max_players; i++) {
        const p = players.find(pl => pl.slot === i);
        const div = document.createElement('div');
        div.className = 'player-slot' + (p ? '' : ' player-slot-empty');
        div.textContent = p
            ? `${i + 1}. ${p.username}${i === 0 ? ' (Host)' : ''}`
            : `${i + 1}. Warte auf Spieler...`;
        playerList.appendChild(div);
    }

    const link = `${window.location.origin}${window.location.pathname}?lobby=${game.invite_token}`;
    document.getElementById('lobby-invite-link').value = link;
    document.getElementById('lobby-player-count').textContent = `${players.length} / ${game.max_players}`;

    const startBtn     = document.getElementById('lobby-start-btn');
    const inviteSection = document.getElementById('lobby-friend-invite');
    if (isHost) {
        startBtn.style.display = 'block';
        startBtn.disabled      = players.length < 2;
        startBtn.textContent   = players.length < 2 ? 'Mindestens 2 Spieler nötig' : 'Spiel starten';
        inviteSection.style.display = 'flex';
    } else {
        startBtn.style.display = 'none';
        inviteSection.style.display = 'none';
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
        } catch (_) {}
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

// ── Open / Load Game ──────────────────────────────────────────────────────────

async function openGame(gameId) {
    currentGameId = gameId;
    try {
        const game = await api.get(`/api/games/${gameId}`);

        if (!game.state_blob) { showToast('Spiel hat noch keinen Spielstand.'); showHomeScreen(); return; }

        currentUserSlot = game.my_slot;
        currentTurnSlot = game.current_slot;
        isSpectator     = game.my_eliminated === true;

        let decoded = null;
        try { decoded = LZString.decompressFromEncodedURIComponent(game.state_blob); } catch (_) {}
        if (!decoded) { showToast('Fehler beim Laden.'); showHomeScreen(); return; }
        gameState = JSON.parse(decoded);

        // Waiting players see their OWN fog of war, not the active player's view
        if (!isSpectator && currentTurnSlot !== currentUserSlot) {
            gameState.cp = currentUserSlot;
        }

        window.history.replaceState({}, '', `?game=${gameId}`);
        document.getElementById('home-screen').style.display = 'none';
        bootGame();

        if (isSpectator) {
            _activateSpectatorMode();
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

function _activateSpectatorMode() {
    if (gameState?.p?.[gameState.cp]) {
        const all = [];
        for (let y = 0; y < gameState.bh; y++)
            for (let x = 0; x < gameState.bw; x++)
                all.push(y * gameState.bw + x);
        gameState.p[gameState.cp].e = all;
    }
    _setReadOnly(true);
    renderBoard(gameState);
    showToast('Zuschauer-Modus – komplette Karte sichtbar');
}

function _setReadOnly(readonly) {
    endTurnBtn.disabled = readonly;
    const sb = document.getElementById('menu-surrender-item');
    if (sb) sb.style.display = readonly ? 'none' : '';
    if (readonly && !isSpectator) {
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
    await refreshFriendsPanel();
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
                <button class="game-delete-btn" title="Freund entfernen" onclick="removeFriend('${otherId}','${escHtml(otherName)}')">🗑️</button>`;
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
    const rows = await api.get('/api/leaderboard').catch(() => []);
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    rows.forEach((row, i) => {
        const isMe = row.id === currentProfile?.id;
        const div = document.createElement('div');
        div.className = 'friend-row';
        div.innerHTML = `<span>#${i + 1} ${escHtml(row.username)}${isMe ? ' (Du)' : ''} — ${row.wins} Siege</span>
            ${isMe ? '' : `<button class="action-btn" onclick="addFriendFromLeaderboard('${escHtml(row.username)}')">+ Freund</button>`}`;
        list.appendChild(div);
    });
    if (!list.children.length)
        list.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Noch keine Spieler.</p>';
}

async function addFriendFromLeaderboard(username) {
    try {
        const result = await api.post('/api/friends/request', { username });
        showToast(result.accepted ? `Du bist jetzt mit ${username} befreundet!` : `Anfrage an ${username} gesendet!`);
    } catch (err) { showToast(err.message); }
}

// ── Server Intermission ───────────────────────────────────────────────────────

function showServerIntermission(nextPlayerName) {
    canvasWrapper.style.display = 'none';
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
window.handleCreateGame      = handleCreateGame;
window.copyInviteLink        = copyInviteLink;
window.openFriendsPicker     = openFriendsPicker;
window.closeFriendsPicker    = closeFriendsPicker;
window.inviteSelectedFriends = inviteSelectedFriends;
window.handleStartGame       = handleStartGame;
window.showFriendsPanel      = showFriendsPanel;
window.hideFriendsPanel      = hideFriendsPanel;
window.handleAddFriend       = handleAddFriend;
window.acceptFriendRequest   = acceptFriendRequest;
