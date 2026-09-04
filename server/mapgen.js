// ── Kartengenerierung auf der Serverseite ────────────────────────────────────
//
// Gebraucht seit dem Auto-Start (Sept 2026): sobald der letzte Eingeladene
// zusagt, startet die Lobby von selbst — auch wenn der Host die App gar nicht
// offen hat. Bis dahin konnte NUR der Client eine Partie starten, weil der
// Anfangszustand (Karte, Startdörfer, Steine, Kreaturen) in js/mapgen.js
// entsteht und von dort als state_blob hochgeladen wird.
//
// Geladen wird der ECHTE Frontend-Code, keine Kopie — dasselbe Vorgehen wie in
// maptest/load_game.js, aus demselben Grund: eine zweite Generierungslogik
// müsste bei jeder Balance-Änderung mitgepflegt werden und wäre spätestens beim
// ersten Vergessen ein Spiel, dessen Karte je nach Startweg anders aussieht.
// Die DOM-Stubs bedienen die Top-Level-Listener in mapgen.js, mehr braucht die
// Datei in Node nicht.
const fs = require('fs');
const path = require('path');
const LZString = require('lz-string');

let _build = null;

function loadGenerator() {
    if (_build) return _build;
    const stub = { addEventListener() { }, value: '', innerHTML: '' };
    const selectStub = { ...stub, querySelector: () => null, selectedOptions: [] };
    // `window` braucht mapgen.js nur für `window.Segmented?.refreshAll()` in
    // updateTeamModeOptions (läuft beim Laden einmal durch) — ein leeres Objekt
    // genügt, die Optional-Chaining-Kette endet dann sofort.
    const g = {
        playerCountSelect: selectStub, namesContainer: stub, startGameBtn: stub,
        mapSizeSelect: stub, teamModeSelect: selectStub, window: {},
        document: { getElementById: () => null }
    };
    for (const [k, v] of Object.entries(g)) if (!global[k]) global[k] = v;

    const root = path.join(__dirname, '..');
    const files = ['js/prng.js', 'js/hex.js', 'js/data.js', 'js/mapgen.js'];
    const src = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n');
    _build = new Function(src + '\nreturn buildInitialGameState;')();
    return _build;
}

// names in Slot-Reihenfolge. Gibt { seed, blob } zurück — genau das, was
// handleStartGame (js/lobby.js) sonst an POST /:id/start schickt.
function buildStartState(names, mapRadius, teamMode) {
    const build = loadGenerator();
    const state = build(names, mapRadius, teamMode);
    return { seed: state.sd, blob: LZString.compressToEncodedURIComponent(JSON.stringify(state)) };
}

module.exports = { buildStartState };
