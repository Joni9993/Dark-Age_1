// === HEX GRID CONSTANTS ===
const hexSize = 24;
const hexWidth = Math.sqrt(3) * hexSize;
const hexHeight = 2 * hexSize;
const xOffset = hexWidth;
const yOffset = hexHeight * 0.75;
const thickness = 12;
const yCompress = 0.65;
// terrainColors → js/art.js
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

// === UNTERWELT-TERRAIN (Phase 3, Meilenstein M9a) ===
// Analog zu getTerrainType, aber über einen EIGENEN Hash-Kanal: state.sd wird
// vor dem Hashen gesalzen und pro Hex direkt (nicht sequenziell wie bei den
// Oberflächen-Clustern) verrechnet — dadurch ist die Unterwelt garantiert
// unkorreliert zur Oberfläche (ein Wald-Hex oben sagt nichts über Kaverne/Ader
// darunter aus), bleibt aber vollständig deterministisch aus demselben Seed.
const UW_FELS = 0;      // Standard, massiv — nur durch Graben passierbar (M9b)
const UW_KAVERNE = 1;   // natürliche offene Tasche, vereinzelt, NICHT zusammenhängend
const UW_ADER = 2;      // Kristallader — Fels mit Kristallen, abbaubar (M10)
const UW_RUINE = 3;     // Stollenruine — kleiner, zusammenhängender Korridor-Cluster
const UW_HERZ = 4;      // Herzkaverne — fix, exakt unter dem zentralen Wachturm
const UW_TYPE_NAMES = {
    [UW_FELS]: 'Fels', [UW_KAVERNE]: 'Kaverne', [UW_ADER]: 'Kristallader',
    [UW_RUINE]: 'Stollenruine', [UW_HERZ]: 'Herzkaverne'
};

// Gleiches Hash-Verfahren wie createPRNG (js/prng.js: seed += Konstante, dann
// zwei imul-Runden), aber der Seed wird hier direkt aus state.sd + eigenem
// Salt + (x, y) gebildet statt sequenziell hochgezählt — macht jede Abfrage
// zu einem reinen Per-Hex-Wert ohne Cluster-/Aufruf-Historie. Genau das
// braucht "vereinzelt, nicht zusammenhängend" für Kaverne/Ader.
const UW_SALT = 0x5A17E17E;
function underworldHash(state, x, y, salt) {
    // Math.imul statt `*`: die Faktoren sind hier groß genug, dass ihr Produkt
    // Number.MAX_SAFE_INTEGER (2^53) überschreiten würde — normales `*` rechnet
    // dann in float64 und verliert genau die niedrigwertigen Bits, die
    // Verteilung/Entropie brauchen (führte zu sichtbar geklumpten Ergebnissen,
    // z.B. 0% Kaverne auf kleinen Karten). Math.imul bleibt exakt in Int32,
    // wie createPRNG es intern selbst auch tut.
    let h = (state.sd ^ UW_SALT) | 0;
    h = Math.imul(h, 374761393);
    h = (h + Math.imul(x, 668265263)) | 0;
    h = (h + Math.imul(y, 2147483647)) | 0;
    h = (h + Math.imul(salt, 1000003)) | 0;
    return createPRNG(h)();
}

// Die 6 Kubik-Richtungen (odd-r über oddRToCube/cubeToOddR) — inhaltlich
// dieselben wie mapgen.js' lokale cubeDirs, hier eigenständig dupliziert,
// damit hex.js ohne mapgen.js (z.B. in maptest-Skripten) lauffähig bleibt.
const UW_HEX_DIRS = [
    { x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 },
    { x: -1, y: 1, z: 0 }, { x: -1, y: 0, z: 1 }, { x: 0, y: -1, z: 1 }
];

// Alle Hexes exakt im Kubik-Abstand `radius` um `center` (odd-r). Standard-
// "Hex-Ring"-Algorithmus: `radius` Schritte in eine Startrichtung, danach für
// jede der 6 Richtungen `radius` Schritte weiterlaufen.
function hexRingAround(center, radius) {
    if (radius <= 0) return [{ x: center.x, y: center.y }];
    const c = oddRToCube(center.x, center.y);
    let cur = { x: c.x + UW_HEX_DIRS[4].x * radius, y: c.y + UW_HEX_DIRS[4].y * radius, z: c.z + UW_HEX_DIRS[4].z * radius };
    const out = [];
    for (let side = 0; side < 6; side++) {
        for (let step = 0; step < radius; step++) {
            out.push(cubeToOddR(cur));
            cur = { x: cur.x + UW_HEX_DIRS[side].x, y: cur.y + UW_HEX_DIRS[side].y, z: cur.z + UW_HEX_DIRS[side].z };
        }
    }
    return out;
}

