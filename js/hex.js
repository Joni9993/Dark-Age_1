// === HEX GRID CONSTANTS ===
const hexSize = 24;
const hexWidth = Math.sqrt(3) * hexSize;
const hexHeight = 2 * hexSize;
const xOffset = hexWidth;
const yOffset = hexHeight * 0.75;
const thickness = 12;
const yCompress = 0.65;
const terrainColors = {
    grass: { top: "#2e3b32", side: "#1a241d" },
    forest: { top: "#1b261c", side: "#0d140e" },
    hill: { top: "#5a4d40", side: "#3b2e22", sideBottom: "#2b1e14" },
    black: { top: "#000", side: "#000" }
};
const hillThickness = thickness * 2;

// === HEX MATH ===
function oddRToCube(x, y) {
    const cx = x - (y - (y & 1)) / 2;
    const cz = y;
    return { x: cx, y: -cx - cz, z: cz };
}

function cubeToOddR(cube) {
    const col = cube.x + (cube.z - (cube.z & 1)) / 2;
    const row = cube.z;
    return { x: col, y: row };
}

function hexDistance(p1, p2) {
    const a = oddRToCube(p1.x, p1.y);
    const b = oddRToCube(p2.x, p2.y);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

function isInsideMap(state, x, y) {
    if (x < 0 || x >= state.bw || y < 0 || y >= state.bh) return false;
    if (state.rad === undefined) return true;
    const cx = Math.floor(state.bw / 2);
    const cy = Math.floor(state.bh / 2);
    return hexDistance({ x, y }, { x: cx, y: cy }) <= state.rad;
}

function getNeighbors(x, y) {
    const isOdd = y % 2 !== 0;
    const offsets = isOdd
        ? [[1, 0], [0, -1], [-1, 0], [0, 1], [1, -1], [1, 1]]
        : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
    return offsets.map(o => ({ x: x + o[0], y: y + o[1] })).filter(n => isInsideMap(gameState, n.x, n.y));
}

function getTerrainType(state, x, y) {
    const rng = createPRNG(state.sd);
    const clusters = [];
    const numClusters = Math.floor((state.bw * state.bh) / 10);
    for (let i = 0; i < numClusters; i++) {
        clusters.push({
            x: Math.floor(rng() * state.bw),
            y: Math.floor(rng() * state.bh),
            type: rng() > 0.5 ? 'forest' : 'hill',
            radius: 1 + Math.floor(rng() * 1.5)
        });
    }
    let tType = 'grass';
    for (let c of clusters) {
        if (hexDistance({ x, y }, { x: c.x, y: c.y }) <= c.radius) tType = c.type;
    }
    return tType;
}

function getHexCenter(x, y) {
    return {
        px: (x + 0.5 * (y % 2)) * xOffset + (hexWidth / 2) + 10,
        py: (y * yOffset + (hexHeight / 2) + 10) * yCompress
    };
}
