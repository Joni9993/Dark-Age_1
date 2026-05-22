const fs = require('fs');
const path = require('path');

function createPRNG(seed) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }

function oddRToCube(x, y) { const cx = x - (y - (y & 1)) / 2; const cz = y; return { x: cx, y: -cx - cz, z: cz }; }
function hexDistance(p1, p2) { const a = oddRToCube(p1.x, p1.y); const b = oddRToCube(p2.x, p2.y); return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)); }

function isInsideMap(state, x, y) {
    if (x < 0 || x >= state.bw || y < 0 || y >= state.bh) return false;
    if (state.rad === undefined) return true;
    const cx = Math.floor(state.bw / 2);
    const cy = Math.floor(state.bh / 2);
    return hexDistance({ x, y }, { x: cx, y: cy }) <= state.rad;
}

function cubeToOddR(cube) {
    const col = cube.x + (cube.z - (cube.z & 1)) / 2;
    const row = cube.z;
    return { x: col, y: row };
}

function compressFog(arr) {
    if (!arr || arr.length === 0) return "";
    let max = Math.max(...arr);
    let hex = "";
    for (let i = 0; i <= max; i += 4) {
        let val = 0;
        if (arr.includes(i)) val |= 1;
        if (arr.includes(i + 1)) val |= 2;
        if (arr.includes(i + 2)) val |= 4;
        if (arr.includes(i + 3)) val |= 8;
        hex += val.toString(16);
    }
    return hex.replace(/0+$/, '');
}

const count = 6;
const radius = 12;
const size = radius * 2 + 1;

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
        <p>6 Players, Radius 12 (Groß), Fog of War: Deaktiviert.</p>
        <div style="display: flex; flex-wrap: wrap; justify-content: center;">
