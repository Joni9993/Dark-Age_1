// === SETUP SCREEN ===
function renderNameInputs() {
    const count = parseInt(playerCountSelect.value); namesContainer.innerHTML = '';
    for (let i = 0; i < count; i++) namesContainer.innerHTML += `<div class="setup-group" style="margin-top: 5px;"><label style="color: ${playerColors[i]}">Spieler ${i + 1} Name:</label><input type="text" id="p-name-${i}" placeholder="Name eingeben" value="Spieler ${i + 1}"></div>`;
}
playerCountSelect.addEventListener('change', renderNameInputs);

// === MAP GENERATION ===
// Spawn-Budgets pro Kartengröße: Distanz-Bänder vom eigenen Startdorf für
// garantierte Pro-Spieler-Spawns + Anzahl "umkämpfter" Spawns (Felder, die zu
// den zwei nächsten Spielern etwa gleich weit sind). Die Bänder sind so
// gewählt, dass sie mit den Mindestabständen (Dörfer >= 3, Steine >= 2) auf
// der jeweiligen Kartengröße tatsächlich erfüllbar sind.
const SPAWN_BUDGETS = {
    5: {
        villageBands:      { 2: [[3, 3], [3, 4]], 3: [[3, 3], [3, 4]], 4: [[3, 3], [3, 4]], 5: [[3, 3], [3, 4]], 6: [[3, 3], [3, 4]] },
        contestedVillages: { 2: 2, 3: 2, 4: 1, 5: 0, 6: 0 },
        stoneBands:        { 2: [[2, 3], [4, 5]], 3: [[2, 3], [4, 5]], 4: [[2, 3]], 5: [[2, 3]], 6: [[2, 3]] },
        contestedStones:   { 2: 1, 3: 0, 4: 2, 5: 1, 6: 0 }
    },
    7: {
        villageBands:      { 2: [[3, 3], [3, 4], [6, 7]], 3: [[3, 3], [3, 4], [6, 7]], 4: [[3, 3], [3, 4], [5, 7]], 5: [[3, 3], [3, 4]], 6: [[3, 3], [3, 4]] },
        contestedVillages: { 2: 5, 3: 4, 4: 3, 5: 2, 6: 2 },
        stoneBands:        { 2: [[2, 3], [4, 6]], 3: [[2, 3], [4, 6]], 4: [[2, 3], [4, 6]], 5: [[2, 3], [4, 6]], 6: [[2, 3], [4, 6]] },
        contestedStones:   { 2: 2, 3: 3, 4: 3, 5: 2, 6: 2 }
    },
    12: {
        villageBands:      { 2: [[3, 3], [3, 4], [5, 7], [8, 10]], 3: [[3, 3], [3, 4], [5, 7], [8, 10]], 4: [[3, 3], [3, 4], [5, 7], [8, 10]], 5: [[3, 3], [3, 4], [5, 7]], 6: [[3, 3], [3, 4], [5, 7]] },
        contestedVillages: { 2: 10, 3: 9, 4: 8, 5: 8, 6: 8 },
        stoneBands:        { 2: [[2, 3], [5, 8]], 3: [[2, 3], [5, 8]], 4: [[2, 3], [5, 8]], 5: [[2, 3], [5, 8]], 6: [[2, 3], [5, 8]] },
        contestedStones:   { 2: 3, 3: 3, 4: 4, 5: 4, 6: 4 }
    }
};

