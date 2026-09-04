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
        if (!p.defeatLog) p.defeatLog = []; // Niederlage-Rückblick (Aug 2026), alte Blobs ohne das Feld
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
    // Jeder Tunnelkopf (x1,y1) räumt sein Unterwelt-Feld frei — läuft hier
    // nochmal für ALLE Tunnel (auch noch im Bau, nicht nur t.r <= rn) als
    // Absicherung für Bestandsspielstände, die die sofortige Räumung beim Bau
    // (js/input.js) noch nicht kannten. Bei neu gebauten Tunneln ist das Feld
    // an dieser Stelle bereits geräumt — der Funktionsaufruf ist dann ein No-Op.
    (gameState.tu || []).forEach(t => clearUnderworldForTunnelHead(gameState, t.x1, t.y1));

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
    // Spielende (Sept 2026 umgebaut): früher stieg bootGame hier mit
    // `showWin(...); return;` aus — VOR Renderer.init() und prepareRecap(). Damit
    // war der komplette Niederlage-/Endspiel-Rückblick unerreichbar: das
    // defeatLog lag im Blob, die 14-Tage-Sichtbarkeit beendeter Spiele in der
    // Liste war eingebaut, das Defeat-Banner in js/lobby.js wurde gesetzt — nur
    // gebaut wurde der Rückblick nie, und showWin blendet Karte samt HUD (also
    // auch den Rückblick-Knopf) aus. Sichtbar wurde er einzig im Sonderfall
    // "ausgeschieden, Spiel läuft weiter"; im 1v1 kann der gar nicht auftreten,
    // weil dort Elimination immer zugleich Spielende ist.
    //
    // Jetzt wird das Ende nur noch gemerkt: der Boot läuft vollständig durch
    // (Karte, HUD, Rückblick), erst ganz am Schluss legt sich der Sieg-Screen
    // darüber — mit einem Knopf, der ihn für den Rückblick wieder wegräumt.
    let gameOver = null;
    const alivePlayers = gameState.p.filter(p => p.dead !== 1);
    const teamWinnersB = checkTeamWin(alivePlayers);
    // Herz-Sieg (M12): muss auch beim Laden geprüft werden, nicht nur direkt nach
    // doEndTurn — sonst sehen alle anderen Clients (die den bereits gewonnenen
    // Blob erst beim Öffnen laden) nie den Sieg-Screen, obwohl uw.hz.n schon das Ziel erreicht hat.
    const erschlWinnersB = teamWinnersB ? null : checkErschliessungWin(gameState);
    if (teamWinnersB) {
        gameOver = { msg: `${teamWinnersB.map(p => p.n).join(' & ')} gewinnen gemeinsam!`, winners: teamWinnersB };
    } else if (alivePlayers.length <= 1) {
        gameOver = { msg: `${alivePlayers[0].n} hat als Letzter überlebt!`, winners: [alivePlayers[0]] };
    } else if (erschlWinnersB) {
        gameOver = { msg: `${erschlWinnersB.map(p => p.n).join(' & ')} haben das Herz der Tiefe erschlossen — wer das Fundament des Landes hält, dem beugt sich die Oberfläche!`, winners: erschlWinnersB };
    }
    // Gelesen von recapViewerId (js/recap.js): am Spielende ist gameState.cp
    // kein brauchbarer "wer schaut gerade zu" mehr.
    window.gameFinished = !!gameOver;

    // Erschließungs-Reminder (Korrektur Juli 2026, Bugfix — PLAN.md Abschn. 8
    // verlangt "alle erfahren es"): der Toast in doEndTurn (js/input.js) feuert
    // nur EINMAL, synchron im Tab des erschließenden Spielers selbst — in echten
    // Server-Partien (jeder Spieler in eigener Session) sehen alle anderen
    // Spieler diesen Toast nie, und selbst im geteilten Hotseat-Testmodus erreicht
    // er nur den direkt danach folgenden Spieler. bootGame() läuft dagegen bei
    // JEDEM Zugstart JEDES Spielers (Hotseat-Weiterschalten UND frisches Laden
    // eines Server-/Legacy-URL-Zugs) — daher hier zusätzlich ein Reminder-Toast,
    // solange eine Erschließung läuft, unabhängig davon, wer sie hält.
    if (!gameOver && gameState.uw && gameState.uw.hz) {
        const hzOwner = gameState.p[gameState.uw.hz.p];
        if (hzOwner) {
            const who = gameState.uw.hz.p === gameState.cp ? 'Du erschließt' : `${hzOwner.n} erschließt`;
            showToast(`🌍 ${who} das Herz der Tiefe (${gameState.uw.hz.n}/${ERSCHLIESSUNG_TARGET})`, 'gold');
        }
    }

    canvasWrapper.style.display = 'block';
    document.body.classList.add('in-game');   // stoppt den Menü-Hintergrund
    uiContainer.style.display = 'flex';
    gameHud.style.display = 'flex';
    endTurnBtn.disabled = !!gameOver;

    Renderer.init();

    showRecap = false;
    focusCamera();

    // Rückblick (js/recap.js): Was seit dem eigenen letzten Zug im eigenen
    // Sichtfeld passiert ist. Der Vorgänger an dieser Stelle war ein
    // blockierendes Kamera-Playback (1200 ms je Aktion, kein Abbruch, nur der
    // unmittelbar vorherige Zug, ein Glyph ohne Urheber) und war deshalb
    // dauerhaft abgeschaltet — die Begründung im Detail steht im Kopf von
    // js/recap.js. prepareRecap() blockiert nichts: es füllt den HUD-Knopf und
    // öffnet ein Panel, das man ignorieren, wegklicken und jederzeit wieder
    // aufrufen kann; die Kamera bewegt sich nur auf ausdrückliches Antippen.
    // Die Fog-/uw-/global-Filterregel (M13) lebt jetzt in recapVisibleActions
    // und wird von js/render.js und js/render3d.js mitbenutzt.

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

    renderBoard(gameState);
    if (gameOver) {
        // Kein startEvents(): Ereignis- und Diplomatie-Kette gehören zu einem
        // laufenden Zug, den es hier nicht mehr gibt. prepareRecap() dagegen
        // MUSS vor showWin laufen — showWin schließt das Panel und blendet den
        // HUD-Knopf aus, baut ihn aber nicht; der Knopf im Sieg-Screen holt
        // beides über showEndRecap() (js/diplomacy.js) zurück.
        prepareRecap();
        showWin(gameOver.msg, gameOver.winners);
        return;
    }
    // Erst die Ereignis-/Diplomatie-Kette (die liegt als .overlay darüber),
    // dann das Rückblick-Panel — so steht es nach dem Wegklicken eines
    // Ereignisses sichtbar da, statt darunter zu verschwinden.
    startEvents();
    prepareRecap();
}

// === APP BOOT ===
// Routed through auth.js initApp() — handles URL mode, server mode, and login.
initApp();
