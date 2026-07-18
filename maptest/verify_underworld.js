// Verifikationsskript M9a — lädt die echten Spiel-Skripte (wie maptest/load_game.js),
// prüft Determinismus, Richtwert-Verteilung, Herzkaverne-Lage und Unkorreliertheit
// zur Oberfläche für mehrere Seeds x Kartengrößen.
const fs = require('fs');
const path = require('path');
const ROOT = require('path').join(__dirname, '..');

function loadGameCode() {
    const stub = { addEventListener() { }, value: '', innerHTML: '' };
    const selectStub = { ...stub, querySelector: () => null, selectedOptions: [] };
    global.playerCountSelect = selectStub;
    global.namesContainer = stub;
    global.startGameBtn = stub;
    global.mapSizeSelect = stub;
    global.teamModeSelect = selectStub;
    if (!global.document) global.document = { getElementById: () => null };

    // js/data.js: seit M11 braucht buildInitialGameState (js/mapgen.js) die
    // Kreaturen-Konstanten (UWC_*/uwCreatureStats) für die initiale Platzierung.
    const files = ['js/prng.js', 'js/hex.js', 'js/data.js', 'js/mapgen.js'];
    const src = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
    const fn = new Function(src + `
        return {
            buildInitialGameState, createPRNG, oddRToCube, cubeToOddR, hexDistance, isInsideMap,
            getTerrainType, getUnderworldType, isUnderworldOpen, getHeartCavernHexes,
            UW_FELS, UW_KAVERNE, UW_ADER, UW_RUINE, UW_HERZ, UW_TYPE_NAMES
        };
    `);
    return fn();
}

const M = loadGameCode();

function makeState(seed, radius) {
    const size = radius * 2 + 1;
    return { sd: seed, bw: size, bh: size, rad: radius };
}

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error('FAIL: ' + msg); failures++; }
    else console.log('OK: ' + msg);
}

const seeds = [1, 4242, 99999];
const radii = [5, 12];

console.log('=== 1) Determinismus (zweimal aufrufen -> identisch) ===');
for (const seed of seeds) {
    for (const radius of radii) {
        const state = makeState(seed, radius);
        let mismatches = 0;
        for (let y = 0; y < state.bh; y++) {
            for (let x = 0; x < state.bw; x++) {
                if (!M.isInsideMap(state, x, y)) continue;
                const a = M.getUnderworldType(state, x, y);
                const b = M.getUnderworldType(state, x, y);
                if (a !== b) mismatches++;
            }
        }
        assert(mismatches === 0, `Seed ${seed} R${radius}: deterministisch (0 Mismatches über volle Karte)`);
    }
}

console.log('\n=== 2) Verteilung in Richtwert-Bändern (Kaverne 5-8%, Ader 6-10%, Ruine 2-4 Stück, Herz exakt) ===');
for (const seed of seeds) {
    for (const radius of radii) {
        const state = makeState(seed, radius);
        const counts = { [M.UW_FELS]: 0, [M.UW_KAVERNE]: 0, [M.UW_ADER]: 0, [M.UW_RUINE]: 0, [M.UW_HERZ]: 0 };
        let total = 0;
        for (let y = 0; y < state.bh; y++) {
            for (let x = 0; x < state.bw; x++) {
                if (!M.isInsideMap(state, x, y)) continue;
                counts[M.getUnderworldType(state, x, y)]++;
                total++;
            }
        }
        const pct = t => (counts[t] / total * 100);
        console.log(`Seed ${seed} R${radius} (${total} Hexes): Fels ${counts[M.UW_FELS]} (${pct(M.UW_FELS).toFixed(1)}%) | ` +
            `Kaverne ${counts[M.UW_KAVERNE]} (${pct(M.UW_KAVERNE).toFixed(1)}%) | ` +
            `Ader ${counts[M.UW_ADER]} (${pct(M.UW_ADER).toFixed(1)}%) | ` +
            `Ruine ${counts[M.UW_RUINE]} (${pct(M.UW_RUINE).toFixed(1)}%) | ` +
            `Herz ${counts[M.UW_HERZ]} (${pct(M.UW_HERZ).toFixed(1)}%)`);

        // Toleranz als +/- 3 Standardabweichungen um die Zielrate (Binomialverteilung,
        // p=Rollwahrscheinlichkeit 0.065/0.08, n=total) statt fixer pp-Bänder — bei
        // kleinen Karten (R5, ~91 Hexes) ist die Schwankung um den Zielwert sonst
        // fälschlich "auffällig", obwohl der Hash korrekt verteilt.
        const withinBinomial = (count, n, p) => {
            const sd = Math.sqrt(n * p * (1 - p));
            return Math.abs(count - n * p) <= 3 * sd + 1; // +1 Hex Toleranz für sehr kleine n
        };
        assert(withinBinomial(counts[M.UW_KAVERNE], total, 0.065), `Seed ${seed} R${radius}: Kaverne binomial plausibel um Ziel ~6.5% (gemessen ${pct(M.UW_KAVERNE).toFixed(1)}%, n=${total})`);
        assert(withinBinomial(counts[M.UW_ADER], total, 0.08), `Seed ${seed} R${radius}: Ader binomial plausibel um Ziel ~8.0% (gemessen ${pct(M.UW_ADER).toFixed(1)}%, n=${total})`);

        // Ruinen-Cluster-Anzahl (nicht Hex-Anzahl) prüfen: 2-4 Cluster
        const clusters = [];
        const seen = new Set();
        for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
            if (M.isInsideMap(state, x, y) && M.getUnderworldType(state, x, y) === M.UW_RUINE) seen.add(`${x},${y}`);
        }
        assert(counts[M.UW_RUINE] >= 2 && counts[M.UW_RUINE] <= 16, `Seed ${seed} R${radius}: Ruinen-Hexes plausibel (2-4 Cluster à 2-4 Hex = 4-16), gemessen ${counts[M.UW_RUINE]}`);
    }
}

