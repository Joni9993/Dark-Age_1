const fs = require('fs');

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

const count = 6;
const radius = 12;
const size = radius * 2 + 1;

let stats = {
    players: Array.from({length: count}, () => ({
        avgDistToNearest: 0,
        villagesWithin3: 0,
        villagesWithin4: 0,
        villagesWithin5: 0,
        avgDistToNearest3: 0,
        samples: 0
    })),
    mapDiscrepancies: [] // difference between luckiest and unluckiest player per map
};

const NUM_MAPS = 1000;

for (let mapIdx = 0; mapIdx < NUM_MAPS; mapIdx++) {
    const seed = Math.floor(Math.random() * 100000);
    const rng = createPRNG(seed);

    let villages = {};

    const cx = radius; const cy = radius;
    const cubeCenter = oddRToCube(cx, cy);
    const sr = radius - 1;

    const cubeDirs = [
        { x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 }, { x: -1, y: 0, z: 1 }, { x: 0, y: -1, z: 1 }
    ];

    const pIndices = [0, 1, 2, 3, 4, 5];
    const playerStarts = [];

    const startPos = pIndices.map(dirIdx => {
        const svCube = {
            x: cubeCenter.x + cubeDirs[dirIdx].x * sr,
            y: cubeCenter.y + cubeDirs[dirIdx].y * sr,
            z: cubeCenter.z + cubeDirs[dirIdx].z * sr
        };
        const svPos = cubeToOddR(svCube);
        return { vx: svPos.x, vy: svPos.y };
    });

    for (let i = 0; i < count; i++) {
        const svLoc = `${startPos[i].vx},${startPos[i].vy}`;
        villages[svLoc] = i;
        playerStarts.push({x: startPos[i].vx, y: startPos[i].vy});
    }

    const tempState = { bw: size, bh: size, rad: radius };
    let neutralVillages = [];

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
                neutralVillages.push({ x: c.x, y: c.y });
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
        if (valid) { 
            villages[`${nx},${ny}`] = -1; 
            neutralVillages.push({ x: nx, y: ny });
            neutralCount--; 
        }
        attempts++;
    }

    // Analysis for this map
    let mapPlayerStats = [];
    
    for (let i = 0; i < count; i++) {
        const pStart = playerStarts[i];
        const distances = neutralVillages.map(nv => hexDistance(pStart, nv)).sort((a, b) => a - b);
        
        let nearest = distances.length > 0 ? distances[0] : 0;
        let within3 = distances.filter(d => d <= 3).length;
        let within4 = distances.filter(d => d <= 4).length;
        let within5 = distances.filter(d => d <= 5).length;
        let nearest3Avg = distances.length >= 3 ? (distances[0] + distances[1] + distances[2]) / 3 : 0;
        
        mapPlayerStats.push({
            nearest, within3, within4, within5, nearest3Avg
        });
        
        stats.players[i].avgDistToNearest += nearest;
        stats.players[i].villagesWithin3 += within3;
        stats.players[i].villagesWithin4 += within4;
        stats.players[i].villagesWithin5 += within5;
        stats.players[i].avgDistToNearest3 += nearest3Avg;
        stats.players[i].samples++;
    }
    
    // Find discrepancy in this map (Luckiest vs Unluckiest)
    // We define luckiest as lowest avg dist to 3 nearest villages
    const sortedByLuck = [...mapPlayerStats].sort((a, b) => a.nearest3Avg - b.nearest3Avg);
    const luckiest = sortedByLuck[0];
    const unluckiest = sortedByLuck[count - 1];
    
    stats.mapDiscrepancies.push({
        luckiestNearest3Avg: luckiest.nearest3Avg,
        unluckiestNearest3Avg: unluckiest.nearest3Avg,
        diff: unluckiest.nearest3Avg - luckiest.nearest3Avg,
        unluckiestWithin5: unluckiest.within5,
        luckiestWithin5: luckiest.within5
    });
}

// Final aggregation
const aggregated = stats.players.map(p => ({
    avgDistToNearest: (p.avgDistToNearest / p.samples).toFixed(2),
    avgVillagesWithin3: (p.villagesWithin3 / p.samples).toFixed(2),
    avgVillagesWithin4: (p.villagesWithin4 / p.samples).toFixed(2),
    avgVillagesWithin5: (p.villagesWithin5 / p.samples).toFixed(2),
    avgDistToNearest3: (p.avgDistToNearest3 / p.samples).toFixed(2)
}));

const avgDiff = stats.mapDiscrepancies.reduce((sum, d) => sum + d.diff, 0) / NUM_MAPS;
const maxDiff = Math.max(...stats.mapDiscrepancies.map(d => d.diff));
const unluckiestHasZeroWithin5 = stats.mapDiscrepancies.filter(d => d.unluckiestWithin5 === 0).length;

console.log(JSON.stringify({
    aggregated_per_player: aggregated,
    fairness_metrics: {
        average_discrepancy_between_luckiest_and_unluckiest_nearest_3_villages: avgDiff.toFixed(2),
        max_discrepancy_observed: maxDiff.toFixed(2),
        games_where_unluckiest_player_has_0_villages_within_distance_5: unluckiestHasZeroWithin5 + " out of " + NUM_MAPS
    }
}, null, 2));
