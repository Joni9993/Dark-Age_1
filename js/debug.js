// === DEBUG- / TEST-MODUS ===
// Aktivierung über URL:  index.html?debug            → neues Testspiel (Login wird übersprungen)
//                        index.html?debug&state=…    → Spielstand aus URL laden
//
// Features:
//  - Fog of War aus (umschaltbar), unsichtbare Assassinen werden angezeigt
//  - Hotseat: "Zug beenden" wechselt direkt zum nächsten Spieler (kein Link-Screen)
//  - Klick-Werkzeuge: Einheit setzen / löschen / HP setzen / Dorf-Besitzer ändern / Aktion togglen
//  - Ressourcen-Cheats, Spieler- und Rundenwechsel
//  - Szenarien speichern/laden (localStorage) + Export/Import als JSON
//  - "State → URL": Zustand in die URL schreiben → Code ändern, F5, exakt dort weitertesten
//  - Konsole: window.dbg  (z.B. dbg.state(), dbg.give(0, 99))

window.DEBUG_MODE = false;
window.DEBUG_NO_FOG = false;
window.DEBUG_HOTSEAT = false;
window.DEBUG_TOOL = 'none';
// "Unterwelt aufdecken": zeigt das komplette Unterwelt-Terrain + alle Tiefen-
// einheiten unabhängig von den echten Netz-/Umkreis-Sichtregeln (getVisibleUWHexes/
// isUWUnitVisible, js/logic.js). Produktions-Default AUS (wie DEBUG_NO_FOG oben) —
// initDebugMode() schaltet es für den Test-/Debug-Modus zur Bequemlichkeit an,
// der Panel-Toggle erlaubt, die echten Sichtregeln trotzdem zu prüfen.
window.DEBUG_UW_REVEAL = false;

const DEBUG_LS_KEY = 'da_debug_scenarios';

function initDebugMode(stateParam) {
    window.DEBUG_MODE = true;
    isLegacyUrlMode = true;
    window.DEBUG_NO_FOG = true;
    window.DEBUG_HOTSEAT = true;
    window.DEBUG_UW_REVEAL = true;

    // Service Worker abschalten, damit Code-Änderungen sofort greifen (F5 statt Cache)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => { });
    }

    buildDebugPanel();

    if (stateParam) {
        let decoded = null;
        try { decoded = LZString.decompressFromEncodedURIComponent(stateParam); } catch (_) { }
        if (!decoded) { try { decoded = atob(stateParam); } catch (_) { } }
        if (decoded) {
            try {
                gameState = JSON.parse(decoded);
                bootGame();
                refreshDebugPanel();
                return;
            } catch (_) { }
        }
        showToast('Debug: State aus URL nicht lesbar — starte neues Testspiel.');
    }
    debugNewGame();
}

// ── Neues Testspiel ───────────────────────────────────────────────────────────
function debugNewGame() {
    const count = parseInt(document.getElementById('dbg-players').value);
    const radius = parseInt(document.getElementById('dbg-radius').value);
    const seedIn = document.getElementById('dbg-seed').value.trim();
    const boost = document.getElementById('dbg-boost').checked;

    const names = Array.from({ length: count }, (_, i) => `P${i + 1}`);
    if (seedIn !== '') {
        // buildInitialGameState zieht seinen Seed aus Math.random — kurz deterministisch machen
        const rng = createPRNG(parseInt(seedIn) || 1);
        const orig = Math.random;
        Math.random = rng;
        try { gameState = buildInitialGameState(names, radius); } finally { Math.random = orig; }
    } else {
        gameState = buildInitialGameState(names, radius);
    }
    if (boost) gameState.p.forEach(p => { p.g = 50; p.m = 50; p.s = 20; });

    turnActions = []; undoStack = [];
    bootGame();
    refreshDebugPanel();
    showToast(`Testspiel: ${count} Spieler, Radius ${radius}, Seed ${gameState.sd}`);
}

// ── Klick-Werkzeuge ───────────────────────────────────────────────────────────
// Debug-Tools klinken sich VOR den normalen Canvas-Klick ein
const _dbgOrigCanvasClick = handleCanvasClick;
handleCanvasClick = function (clientX, clientY) {
    if (window.DEBUG_MODE && window.DEBUG_TOOL !== 'none' && gameState) {
        const hex = debugPickHex(clientX, clientY);
        if (hex) { debugApplyTool(hex); return; }
    }
    _dbgOrigCanvasClick(clientX, clientY);
};

