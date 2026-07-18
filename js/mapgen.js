// === SETUP SCREEN ===
function renderNameInputs() {
    const count = parseInt(playerCountSelect.value); namesContainer.innerHTML = '';
    for (let i = 0; i < count; i++) namesContainer.innerHTML += `<div class="setup-group" style="margin-top: 5px;"><label style="color: ${playerColors[i]}">Spieler ${i + 1} Name:</label><input type="text" id="p-name-${i}" placeholder="Name eingeben" value="Spieler ${i + 1}"></div>`;
}

// Aktiviert/deaktiviert die Diplomatie/Team-Optionen je nach Spieleranzahl:
// feste Teams brauchen mindestens 2 volle Gruppen der jeweiligen Größe.
function updateTeamModeOptions() {
    const count = parseInt(playerCountSelect.value);
    const opts = {
        diplomacy: count >= 3,
        teams2: count >= 4 && count % 2 === 0,
        teams3: count % 3 === 0 && count / 3 >= 2
    };
    for (const [value, allowed] of Object.entries(opts)) {
        const opt = teamModeSelect.querySelector(`option[value="${value}"]`);
        if (opt) opt.disabled = !allowed;
    }
    if (teamModeSelect.selectedOptions[0]?.disabled) teamModeSelect.value = 'ffa';
}

playerCountSelect.addEventListener('change', () => { renderNameInputs(); updateTeamModeOptions(); });
updateTeamModeOptions();

// === MAP GENERATION ===
// Spawn-Budgets pro Kartengröße: Distanz-Bänder vom eigenen Startdorf für
// garantierte Pro-Spieler-Spawns + Anzahl "umkämpfter" Spawns (Felder, die zu
// den zwei nächsten Spielern etwa gleich weit sind). Die Bänder sind so
// gewählt, dass sie mit den Mindestabständen (Dörfer >= 3, Steine >= 2) auf
// der jeweiligen Kartengröße tatsächlich erfüllbar sind.
const SPAWN_BUDGETS = {
    5: {
        villageBands:      { 2: [[2, 2], [3, 4]], 3: [[2, 2], [3, 4]], 4: [[2, 2], [3, 4]], 5: [[2, 2], [3, 4]], 6: [[2, 2], [3, 4]] },
        contestedVillages: { 2: 2, 3: 2, 4: 1, 5: 0, 6: 0 },
        stoneBands:        { 2: [[2, 2], [4, 5]], 3: [[2, 2], [4, 5]], 4: [[2, 2]], 5: [[2, 2]], 6: [[2, 2]] },
        contestedStones:   { 2: 1, 3: 0, 4: 2, 5: 1, 6: 0 }
    },
    7: {
        villageBands:      { 2: [[2, 2], [3, 4], [6, 7]], 3: [[2, 2], [3, 4], [6, 7]], 4: [[2, 2], [3, 4], [5, 7]], 5: [[2, 2], [3, 4]], 6: [[2, 2], [3, 4]] },
        contestedVillages: { 2: 5, 3: 4, 4: 3, 5: 2, 6: 2 },
        stoneBands:        { 2: [[2, 2], [4, 6]], 3: [[2, 2], [4, 6]], 4: [[2, 2], [4, 6]], 5: [[2, 2], [4, 6]], 6: [[2, 2], [4, 6]] },
        contestedStones:   { 2: 2, 3: 3, 4: 3, 5: 2, 6: 2 }
    },
    12: {
        villageBands:      { 2: [[2, 2], [3, 4], [5, 7], [8, 10]], 3: [[2, 2], [3, 4], [5, 7], [8, 10]], 4: [[2, 2], [3, 4], [5, 7], [8, 10]], 5: [[2, 2], [3, 4], [5, 7]], 6: [[2, 2], [3, 4], [5, 7]] },
        contestedVillages: { 2: 10, 3: 9, 4: 8, 5: 8, 6: 8 },
        stoneBands:        { 2: [[2, 2], [5, 8]], 3: [[2, 2], [5, 8]], 4: [[2, 2], [5, 8]], 5: [[2, 2], [5, 8]], 6: [[2, 2], [5, 8]] },
        contestedStones:   { 2: 3, 3: 3, 4: 4, 5: 4, 6: 4 }
    }
};