// Herzkaverne: fix unter dem Kartenzentrum — dasselbe Hex wie `ct` in
// js/mapgen.js ({x: radius, y: radius}). Größe an die Kartengröße angepasst:
// Radius 5 → Zentrum + Ring 1 (7 Hexes); größere Karten zusätzlich einzelne
// (nicht alle) Ring-2-/Ring-3-Hexes. Reine Funktion von bw/bh/rad (kein x/y-
// Argument nötig), daher pro Karte gecacht statt bei jeder Abfrage neu gebaut.
const _heartCavernCache = {};
function getHeartCavernHexes(state) {
    const key = `${state.bw}|${state.bh}|${state.rad}`;
    if (_heartCavernCache[key]) return _heartCavernCache[key];

    const cx = Math.floor(state.bw / 2), cy = Math.floor(state.bh / 2);
    const center = { x: cx, y: cy };
    let hexes = [center, ...hexRingAround(center, 1)];

    const rad = state.rad || 5;
    if (rad > 5) {
        // Größere Karten: jedes zweite Ring-2-Hex dazu ("einzelne", kein voller Ring)
        hexRingAround(center, 2).forEach((h, i) => { if (i % 2 === 0) hexes.push(h); });
    }
    if (rad > 8) {
        // Sehr große Karten (Radius 12): zusätzlich jedes dritte Ring-3-Hex
        hexRingAround(center, 3).forEach((h, i) => { if (i % 3 === 0) hexes.push(h); });
    }

    hexes = hexes.filter(h => isInsideMap(state, h.x, h.y));
    _heartCavernCache[key] = hexes;
    return hexes;
}

function isHeartCavernHex(state, x, y) {
    return getHeartCavernHexes(state).some(h => h.x === x && h.y === y);
}

// Stollenruinen: wenige, kleine geradlinige Korridore (2-4 Hexes je Cluster),
// Cluster-Anzahl leicht an die Kartenfläche gekoppelt, aber immer selten
// (2-4 Stück). Eigener, nochmals anders gesalzener PRNG-Strom (state.sd
// bereits fürs Oberflächen-Terrain UND für underworldHash genutzt — ein
// dritter, verschiedener Salt hier hält auch die Ruinen-Lage unkorreliert).
// Reine Funktion von sd/bw/bh, daher gecacht.
const _ruinClusterCache = {};
function getRuinClusters(state) {
    const key = `${state.sd}|${state.bw}|${state.bh}`;
    if (_ruinClusterCache[key]) return _ruinClusterCache[key];

    const count = Math.max(2, Math.min(4, Math.round((state.bw * state.bh) / 130)));
    const rng = createPRNG((state.sd ^ 0x51ED270B) | 0);
    const clusters = [];
    for (let i = 0; i < count; i++) {
        const sx = Math.floor(rng() * state.bw);
        const sy = Math.floor(rng() * state.bh);
        const len = 2 + Math.floor(rng() * 3); // 2-4 Hexes
        const dir = UW_HEX_DIRS[Math.floor(rng() * 6)];
        let cur = oddRToCube(sx, sy);
        const hexes = [];
        for (let s = 0; s < len; s++) {
            const p = cubeToOddR(cur);
            if (isInsideMap(state, p.x, p.y)) hexes.push(p);
            cur = { x: cur.x + dir.x, y: cur.y + dir.y, z: cur.z + dir.z };
        }
        clusters.push(hexes);
    }
    _ruinClusterCache[key] = clusters;
    return clusters;
}

function isRuinHex(state, x, y) {
    return getRuinClusters(state).some(cluster => cluster.some(h => h.x === x && h.y === y));
}