function debugPickHex(clientX, clientY) {
    return Renderer.pickHex(clientX, clientY, 1.5);
}

function debugApplyTool(hex) {
    const { x, y } = hex;
    const tool = window.DEBUG_TOOL;
    const unitAt = gameState.u.find(u => u.x === x && u.y === y);

    if (tool === 'spawn') {
        const t = parseInt(document.getElementById('dbg-spawn-type').value);
        if (unitStats[t].isUW) { showToast('Unterwelt-Einheit — bitte Werkzeug "Unterwelt setzen" nutzen (Klick unten in der Unterwelt-Ansicht).'); return; }
        // Ebenenbewusst: Flieger blockieren nur Flieger, Boden nur Boden
        const blocked = unitStats[t].isAir ? airUnitAt(x, y) : groundUnitAt(x, y);
        if (blocked) { showToast('Ebene belegt.'); return; }
        const owner = parseInt(document.getElementById('dbg-spawn-owner').value);
        const nextId = gameState.u.reduce((m, u) => Math.max(m, u.i || 0), 0) + 1;
        gameState.u.push({ i: nextId, p: owner, t, x, y, h: getUnitMaxHp(gameState.p[owner], t), a: 0, dp: 0 });
    } else if (tool === 'delete') {
        if (unitAt) gameState.u = gameState.u.filter(u => u !== unitAt);
        else if ((gameState.tw || []).some(tw => tw.x === x && tw.y === y)) gameState.tw = gameState.tw.filter(tw => !(tw.x === x && tw.y === y));
        else if ((gameState.wa || []).some(w => w.x === x && w.y === y)) gameState.wa = gameState.wa.filter(w => !(w.x === x && w.y === y));
        else if ((gameState.st || []).some(s => s.x === x && s.y === y)) gameState.st = gameState.st.filter(s => !(s.x === x && s.y === y));
        else if (gameState.v[`${x},${y}`] !== undefined) delete gameState.v[`${x},${y}`];
        else { showToast('Nichts zum Löschen auf dem Feld.'); return; }
    } else if (tool === 'hp') {
        const target = unitAt
            || (gameState.tw || []).find(tw => tw.x === x && tw.y === y)
            || (gameState.wa || []).find(w => w.x === x && w.y === y)
            || (gameState.st || []).find(s => s.x === x && s.y === y);
        if (!target) { showToast('Nichts mit HP auf dem Feld.'); return; }
        const val = prompt('Neue HP:', target.h);
        if (val !== null && !isNaN(parseInt(val))) target.h = parseInt(val);
    } else if (tool === 'village') {
        const owner = parseInt(document.getElementById('dbg-village-owner').value);
        if (owner === -2) delete gameState.v[`${x},${y}`];
        else gameState.v[`${x},${y}`] = owner;
    } else if (tool === 'ready') {
        if (!unitAt) { showToast('Keine Einheit auf dem Feld.'); return; }
        unitAt.a = unitAt.a ? 0 : 1;
    } else if (tool === 'uwspawn') {
        // Unterwelt-Einheit (17-22, aus dbg-spawn-type) auf ein Unterwelt-Hex setzen
        // (unabhängig von Kamerafokus/Kauf-Regeln) — nur auf bereits offenen Hexes,
        // nicht auf belegten.
        const t = parseInt(document.getElementById('dbg-spawn-type').value);
        if (!unitStats[t].isUW) { showToast('Keine Unterwelt-Einheit ausgewählt (17-22). Der Arbeiter (7) taucht über "Abtauchen" an seinem Tunnel-Startpunkt ab.'); return; }
        if (!isUnderworldOpen(gameState, x, y)) { showToast('Hex ist noch massiver Fels — nicht setzbar.'); return; }
        if (!gameState.uw) gameState.uw = { d: [], u: [], n: [], a: {} };
        if (uwUnitAt(x, y)) { showToast('Unterwelt-Feld belegt.'); return; }
        const owner = parseInt(document.getElementById('dbg-spawn-owner').value);
        const nextId = gameState.uw.u.reduce((m, u) => Math.max(m, u.i || 0), 0) + 1;
        const unitObj = { i: nextId, p: owner, t, x, y, h: getUnitMaxHp(gameState.p[owner], t), a: 0 };
        if (t === 21) unitObj.iv = 1; // Horcher: passiv unsichtbar
        gameState.uw.u.push(unitObj);
    } else if (tool === 'uwcreature') {
        // Kreatur (M11, Typ aus dbg-creature-type) auf ein offenes Unterwelt-Hex
        // setzen — neutral, kein Besitzer, keine Kauf-/Kamerafokus-Prüfung nötig.
        const t = parseInt(document.getElementById('dbg-creature-type').value);
        if (!isUnderworldOpen(gameState, x, y)) { showToast('Hex ist noch massiver Fels — nicht setzbar.'); return; }
        if (!gameState.uw) gameState.uw = { d: [], u: [], n: [], a: {}, f: {}, w: {}, c: [] };
        if (!gameState.uw.c) gameState.uw.c = [];
        if (uwUnitAt(x, y) || uwCreatureAt(x, y)) { showToast('Unterwelt-Feld belegt.'); return; }
        gameState.uw.c.push({ t, x, y, h: uwCreatureStats[t].hp });
    }

    renderBoard(gameState);
    updateUI();
    refreshDebugPanel();
}