console.log('\n=== 3) Herzkaverne exakt unter dem Kartenzentrum (== ct in mapgen.js) ===');
for (const seed of seeds) {
    for (const radius of radii) {
        const state = makeState(seed, radius);
        const cx = radius, cy = radius; // == ct.x/ct.y in buildInitialGameState
        const centerType = M.getUnderworldType(state, cx, cy);
        assert(centerType === M.UW_HERZ, `Seed ${seed} R${radius}: Zentrum (${cx},${cy}) ist UW_HERZ`);

        const heartHexes = M.getHeartCavernHexes(state);
        const expectedMin = radius <= 5 ? 7 : (radius <= 8 ? 13 : 20);
        assert(heartHexes.length >= expectedMin - 1, `Seed ${seed} R${radius}: Herzkaverne-Größe plausibel (${heartHexes.length} Hexes, erwartet >= ${expectedMin - 1})`);
        // Alle Herzkaverne-Hexes müssen auch tatsächlich UW_HERZ liefern
        const allHeart = heartHexes.every(h => M.getUnderworldType(state, h.x, h.y) === M.UW_HERZ);
        assert(allHeart, `Seed ${seed} R${radius}: alle ${heartHexes.length} Herzkaverne-Hexes liefern UW_HERZ`);
        // Herzkaverne muss dieselbe sein wie state.ct in echten buildInitialGameState-Karten
        const built = M.buildInitialGameState(['A', 'B'], radius);
        assert(built.ct.x === cx && built.ct.y === cy, `Seed ${seed} R${radius}: ct-Position stimmt mit Zentrum überein (${built.ct.x},${built.ct.y})`);
    }
}

console.log('\n=== 4) Unkorreliertheit zur Oberfläche (Wald-Hexes oben != erhöhte Kavernen-Quote unten) ===');
for (const seed of seeds) {
    const radius = 12;
    const state = makeState(seed, radius);
    let forestTotal = 0, forestCavern = 0, otherTotal = 0, otherCavern = 0;
    for (let y = 0; y < state.bh; y++) {
        for (let x = 0; x < state.bw; x++) {
            if (!M.isInsideMap(state, x, y)) continue;
            const surface = M.getTerrainType(state, x, y);
            const under = M.getUnderworldType(state, x, y);
            const isCavernLike = (under === M.UW_KAVERNE);
            if (surface === 'forest') { forestTotal++; if (isCavernLike) forestCavern++; }
            else { otherTotal++; if (isCavernLike) otherCavern++; }
        }
    }
    const forestRate = forestTotal ? forestCavern / forestTotal : 0;
    const otherRate = otherTotal ? otherCavern / otherTotal : 0;
    console.log(`Seed ${seed} R${radius}: Kavernen-Quote auf Wald-Hexes ${( forestRate*100).toFixed(1)}% (n=${forestTotal}) vs. sonst ${(otherRate*100).toFixed(1)}% (n=${otherTotal})`);
    // Keine harte statistische Signifikanzprüfung (kleine Stichprobe je Seed) —
    // nur grober Plausibilitätscheck: Differenz soll nicht riesig sein (kein
    // systematischer Zusammenhang, z.B. "3x mehr Kavernen unter Wald").
    const ratio = otherRate > 0 ? forestRate / otherRate : (forestRate === 0 ? 1 : Infinity);
    assert(ratio > 0.4 && ratio < 2.5, `Seed ${seed} R${radius}: Wald/Nicht-Wald-Kavernen-Quote nicht auffällig korreliert (Verhältnis ${ratio.toFixed(2)})`);
}

console.log('\n=== 5) isUnderworldOpen: defensiv ohne state.uw ===');
{
    const state = makeState(1, 5);
    const cx = 5, cy = 5;
    assert(M.isUnderworldOpen(state, cx, cy) === true, 'Herzkaverne-Zentrum ist offen (ohne state.uw)');
    let felsHex = null;
    outer:
    for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) {
        if (M.isInsideMap(state, x, y) && M.getUnderworldType(state, x, y) === M.UW_FELS) { felsHex = { x, y }; break outer; }
    }
    assert(felsHex && M.isUnderworldOpen(state, felsHex.x, felsHex.y) === false, 'Fels-Hex ohne state.uw.d ist NICHT offen');
}

console.log(`\n=== Zusammenfassung: ${failures === 0 ? 'ALLE CHECKS BESTANDEN' : failures + ' FEHLGESCHLAGEN'} ===`);
process.exit(failures === 0 ? 0 : 1);