// Fundkammer (M10, PLAN.md Abschn. 2+5): pro Ruinen-Cluster genau EIN Hex —
// deterministisch das letzte Hex des Clusters (kein Zufall nötig, Cluster-
// Reihenfolge/-Länge ist bereits seed-deterministisch, siehe getRuinClusters).
function getFundkammerHexes(state) {
    return getRuinClusters(state).map(cluster => cluster[cluster.length - 1]).filter(Boolean);
}

function isFundkammerHex(state, x, y) {
    return getFundkammerHexes(state).some(h => h.x === x && h.y === y);
}

// Haupt-Typabfrage: Herzkaverne schlägt Ruine schlägt Kaverne/Ader-Hash
// schlägt Fels. Deterministisch aus state.sd (+ eigenem Hash-Kanal) — zweimal
// mit denselben Argumenten aufgerufen liefert immer denselben Typ.
function getUnderworldType(state, x, y) {
    if (isHeartCavernHex(state, x, y)) return UW_HERZ;
    if (isRuinHex(state, x, y)) return UW_RUINE;

    const r = underworldHash(state, x, y, 1);
    if (r < 0.065) return UW_KAVERNE;   // ~6.5% — im Richtwert-Band 5-8%
    if (r < 0.145) return UW_ADER;      // ~8.0% — im Richtwert-Band 6-10%
    return UW_FELS;
}

// Stollenköpfe (M9b): das Unterwelt-Hex unter einem nutzbaren Tunnel-Endpunkt
// (tu[], r <= rn) zählt automatisch als offen + als Stollenkopf des Tunnel-
// Besitzers — wird NICHT in uw.d gespeichert, sondern aus tu[] abgeleitet
// (Tunnel bauen -> sofort offen; Tunnel zerstört -> sofort wieder zu, ohne
// jeden Zustand doppelt pflegen zu müssen).
function getUnderworldTunnelHeads(state) {
    if (!state.tu) return [];
    const heads = [];
    state.tu.forEach(t => {
        if (t.r > state.rn) return; // noch im Bau, kein nutzbarer Kopf
        heads.push({ x: t.x1, y: t.y1, owner: t.o });
        heads.push({ x: t.x2, y: t.y2, owner: t.o });
    });
    return heads;
}

function getStollenkopfOwner(state, x, y) {
    const head = getUnderworldTunnelHeads(state).find(h => h.x === x && h.y === y);
    return head ? head.owner : -1;
}

function isUnderworldTunnelHead(state, x, y) {
    return getStollenkopfOwner(state, x, y) !== -1;
}

// offen = natürlich begehbar (Kaverne/Ruine/Herz) ODER Stollenkopf ODER bereits
// gegraben. `state.uw.d` liegt zur Laufzeit als ARRAY von Indizes vor (gleiche
// Konvention wie p[].e/p[].ue: Array im Speicher, komprimierter Index-String
// nur auf dem Wire — siehe doEndTurn/confirmSurrender/bootGame); der String-
// Zweig hier ist eine defensive Rückfallebene, falls isUnderworldOpen einmal
// vor der bootGame-Dekomprimierung aufgerufen wird.
function isUnderworldOpen(state, x, y) {
    const t = getUnderworldType(state, x, y);
    if (t === UW_KAVERNE || t === UW_RUINE || t === UW_HERZ) return true;
    if (isUnderworldTunnelHead(state, x, y)) return true;
    if (!state.uw || !state.uw.d) return false;
    const idx = y * state.bw + x;
    if (typeof state.uw.d === 'string') return decompressFog(state.uw.d).includes(idx);
    return state.uw.d.includes(idx);
}

// Restbestand einer Kristallader (voller Bestand = 4, 0 = leergegraben/dauerhaft
// offen). Kein Ader-Hex -> 0. Bereits über isUnderworldOpen (uw.d) als leer
// vermerkt -> 0, unabhängig vom (dann gelöschten) uw.a-Eintrag.
function getUWVeinRemaining(state, x, y) {
    if (getUnderworldType(state, x, y) !== UW_ADER) return 0;
    if (isUnderworldOpen(state, x, y)) return 0;
    const key = `${x},${y}`;
    if (state.uw && state.uw.a && state.uw.a[key] !== undefined) return state.uw.a[key];
    return 4; // noch unangebrochen: voller Bestand (Balance-Erstentwurf, siehe PLAN.md)
}