// ── Aktionen ──────────────────────────────────────────────────────────────────
function debugSwitchPlayer(idx) {
    gameState.cp = idx;
    selectedUnit = null; selectedHex = null; validMoves = []; validAttacks = []; window.specialActive = null; window.demolishTargets = [];
    turnActions = []; undoStack = [];
    updateUndoButton();
    hideActionMenu();
    endTurnBtn.disabled = false;
    focusCamera();
    renderBoard(gameState);
    updateUI();
    refreshDebugPanel();
}

function debugGive(g, m, s) {
    const p = gameState.p[gameState.cp];
    p.g += g; p.m += m; p.s = (p.s || 0) + s;
    updateUI();
}

function debugGiveCrystals(k) {
    const p = gameState.p[gameState.cp];
    p.k = (p.k || 0) + k;
    updateUI();
}

function debugGiveRelics() {
    const p = gameState.p[gameState.cp];
    if (!p.rel) p.rel = [];
    Object.keys(RELICS).forEach(key => { if (key !== 'map') p.rel.push(key); }); // "map" wirkt sofort, kein Inventar-Item
    renderBoard(gameState);
    updateUI();
    showToast('Je 1 Reliquie ins Inventar gelegt (außer Karte der Tiefe).');
}

// Alten Wurm sofort besiegen (M11) — entfernt ihn aus uw.c und setzt uw.wd
// dauerhaft, exakt wie ein regulärer Spielerkill (siehe resolveUWAttackOnCreature).
function debugKillWorm() {
    if (!gameState.uw || !gameState.uw.c) { showToast('Kein Unterwelt-Zustand geladen.'); return; }
    const worm = gameState.uw.c.find(c => c.t === UWC_WURM && c.h > 0);
    if (!worm) { showToast('Der Alte Wurm ist bereits tot (oder nicht auf der Karte).'); return; }
    gameState.uw.c = gameState.uw.c.filter(c => c !== worm);
    gameState.uw.wd = 1;
    renderBoard(gameState);
    updateUI();
    showToast('🐛 Ein Beben läuft durch das Land — der Alte Wurm ist gefallen!', 'gold');
}

// Erschließungs-Setup mit einem Klick (M12): tötet den Wurm (falls noch am
// Leben) UND setzt eine eigene Einheit exakt ins Herzkaverne-Zentrum — damit
// ist die Fortschritts-Bedingung sofort erfüllt (nächstes doEndTurn zählt hoch).
function debugSetupErschliessung() {
    if (!gameState.uw) gameState.uw = { d: [], u: [], n: [], a: {}, f: {}, w: {}, c: [] };
    gameState.uw.wd = 1;
    gameState.uw.c = (gameState.uw.c || []).filter(c => c.t !== UWC_WURM);
    const cx = Math.floor(gameState.bw / 2), cy = Math.floor(gameState.bh / 2);
    if (!uwUnitAt(cx, cy)) {
        if (!gameState.uw.u) gameState.uw.u = [];
        const nextId = gameState.uw.u.reduce((m, u) => Math.max(m, u.i || 0), 0) + 1;
        gameState.uw.u.push({ i: nextId, p: gameState.cp, t: 7, x: cx, y: cy, h: getUnitMaxHp(gameState.p[gameState.cp], 7), a: 0 });
    }
    renderBoard(gameState);
    updateUI();
    showToast('Wurm tot + eigene Einheit im Herzkaverne-Zentrum gesetzt (nächster Zugende zählt).');
}

