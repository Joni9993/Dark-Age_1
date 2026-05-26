// === BOOT GAME ===
function bootGame() {
    setupScreen.style.display = 'none'; intermissionScreen.style.display = 'none'; draftOverlay.style.display = 'none'; researchOverlay.style.display = 'none'; winScreen.style.display = 'none';

    if (mainTitle) mainTitle.style.display = 'none';

    gameState.p.forEach(p => {
        if (p.sh === undefined) p.sh = 30;
        if (!p.u) p.u = [];
        if (!p.e) p.e = [];
        if (!p.al) p.al = [];
        if (!p.req) p.req = [];
        if (!p.tc) p.tc = [];
        if (typeof p.e === 'string') p.e = decompressFog(p.e);
        if (p.dead === undefined) p.dead = 0;
        if (p.s === undefined) p.s = 0;
        if (!p.of) p.of = [];
    });
    if (!gameState.tu) gameState.tu = [];
    if (!gameState.wa) gameState.wa = [];
    if (!gameState.st) gameState.st = [];
    if (!gameState.tw) gameState.tw = [];
    gameState.u.forEach((u, idx) => {
        if (u.a === undefined) u.a = 0;
        if (!u.i) u.i = idx + 1;
        if (u.dp === undefined) u.dp = 0;
        if (u.mi === undefined) delete u.mi;
    });
    const alivePlayers = gameState.p.filter(p => p.dead !== 1);
    const teamWinnersB = checkTeamWin(alivePlayers);
    if (teamWinnersB) { showWin(`${teamWinnersB.map(p => p.n).join(' & ')} gewinnen gemeinsam!`); return; }
    if (alivePlayers.length <= 1) { showWin(`${alivePlayers[0].n} hat als Letzter überlebt!`); return; }

    canvasWrapper.style.display = 'block';
    uiContainer.style.display = 'flex';
    gameHud.style.display = 'flex';
    endTurnBtn.disabled = false;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    showRecap = false;
    focusCamera();

    const recapActions = (gameState.la || []).filter(a => {
        const vis = getVisibleHexes(gameState.cp);
        return vis.has(`${a.x},${a.y}`);
    });

    function startRecap() {
        if (recapActions.length === 0) {
            showRecap = false;
            renderBoard(gameState);
            startEvents();
            return;
        }

        let recapIndex = 0;
        const recapColors = { mv: '#64b5f6', atk: '#ff5252', buy: '#69f0ae', cap: '#ffab40' };
        const recapIcons = { mv: '→', atk: '⚔', buy: '✦', cap: '⚑' };

        function playNextRecap() {
            if (recapIndex >= recapActions.length) {
                showRecap = false;
                renderBoard(gameState);
                setTimeout(startEvents, 400);
                return;
            }
            const action = recapActions[recapIndex];
            recapIndex++;

            const target = getHexCenter(action.x, action.y);
            camX = (canvas.width / 2) - target.px;
            camY = (canvas.height / 2) - target.py;
            renderBoard(gameState);

            const icon = recapIcons[action.t] || '•';
            const color = recapColors[action.t] || '#fff';

            if (action.t === 'atk' && action.fx !== undefined) {
                spawnAttackAnim(action.fx, action.fy, action.x, action.y, 'slash');
            }
            spawnFloatingText(action.x, action.y, icon, color);

            setTimeout(playNextRecap, 1200);
        }
        playNextRecap();
    }

    function startEvents() {
        if (gameState.rn >= 3) {
            const evt = checkForEvent();
            if (evt) {
                showEvent(evt);
                const origDismiss = window.dismissEvent;
                window.dismissEvent = function () {
                    origDismiss();
                    window.dismissEvent = origDismiss;
                    setTimeout(startDiplomacy, 300);
                };
                return;
            }
        }
        startDiplomacy();
    }

    function startDiplomacy() {
        const pState = gameState.p[gameState.cp];
        if (gameState.p.length >= 4 && gameState.rn >= 5 && pState.req && pState.req.length > 0) {
            openDiplomacy();
        }

        if (gameState.th && gameState.th.length > 0) {
            setTimeout(() => {
                gameState.th.forEach(h => spawnFloatingText(h.x, h.y, `+${h.val}`, "#81c784"));
                gameState.th = [];
            }, 500);
        }
    }

    // Recap temporarily disabled; keep collecting last actions for future fix
    renderBoard(gameState);
    startEvents();
}

// === URL STATE LOADING ===
const urlParams = new URLSearchParams(window.location.search);
const stateParam = urlParams.get('state');
if (stateParam) {
    let decoded = null;
    try { decoded = LZString.decompressFromEncodedURIComponent(stateParam); } catch (e) { }
    if (!decoded) { try { decoded = atob(stateParam); } catch (e) { } }
    if (decoded) { try { gameState = JSON.parse(decoded); bootGame(); } catch (e) { renderNameInputs(); } } else { renderNameInputs(); }
} else { renderNameInputs(); }