// buildInitialGameState: called by both legacy button and server lobby start
function buildInitialGameState(playerNames, radius) {
    const count = playerNames.length;
    const size = radius * 2 + 1;
    const seed = Math.floor(Math.random() * 10000);
    const rng = createPRNG(seed);

    let players = []; let villages = {}; let units = [];

    const cx = radius; const cy = radius;
    const center = { x: cx, y: cy };
    const cubeCenter = oddRToCube(cx, cy);
    const sr = radius - 1;

    const cubeDirs = [
        { x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 }, { x: -1, y: 0, z: 1 }, { x: 0, y: -1, z: 1 }
    ];

    // Startdörfer gleichmäßig über den Umfang des Rings bei sr verteilen.
    // Der Ring hat 6*sr Felder (Ecke k liegt bei Index k*sr); für 2/3/6
    // Spieler landen die Starts exakt auf den Ecken wie bisher, für 4/5
    // Spieler sind die Abstände jetzt (nahezu) gleich statt 60°/120° gemischt.
    const ringHexes = [];
    let cur = { x: cubeCenter.x + cubeDirs[0].x * sr, y: cubeCenter.y + cubeDirs[0].y * sr, z: cubeCenter.z + cubeDirs[0].z * sr };
    for (let k = 0; k < 6; k++) {
        const d = cubeDirs[(k + 2) % 6];
        for (let j = 0; j < sr; j++) {
            ringHexes.push(cubeToOddR(cur));
            cur = { x: cur.x + d.x, y: cur.y + d.y, z: cur.z + d.z };
        }
    }

    const startPos = [];
    for (let i = 0; i < count; i++) {
        const sv = ringHexes[Math.round(i * ringHexes.length / count) % ringHexes.length];
        const svCube = oddRToCube(sv.x, sv.y);
        let u = null; // Starteinheit: Nachbarfeld Richtung Kartenmitte
        for (const d of cubeDirs) {
            const n = cubeToOddR({ x: svCube.x + d.x, y: svCube.y + d.y, z: svCube.z + d.z });
            if (!u || hexDistance(n, center) < hexDistance(u, center)) u = n;
        }
        startPos.push({ vx: sv.x, vy: sv.y, ux: u.x, uy: u.y });
    }

    for (let i = 0; i < count; i++) {
        const svLoc = `${startPos[i].vx},${startPos[i].vy}`;
        players.push({ n: (playerNames[i] || '').trim() || `Spieler ${i + 1}`, g: 3, m: 1, s: 0, f: [], of: [], u: [], e: [], sv: svLoc, dead: 0, sh: 30 });
        villages[svLoc] = i;
        units.push({ i: i + 1, p: i, t: 0, x: startPos[i].ux, y: startPos[i].uy, h: 10, a: 0 });
    }

    const tempState = { bw: size, bh: size, rad: radius };

    // Sektor-Zuordnung: jedes Feld gehört dem nächstgelegenen Spieler.
    // Felder, deren Distanz zu den zwei nächsten Spielern sich um <= 1
    // unterscheidet, bilden den umkämpften Pool (fair per Konstruktion).
    const cells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!isInsideMap(tempState, x, y)) continue;
            if (hexDistance({ x, y }, center) >= radius) continue;
            if (x === cx && y === cy) continue; // zentraler Wachturm
            const dists = startPos.map(s => hexDistance({ x, y }, { x: s.vx, y: s.vy }));
            let owner = 0;
            for (let i = 1; i < count; i++) if (dists[i] < dists[owner]) owner = i;
            let second = -1;
            for (let i = 0; i < count; i++) if (i !== owner && (second === -1 || dists[i] < dists[second])) second = i;
            const contested = dists[second] - dists[owner] <= 1;
            cells.push({ x, y, dists, owner, contested, pair: Math.min(owner, second) + ',' + Math.max(owner, second) });
        }
    }

    const shuffled = arr => {
        const a = arr.slice();
        for (let j = a.length - 1; j > 0; j--) {
            const k = Math.floor(rng() * (j + 1));
            [a[j], a[k]] = [a[k], a[j]];
        }
        return a;
    };
    const pickRandom = arr => arr.length ? arr[Math.floor(rng() * arr.length)] : null;

    const villageOK = (x, y, minDist) => {
        for (let key in villages) {
            const [vx, vy] = key.split(',').map(Number);
            if (hexDistance({ x, y }, { x: vx, y: vy }) < minDist) return false;
        }
        return true;
    };

    const stones = [];
    const stoneOK = (x, y, minDist) => {
        if (units.some(u => u.x === x && u.y === y)) return false;
        if (stones.some(s => hexDistance({ x, y }, { x: s.x, y: s.y }) < minDist)) return false;
        for (let key in villages) {
            const [vx, vy] = key.split(',').map(Number);
            if (hexDistance({ x, y }, { x: vx, y: vy }) < minDist) return false;
        }
        return true;
    };

    // Pro Band reihum ein Spawn pro Spieler (Reihenfolge pro Runde zufällig,
    // damit kein Spieler systematisch zuerst wählt). Auf vollen Karten (kleine
    // Karte, viele Spieler) sind fast alle Felder umkämpft und die Abstände
    // knapp — dann wird schrittweise gelockert (umkämpfte Felder erlauben,
    // Mindestabstand senken, Band aufweiten), damit die Anzahl pro Spieler
    // garantiert bleibt.
    const placeForPlayers = (bands, okFn, minSpacing, place) => {
        for (const band of bands) {
            for (const i of shuffled(Array.from({ length: count }, (_, p) => p))) {
                const own = c => c.dists[i] === c.dists[c.owner]; // Spieler i ist nächster (oder gleich naher) Start
                const inBand = c => c.dists[i] >= band[0] && c.dists[i] <= band[1];
                const pools = [
                    [c => c.owner === i && !c.contested && inBand(c), minSpacing],
                    [c => own(c) && inBand(c), minSpacing],
                    [c => own(c) && inBand(c), minSpacing - 1],
                    [c => own(c) && c.dists[i] >= band[0], minSpacing],
                    [c => own(c), minSpacing - 1]
                ];
                for (const [poolFilter, spacing] of pools) {
                    const pick = pickRandom(cells.filter(c => poolFilter(c) && okFn(c.x, c.y, spacing)));
                    if (pick) { place(pick); break; }
                }
            }
        }
    };
    // Umkämpfte Spawns reihum über die Sektorgrenzen (Spielerpaare) verteilen,
    // damit nicht eine Grenze zufällig alles bekommt.
    const placeContested = (n, okFn, minSpacing, place) => {
        const pairs = shuffled([...new Set(cells.filter(c => c.contested).map(c => c.pair))]);
        let k = 0, idle = 0;
        while (n > 0 && idle < pairs.length) {
            const pair = pairs[k % pairs.length]; k++;
            let pick = pickRandom(cells.filter(c => c.contested && c.pair === pair && okFn(c.x, c.y, minSpacing)));
            if (!pick) pick = pickRandom(cells.filter(c => c.contested && c.pair === pair && okFn(c.x, c.y, minSpacing - 1)));
            if (pick) { place(pick); n--; idle = 0; } else idle++;
        }
    };

    const cnt = Math.min(6, Math.max(2, count));
    const budget = SPAWN_BUDGETS[[5, 7, 12].reduce((a, b) => Math.abs(b - radius) < Math.abs(a - radius) ? b : a)];

    const placeVillage = c => { villages[`${c.x},${c.y}`] = -1; };
    const placeStone = c => stones.push({ x: c.x, y: c.y, h: 40 });

    placeForPlayers(budget.villageBands[cnt], villageOK, 3, placeVillage);
    placeContested(budget.contestedVillages[cnt], villageOK, 3, placeVillage);
    placeForPlayers(budget.stoneBands[cnt], stoneOK, 2, placeStone);
    placeContested(budget.contestedStones[cnt], stoneOK, 2, placeStone);

    const state = { sd: seed, bw: size, bh: size, rad: radius, rn: 1, cp: 0, df: null, p: players, v: villages, u: units, st: stones, tw: [], la: [], th: [], tu: [], wa: [], ct: { x: cx, y: cy, ctrl: -1 } };

    if (count >= 4 && count % 2 === 0) {
        state.at = 1;
        const idx = Array.from({ length: count }, (_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [idx[i], idx[j]] = [idx[j], idx[i]];
        }
        for (let i = 0; i < count; i += 2) {
            players[idx[i]].al = [idx[i + 1]];
            players[idx[i + 1]].al = [idx[i]];
        }
    }

    return state;
}

// Legacy button: used in URL mode and for local (no-server) play
startGameBtn.addEventListener('click', () => {
    const count  = parseInt(playerCountSelect.value);
    const radius = parseInt(mapSizeSelect.value);
    const names  = Array.from({ length: count }, (_, i) =>
        (document.getElementById(`p-name-${i}`)?.value.trim()) || `Spieler ${i + 1}`
    );
    gameState = buildInitialGameState(names, radius);
    bootGame();
});