// Dynamit sofort platzieren (Korrektur Juli 2026, ersetzt debugArmChamber):
// findet den ersten eigenen Sprengmeister in der Unterwelt und platziert eine
// Ladung auf seinem ersten gültigen Fels-Nachbarn, unabhängig vom Holzvorrat —
// reines Testwerkzeug, um die Detonation am nächsten Zugstart schnell zu prüfen.
function debugPlaceDynamite() {
    const sprengmeister = ((gameState.uw && gameState.uw.u) || []).find(u => u.p === gameState.cp && u.t === 18);
    if (!sprengmeister) { showToast('Kein eigener Sprengmeister in der Unterwelt.'); return; }
    const targets = calculateDynamiteTargetsUW(sprengmeister);
    if (targets.length === 0) { showToast('Kein Fels-Hex neben dem Sprengmeister.'); return; }
    placeUWDynamite(gameState, sprengmeister, targets[0].x, targets[0].y);
    renderBoard(gameState);
    updateUI();
    showToast('🧨 Dynamit sofort platziert (detoniert am nächsten eigenen Zugstart).');
}

function debugRefreshActions() {
    gameState.u.filter(u => u.p === gameState.cp).forEach(u => { u.a = 0; delete u.br; });
    (gameState.tw || []).filter(tw => tw.o === gameState.cp).forEach(tw => tw.a = 0);
    renderBoard(gameState);
    showToast('Alle Aktionen aufgefrischt.');
}

function debugToggleFog(off) {
    window.DEBUG_NO_FOG = off;
    renderBoard(gameState);
}

function debugToggleUwReveal(on) {
    window.DEBUG_UW_REVEAL = on;
    renderBoard(gameState);
}

// ── Spielstand: URL / localStorage / JSON ────────────────────────────────────
function debugStateToUrl() {
    const enc = LZString.compressToEncodedURIComponent(JSON.stringify(gameState));
    const url = window.location.href.split('?')[0] + '?debug=1&state=' + enc;
    try { window.history.pushState({ path: url }, '', url); } catch (_) { }
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => { });
    showToast('State in URL geschrieben (und kopiert) — F5 lädt hier weiter.');
}

function debugGetScenarios() {
    try { return JSON.parse(localStorage.getItem(DEBUG_LS_KEY)) || {}; } catch (_) { return {}; }
}

function debugSaveScenario() {
    const name = prompt('Name für das Szenario:', 'Szenario ' + new Date().toLocaleTimeString());
    if (!name) return;
    const all = debugGetScenarios();
    all[name] = JSON.stringify(gameState);
    localStorage.setItem(DEBUG_LS_KEY, JSON.stringify(all));
    refreshDebugPanel();
    showToast(`Szenario "${name}" gespeichert.`);
}

function debugLoadScenario() {
    const sel = document.getElementById('dbg-scenario-list');
    const name = sel.value;
    if (!name) { showToast('Kein Szenario ausgewählt.'); return; }
    const all = debugGetScenarios();
    if (!all[name]) { showToast('Szenario nicht gefunden.'); return; }
    gameState = JSON.parse(all[name]);
    turnActions = []; undoStack = [];
    bootGame();
    refreshDebugPanel();
    showToast(`Szenario "${name}" geladen.`);
}

function debugDeleteScenario() {
    const sel = document.getElementById('dbg-scenario-list');
    const name = sel.value;
    if (!name) return;
    const all = debugGetScenarios();
    delete all[name];
    localStorage.setItem(DEBUG_LS_KEY, JSON.stringify(all));
    refreshDebugPanel();
}

function debugExportJson() {
    const ta = document.getElementById('dbg-json');
    ta.value = JSON.stringify(gameState, null, 1);
    ta.select();
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => { });
    showToast('State als JSON exportiert (kopiert).');
}

function debugImportJson() {
    const ta = document.getElementById('dbg-json');
    try {
        gameState = JSON.parse(ta.value);
        turnActions = []; undoStack = [];
        bootGame();
        refreshDebugPanel();
        showToast('JSON-State geladen.');
    } catch (e) {
        showToast('Ungültiges JSON: ' + e.message);
    }
}