`;

for (let mapIdx = 1; mapIdx <= 10; mapIdx++) {
    const seed = Math.floor(Math.random() * 100000);
    const rng = createPRNG(seed);

    let players = []; let villages = {}; let units = [];

    const cx = radius; const cy = radius;
    const cubeCenter = oddRToCube(cx, cy);
    const sr = radius - 1;

    const cubeDirs = [
        { x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 }, { x: -1, y: 0, z: 1 }, { x: 0, y: -1, z: 1 }
    ];

    const pIndices = [0, 1, 2, 3, 4, 5];

    const startPos = pIndices.map(dirIdx => {
        const svCube = {
            x: cubeCenter.x + cubeDirs[dirIdx].x * sr,
            y: cubeCenter.y + cubeDirs[dirIdx].y * sr,
            z: cubeCenter.z + cubeDirs[dirIdx].z * sr
        };
        const svPos = cubeToOddR(svCube);

        const uCube = {
            x: cubeCenter.x + cubeDirs[dirIdx].x * (sr - 1),
            y: cubeCenter.y + cubeDirs[dirIdx].y * (sr - 1),
            z: cubeCenter.z + cubeDirs[dirIdx].z * (sr - 1)
        };
        const uPos = cubeToOddR(uCube);

        return { vx: svPos.x, vy: svPos.y, ux: uPos.x, uy: uPos.y };
    });

    for (let i = 0; i < count; i++) {
        const svLoc = `${startPos[i].vx},${startPos[i].vy}`;
        players.push({ n: `Spieler ${i + 1}`, g: 3, m: 1, f: [], of: [], u: [], e: [], sv: svLoc, dead: 0, sh: 30 });
        villages[svLoc] = i;
        units.push({ i: i + 1, p: i, t: 0, x: startPos[i].ux, y: startPos[i].uy, h: 10, a: 0 });
    }

    const tempState = { bw: size, bh: size, rad: radius };

    // Phase 1: Garantierte Start-Dörfer (2 pro Spieler in Distanz 3)
    for (let i = 0; i < count; i++) {
        const svX = startPos[i].vx;
        const svY = startPos[i].vy;
        const svCube = oddRToCube(svX, svY);

        // Alle Felder in exakt Distanz 3 sammeln
        let candidates = [];
        for (let dx = -3; dx <= 3; dx++) {
            for (let dy = Math.max(-3, -dx - 3); dy <= Math.min(3, -dx + 3); dy++) {
                let dz = -dx - dy;
                if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) === 3) {
                    const candidateCube = { x: svCube.x + dx, y: svCube.y + dy, z: svCube.z + dz };
                    const candidatePos = cubeToOddR(candidateCube);
                    candidates.push(candidatePos);
                }
            }
        }

        // Kandidaten filtern (in der Map, nicht auf dem Rand, min. Abstand 3 zu anderen Dörfern)
        let validCandidates = [];
        let minDistOther = 3;
        let minDistStart = 3;

        // Robustes Fallback-System bei Platzmangel
        while (validCandidates.length < 2 && minDistOther >= 0) {
            validCandidates = candidates.filter(c => {
                let valid = isInsideMap(tempState, c.x, c.y);
                if (hexDistance(c, { x: cx, y: cy }) >= radius) valid = false;
                if (valid) {
                    for (let key in villages) {
                        let [vx, vy] = key.split(',').map(Number);
                        let isStartVillage = false;
                        for (let pIdx = 0; pIdx < count; pIdx++) {
                            if (startPos[pIdx].vx === vx && startPos[pIdx].vy === vy) {
                                isStartVillage = true;
                                break;
                            }
                        }
                        let minDist = isStartVillage ? minDistStart : minDistOther;
                        if (hexDistance(c, { x: vx, y: vy }) < minDist) valid = false;
                    }
                }
                return valid;
            });

            if (validCandidates.length < 2) {
                minDistOther--;
                if (minDistOther < 2) minDistStart = 2;
            }
        }

        // Shuffle und die ersten 2 platzieren
        if (validCandidates.length > 0) {
            // Fisher-Yates shuffle mit dem deterministischen PRNG
            for (let j = validCandidates.length - 1; j > 0; j--) {
                const k = Math.floor(rng() * (j + 1));
                const temp = validCandidates[j];
                validCandidates[j] = validCandidates[k];
                validCandidates[k] = temp;
            }
            
            const toPlace = Math.min(2, validCandidates.length);
            for (let j = 0; j < toPlace; j++) {
                const c = validCandidates[j];
                villages[`${c.x},${c.y}`] = -1;
            }
        }
    }

    // Phase 2: Zusätzliche zufällige Dörfer (1/3 mehr insgesamt)
    const totalNeutralTarget = Math.floor((radius + count + 1) * 4 / 3);
    let placedNeutral = Object.values(villages).filter(v => v === -1).length;
    let neutralCount = Math.max(0, totalNeutralTarget - placedNeutral);
    let attempts = 0;

    while (neutralCount > 0 && attempts < 400) {
        let nx = Math.floor(rng() * size);
        let ny = Math.floor(rng() * size);

        let valid = isInsideMap(tempState, nx, ny);
        if (hexDistance({ x: nx, y: ny }, { x: cx, y: cy }) >= radius) valid = false;

        if (valid) {
            for (let key in villages) {
                let [vx, vy] = key.split(',').map(Number);
                if (hexDistance({ x: nx, y: ny }, { x: vx, y: vy }) < 3) valid = false;
            }
        }
        if (valid) { villages[`${nx},${ny}`] = -1; neutralCount--; }
        attempts++;
    }

    let gameState = { sd: seed, bw: size, bh: size, rad: radius, rn: 1, cp: 0, df: null, p: players, v: villages, u: units, la: [], th: [], tu: [], wa: [] };

    let allTiles = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (isInsideMap(tempState, x, y)) {
                allTiles.push(y * size + x);
            }
        }
    }

    gameState.p.forEach(p => {
        p.e = compressFog(allTiles);
    });

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

    fs.writeFileSync(path.join(__dirname, 'maptest', `map_${mapIdx}.html`), htmlContent);
    console.log(`Generated map_${mapIdx}.html`);
    
    indexHtml += `<a href="map_${mapIdx}.html">Map ${mapIdx}</a>\n`;
    const spawnInfo = players.map(p => `${p.n} (${p.sv})`).join(', ');
    indexHtml += `<p style="color:#ccc; font-size:0.9em; margin:0;">${spawnInfo}</p>\n`;
}

indexHtml += `</div>
    </div>
</body>
</html>`;
fs.writeFileSync(path.join(__dirname, 'maptest', 'index.html'), indexHtml);
console.log('Generated index.html');
