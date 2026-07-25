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
        // 4/5/6 Spieler: zweites, weiter entferntes Band [4,5] ergänzt
        // (Korrektur Juli 2026, "Sauberkeit garantieren, Budget senken") —
        // seit dem harten Mindestabstand-Boden (nie berühren) liefert die
        // Nah-Spawn-Zone auf Radius 5 mit 4+ Spielern oft keinen Stein mehr,
        // das zweite Band hat mehr Luft und gleicht das etwas aus.
        stoneBands:        { 2: [[2, 2], [4, 5]], 3: [[2, 2], [4, 5]], 4: [[2, 2], [4, 5]], 5: [[2, 2], [4, 5]], 6: [[2, 2], [4, 5]] },
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
            const diff = dists[second] - dists[owner];
            const contested = diff <= 1;
            cells.push({ x, y, dists, udists, owner, contested, diff, pair: Math.min(owner, second) + ',' + Math.max(owner, second) });
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

    // villageOK prüft symmetrisch zu stoneOK jetzt auch gegen bestehende Steine
    // (vorher nur gegen andere Dörfer) — sonst konnte ein Dorf aus einem
    // späteren Band direkt neben einem schon platzierten Stein landen, ohne
    // jeden Mindestabstand (stoneOK verhinderte umgekehrt schon immer, dass ein
    // Stein neben einem Dorf landet, aber nicht andersrum). `stones` wird erst
    // unten deklariert, aber als Closure erst beim tatsächlichen Aufruf von
    // villageOK gelesen (Closure), nicht beim Definieren — also unproblematisch.
    const villageOK = (x, y, minDist) => {
        for (let key in villages) {
            const [vx, vy] = key.split(',').map(Number);
            if (hexDistance({ x, y }, { x: vx, y: vy }) < minDist) return false;
        }
        if (stones.some(s => hexDistance({ x, y }, { x: s.x, y: s.y }) < minDist)) return false;
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
                // Harter Boden bei 2 (Korrektur Juli 2026, Jonathan: "Sauberkeit
                // garantieren, Budget senken"): Mindestabstand darf NIE unter 2
                // fallen — direktes Nebeneinander (Distanz 1) wird nicht mehr
                // als letzter Ausweg akzeptiert. Auf sehr engen Karten (Radius 5
                // mit 4+ Spielern, Radius 7 mit 6 Spielern) bedeutet das: lieber
                // WENIGER Dörfer/Steine als budgetiert als geklumpte/berührende
                // Platzierung — die Anzahl gibt nach, nicht der Abstand.
                const pools = [
                    [c => c.owner === i && !c.contested && inBand(c), minSpacing],
                    [c => own(c) && inBand(c), minSpacing],
                    [c => own(c) && inBand(c), Math.max(minSpacing - 1, 2)],
                    [c => own(c) && c[distKey][i] >= band[0], minSpacing],
                    [c => own(c), Math.max(minSpacing - 1, 2)]
                ];
                // farthestPick statt pickRandom (Korrektur Juli 2026, gleicher
                // Grund wie bei placeContested/Nah-Spawn oben): reiner
                // Zufalls-Pick aus dem Pool ignoriert, wie dicht es rundherum
                // schon ist, und lässt so trotz eingehaltenem Mindestabstand
                // Klumpen entstehen, sobald mehrere unabhängige Aufrufe (andere
                // Spieler, andere Bänder) zufällig densel­ben Bereich treffen.
                for (const [poolFilter, spacing] of pools) {
                    const pick = farthestPick(cells.filter(c => poolFilter(c) && okFn(c.x, c.y, spacing)));
                    if (pick) { place(pick); break; }
                }
            }
        }
    };
    // Umkämpfte Spawns: Budget proportional zur Poolgröße jeder Spieler-Paar-
    // Grenze verteilen (statt striktem Reihum) UND innerhalb jeder Grenze
    // stratifiziert entlang ihrer Länge ziehen (ein Kandidat pro gleich großem
    // Abschnitt der Grenzlinie) statt rein zufällig aus dem Gesamtpool zu
    // picken. Poisson-Disc/Blue-Noise-Prinzip aus der Recherche zu prozeduraler
    // Objektverteilung: reines Zufalls-Sampling erzeugt Klumpen an manchen
    // Stellen und Lücken an anderen, Stratifizierung + "greedy farthest point"
    // (siehe farthestPick unten) verteilt gleichmäßiger über die volle
    // Fläche/Länge. Behebt drei sichtbare Bugs: (1) bei 2 Spielern gibt es nur
    // EINE Grenze (die Mittelsenkrechte übers ganze Kartenzentrum) — die bekam
    // bisher das komplette Kontest-Budget auf einen zufälligen Fleck der Linie
    // geklumpt statt über ihre volle Länge verteilt; (2) auf engen Karten mit
    // mehreren Spielern klumpten mehrere Dörfer/Steine derselben Grenze aus
    // demselben Grund in eine Ecke; (3) bei 3+ Spielern laufen die Grenzen
    // ALLER Nachbar-Paare geometrisch nahe am Kartenzentrum zusammen — jedes
    // Paar für sich hielt zwar seinen eigenen Mindestabstand ein, aber mehrere
    // unabhängig voneinander "knapp genug" platzierte Punkte verschiedener
    // Paare bildeten in Summe trotzdem einen Klumpen genau am Hub. Reines
    // Distanz-Prüfen (>= minSpacing) reicht dagegen nicht: es lässt jeden
    // einzelnen Pick isoliert zu, ohne auf die schon entstandene lokale Dichte
    // zu achten — "greedy farthest point" wählt stattdessen je Pick den
    // Kandidaten mit dem GRÖSSTEN Mindestabstand zu alles bereits Platzierten,
    // was solche Hub-Ansammlungen von mehreren Paaren aktiv vermeidet.
    const farthestPick = candidates => {
        if (!candidates.length) return null;
        let best = null, bestScore = -1;
        for (const c of shuffled(candidates)) {
            let minD = Infinity;
            for (const key in villages) {
                const [vx, vy] = key.split(',').map(Number);
                minD = Math.min(minD, hexDistance(c, { x: vx, y: vy }));
            }
            for (const s of stones) minD = Math.min(minD, hexDistance(c, s));
            if (minD > bestScore) { bestScore = minD; best = c; }
        }
        return best;
    };
    const placeContested = (n, okFn, minSpacing, place) => {
        // Die exakte Gleichstand-Zone (c.contested, Toleranz ±1) ist geometrisch
        // eine hauchdünne Linie quer über die Karte — bei 2 Spielern nur ~2
        // Hexes breit auf einer 25 breiten Karte, unabhängig davon, wie gut man
        // ENTLANG dieser Linie verteilt (empirisch geprüft: Toleranz skaliert
        // linear, ±1 → Breite 2, ±5 → Breite nur 6). Für `placeContested`
        // deshalb eine bewusst breitere, radiusabhängige Toleranz (~halber
        // Radius) statt der strikten `contested`-Flag — verwandelt die Linie in
        // ein echtes Band, sodass "greedy farthest point" (2D-Distanz, nicht
        // nur entlang der Grenze) auch in der Breite streuen kann. `pair`
        // (welche zwei Spieler am nächsten sind) bleibt exakt wie zuvor — nur
        // die Breite des als "Grenze" akzeptierten Bereichs wächst.
        const wideThreshold = Math.max(1, Math.round(radius / 2));
        const pairKeys = [...new Set(cells.filter(c => c.diff <= wideThreshold).map(c => c.pair))];
        if (pairKeys.length === 0 || n <= 0) return;

        // "Entlang der Grenze"-Koordinate: Projektion auf die Senkrechte zur
        // Verbindungslinie der beiden Startdörfer, in Kubik-Koordinaten (x/y,
        // z ist redundant). Rein geometrisch, KEIN getHexCenter/Pixel-Wert —
        // mapgen.js muss auch ohne render.js/globals.js laufen (maptest/).
        const villageCube = startPos.map(s => oddRToCube(s.vx, s.vy));
        const alongBorder = (pairKey, cell) => {
            const [a, b] = pairKey.split(',').map(Number);
            const A = villageCube[a], B = villageCube[b];
            const dirX = -(B.y - A.y), dirY = (B.x - A.x);
            const c = oddRToCube(cell.x, cell.y);
            return (c.x - A.x) * dirX + (c.y - A.y) * dirY;
        };

        const pools = shuffled(pairKeys).map(pair => ({
            pair,
            sorted: shuffled(cells.filter(c => c.diff <= wideThreshold && c.pair === pair))
                .sort((a, b) => alongBorder(pair, a) - alongBorder(pair, b))
        }));
        const totalPool = pools.reduce((s, p) => s + p.sorted.length, 0);

        // Quote pro Grenze proportional zur Poolgröße (Rundungsreste reihum
        // nachverteilt) — sonst würde bei 2 Spielern (1 Grenze) oder sehr
        // ungleich großen Grenzen weiterhin alles bzw. zu viel auf eine Grenze
        // fallen.
        const quotas = pools.map(p => Math.floor(n * p.sorted.length / totalPool));
        let leftover = n - quotas.reduce((s, q) => s + q, 0);
        for (let i = 0; leftover > 0; i = (i + 1) % pools.length, leftover--) quotas[i]++;

        let placedTotal = 0;
        pools.forEach((poolObj, idx) => {
            const quota = Math.min(quotas[idx], poolObj.sorted.length);
            if (quota <= 0) return;
            const bucketSize = poolObj.sorted.length / quota;
            for (let b = 0; b < quota; b++) {
                const from = Math.floor(b * bucketSize), to = Math.floor((b + 1) * bucketSize);
                const bucket = poolObj.sorted.slice(from, to);
                // Harter Boden bei 2 (nie berühren, siehe placeForPlayers oben) —
                // wenn selbst das nicht passt, bleibt der Bucket/diese Grenze
                // leer statt zu klumpen; `missing` unten füllt ggf. aus anderen
                // Grenzen auf, sonst bleibt `n` schlicht unterschritten.
                const pick = farthestPick(bucket.filter(c => okFn(c.x, c.y, minSpacing)))
                    || farthestPick(bucket.filter(c => okFn(c.x, c.y, Math.max(minSpacing - 1, 2))))
                    || farthestPick(poolObj.sorted.filter(c => okFn(c.x, c.y, Math.max(minSpacing - 1, 2))));
                if (pick) { place(pick); placedTotal++; }
            }
        });

        // Fallback: falls einzelne Grenzen/Buckets trotz Lockerung leer
        // blieben, restliche Slots aus dem GESAMTEN umkämpften Pool auffüllen,
        // aber NIE unter Mindestabstand 2 (nie berühren) — reicht der Platz auf
        // sehr engen Karten trotzdem nicht, bleibt `n` bewusst unterschritten
        // statt zu klumpen (Korrektur Juli 2026, "Sauberkeit statt Budget").
        let missing = n - placedTotal;
        if (missing > 0) {
            const allCells = cells.filter(c => c.diff <= wideThreshold);
            for (const minD of [minSpacing, Math.max(minSpacing - 1, 2)]) {
                while (missing > 0) {
                    const pick = farthestPick(allCells.filter(c => okFn(c.x, c.y, minD)));
                    if (!pick) break;
                    place(pick); missing--;
                }
            }
        }
    };

    const cnt = Math.min(6, Math.max(2, count));
    const budget = SPAWN_BUDGETS[[5, 7, 12].reduce((a, b) => Math.abs(b - radius) < Math.abs(a - radius) ? b : a)];

    const placeVillage = c => { villages[`${c.x},${c.y}`] = -1; };
    const placeStone = c => stones.push({ x: c.x, y: c.y, h: 40 });

    // Nah-Spawn (Korrektur Juli 2026, Jonathan: erst Ring 1, dann Ring 2, jetzt
    // Ring 3; danach "Sauberkeit garantieren, Budget senken" statt harter
    // Zahlen-Garantie): ZIEL 2 Dörfer + 1 Stein exakt 3 Hexes vom eigenen
    // Startdorf entfernt (`hexRingAround`, js/hex.js), aber NUR aus der Hälfte
    // der 18 Ring-3-Felder, die nicht weiter von der Kartenmitte entfernt liegt
    // als das Dorf selbst ("nicht hinter dem Dorf") — sortiert nach Nähe zur
    // Mitte, sodass die nächstgelegenen (Richtung Mitte oder leicht seitlich
    // davon) zuerst gezogen werden. Direkte Dorf-Nachbarn (Ring 1) scheiden
    // grundsätzlich aus: von den 6 Nachbarn ist geometrisch IMMER nur genau
    // einer näher an der Mitte als das Dorf, und den besetzt schon die
    // Starteinheit — jede Wahl unter den übrigen 5 hätte zwangsläufig Richtung
    // Kartenrand gezeigt. Nutzt villageOK/stoneOK mit minDist 2 (mind. 1 Hex
    // Abstand, auch untereinander — beide Funktionen prüfen symmetrisch gegen
    // Dörfer UND Steine): bei Ring 3 ist die eigene Distanz zum Startdorf
    // selbst exakt 3, das ist NIE < 2, also kein Selbstausschluss nötig.
    // "Richtung Mitte" zeigt bei benachbarten Spielern zwangsläufig auch
    // "Richtung Nachbar" — auf engen Karten (Radius 5 mit 4+ Spielern, Radius 7
    // mit 6 Spielern) laufen zwei Nah-Spawn-Zonen deshalb ineinander (derselbe
    // Hub-Konvergenz-Effekt wie bei `placeContested` oben, hier zwischen
    // Nachbarspielern statt zwischen Sektor-Grenzen). Gegenmaßnahme 1: pro
    // Distanz-zu-Mitte-Stufe (Tier, erhält weiter die Richtungspräferenz) den
    // `farthestPick`-Kandidaten wählen — den mit dem größten Mindestabstand zu
    // ALLEN bereits platzierten Villages/Stones — bevor zur nächsten (weiter
    // entfernten) Stufe gewechselt wird. Gegenmaßnahme 2 (siehe minDist-Schleife
    // unten): KEIN Fallback auf minDist 1 mehr — auf den engsten Karten bekommt
    // ein Spieler dadurch ggf. nur 1 (oder 0) Nah-Dörfer bzw. keinen Nah-Stein
    // statt der vollen 2+1 (empirisch: auf Radius 5 mit 5-6 Spielern und Radius
    // 7 mit 6 Spielern betrifft das praktisch jeden Spieler) — bewusst
    // hingenommen, weil geklumpte/berührende Platzierung schlechter aussieht
    // als weniger Spawns.
    for (let i = 0; i < count; i++) {
        const { vx, vy } = startPos[i];
        const distV = hexDistance({ x: vx, y: vy }, center);
        const candidates = hexRingAround({ x: vx, y: vy }, 3)
            .filter(n => isInsideMap(tempState, n.x, n.y) && hexDistance(n, center) <= distV);
        const tierOrder = [...new Set(candidates.map(c => hexDistance(c, center)))].sort((a, b) => a - b);
        const tierOf = d => candidates.filter(c => hexDistance(c, center) === d);

        // Harter Boden bei 2 (Korrektur Juli 2026, Jonathan: "Sauberkeit
        // garantieren, Budget senken" statt die alte Garantie "immer 2 Dörfer +
        // 1 Stein" um jeden Preis): kein Fallback auf minDist 1 mehr. Auf sehr
        // engen Karten (Radius 5 mit 4+ Spielern, Radius 7 mit 6 Spielern)
        // bekommt ein Spieler dann ggf. nur 1 (oder 0) Nah-Dörfer bzw. keinen
        // Nah-Stein statt der vollen 2+1 — lieber weniger als geklumpt/berührend.
        const villageSlots = [];
        for (const minDist of [2]) {
            if (villageSlots.length >= 2) break;
            for (const d of tierOrder) {
                if (villageSlots.length >= 2) break;
                while (villageSlots.length < 2) {
                    const pool = tierOf(d).filter(c =>
                        !villageSlots.some(v => v.x === c.x && v.y === c.y) &&
                        villageOK(c.x, c.y, minDist) && !units.some(u => u.x === c.x && u.y === c.y));
                    const pick = farthestPick(pool);
                    if (!pick) break;
                    villageSlots.push(pick);
                    placeVillage(pick);
                }
            }
        }
        let stoneSlot = null;
        for (const minDist of [2]) {
            if (stoneSlot) break;
            for (const d of tierOrder) {
                stoneSlot = farthestPick(tierOf(d).filter(c => stoneOK(c.x, c.y, minDist)));
                if (stoneSlot) break;
            }
        }
        if (stoneSlot) placeStone(stoneSlot);
    }

    const [, ...restVillageBands] = budget.villageBands[cnt];
    const [, ...restStoneBands] = budget.stoneBands[cnt];

    placeForPlayers(restVillageBands, villageOK, 3, placeVillage);
    placeContested(budget.contestedVillages[cnt], villageOK, 3, placeVillage);
    placeForPlayers(restStoneBands, stoneOK, 2, placeStone);
    placeContested(budget.contestedStones[cnt], stoneOK, 2, placeStone);

    // uw = Unterwelt-Zustand (M9b/M10/M11): d = gegrabene Hexes (Indizes, wie
    // p[].e/ue — Stollenköpfe zählen NICHT hierzu, die werden aus tu[] abgeleitet,
    // siehe getStollenkopfOwner/isUnderworldOpen in hex.js), u = Tiefeneinheiten,
    // n = Lärm-Marker der letzten Runde, a = angebrochene Kristalladern {"x,y": restH},
    // f = geplünderte Fundkammern {"x,y": 1}, c = Kreaturen {t,x,y,h} (neutral,
    // kein Besitzer), w = Spinnennetze {"x,y": 1}, wd = Alter Wurm dauerhaft tot.
    const state = { sd: seed, bw: size, bh: size, rad: radius, rn: 1, cp: 0, df: null, p: players, v: villages, u: units, st: stones, tw: [], la: [], th: [], tu: [], wa: [], ct: { x: cx, y: cy, ctrl: -1 }, uw: { d: [], u: [], n: [], a: {}, f: {}, w: {}, dr: {}, dy: [] } };

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