// ── Panel-UI ──────────────────────────────────────────────────────────────────
function buildDebugPanel() {
    const style = document.createElement('style');
    style.textContent = `
        #dbg-toggle { position: fixed; top: 52px; right: 6px; z-index: 501; background: #4a148c; color: #fff;
            border: 1px solid #7b1fa2; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 14px; }
        #dbg-panel { position: fixed; top: 88px; right: 6px; z-index: 500; width: 230px; max-height: calc(100vh - 100px);
            overflow-y: auto; background: rgba(15, 10, 25, 0.94); border: 1px solid #7b1fa2; border-radius: 8px;
            padding: 8px; color: #d4c4a8; font-size: 12px; font-family: monospace; display: flex;
            flex-direction: column; gap: 6px; }
        #dbg-panel h4 { margin: 4px 0 2px; color: #ce93d8; font-size: 11px; text-transform: uppercase;
            letter-spacing: 1px; border-bottom: 1px solid #4a148c; }
        #dbg-panel button { background: #311b92; color: #fff; border: 1px solid #5e35b1; border-radius: 4px;
            padding: 3px 6px; cursor: pointer; font-size: 11px; font-family: monospace; }
        #dbg-panel button:hover { background: #4527a0; }
        #dbg-panel select, #dbg-panel input[type=text], #dbg-panel input[type=number] {
            background: #1a1025; color: #d4c4a8; border: 1px solid #4a148c; border-radius: 4px;
            padding: 2px 4px; font-size: 11px; font-family: monospace; max-width: 100%; }
        #dbg-panel .dbg-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        #dbg-panel label.dbg-tool { display: flex; gap: 4px; align-items: center; cursor: pointer; }
        #dbg-panel textarea { width: 100%; box-sizing: border-box; background: #1a1025; color: #d4c4a8;
            border: 1px solid #4a148c; font-size: 10px; font-family: monospace; }
    `;
    document.head.appendChild(style);

    const toggle = document.createElement('button');
    toggle.id = 'dbg-toggle';
    toggle.textContent = '🐞';
    toggle.title = 'Debug-Panel ein/aus';
    toggle.onclick = () => {
        const p = document.getElementById('dbg-panel');
        p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    };
    document.body.appendChild(toggle);

    const unitOptions = Object.entries(unitStats).map(([t, s]) => `<option value="${t}">${s.name}</option>`).join('');
    const creatureOptions = Object.entries(uwCreatureStats).map(([t, s]) => `<option value="${t}">${s.name}</option>`).join('');

    const panel = document.createElement('div');
    panel.id = 'dbg-panel';
    panel.innerHTML = `
        <h4>Spiel</h4>
        <div class="dbg-row">Am Zug: <select id="dbg-cp" onchange="debugSwitchPlayer(parseInt(this.value))"></select>
            Rd: <input type="number" id="dbg-round" min="1" style="width:40px"
                onchange="gameState.rn = parseInt(this.value) || 1; updateUI();"></div>
        <div class="dbg-row">
            <select id="dbg-players"><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>Sp.
            <select id="dbg-radius"><option value="5">R5</option><option value="7">R7</option><option value="12">R12</option></select>
            <input type="text" id="dbg-seed" placeholder="Seed" style="width:44px">
            <label class="dbg-tool"><input type="checkbox" id="dbg-boost" checked>Boost</label>
        </div>
        <button onclick="debugNewGame()">⚔ Neues Testspiel</button>

        <h4>Cheats (akt. Spieler)</h4>
        <div class="dbg-row">
            <button onclick="debugGive(10,0,0)">+10💰</button>
            <button onclick="debugGive(0,10,0)">+10🪵</button>
            <button onclick="debugGive(0,0,10)">+10🪨</button>
            <button onclick="debugGiveCrystals(10)">+10💎</button>
            <button onclick="debugGiveRelics()" title="Je eine Reliquie jedes Typs ins Inventar">+1️⃣ Reliquien</button>
        </div>
        <button onclick="debugRefreshActions()">⟳ Aktionen auffrischen</button>
        <label class="dbg-tool"><input type="checkbox" id="dbg-fog" checked
            onchange="debugToggleFog(this.checked)"> Fog of War aus</label>

        <h4>Unterwelt</h4>
        <label class="dbg-tool"><input type="checkbox" id="dbg-uw-reveal" checked
            onchange="debugToggleUwReveal(this.checked)"> Unterwelt aufdecken (Netz-Sicht aus)</label>
        <div class="dbg-row">
            <button onclick="dbg.uwStats()" title="Typ-Verteilung des aktuellen Seeds in die Konsole loggen">📊 uwStats()</button>
            <button onclick="dbg.uwState()" title="gameState.uw in die Konsole loggen">🗂 uw-State</button>
        </div>
        <div class="dbg-row">
            <button onclick="debugKillWorm()" title="Alten Wurm sofort besiegen (uw.wd=1)">🐛 Wurm töten</button>
            <button onclick="debugSetupErschliessung()" title="Wurm tot + eigene Einheit ins Herzkaverne-Zentrum">🌍 Erschließungs-Setup</button>
        </div>
        <button onclick="debugPlaceDynamite()" title="Dynamit-Ladung auf einem Fels-Nachbarn des ersten eigenen Sprengmeisters, ohne Holzkosten">🧨 Dynamit sofort platzieren</button>

        <h4>Klick-Werkzeug</h4>
        <label class="dbg-tool"><input type="radio" name="dbg-tool" value="none" checked
            onchange="DEBUG_TOOL=this.value"> Aus (normal spielen)</label>
        <label class="dbg-tool"><input type="radio" name="dbg-tool" value="spawn"
            onchange="DEBUG_TOOL=this.value"> Einheit setzen:</label>
        <div class="dbg-row" style="padding-left:16px;">
            <select id="dbg-spawn-type">${unitOptions}</select>
            <select id="dbg-spawn-owner"></select>
        </div>
        <label class="dbg-tool"><input type="radio" name="dbg-tool" value="delete"
            onchange="DEBUG_TOOL=this.value"> Löschen (Einheit/Bau/Dorf)</label>
        <label class="dbg-tool"><input type="radio" name="dbg-tool" value="hp"
            onchange="DEBUG_TOOL=this.value"> HP setzen</label>
        <label class="dbg-tool"><input type="radio" name="dbg-tool" value="village"
            onchange="DEBUG_TOOL=this.value"> Dorf-Besitzer:</label>
        <div class="dbg-row" style="padding-left:16px;">
            <select id="dbg-village-owner"></select>
        </div>
        <label class="dbg-tool"><input type="radio" name="dbg-tool" value="ready"
            onchange="DEBUG_TOOL=this.value"> Aktion verbraucht an/aus</label>
        <label class="dbg-tool"><input type="radio" name="dbg-tool" value="uwspawn"
            onchange="DEBUG_TOOL=this.value"> ⛏ Unterwelt setzen (Typ oben, akt. Spieler)</label>
        <label class="dbg-tool"><input type="radio" name="dbg-tool" value="uwcreature"
            onchange="DEBUG_TOOL=this.value"> 🕷 Kreatur setzen:</label>
        <div class="dbg-row" style="padding-left:16px;">
            <select id="dbg-creature-type">${creatureOptions}</select>
        </div>

        <h4>Spielstand</h4>
        <button onclick="debugStateToUrl()" title="Zustand in URL — Code ändern, F5, weitertesten">🔗 State → URL (F5-sicher)</button>
        <div class="dbg-row">
            <button onclick="debugSaveScenario()">💾</button>
            <select id="dbg-scenario-list" style="flex:1"></select>
            <button onclick="debugLoadScenario()">▶</button>
            <button onclick="debugDeleteScenario()">🗑</button>
        </div>
        <div class="dbg-row">
            <button onclick="debugExportJson()">JSON export</button>
            <button onclick="debugImportJson()">JSON laden</button>
        </div>
        <textarea id="dbg-json" rows="4" placeholder="gameState als JSON"></textarea>
    `;
    document.body.appendChild(panel);
}

