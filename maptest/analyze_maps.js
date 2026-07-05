// Fairness-Analyse der neutralen Spawns (Dörfer + Steine) über alle
// Kartengrößen (Radius 5/7/12) und Spielerzahlen (2-6). Nutzt die echte
// Generierung aus js/mapgen.js via load_game.js — keine Code-Kopie.
//
// Aufruf: node maptest/analyze_maps.js [anzahlMaps]
const loadGameCode = require('./load_game');
const { buildInitialGameState, hexDistance } = loadGameCode();

const NUM_MAPS = parseInt(process.argv[2], 10) || 500;
const results = [];

for (const radius of [5, 7, 12]) {
    for (const count of [2, 3, 4, 5, 6]) {
        let sumVTotal = 0, sumSTotal = 0;
        let sumDiffN3 = 0, maxDiffN3 = 0, sumDiffW5 = 0, zeroW4 = 0;
        let sumStoneDiff = 0, stoneFar = 0;

        for (let m = 0; m < NUM_MAPS; m++) {
            const names = Array.from({ length: count }, (_, i) => `Spieler ${i + 1}`);
            const state = buildInitialGameState(names, radius);

            const starts = state.p.map(p => {
                const [x, y] = p.sv.split(',').map(Number);
                return { x, y };
            });
            const neutral = Object.keys(state.v)
                .filter(k => state.v[k] === -1)
                .map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; });

            const per = starts.map(s => {
                const dv = neutral.map(v => hexDistance(s, v)).sort((a, b) => a - b);
                const ds = state.st.map(st => hexDistance(s, st)).sort((a, b) => a - b);
                return {
                    n3: dv.length >= 3 ? (dv[0] + dv[1] + dv[2]) / 3 : 99,
                    w4: dv.filter(d => d <= 4).length,
                    w5: dv.filter(d => d <= 5).length,
                    stNear: ds.length ? ds[0] : 99
                };
            });

            const n3s = per.map(p => p.n3), w5s = per.map(p => p.w5);
            const dN3 = Math.max(...n3s) - Math.min(...n3s);
            sumDiffN3 += dN3;
            if (dN3 > maxDiffN3) maxDiffN3 = dN3;
            sumDiffW5 += Math.max(...w5s) - Math.min(...w5s);
            if (Math.min(...per.map(p => p.w4)) === 0) zeroW4++;
            const sts = per.map(p => p.stNear);
            sumStoneDiff += Math.max(...sts) - Math.min(...sts);
            if (Math.max(...sts) > 4) stoneFar++;
            sumVTotal += neutral.length;
            sumSTotal += state.st.length;
        }

        results.push({
            radius, count,
            avgNeutralVillages: (sumVTotal / NUM_MAPS).toFixed(1),
            avgStones: (sumSTotal / NUM_MAPS).toFixed(1),
            avgDiff_nearest3Villages: (sumDiffN3 / NUM_MAPS).toFixed(2),
            maxDiff_nearest3Villages: maxDiffN3.toFixed(2),
            avgDiff_villagesWithin5: (sumDiffW5 / NUM_MAPS).toFixed(2),
            pct_playerZeroVillagesWithin4: (zeroW4 / NUM_MAPS * 100).toFixed(1) + '%',
            avgDiff_nearestStone: (sumStoneDiff / NUM_MAPS).toFixed(2),
            pct_playerNearestStoneOver4: (stoneFar / NUM_MAPS * 100).toFixed(1) + '%'
        });
    }
}

console.table(results);
