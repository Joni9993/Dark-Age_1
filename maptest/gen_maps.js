// Erzeugt 10 Test-Map-Links als HTML (maptest/index.html + map_N.html).
// Nutzt die echte Generierung aus js/mapgen.js via load_game.js — keine Kopie.
//
// Aufruf: node maptest/gen_maps.js [spieler] [radius]
const fs = require('fs');
const path = require('path');
const loadGameCode = require('./load_game');
const { buildInitialGameState, isInsideMap, compressFog } = loadGameCode();

const count = parseInt(process.argv[2], 10) || 6;
const radius = parseInt(process.argv[3], 10) || 12;

let indexHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Map Test Links</title>
    <style>
        body { font-family: sans-serif; background: #111; color: #eee; padding: 20px; text-align: center; }
        a { color: #4fc3f7; display: inline-block; margin: 10px; font-size: 1.2em; text-decoration: none; padding: 10px 20px; border: 1px solid #4fc3f7; border-radius: 5px; }
        a:hover { background: #4fc3f7; color: #111; }
        .container { max-width: 800px; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>10 Test Maps</h1>
        <p>${count} Players, Radius ${radius}, Fog of War: Deaktiviert.</p>
        <div style="display: flex; flex-wrap: wrap; justify-content: center;">
`;

for (let mapIdx = 1; mapIdx <= 10; mapIdx++) {
    const names = Array.from({ length: count }, (_, i) => `Spieler ${i + 1}`);
    const gameState = buildInitialGameState(names, radius);

    // Fog of War komplett aufdecken
    let allTiles = [];
    for (let y = 0; y < gameState.bh; y++) {
        for (let x = 0; x < gameState.bw; x++) {
            if (isInsideMap(gameState, x, y)) allTiles.push(y * gameState.bw + x);
        }
    }
    gameState.p.forEach(p => { p.e = compressFog(allTiles); });

    const encodedState = Buffer.from(JSON.stringify(gameState), 'utf8').toString('base64');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Map ${mapIdx}</title>
    <script>
        window.location.href = "../index.html?state=" + encodeURIComponent("${encodedState}");
    </script>
</head>
<body>
    <p style="font-family: sans-serif; background: #111; color: #eee; text-align: center; padding: 50px;">Lade Karte ${mapIdx}...</p>
</body>
</html>`;

    fs.writeFileSync(path.join(__dirname, `map_${mapIdx}.html`), htmlContent);
    console.log(`Generated map_${mapIdx}.html`);

    indexHtml += `<a href="map_${mapIdx}.html">Map ${mapIdx}</a>\n`;
    const spawnInfo = gameState.p.map(p => `${p.n} (${p.sv})`).join(', ');
    indexHtml += `<p style="color:#ccc; font-size:0.9em; margin:0;">${spawnInfo}</p>\n`;
}

indexHtml += `</div>
    </div>
</body>
</html>`;
fs.writeFileSync(path.join(__dirname, 'index.html'), indexHtml);
console.log('Generated index.html');
