// Lädt die echten Spiel-Skripte (Browser-Globals, keine Module) in Node,
// damit die maptest-Skripte keine Kopie der Generierungslogik pflegen müssen.
const fs = require('fs');
const path = require('path');

function loadGameCode() {
    // DOM-Stubs für die Top-Level-Listener in mapgen.js
    const stub = { addEventListener() { }, value: '', innerHTML: '' };
    const selectStub = { ...stub, querySelector: () => null, selectedOptions: [] };
    global.playerCountSelect = selectStub;
    global.namesContainer = stub;
    global.startGameBtn = stub;
    global.mapSizeSelect = stub;
    global.teamModeSelect = selectStub;
    if (!global.document) global.document = { getElementById: () => null };

    const files = ['js/prng.js', 'js/hex.js', 'js/mapgen.js'];
    const src = files
        .map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))
        .join('\n;\n');
    const fn = new Function(src + `
        return { buildInitialGameState, createPRNG, oddRToCube, cubeToOddR, hexDistance, isInsideMap, compressFog, getTerrainType };
    `);
    return fn();
}

module.exports = loadGameCode;