function refreshDebugPanel() {
    if (!document.getElementById('dbg-panel') || !gameState) return;

    const playerOpts = gameState.p.map((p, i) =>
        `<option value="${i}" style="color:${playerColors[i]}">${p.n}${p.dead === 1 ? ' ☠' : ''}</option>`).join('');

    const cpSel = document.getElementById('dbg-cp');
    cpSel.innerHTML = playerOpts;
    cpSel.value = gameState.cp;

    const ownerSel = document.getElementById('dbg-spawn-owner');
    const prevOwner = ownerSel.value;
    ownerSel.innerHTML = playerOpts;
    if (prevOwner !== '' && gameState.p[prevOwner]) ownerSel.value = prevOwner;

    const villageSel = document.getElementById('dbg-village-owner');
    const prevVillage = villageSel.value;
    villageSel.innerHTML = `<option value="-1">Neutral</option>` + playerOpts + `<option value="-2">Entfernen</option>`;
    if (prevVillage !== '') villageSel.value = prevVillage;

    document.getElementById('dbg-round').value = gameState.rn;

    const scenSel = document.getElementById('dbg-scenario-list');
    const prevScen = scenSel.value;
    scenSel.innerHTML = Object.keys(debugGetScenarios()).map(n => `<option>${n}</option>`).join('');
    if (prevScen) scenSel.value = prevScen;
}