// buildInitialGameState: called by both legacy button and server lobby start
// teamMode: 'ffa' (default, kein Bündnis) | 'diplomacy' (freie, manuelle Bündnisse)
//           | 'teams2' | 'teams3' (feste, unveränderliche Teams der jeweiligen Größe)
function buildInitialGameState(playerNames, radius, teamMode = 'ffa') {
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

    // Bei 4 Spielern liegt Index 0 sonst exakt auf einer Hex-Ecke und Index
    // 2 exakt auf der gegenüberliegenden Ecke, während 1/3 auf Kantenmitten
    // landen — Ecke vs. Kantenmitte ist geometrisch nicht gleichwertig
    // (unterschiedlich "spitzer" Sektor), das erzeugt ein systematisches
    // Nachbarschafts-Ungleichgewicht (empirisch geprüft: bis zu 40% mehr
    // Dörfer für die Eck-Spieler). Ein Phasenversatz von 1/6 verschiebt alle
    // 4 Spieler gleichermaßen von den Ecken weg und macht die Sektoren
    // messbar gleich groß (siehe maptest/analyze_maps.js).
    const phaseOffset = count === 4 ? 1 / 6 : 0;

    const startPos = [];
    for (let i = 0; i < count; i++) {
        const sv = ringHexes[Math.round((i + phaseOffset) * ringHexes.length / count) % ringHexes.length];
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
        players.push({ n: (playerNames[i] || '').trim() || `Spieler ${i + 1}`, g: 3, m: 1, s: 0, k: 0, f: [], of: [], u: [], e: [], ue: [], sv: svLoc, dead: 0, sh: 30 });
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
            // Distanz zur Starteinheit (nicht zum Startdorf) — das ist, was für
            // "in N Zügen erreichbar" tatsächlich zählt, da die Einheit läuft.
            const udists = startPos.map(s => hexDistance({ x, y }, { x: s.ux, y: s.uy }));
            let owner = 0;
            for (let i = 1; i < count; i++) if (dists[i] < dists[owner]) owner = i;
            let second = -1;
            for (let i = 0; i < count; i++) if (i !== owner && (second === -1 || dists[i] < dists[second])) second = i;
            const contested = dists[second] - dists[owner] <= 1;
            cells.push({ x, y, dists, udists, owner, contested, pair: Math.min(owner, second) + ',' + Math.max(owner, second) });
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
    // distKey: 'dists' misst vom Startdorf (Standard, für die weiter entfernten
    // Bänder), 'udists' von der Starteinheit — nötig, wenn eine exakte
    // Zugzahl-Distanz garantiert werden soll (z.B. "in 2 Zügen erreichbar").
    // Die Sektor-/Contested-Zuordnung (owner) bleibt immer dorfbasiert, damit
    // die Fairness-Aufteilung der Karte unverändert bleibt.
    const placeForPlayers = (bands, okFn, minSpacing, place, distKey = 'dists') => {
        for (const band of bands) {
            for (const i of shuffled(Array.from({ length: count }, (_, p) => p))) {
                const own = c => c.dists[i] === c.dists[c.owner]; // Spieler i ist nächster (oder gleich naher) Start
                const inBand = c => c[distKey][i] >= band[0] && c[distKey][i] <= band[1];
                const pools = [
                    [c => c.owner === i && !c.contested && inBand(c), minSpacing],
                    [c => own(c) && inBand(c), minSpacing],
                    [c => own(c) && inBand(c), minSpacing - 1],
                    [c => own(c) && c[distKey][i] >= band[0], minSpacing],
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

    // Das jeweils erste (nächste) Dorf/Steinvorkommen wird exakt von der
    // Starteinheit aus bemessen: bei Bewegungsreichweite 1 pro Zug liegt eine
    // Distanz von 2 genau so, dass Zug 1 = hinlaufen (1 Feld), Zug 2 = ankommen
    // + einnehmen (Dorf) bzw. angrenzen (Stein).
    const [firstVillageBand, ...restVillageBands] = budget.villageBands[cnt];
    const [firstStoneBand, ...restStoneBands] = budget.stoneBands[cnt];

    placeForPlayers([firstVillageBand], villageOK, 3, placeVillage, 'udists');
    placeForPlayers(restVillageBands, villageOK, 3, placeVillage);
    placeContested(budget.contestedVillages[cnt], villageOK, 3, placeVillage);
    placeForPlayers([firstStoneBand], stoneOK, 2, placeStone, 'udists');
    placeForPlayers(restStoneBands, stoneOK, 2, placeStone);
    placeContested(budget.contestedStones[cnt], stoneOK, 2, placeStone);

    // uw = Unterwelt-Zustand (M9b/M10/M11): d = gegrabene Hexes (Indizes, wie
    // p[].e/ue — Stollenköpfe zählen NICHT hierzu, die werden aus tu[] abgeleitet,
    // siehe getStollenkopfOwner/isUnderworldOpen in hex.js), u = Tiefeneinheiten,
    // n = Lärm-Marker der letzten Runde, a = angebrochene Kristalladern {"x,y": restH},
    // f = geplünderte Fundkammern {"x,y": 1}, c = Kreaturen {t,x,y,h} (neutral,
    // kein Besitzer), w = Spinnennetze {"x,y": 1}, wd = Alter Wurm dauerhaft tot.
    const state = { sd: seed, bw: size, bh: size, rad: radius, rn: 1, cp: 0, df: null, p: players, v: villages, u: units, st: stones, tw: [], la: [], th: [], tu: [], wa: [], ct: { x: cx, y: cy, ctrl: -1 }, uw: { d: [], u: [], n: [], a: {}, f: {}, w: {} } };

    // Unterwelt-Kreaturen (M11, Platzierung korrigiert Juli 2026): deterministisch
    // aus dem Seed, und IMMER auf offenen Hexes — nie auf massivem Fels/Adern
    // ("Gebirge"). Spinnen in den (Hash-Rang) "besten" natürlichen Kavernen,
    // Steinpanzer auf einem Wach-Hex NEBEN den "reichsten" Adern (ggf. wird die
    // Fels-Tasche daneben vorgegraben, getSteinpanzerGuardHex), Wühler in
    // natürlichen Öffnungen, der Wurm exakt im Herzkaverne-Zentrum (== ct, s.o.).
    // Dichte-Bänder siehe densityForRadius; `used` verhindert Doppelbelegungen.
    const creatures = [];
    const used = new Set([`${cx},${cy}`]); // Zentrum ist für den Wurm reserviert
    const place = (t, x, y) => {
        if (used.has(`${x},${y}`)) return;
        used.add(`${x},${y}`);
        creatures.push({ t, x, y, h: uwCreatureStats[t].hp });
    };
    getSpiderNestHexes(state).forEach(h => place(UWC_SPINNE, h.x, h.y));
    getSteinpanzerVeinHexes(state).forEach(vein => {
        // needsCarve-Taschen landen NICHT in uw.d — sie sind seed-deterministisch
        // und zählen über getSteinpanzerPocketSet (isUnderworldOpen, js/hex.js)
        // als natürlich offen. Unberührte Unterwelt bleibt so 0 Bytes im Blob.
        const guard = getSteinpanzerGuardHex(state, vein);
        if (guard) place(UWC_STEINPANZER, guard.x, guard.y);
    });
    getWuehlerSpawnHexes(state).forEach(h => place(UWC_WUEHLER, h.x, h.y));
    creatures.push({ t: UWC_WURM, x: cx, y: cy, h: uwCreatureStats[UWC_WURM].hp });
    state.uw.c = creatures;

    const teamSize = teamMode === 'teams2' ? 2 : teamMode === 'teams3' ? 3 : 0;
    if (teamSize > 0 && count % teamSize === 0 && count / teamSize >= 2) {
        state.at = 1;
        const idx = Array.from({ length: count }, (_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [idx[i], idx[j]] = [idx[j], idx[i]];
        }
        for (let g = 0; g < count; g += teamSize) {
            const group = idx.slice(g, g + teamSize);
            for (const pid of group) players[pid].al = group.filter(x => x !== pid);
        }
    } else if (teamMode === 'diplomacy') {
        state.dp = 1;
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
    gameState = buildInitialGameState(names, radius, teamModeSelect.value);
    bootGame();
});
