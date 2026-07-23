// === BOOT GAME ===
function bootGame() {
    setupScreen.style.display = 'none'; intermissionScreen.style.display = 'none'; draftOverlay.style.display = 'none'; researchOverlay.style.display = 'none'; winScreen.style.display = 'none';

    if (mainTitle) mainTitle.style.display = 'none';
    if (appVersionEl) appVersionEl.style.display = 'none';

    gameState.p.forEach(p => {
        if (p.sh === undefined) p.sh = 30;
        if (!p.u) p.u = [];
        if (!p.e) p.e = [];
        if (!p.al) p.al = [];
        if (!p.req) p.req = [];
        if (!p.tc) p.tc = [];
        if (!p.gifts) p.gifts = [];
        if (typeof p.e === 'string') p.e = decompressFog(p.e);
        if (p.dead === undefined) p.dead = 0;
        if (p.s === undefined) p.s = 0;
        if (p.k === undefined) p.k = 0;
        if (!p.ue) p.ue = [];
        if (typeof p.ue === 'string') p.ue = decompressFog(p.ue);
        if (!p.of) p.of = [];
        if (!p.rel) p.rel = []; // gekaufte, noch nicht ausgerüstete Reliquien (M10)
    });
    if (!gameState.tu) gameState.tu = [];
    if (!gameState.wa) gameState.wa = [];
    if (!gameState.st) gameState.st = [];
    if (!gameState.tw) gameState.tw = [];
    if (!gameState.ct) gameState.ct = { x: gameState.rad, y: gameState.rad, ctrl: -1 };
    // Unterwelt-Zustand (M9b/M10/M11): d = gegrabene Hexes (Array im Speicher,
    // komprimierter Index-String nur auf dem Wire — siehe hex.js/isUnderworldOpen),
    // u = Tiefeneinheiten, n = Lärm-Marker der letzten Runde, a = angebrochene
    // Kristalladern, f = geplünderte Fundkammern ({"x,y": 1}), c = Kreaturen
    // {t,x,y,h}, w = Spinnennetze ({"x,y": 1}), dr = herrenlose Kristallhaufen
    // ({"x,y": Menge}, Korrektur Juli 2026), dy = platzierte Dynamit-Ladungen
    // ([{p, hexes:[{x,y}...]}], Korrektur Juli 2026, ersetzt Unterminierung),
    // wd = Alter Wurm dauerhaft tot.
    if (!gameState.uw) gameState.uw = { d: [], u: [], n: [], a: {}, f: {}, w: {}, dr: {}, dy: [], c: [] };
    if (!gameState.uw.d) gameState.uw.d = [];
    if (typeof gameState.uw.d === 'string') gameState.uw.d = decompressFog(gameState.uw.d);
    if (!gameState.uw.u) gameState.uw.u = [];
    if (!gameState.uw.n) gameState.uw.n = [];
    if (!gameState.uw.a) gameState.uw.a = {};
    if (!gameState.uw.f) gameState.uw.f = {};
    if (!gameState.uw.w) gameState.uw.w = {};
    if (!gameState.uw.dr) gameState.uw.dr = {};
    if (!gameState.uw.dy) gameState.uw.dy = [];
    if (!gameState.uw.c) gameState.uw.c = [];
    gameState.uw.u.forEach((u, idx) => {
        if (u.a === undefined) u.a = 0;
        if (!u.i) u.i = idx + 1;
    });
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
    // Herz-Sieg (M12): muss auch beim Laden geprüft werden, nicht nur direkt nach
    // doEndTurn — sonst sehen alle anderen Clients (die den bereits gewonnenen
    // Blob erst beim Öffnen laden) nie den Sieg-Screen, obwohl uw.hz.n schon das Ziel erreicht hat.
    const erschlWinnersB = checkErschliessungWin(gameState);
    if (erschlWinnersB) { showWin(`${erschlWinnersB.map(p => p.n).join(' & ')} haben das Herz der Tiefe erschlossen — wer das Fundament des Landes hält, dem beugt sich die Oberfläche!`); return; }

    // Erschließungs-Reminder (Korrektur Juli 2026, Bugfix — PLAN.md Abschn. 8
    // verlangt "alle erfahren es"): der Toast in doEndTurn (js/input.js) feuert
    // nur EINMAL, synchron im Tab des erschließenden Spielers selbst — in echten
    // Server-Partien (jeder Spieler in eigener Session) sehen alle anderen
    // Spieler diesen Toast nie, und selbst im geteilten Hotseat-Testmodus erreicht
    // er nur den direkt danach folgenden Spieler. bootGame() läuft dagegen bei
    // JEDEM Zugstart JEDES Spielers (Hotseat-Weiterschalten UND frisches Laden
    // eines Server-/Legacy-URL-Zugs) — daher hier zusätzlich ein Reminder-Toast,
    // solange eine Erschließung läuft, unabhängig davon, wer sie hält.
    if (gameState.uw && gameState.uw.hz) {
        const hzOwner = gameState.p[gameState.uw.hz.p];
        if (hzOwner) {
            const who = gameState.uw.hz.p === gameState.cp ? 'Du erschließt' : `${hzOwner.n} erschließt`;
            showToast(`🌍 ${who} das Herz der Tiefe (${gameState.uw.hz.n}/${ERSCHLIESSUNG_TARGET})`, 'gold');
        }
    }

    canvasWrapper.style.display = 'block';
    uiContainer.style.display = 'flex';
    gameHud.style.display = 'flex';
    endTurnBtn.disabled = false;

    Renderer.init();

    showRecap = false;
    focusCamera();

    // M13: Recap-Sichtbarkeit ist NICHT einheitlich Oberflächen-Sicht — jede Aktion
    // trägt optional a.uw (Sichtbarkeit über das Unterwelt-Netz, getVisibleUWHexes,
    // statt getVisibleHexes) oder a.global (fog-unabhängig — PLAN.md nennt Wurm-Tod
    // und Erschließungs-Fortschritt explizit "globale Meldung"). Design-Entscheidung
    // fürs verdeckte Verhalten: unsichtbare Aktionen werden KOMPLETT WEGGELASSEN statt
    // generisch umformuliert ("Es wurde in der Tiefe gegraben") — konsistent mit dem
    // bestehenden Oberflächen-Recap, das genauso hart filtert statt zu anonymisieren.
    // Das verhindert jeden Informations-Leak über fremde Stollen-Netze (kein Hinweis,
    // DASS überhaupt etwas passiert ist, nicht nur WAS). Kammer/Zünden (M12) sind
    // bewusst NICHT uw-getaggt: PLAN.md Abschn. 6 beschreibt beide explizit als
    // oberirdisch wahrnehmbar ("Beben-Anzeige oben für alle Sichtbaren").
    const recapActions = (gameState.la || []).filter(a => {
        if (a.global) return true;
        const vis = a.uw ? getVisibleUWHexes(gameState.cp) : getVisibleHexes(gameState.cp);
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
        // dig/mine/loot/relicbuy/relicuse/wormdeath (M9b-M11, Unterwelt) + chamber/
        // detonate/collapse/erschl (M12) nutzen dieselben Tags wie oben — eigene
        // Farbe/Icon statt der defensiven '•'/#fff-Fallbacks in playNextRecap unten.
        const recapColors = { mv: '#64b5f6', atk: '#ff5252', buy: '#69f0ae', cap: '#ffab40', dig: '#a1662f', mine: '#7fe3ff', deliver: '#ffca28', loot: '#c9a24b', relicbuy: '#ba68c8', relicuse: '#ba68c8', wormdeath: '#8d6e63', chamber: '#ffb300', detonate: '#d84315', collapse: '#ff9800', erschl: '#8d6e63', creatureAtk: '#ff8a65' };
        const recapIcons = { mv: '→', atk: '⚔', buy: '✦', cap: '⚑', dig: '⛏', mine: '💎', deliver: '💰', loot: '🏺', relicbuy: '🗺️', relicuse: '🔧', wormdeath: '🐛', chamber: '💣', detonate: '🧨', collapse: '💥', erschl: '🌍', creatureAtk: '🐾' };

        function playNextRecap() {
            if (recapIndex >= recapActions.length) {
                showRecap = false;
                renderBoard(gameState);
                setTimeout(startEvents, 400);
                return;
            }
            const action = recapActions[recapIndex];
            recapIndex++;

            Renderer.centerOn(action.x, action.y);
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

        if (pState.gifts && pState.gifts.length > 0) {
            pState.gifts.forEach(gift => {
                const sender = gameState.p[gift.from];
                const parts = [];
                if (gift.g) parts.push(`${gift.g}💰`);
                if (gift.m) parts.push(`${gift.m}🪵`);
                if (gift.s) parts.push(`${gift.s}🪨`);
                showToast(`${sender ? sender.n : 'Ein Verbündeter'} hat dir ${parts.join(' ')} geschickt!`, 'gold');
            });
            pState.gifts = [];
            updateUI();
        }

        if (gameState.p.length >= 4 && gameState.rn >= 5 && pState.req && pState.req.length > 0) {
            openDiplomacy();
        }

        if (gameState.th && gameState.th.length > 0) {
            setTimeout(() => {
                gameState.th.forEach(h => spawnFloatingText(h.x, h.y, `+${h.val}`, "#81c784"));
                gameState.th = [];
            }, 500);
        }

        // Brand-Schäden (Feuer-System) anzeigen
        if (gameState.bd && gameState.bd.length > 0) {
            setTimeout(() => {
                gameState.bd.forEach(b => spawnFloatingText(b.x, b.y, `-${b.val}🔥`, "#ff7043"));
                gameState.bd = [];
            }, 700);
        }

        // Moral-Kollaps-Schäden (M12, PLAN.md Abschn. 3) anzeigen — eigenes Array
        // statt gameState.bd wiederzuverwenden, damit das Icon thematisch passt
        // (kein Feuer, sondern "abgeschnittene Versorgung").
        if (gameState.uwbd && gameState.uwbd.length > 0) {
            setTimeout(() => {
                gameState.uwbd.forEach(b => spawnFloatingText(b.x, b.y, `-${b.val}`, "#b0bec5"));
                gameState.uwbd = [];
            }, 900);
        }
    }

    // Recap temporarily disabled; keep collecting last actions for future fix
    renderBoard(gameState);
    startEvents();
}

// === APP BOOT ===
// Routed through auth.js initApp() — handles URL mode, server mode, and login.
initApp();