// ── Konsolen-Helfer ───────────────────────────────────────────────────────────
window.dbg = {
    state: () => gameState,
    give: (pIdx, g = 99, m = 99, s = 99) => { const p = gameState.p[pIdx]; p.g += g; p.m += m; p.s = (p.s || 0) + s; updateUI(); },
    render: () => { renderBoard(gameState); updateUI(); },
    switch: (i) => debugSwitchPlayer(i),
    faction: (pIdx, fId) => { const p = gameState.p[pIdx]; if (!p.f.includes(fId)) p.f.push(fId); renderBoard(gameState); },
    upgrade: (pIdx, uId) => { const p = gameState.p[pIdx]; if (!p.u) p.u = []; if (!p.u.includes(uId)) p.u.push(uId); },
    // Zählt für den aktuellen Seed die Unterwelt-Typ-Verteilung (Fels/Kaverne/
    // Ader/Ruine/Herz) über die komplette Karte und loggt sie in die Konsole.
    uwStats: () => {
        if (!gameState) { console.log('Kein Spiel geladen.'); return; }
        const counts = { [UW_FELS]: 0, [UW_KAVERNE]: 0, [UW_ADER]: 0, [UW_RUINE]: 0, [UW_HERZ]: 0 };
        let total = 0;
        for (let y = 0; y < gameState.bh; y++) {
            for (let x = 0; x < gameState.bw; x++) {
                if (!isInsideMap(gameState, x, y)) continue;
                counts[getUnderworldType(gameState, x, y)]++;
                total++;
            }
        }
        const pct = t => total ? (counts[t] / total * 100).toFixed(1) : '0.0';
        const line = Object.keys(UW_TYPE_NAMES)
            .map(t => `${UW_TYPE_NAMES[t]} ${counts[t]} (${pct(t)}%)`)
            .join(' · ');
        console.log(`Unterwelt-Verteilung (Seed ${gameState.sd}, ${total} Hexes): ${line}`);
        return counts;
    },
    // Dumpt den kompletten Unterwelt-Zustand (gegrabene Hexes, Einheiten, Lärm,
    // angebrochene Adern) + Kristalle/Netz-Sicht aller Spieler in die Konsole.
    uwState: () => {
        if (!gameState) { console.log('Kein Spiel geladen.'); return; }
        console.log('gameState.uw:', gameState.uw);
        gameState.p.forEach((p, i) => console.log(`Spieler ${i} (${p.n}): 💎${p.k || 0} · Netz-Hexes: ${(p.ue || []).length}`));
        // Kreaturen (M11): Bestand nach Typ + Wurm-Status.
        const creatures = (gameState.uw && gameState.uw.c) || [];
        const counts = {};
        creatures.forEach(c => { counts[c.t] = (counts[c.t] || 0) + 1; });
        const line = Object.keys(uwCreatureStats).map(t => `${uwCreatureStats[t].name} ${counts[t] || 0}`).join(' · ');
        console.log(`Kreaturen: ${line} · Wurm tot: ${gameState.uw && gameState.uw.wd ? 'ja' : 'nein'} · Netze: ${Object.keys((gameState.uw && gameState.uw.w) || {}).length}`);
        // Erschließung (M12): Fortschritt + ausstehende Dynamit-Ladungen.
        const hz = gameState.uw && gameState.uw.hz;
        console.log(`Erschließung: ${hz ? `${gameState.p[hz.p].n} (${hz.n}/4)` : 'keine'}`);
        const charges = (gameState.uw && gameState.uw.dy) || [];
        console.log(`Ausstehende Dynamit-Ladungen: ${charges.length} (${charges.map(c => `${gameState.p[c.p].n}: ${c.hexes.map(h => `${h.x},${h.y}`).join('+')}`).join(' · ')})`);
        return gameState.uw;
    },
};
