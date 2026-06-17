// === SETUP SCREEN ===
function renderNameInputs() {
    const count = parseInt(playerCountSelect.value); namesContainer.innerHTML = '';
    for (let i = 0; i < count; i++) namesContainer.innerHTML += `<div class="setup-group" style="margin-top: 5px;"><label style="color: ${playerColors[i]}">Spieler ${i + 1} Name:</label><input type="text" id="p-name-${i}" placeholder="Name eingeben" value="Spieler ${i + 1}"></div>`;
}
playerCountSelect.addEventListener('change', renderNameInputs);

// === MAP GENERATION ===
// buildInitialGameState: called by both legacy button and server lobby start
function buildInitialGameState(playerNames, radius) {
    const count = playerNames.length;
    const size = radius * 2 + 1;
    const seed = Math.floor(Math.random() * 10000);
    const rng = createPRNG(seed);

    let players = []; let villages = {}; let units = [];

    const cx = radius; const cy = radius;
    const cubeCenter = oddRToCube(cx, cy);
    const sr = radius - 1;

    const cubeDirs = [
        { x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 }, { x: -1, y: 0, z: 1 }, { x: 0, y: -1, z: 1 }
    ];

    const pIndices = {
        2: [0, 3],
        3: [0, 2, 4],
        4: [0, 1, 3, 4],
        5: [0, 1, 2, 3, 4],
        6: [0, 1, 2, 3, 4, 5]
    }[count];

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
        players.push({ n: (playerNames[i] || '').trim() || `Spieler ${i + 1}`, g: 3, m: 1, s: 0, f: [], of: [], u: [], e: [], sv: svLoc, dead: 0, sh: 30 });
        villages[svLoc] = i;
        units.push({ i: i + 1, p: i, t: 0, x: startPos[i].ux, y: startPos[i].uy, h: 10, a: 0 });
    }

    const tempState = { bw: size, bh: size, rad: radius };

    // Phase 1: guaranteed starting villages (2 per player at distance 3)
    for (let i = 0; i < count; i++) {
        const svX = startPos[i].vx;
        const svY = startPos[i].vy;
        const svCube = oddRToCube(svX, svY);

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

        let validCandidates = [];
        let minDistOther = 3;
        let minDistStart = 3;

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

        if (validCandidates.length > 0) {
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

    // Phase 2: additional random neutral villages
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

    // Stone placement
    const stones = [];
    const isOccupied = (x, y) => {
        if (units.some(u => u.x === x && u.y === y)) return true;
        if (villages[`${x},${y}`] !== undefined) return true;
        return false;
    };
    const isValidStone = (x, y) => {
        if (!isInsideMap(tempState, x, y)) return false;
        if (hexDistance({ x, y }, { x: cx, y: cy }) >= radius) return false;
        if (isOccupied(x, y)) return false;
        if (stones.some(s => hexDistance({ x, y }, { x: s.x, y: s.y }) < 2)) return false;
        for (let key in villages) {
            const [vx, vy] = key.split(',').map(Number);
            if (hexDistance({ x, y }, { x: vx, y: vy }) < 2) return false;
        }
        return true;
    };

    for (let i = 0; i < count; i++) {
        const [svX, svY] = players[i].sv.split(',').map(Number);
        const svCube = oddRToCube(svX, svY);
        let pick = null;
        for (let ring = 2; ring <= 4 && !pick; ring++) {
            let candidates = [];
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dy = Math.max(-ring, -dx - ring); dy <= Math.min(ring, -dx + ring); dy++) {
                    let dz = -dx - dy;
                    if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) === ring) {
                        const cPos = cubeToOddR({ x: svCube.x + dx, y: svCube.y + dy, z: svCube.z + dz });
                        candidates.push(cPos);
                    }
                }
            }
            for (let j = candidates.length - 1; j > 0; j--) {
                const k = Math.floor(rng() * (j + 1));
                const tmp = candidates[j]; candidates[j] = candidates[k]; candidates[k] = tmp;
            }
            pick = candidates.find(c => isValidStone(c.x, c.y));
        }
        if (pick) stones.push({ x: pick.x, y: pick.y, h: 40 });
    }

    let neutralToPlace = 2 * count;
    let attemptsSt = 0;
    while (neutralToPlace > 0 && attemptsSt < 800) {
        let nx = Math.floor(rng() * size);
        let ny = Math.floor(rng() * size);
        if (isValidStone(nx, ny)) { stones.push({ x: nx, y: ny, h: 40 }); neutralToPlace--; }
        attemptsSt++;
    }

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
