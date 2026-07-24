// === LUFT-EBENE ===
// Boden und Luft teilen sich ein Hex: pro Hex max. 1 Bodeneinheit UND 1 Lufteinheit.
// Ein gelandeter Fallschirmspringer (u.ld === 1) zählt dauerhaft als Bodeneinheit.
function isFlying(u) {
    return !!unitStats[u.t].isAir && u.ld !== 1;
}

function groundUnitAt(x, y) {
    return gameState.u.find(u => u.x === x && u.y === y && !isFlying(u));
}

function airUnitAt(x, y) {
    return gameState.u.find(u => u.x === x && u.y === y && isFlying(u));
}

// Schwere Bodeneinheiten (Elefant, Wagenburg): kein Tunnel, kein Lufttransport
function isHeavyUnit(u) {
    return !!unitStats[u.t].heavy;
}

// Komplette Luft-Ziel-Matrix. MUSS an genau drei Stellen verwendet werden:
// calculateAttacks, Konterschlag-Block (input.js), Turmschuss-Zielauflösung.
function canTargetUnit(attacker, target) {
    const aStats = unitStats[attacker.t];
    if (isFlying(target)) {
        // Fliegendes Ziel: nur Fernkampf-Boden, oder Flieger mit hitsAir
        if (isFlying(attacker)) return !!aStats.hitsAir;
        return !aStats.isMelee;
    }
    // Bodenziel (inkl. gelandetem Fallschirm)
    if (isFlying(attacker)) {
        if (attacker.t === 14) return false;          // fliegender Fallschirm trifft nur Luft
        return aStats.hitsGround !== false;
    }
    return true;                                      // Boden vs. Boden: bestehende Regeln
}

// === UNIT STAT HELPERS ===
const getUnitMaxHp = (pState, type, unit) => {
    let hp = (type === 0 && pState.u.includes(0)) ? 15 : unitStats[type].maxHp;
    if (unit && unit.fb) hp += unit.fb;
    if (type === 11 && pState.u.includes(11)) hp += 4;
    // Reliquie "Harnisch des Bergvolks" (M10): +10 Max-HP, gilt für Oberflächen-
    // UND Unterwelt-Einheiten gleichermaßen (getUnitMaxHp wird von beiden genutzt).
    if (unit && unit.art === 'armor') hp += 10;
    return hp;
};

const getUnitCost = (pState, type) =>
    ([0, 1, 2].includes(type) && pState.u.includes(6)) ? unitStats[type].cost - 1 : unitStats[type].cost;

const getUnitMove = (pState, type, unit) => {
    if (type === 11 && unit && unit.dp === 1) return 0;
    if (type === 14 && unit && unit.ld === 1) return unitStats[14].ldMove;
    return (type === 5 && pState.u.includes(5)) ? unitStats[type].move + 1 : unitStats[type].move;
};

const getUnitRange = (pState, unit) => {
    if (unit.t === 11 && unit.dp === 1) return 2;
    return unitStats[unit.t].range;
};

// === INCOME ===
const calculateIncome = (pId) => {
    if (!gameState || !gameState.p[pId]) return { g: 0, m: 0 };
    const pState = gameState.p[pId];
    let myVillages = Object.values(gameState.v).filter(v => v === pId).length;
    let extraGold = pState.f && pState.f.includes(3) ? 1 : 0;
    return { g: myVillages * (2 + extraGold), m: myVillages * 1 };
};

// === NAME FORMATTING ===
const formatOwnerName = (id, cp) => {
    if (id === cp) return "Dein";
    let name = gameState.p[id].n;
    return name.endsWith('s') || name.endsWith('x') || name.endsWith('z') ? name + "'" : name + "s";
};

// === DAMAGE CALCULATION ===
const getExpectedDamage = (attackerUnit, targetType, targetOwnerId, targetUnit) => {
    const pState = gameState.p[attackerUnit.p];
    const stats = unitStats[attackerUnit.t];
    let dmg = stats.dmg;

    if (pState.f.includes(1) && stats.isMelee) dmg += 1;
    if (attackerUnit.t === 4 && (targetType === 'building' || targetType === 'tunnel') && pState.u.includes(3)) dmg += 3;
    if (attackerUnit.t === 1 && pState.u.includes(4)) dmg += 1;
    if (attackerUnit.t === 5 && pState.u.includes(5)) dmg += 1;
    if (attackerUnit.t === 6 && pState.u.includes(7)) {
        let targetMaxHp = 10;
        if (targetType === 'unit' && targetUnit) targetMaxHp = getUnitMaxHp(gameState.p[targetUnit.p], targetUnit.t, targetUnit);
        else if (targetType === 'building') targetMaxHp = 30;
        else if (targetType === 'tower') targetMaxHp = 15;
        else if (targetType === 'wall') targetMaxHp = 10;
        else if (targetType === 'tunnel') targetMaxHp = 13;
        dmg += Math.max(1, Math.round(targetMaxHp * 0.2));
    }
    if (attackerUnit.t === 9 && (targetType === 'building' || targetType === 'tunnel' || targetType === 'wall' || targetType === 'tower') && pState.u.includes(10)) dmg += 5;
    // Hügel-Bonus nur für Bodeneinheiten — ein Flieger steht nicht auf dem Hügel
    if (!stats.isMelee && !(stats.isAir && isFlying(attackerUnit)) && getTerrainType(gameState, attackerUnit.x, attackerUnit.y) === 'hill') dmg += 1;
    // Reliquie "Damaszener Klinge" (M10): +5 DMG permanent (Oberfläche + Unterwelt-
    // Pendant getExpectedDamageUW nutzen denselben Reliquien-Key).
    if (attackerUnit.art === 'blade') dmg += 5;
    dmg += getVeteranBonus(attackerUnit);

    const maxHp = getUnitMaxHp(pState, attackerUnit.t, attackerUnit);
    let scaled = Math.max(1, Math.round(dmg * (attackerUnit.h / maxHp)));

    if (targetType === 'unit' && targetUnit && targetUnit.p === targetOwnerId) {
        const hasAura = gameState.u.some(u =>
            u.p === targetOwnerId && u.t === 11 && u.dp === 1 &&
            hexDistance({ x: u.x, y: u.y }, { x: targetUnit.x, y: targetUnit.y }) === 1
        );
        if (hasAura) scaled = Math.max(1, scaled - 1);
        // Wald-Deckung: Bodeneinheiten im Wald nehmen 1 DMG weniger
        if (!isFlying(targetUnit) && getTerrainType(gameState, targetUnit.x, targetUnit.y) === 'forest') {
            scaled = Math.max(1, scaled - 1);
        }
    }
    return scaled;
};

// === VETERAN SYSTEM ===
function checkVeteran(unit) {
    if (!unit.k) unit.k = 0;
    unit.k++;
    if (unit.k >= 2 && !unit.vet) {
        unit.vet = 1;
        showToast(`⭐ ${unitStats[unit.t].name} wird zum Veteranen!`, 'gold');
    }
}

function getVeteranBonus(unit) {
    return unit.vet ? 1 : 0;
}

// === MOVE & ATTACK CALCULATION ===
function calculateMoves(unit) {
    const pState = gameState.p[unit.p];
    const moveStat = getUnitMove(pState, unit.t, unit);
    let moves = [];
    let queue = [{ x: unit.x, y: unit.y, steps: 0 }];
    let visited = new Set([`${unit.x},${unit.y}`]);
    const flying = isFlying(unit);

    while (queue.length > 0) {
        let current = queue.shift();
        if (current.steps > 0) moves.push({ x: current.x, y: current.y });
        if (current.steps < moveStat) {
            for (let n of getNeighbors(current.x, current.y)) {
                const key = `${n.x},${n.y}`;
                if (visited.has(key)) continue;

                if (flying) {
                    // Luft-BFS: ignoriert alle Bodenhindernisse — nur andere Flieger blockieren
                    if (airUnitAt(n.x, n.y)) continue;
                    visited.add(key);
                    queue.push({ x: n.x, y: n.y, steps: current.steps + 1 });
                    continue;
                }

                let isAliveSV = false;
                for (let i = 0; i < gameState.p.length; i++) {
                    if (i !== unit.p && gameState.p[i].dead === 0 && gameState.p[i].sv === key) isAliveSV = true;
                }
                let isEnemyTunnel = false;
                if (gameState.tu) {
                    const canUse = (tId) => unit.p === tId || (pState.al && pState.al.includes(tId));
                    isEnemyTunnel = gameState.tu.some(t => !canUse(t.o) && ((t.x1 === n.x && t.y1 === n.y) || (t.x2 === n.x && t.y2 === n.y)));
                }
                const hasWall = gameState.wa && gameState.wa.some(w => w.x === n.x && w.y === n.y);
                const hasStone = gameState.st && gameState.st.some(s => s.x === n.x && s.y === n.y && s.h > 0);
                const hasTower = gameState.tw && gameState.tw.some(tw => tw.x === n.x && tw.y === n.y && tw.h > 0);
                if (!groundUnitAt(n.x, n.y) && !isAliveSV && !isEnemyTunnel && !hasWall && !hasStone && !hasTower) {
                    visited.add(key);
                    queue.push({ x: n.x, y: n.y, steps: current.steps + 1 });
                }
            }
        }
    }
    return moves;
}

function calculateAttacks(unit) {
    const stats = unitStats[unit.t];
    let attacks = [];
    const pState = gameState.p[gameState.cp];
    const canAttack = (targetId) => !(pState.al && pState.al.includes(targetId)) && !(pState.tc && pState.tc.includes(targetId));
    const range = getUnitRange(gameState.p[unit.p], unit);

    // Fliegende Angreifer, die keine Bodenziele treffen (Fallschirm), greifen keine Strukturen an
    const canHitStructures = !isFlying(unit) || (stats.hitsGround !== false && unit.t !== 14);

    for (let enemy of gameState.u.filter(u => u.p !== unit.p && u.iv !== 1 && canAttack(u.p))) {
        if (!canTargetUnit(unit, enemy)) continue;
        if (hexDistance({ x: unit.x, y: unit.y }, { x: enemy.x, y: enemy.y }) <= range) {
            attacks.push({ x: enemy.x, y: enemy.y, target: enemy, air: isFlying(enemy) ? 1 : 0 });
        }
    }
    if (!canHitStructures) return attacks;
    for (let i = 0; i < gameState.p.length; i++) {
        if (i !== unit.p && gameState.p[i].dead === 0 && canAttack(i)) {
            let [vx, vy] = gameState.p[i].sv.split(',').map(Number);
            if (hexDistance({ x: unit.x, y: unit.y }, { x: vx, y: vy }) <= range) {
                attacks.push({ x: vx, y: vy, isBuilding: true, owner: i });
            }
        }
    }
    if (gameState.tu) {
        for (let t of gameState.tu) {
            if (t.o !== unit.p && canAttack(t.o)) {
                if (hexDistance({ x: unit.x, y: unit.y }, { x: t.x1, y: t.y1 }) <= range) {
                    attacks.push({ x: t.x1, y: t.y1, isTunnelTarget: true, tunnel: t, targetOwner: t.o });
                }
                if (hexDistance({ x: unit.x, y: unit.y }, { x: t.x2, y: t.y2 }) <= range) {
                    attacks.push({ x: t.x2, y: t.y2, isTunnelTarget: true, tunnel: t, targetOwner: t.o });
                }
            }
        }
    }
    if (gameState.wa) {
        for (let w of gameState.wa) {
            if (w.o !== unit.p && !(pState.al && pState.al.includes(w.o))) {
                if (hexDistance({ x: unit.x, y: unit.y }, { x: w.x, y: w.y }) <= range) {
                    attacks.push({ x: w.x, y: w.y, isWallTarget: true, wall: w });
                }
            }
        }
    }
    if (gameState.tw) {
        for (let tw of gameState.tw) {
            if (tw.h > 0 && tw.o !== unit.p && canAttack(tw.o)) {
                if (hexDistance({ x: unit.x, y: unit.y }, { x: tw.x, y: tw.y }) <= range) {
                    attacks.push({ x: tw.x, y: tw.y, isTowerTarget: true, tower: tw });
                }
            }
        }
    }
    // Bombenballon: sein Normalangriff ist Anzünden (4 sofort + 4 nächster Zug)
    if (unit.t === 15) attacks.forEach(a => a.ignite = true);
    // UI-Regel: Luftziele sind nur in der Luftansicht (✈️) anvisierbar
    if (!window.airView) attacks = attacks.filter(a => !a.air);
    return attacks;
}

// === AUTO MINING ===
function processAutoMining(pId) {
    const pState = gameState.p[pId];
    if (!pState.s) pState.s = 0;
    if (!gameState.st) gameState.st = [];
    const myWorkers = gameState.u.filter(u => u.p === pId && u.t === 7 && u.mi);
    myWorkers.forEach(w => {
        if (!w.mi) return;
        let target = gameState.st.find(s => s.x === w.mi.x && s.y === w.mi.y && s.h > 0);
        if (!target || hexDistance({ x: w.x, y: w.y }, { x: target.x, y: target.y }) !== 1) {
            // Gespeichertes Ziel weg oder außer Reichweite (z.B. nach Bewegung durch
            // einen Tunnel): auf einen anderen angrenzenden Steinhaufen umschwenken
            // statt den Abbau-Modus zu beenden — der Toggle bleibt an, solange
            // IRGENDEINE Quelle angrenzt (größter Vorrat zuerst, wie startMining).
            const adj = gameState.st.filter(s => s.h > 0 && hexDistance({ x: w.x, y: w.y }, { x: s.x, y: s.y }) === 1);
            adj.sort((a, b) => b.h - a.h);
            target = adj[0] || null;
        }
        if (target) {
            const tx = target.x, ty = target.y;
            w.mi = { x: tx, y: ty };
            target.h -= 1;
            pState.s += 1;
            if (target.h <= 0) {
                gameState.st = gameState.st.filter(s => s.x !== tx || s.y !== ty);
                gameState.u.forEach(u => { if (u.mi && u.mi.x === tx && u.mi.y === ty) delete u.mi; });
            }
        } else {
            delete w.mi;
        }
    });
    if (gameState.st.length === 0) gameState.st = [];
}

// === VISIBILITY & FOG ===
function getVisibleHexes(playerId, includeAllies = true) {
    let visible = new Set();
    if (window.DEBUG_NO_FOG) {
        for (let y = 0; y < gameState.bh; y++)
            for (let x = 0; x < gameState.bw; x++)
                if (isInsideMap(gameState, x, y)) visible.add(`${x},${y}`);
        return visible;
    }
    const mainState = gameState.p[playerId];
    if (mainState.dead) {
        if (isSpectator) {
            for (let y = 0; y < gameState.bh; y++)
                for (let x = 0; x < gameState.bw; x++)
                    if (isInsideMap(gameState, x, y)) visible.add(`${x},${y}`);
        }
        return visible;
    }

    const addV = (pId) => {
        const pState = gameState.p[pId];
        // Karte der Tiefe (p.mr): permanente 100%-Sicht — greift auch für
        // Verbündete mit, da Bündnisse die Sicht ohnehin voll teilen.
        if (pState.mr) {
            for (let y = 0; y < gameState.bh; y++)
                for (let x = 0; x < gameState.bw; x++)
                    if (isInsideMap(gameState, x, y)) visible.add(`${x},${y}`);
            return;
        }
        const sightRange = pState.f && pState.f.includes(2) ? 3 : 2;
        const myUnits = gameState.u.filter(u => u.p === pId);
        const myVillages = Object.entries(gameState.v).filter(([k, v]) => v === pId).map(([k, v]) => k.split(',').map(Number));
        const myTowers = (gameState.tw || []).filter(tw => tw.o === pId && tw.h > 0);
        for (let y = 0; y < gameState.bh; y++) {
            for (let x = 0; x < gameState.bw; x++) {
                if (!isInsideMap(gameState, x, y) || visible.has(`${x},${y}`)) continue;
                let isVis = false;
                for (let u of myUnits) {
                    const unitSight = (u.t === 6) ? 3 : sightRange;
                    if (hexDistance({ x, y }, { x: u.x, y: u.y }) <= unitSight) { isVis = true; break; }
                }
                if (!isVis) {
                    for (let [vx, vy] of myVillages) {
                        if (hexDistance({ x, y }, { x: vx, y: vy }) <= sightRange) { isVis = true; break; }
                    }
                }
                if (!isVis) {
                    for (let tw of myTowers) {
                        if (hexDistance({ x, y }, { x: tw.x, y: tw.y }) <= 2) { isVis = true; break; }
                    }
                }
                if (!isVis && gameState.ct && gameState.ct.ctrl === pId) {
                    const ctRange = Math.ceil(gameState.rad * 0.7);
                    if (hexDistance({ x, y }, { x: gameState.ct.x, y: gameState.ct.y }) <= ctRange) isVis = true;
                }
                if (isVis) visible.add(`${x},${y}`);
            }
        }
    };

    addV(playerId);
    if (includeAllies && mainState.al) mainState.al.forEach(allyId => addV(allyId));
    return visible;
}

function updateExploration() {
    const pId = gameState.cp;
    if (!gameState.p[pId].e) gameState.p[pId].e = [];
    getVisibleHexes(pId).forEach(key => {
        const [x, y] = key.split(',').map(Number);
        const idx = y * gameState.bw + x;
        if (!gameState.p[pId].e.includes(idx)) gameState.p[pId].e.push(idx);
    });
}

// === UNTERWELT (M9b) ===
// Eigene, kleine Parallel-Funktionen statt Verzweigung der Boden-Logik (siehe
// Unterwelt/PLAN.md Abschn. 10) — BFS läuft hier nur über offene Hexes
// (isUnderworldOpen, js/hex.js) statt über Terrain-Hindernisse.
function uwUnitAt(x, y) {
    return ((gameState.uw && gameState.uw.u) || []).find(u => u.x === x && u.y === y);
}

// Kreaturen (M11) — neutral, blockieren Hexes wie Einheiten.
function uwCreatureAt(x, y) {
    return ((gameState.uw && gameState.uw.c) || []).find(c => c.x === x && c.y === y && c.h > 0);
}

function calculateMovesUW(unit) {
    const pState = gameState.p[unit.p];
    const moveStat = getUnitMove(pState, unit.t, unit);
    let moves = [];
    let queue = [{ x: unit.x, y: unit.y, steps: 0 }];
    let visited = new Set([`${unit.x},${unit.y}`]);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.steps > 0) moves.push({ x: current.x, y: current.y });
        // Spinnennetz (M11): stoppt die Bewegung sofort — von einem Netz-Hex aus
        // wird nicht weiter expandiert, selbst wenn noch Bewegungspunkte übrig
        // wären (das Netz wird beim tatsächlichen Betreten verbraucht, siehe
        // executeUWMoveTo, js/input.js).
        const isWebbed = gameState.uw && gameState.uw.w && gameState.uw.w[`${current.x},${current.y}`];
        if (current.steps > 0 && isWebbed) continue;
        if (current.steps < moveStat) {
            for (const n of getNeighbors(current.x, current.y)) {
                const key = `${n.x},${n.y}`;
                if (visited.has(key)) continue;
                if (!isUnderworldOpen(gameState, n.x, n.y)) continue;
                if (uwUnitAt(n.x, n.y)) continue; // besetzt, egal von wem (kein Stacking)
                if (uwCreatureAt(n.x, n.y)) continue; // Kreaturen blockieren wie Einheiten
                visited.add(key);
                queue.push({ x: n.x, y: n.y, steps: current.steps + 1 });
            }
        }
    }
    return moves;
}

// Horcher-Sprung (21, Spionage — Korrektur Juli 2026, ersetzt die permanente
// Tarnung, die zu stark war): exakt 2 Hex weit, komplett unabhängig vom BFS-
// Pfad/Fels/Weg dazwischen (hexRingAround, js/hex.js) — der Witz der Fähigkeit
// ist gerade, dass sie massiven Fels/unbekannte Lücken ÜBERSPRINGT, statt sich
// durchzugraben. Das Ziel-Hex selbst muss trotzdem bereits offen und frei sein
// (keine Einheit/Kreatur darauf) — kein Sprung in massiven Fels oder auf ein
// besetztes Hex.
function calculateHorcherJumpTargetsUW(unit) {
    if (unit.t !== 21) return [];
    return hexRingAround({ x: unit.x, y: unit.y }, 2).filter(n =>
        isInsideMap(gameState, n.x, n.y) &&
        isUnderworldOpen(gameState, n.x, n.y) &&
        !uwUnitAt(n.x, n.y) && !uwCreatureAt(n.x, n.y)
    );
}

// Führt den Sprung aus — gleiche Nebeneffekte wie eine normale Bewegung
// (Spinnennetz am Ziel verbraucht sich, herrenlose Kristalle werden
// aufgesammelt, siehe moveUWUnit; eine Fundkammer am Ziel wird NICHT mehr
// automatisch geplündert — Plündern ist seit Juli 2026 eine eigene Button-
// Aktion, siehe lootFundkammerAction), aber als vollständige Fähigkeit
// (a=1, kein Bewegen+Agieren-Zwischenzustand wie bei a=2) — Muster wie
// placeUWDynamite/collapseUWHex.
function jumpUWUnit(state, unit, x, y) {
    unit.x = x; unit.y = y;
    unit.a = 1;
    const webKey = `${x},${y}`;
    if (state.uw && state.uw.w && state.uw.w[webKey]) delete state.uw.w[webKey];
    const picked = pickupUWCrystalDrop(state, unit);
    return { picked };
}

// Angrenzende FELS-Hexes, die noch nicht offen sind — ein Klick darauf gräbt UND
// rückt die Einheit nach (siehe executeUWDig in input.js). Kaverne/Ruine/Herz
// sind schon offen (keine Grab-Ziele), Kristalladern laufen über calculateMineTargetsUW.
// Graben ist Arbeiter (7, DIE Ebenen-Brücke — Korrektur Juli 2026) und Bohrwagen
// (22) vorbehalten (PLAN.md Abschn. 3).
function calculateDigsUW(unit) {
    if (unit.t !== 7 && unit.t !== 22) return [];
    // Zweites Graben im selben Zug ist Bohrwagen-exklusiv (digMove>1, s.
    // digUWHex) — ein normaler Arbeiter darf den a=2-Zwischenzustand nach
    // seiner ersten Grabung nur noch für eine Nicht-Grab-Aktion nutzen
    // (Angriff, Abbau-Toggle), sonst hätte jeder Arbeiter faktisch dasselbe
    // 2-Hex/Zug-Grabtempo wie der Bohrwagen.
    if (unit.dg && (unitStats[unit.t].digMove || 1) <= 1) return [];
    const targets = [];
    getNeighbors(unit.x, unit.y).forEach(n => {
        if (getUnderworldType(gameState, n.x, n.y) === UW_FELS && !isUnderworldOpen(gameState, n.x, n.y)) {
            targets.push({ x: n.x, y: n.y });
        }
    });
    return targets;
}

// Kristalladern, die die Einheit abbauen kann: das eigene Hex selbst (falls ein
// Stollenkopf zufällig auf einer Ader liegt) + angrenzende Ader-Hexes mit Restbestand.
// Abbau ist Arbeiter (7, Ebenen-Brücke) und Beutegräber (20) vorbehalten (PLAN.md Abschn. 4).
function calculateMineTargetsUW(unit) {
    if (unit.t !== 7 && unit.t !== 20) return [];
    const targets = [];
    const consider = (x, y) => {
        if (getUWVeinRemaining(gameState, x, y) > 0) targets.push({ x, y });
    };
    consider(unit.x, unit.y);
    getNeighbors(unit.x, unit.y).forEach(n => consider(n.x, n.y));
    return targets;
}

// Stollenbruch (M12, Sprengmeister 18): angrenzende, EXPLIZIT gegrabene Hexes
// (nur uw.d — natürliche Kavernen/Ruinen/Adern/Herz und Stollenköpfe sind nicht
// verfüllbar, auch wenn isUnderworldOpen für sie ebenfalls true liefert), die
// nicht von einer Einheit/Kreatur besetzt sind.
function calculateStollenbruchTargetsUW(unit) {
    if (unit.t !== 18) return [];
    const targets = [];
    getNeighbors(unit.x, unit.y).forEach(n => {
        const idx = n.y * gameState.bw + n.x;
        const isDug = gameState.uw && gameState.uw.d && gameState.uw.d.includes(idx);
        if (!isDug) return;
        if (uwUnitAt(n.x, n.y) || uwCreatureAt(n.x, n.y)) return;
        targets.push({ x: n.x, y: n.y });
    });
    return targets;
}

// Verfüllt ein gegrabenes Hex wieder zu massivem Fels (Stollenbruch, M12) —
// Fähigkeit wie Dynamit (placeUWDynamite): aus a=0 ODER a=2 nutzbar, verbraucht
// die Aktion vollständig (a=1, Oberflächen-Parität, Korrektur Juli 2026).
function collapseUWHex(state, unit, x, y) {
    if (!state.uw || !state.uw.d) return;
    const idx = y * state.bw + x;
    state.uw.d = state.uw.d.filter(i => i !== idx);
    unit.a = 1;
}

// === DYNAMIT (Sprengmeister 18, ersetzt Unterminierung — Korrektur Juli 2026) ===
// Grundprinzip: Tiefeneinheiten haben KEINERLEI Auswirkung auf das Spiel oben —
// Dynamit wirkt daher ausschließlich innerhalb der Unterwelt (Fels/Einheiten/
// Kreaturen), nie auf Oberflächen-Strukturen (Tunnel/Mauern/Türme/Startdörfer).
//
// Ziel-Hexes: JEDES angrenzende Hex, unabhängig von Typ/Offen-Zustand (Korrektur
// Juli 2026, Jonathan — vorher nur angrenzendes massives Fels-Hex): der
// Sprengmeister kann Dynamit also auch in bereits offenen Gängen/Kavernen legen,
// um dort stehende Einheiten/Kreaturen zu treffen, ohne dass Fels im Weg sein
// muss. Das Öffnen von massivem Fels bleibt ein Nebeneffekt für Fels-Hexes im
// Dreieck (processUWDynamiteDetonations), Kristaladern bleiben davon ausgenommen.
function calculateDynamiteTargetsUW(unit) {
    if (unit.t !== 18) return [];
    return getNeighbors(unit.x, unit.y);
}

// Das Dreieck aus 3 Hexes einer Dynamit-Platzierung: das Ziel-Hex selbst + seine
// beiden "gemeinsamen Nachbarn" mit der platzierenden Einheit — geometrisch auf
// jedem Hexraster genau die zwei Hexes, die zusammen mit Platzierer und Ziel die
// beiden an der gemeinsamen Kante anliegenden Dreiecksflächen bilden. Wird EINMAL
// bei der Platzierung berechnet und mit der Ladung gespeichert (state.uw.dy),
// damit spätere Bewegungen der platzierenden Einheit die Sprengrichtung nicht
// mehr verändern. Nahe am Kartenrand können es auch nur 2 Hexes sein (fehlende
// gemeinsame Nachbarn liegen außerhalb der Karte, getNeighbors filtert bereits).
function getDynamiteTriangle(fromX, fromY, targetX, targetY) {
    const fromNeighbors = new Set(getNeighbors(fromX, fromY).map(n => `${n.x},${n.y}`));
    const shared = getNeighbors(targetX, targetY).filter(n => fromNeighbors.has(`${n.x},${n.y}`));
    return [{ x: targetX, y: targetY }, ...shared.slice(0, 2)];
}

// Platzieren: 1 Holz, verbraucht die Aktion, erzeugt Lärm (laut wie vormals die
// Unterminierungs-Kammer). Die Ladung liegt lose in state.uw.dy (nicht am Gerät
// selbst) — sie explodiert unabhängig davon, ob/wohin sich der Sprengmeister
// danach noch bewegt.
function placeUWDynamite(state, unit, x, y) {
    if (!state.uw.dy) state.uw.dy = [];
    state.uw.dy.push({ p: unit.p, hexes: getDynamiteTriangle(unit.x, unit.y, x, y) });
    unit.a = 1;
}

// Detonation: läuft in doEndTurn für den NEU aktiven Spieler (Muster: Brand-
// Ticks/Moral-Kollaps — "wenn der Spieler seinen nächsten Zug startet"). Jedes
// der 3 Hexes: 6 Schaden an einer dort stehenden Tiefeneinheit/Kreatur (AoE,
// unabhängig vom Besitzer — auch eigene Einheiten, Muster: Feuersturm oben),
// UND massiver Fels wird dauerhaft offen ("Gebirge wegsprengen"). Rührt NIE an
// tu[]/wa[]/tw[]/p[].sh — genau das ist der Kernunterschied zur alten
// Unterminierung. Gibt die Float-Liste zurück (Schadenszahlen fürs UI).
function processUWDynamiteDetonations(pId) {
    if (!gameState.uw || !gameState.uw.dy || gameState.uw.dy.length === 0) return [];
    const floats = [];
    gameState.uw.dy.filter(c => c.p === pId).forEach(charge => {
        charge.hexes.forEach(h => {
            const victimUnit = uwUnitAt(h.x, h.y);
            if (victimUnit) { victimUnit.h -= 6; floats.push({ x: h.x, y: h.y, val: 6 }); }
            const victimCreature = uwCreatureAt(h.x, h.y);
            if (victimCreature) { victimCreature.h -= 6; floats.push({ x: h.x, y: h.y, val: 6 }); }
            // Jedes noch geschlossene FELS-Hex im Dreieck wird dauerhaft offen
            // ("Gebirge wegsprengen") — Kristaladern sind davon ausgenommen (Korrektur
            // Juli 2026, Jonathan): Dynamit darf keine Ader öffnen/zerstören, die
            // verschwindet ausschließlich durch vollständigen Abbau (Restbestand auf
            // 0). Eine Ader im Dreieck nimmt weiterhin AoE-Schaden auf eine dort
            // stehende Einheit/Kreatur, bleibt aber massiv und unangetastet.
            if (getUnderworldType(gameState, h.x, h.y) !== UW_ADER && !isUnderworldOpen(gameState, h.x, h.y)) {
                const idx = h.y * gameState.bw + h.x;
                if (!gameState.uw.d.includes(idx)) gameState.uw.d.push(idx);
            }
        });
    });
    (gameState.uw.u || []).filter(u => u.h <= 0).forEach(u => dropUWCrystalsOnDeath(gameState, u));
    gameState.uw.u = (gameState.uw.u || []).filter(u => u.h > 0);
    // Stirbt der Alte Wurm durch Dynamit statt im Kampf, muss dasselbe wd-Flag
    // gesetzt werden wie in resolveUWAttackOnCreature — sonst bliebe die
    // Erschließung ("Wurm besiegt?") für immer blockiert, obwohl er faktisch tot ist.
    if ((gameState.uw.c || []).some(c => c.t === UWC_WURM && c.h <= 0)) {
        gameState.uw.wd = 1;
        showToast('🐛 Ein Beben läuft durch das Land — der Alte Wurm ist gefallen!', 'gold');
    }
    gameState.uw.c = (gameState.uw.c || []).filter(c => c.h > 0);
    // Verwaiste Ladungen (Besitzer ausgeschieden, kommt nie wieder ans Zug) beim
    // Aufräumen mit entfernen, statt für immer im State hängen zu bleiben.
    gameState.uw.dy = gameState.uw.dy.filter(c => c.p !== pId && gameState.p[c.p] && gameState.p[c.p].dead !== 1);
    return floats;
}

// Engstelle (M10, PLAN.md Abschn. 3): offenes Hex mit <= 2 offenen Nachbarn.
function isChokepoint(state, x, y) {
    if (!isUnderworldOpen(state, x, y)) return false;
    const openNeighbors = getNeighbors(x, y).filter(n => isUnderworldOpen(state, n.x, n.y));
    return openNeighbors.length <= 2;
}

// Angriffsziele im Unterwelt-Nahkampf: fremde, SICHTBARE Tiefeneinheiten in
// Reichweite (alle Typen haben RW 1) — Diplomatie (Bündnis/Waffenstillstand)
// gilt wie an der Oberfläche.
function calculateAttacksUW(unit) {
    const attacks = [];
    const pState = gameState.p[gameState.cp];
    const canAttack = (targetId) => !(pState.al && pState.al.includes(targetId)) && !(pState.tc && pState.tc.includes(targetId));
    const range = unitStats[unit.t].range;
    ((gameState.uw && gameState.uw.u) || []).forEach(enemy => {
        if (enemy.p === unit.p || !canAttack(enemy.p)) return;
        if (!isUWUnitVisible(unit.p, enemy)) return; // Sichtregel: nur sichtbare Ziele
        if (hexDistance({ x: unit.x, y: unit.y }, { x: enemy.x, y: enemy.y }) <= range) {
            attacks.push({ x: enemy.x, y: enemy.y, target: enemy });
        }
    });
    // Kreaturen (M11): neutral, keine Diplomatie-Prüfung nötig — nur Sicht
    // (isUWCreatureVisible, gleiche Umkreis-2-Regel wie fremde Spieler-Einheiten).
    ((gameState.uw && gameState.uw.c) || []).forEach(creature => {
        if (creature.h <= 0) return;
        if (!isUWCreatureVisible(unit.p, creature)) return;
        if (hexDistance({ x: unit.x, y: unit.y }, { x: creature.x, y: creature.y }) <= range) {
            attacks.push({ x: creature.x, y: creature.y, target: creature, isCreature: true });
        }
    });
    return attacks;
}

// Unterwelt-Pendant zu getExpectedDamage: Plünderer-Nahkampf-Passiv, Veteranen-
// Bonus, Reliquie (Klinge), HP-Skalierung wie oben.
function getExpectedDamageUW(attackerUnit, targetUnit) {
    const pState = gameState.p[attackerUnit.p];
    const stats = unitStats[attackerUnit.t];
    let dmg = stats.dmg;

    if (pState.f.includes(1) && stats.isMelee) dmg += 1;
    if (attackerUnit.art === 'blade') dmg += 5;
    dmg += getVeteranBonus(attackerUnit);

    const maxHp = getUnitMaxHp(pState, attackerUnit.t, attackerUnit);
    return Math.max(1, Math.round(dmg * (attackerUnit.h / maxHp)));
}

// Grubenritter (19): Sturmangriff — nach einem Kill (Einheit ODER Kreatur) darf
// er sich noch einmal frisch bewegen + angreifen (a zurück auf 0, wie ein neuer
// Zug), aber nur einmal pro eigenem Zug — attacker.sm sperrt danach jede weitere
// Auslösung, auch wenn der Bonus-Angriff selbst wieder tötet (keine Kill-Ketten).
// sm ist rein transient (wie br/ld bei Oberflächen-Einheiten) und wird beim
// nächsten a-Reset in doEndTurn mitgelöscht.
function maybeTriggerSturmangriff(attacker) {
    if (attacker.t === 19 && !attacker.sm) {
        attacker.a = 0;
        attacker.sm = 1;
    }
}

// Führt einen einzelnen Unterwelt-Angriff INSTANT aus — keine 600ms-Verzögerung,
// die übernimmt der Aufrufer (executeUWAttack, js/input.js) für den optischen
// Konterschlag; hier nur die reine Regel (Schaden, Kill, Beutegräber-Diebstahl,
// Nahkampf-Nachrücken), damit sie DOM-frei testbar ist (M10-Verifikation).
// Angriff ist eine FÄHIGKEIT wie Graben/Dynamit/Stollenbruch: aus a=0 ODER
// (nach vorheriger Bewegung) a=2 nutzbar, verbraucht die Aktion vollständig
// (a=1, Oberflächen-Parität, Korrektur Juli 2026) — der Angreifer selbst setzt
// das hier, statt es dem DOM-Wrapper zu überlassen.
// Gibt { finalDmg, killed, stolenCrystals, retDmg } zurück — retDmg > 0 heißt
// "Ziel darf kontern" (überlebt UND Angreifer bleibt in seiner Reichweite).
function resolveUWAttack(state, attacker, target) {
    const finalDmg = getExpectedDamageUW(attacker, target);
    target.h -= finalDmg;
    attacker.a = 1;
    const result = { finalDmg, killed: false, stolenCrystals: 0, retDmg: 0 };

    if (target.h > 0) {
        const dist = hexDistance({ x: attacker.x, y: attacker.y }, { x: target.x, y: target.y });
        if (dist <= unitStats[target.t].range) result.retDmg = getExpectedDamageUW(target, attacker);
        return result;
    }

    result.killed = true;
    // Beutegräber (20): stiehlt getragene Kristalle des Opfers beim Kill (Korrektur
    // Juli 2026, uncapped — kein Diebstahl-Limit mehr). Andere Killer lassen die
    // Fracht des Opfers auf dessen Hex fallen (dropUWCrystalsOnDeath).
    if (attacker.t === 20 && target.cr) {
        attacker.cr = (attacker.cr || 0) + target.cr;
        result.stolenCrystals = target.cr;
    } else {
        dropUWCrystalsOnDeath(state, target);
    }
    state.uw.u = state.uw.u.filter(u => u !== target);
    checkVeteran(attacker);
    // Nahkampf-Killer rückt aufs Ziel-Hex nach (frei, da das Ziel gerade starb —
    // Stacking anderer Einheiten/Kreaturen dort wäre nur bei einem zweiten,
    // zeitgleichen Kill auf demselben Hex möglich, daher defensiv geprüft)
    if (!(state.uw.u || []).some(u => u.x === target.x && u.y === target.y) && !(state.uw.c || []).some(c => c.x === target.x && c.y === target.y && c.h > 0)) {
        attacker.x = target.x; attacker.y = target.y;
        const picked = pickupUWCrystalDrop(state, attacker);
        if (picked > 0) result.stolenCrystals = (result.stolenCrystals || 0) + picked;
    }
    maybeTriggerSturmangriff(attacker);
    return result;
}

// === UNTERWELT-KREATUREN: KAMPF (M11, PLAN.md Abschn. 5) ===
// Unterwelt-Pendant zu resolveUWAttack, aber gegen ein uw.c[]-Ziel statt eine
// Spieler-Einheit: Kreaturen kontern NIE, wenn der Spieler sie im eigenen Zug
// angreift (retDmg bleibt immer 0) — auch der Alte Wurm nicht mehr. Ihre festen
// Angriffsmuster (creatureHitUnit, uwCreatureRoundPhase) bleiben unverändert;
// nur der reaktive Gegenschlag auf einen Spieler-Angriff ist deaktiviert
// (Korrektur Juli 2026). Kreaturen-Kills zählen für Veteranenstatus UND geben
// dem Beutegräber (20) zusätzlich +1 Gold (Roster-Passiv "Kopfgeld-Upgrade
// greift auf Kreaturen", PLAN Abschn. 4). Wie resolveUWAttack: aus a=0 ODER
// a=2 nutzbar, verbraucht die Aktion (a=1, Oberflächen-Parität, Korrektur
// Juli 2026).
function resolveUWAttackOnCreature(state, attacker, creature) {
    // getExpectedDamageUW liest vom "Ziel" nur targetUnit.t/x/y (Engstellen-Check
    // für 17/19) — Kreaturen-Typ-IDs (100+) treffen diesen Zweig nie, die Funktion
    // ist also gefahrlos auch gegen Kreaturen wiederverwendbar.
    const finalDmg = getExpectedDamageUW(attacker, creature);
    creature.h -= finalDmg;
    attacker.a = 1;
    const result = { finalDmg, killed: false, retDmg: 0, bonusGold: 0, wormDied: false };

    const isWurm = creature.t === UWC_WURM;

    if (creature.h <= 0) {
        result.killed = true;
        state.uw.c = state.uw.c.filter(c => c !== creature);
        checkVeteran(attacker);
        if (attacker.t === 20) {
            const pState = state.p[attacker.p];
            pState.g = (pState.g || 0) + 1;
            result.bonusGold = 1;
        }
        if (isWurm) {
            state.uw.wd = 1;
            result.wormDied = true;
        }
        // Nahkampf-Killer rückt aufs Ziel-Hex nach (frei, da die Kreatur starb)
        if (!(state.uw.u || []).some(u => u.x === creature.x && u.y === creature.y) && !(state.uw.c || []).some(c => c.x === creature.x && c.y === creature.y && c.h > 0)) {
            attacker.x = creature.x; attacker.y = creature.y;
            pickupUWCrystalDrop(state, attacker); // falls dort zufällig ein Kristallhaufen liegt
        }
        maybeTriggerSturmangriff(attacker);
    }
    return result;
}

// Nächste Spieler-Einheit einer Kreatur im Radius — deterministischer Tiebreak
// (Distanz, dann HP, dann Position), kein Zufall nötig.
function uwNearestPlayerUnit(x, y, radius) {
    const candidates = ((gameState.uw && gameState.uw.u) || []).filter(u =>
        hexDistance({ x, y }, { x: u.x, y: u.y }) <= radius);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) =>
        (hexDistance({ x, y }, a) - hexDistance({ x, y }, b)) || (a.h - b.h) || (a.x - b.x) || (a.y - b.y));
    return candidates[0];
}

// Kreatur trifft eine Spieler-Einheit — kein Veteranen-Credit (Kreaturen kennen
// kein vet-Konzept), tötet aber normal; getragene Kristalle fallen wie bei
// jedem anderen Tod (Korrektur Juli 2026, dropUWCrystalsOnDeath). Gibt true
// zurück, wenn die Einheit dabei starb.
function creatureHitUnit(target, dmg) {
    target.h -= dmg;
    if (target.h <= 0) {
        dropUWCrystalsOnDeath(gameState, target);
        gameState.uw.u = gameState.uw.u.filter(u => u !== target);
        return true;
    }
    return false;
}

// === UNTERWELT-KREATUREN: RUNDEN-PHASE (Korrektur Juli 2026, "Runden-Phase +
// Telegraph", ersetzt das alte Pro-Zug-Modell) ===
// Grund: im alten Modell zog jede Kreatur bei JEDEM doEndTurn — bei 6 Spielern
// wurde eine Einheit so bis zu 6x angegriffen, bevor ihr Besitzer je reagieren
// konnte. Neues Modell (civ-artige Barbaren-Phase × Into-the-Breach-Telegraph):
// Kreaturen agieren GENAU 1x pro Runde (beim Rundenwechsel), und jeder
// bevorstehende Treffer wird eine volle Runde VORHER als Ziel-Hex markiert
// (c.ap = {p: patternIdx, d: dirIdx}) — jeder Spieler hat also mindestens
// einen vollen Zug Zeit zum Ausweichen, unabhängig von Spieleranzahl/-reihenfolge.
//
// Ablauf pro Aufruf (einmal pro Rundenwechsel, siehe doEndTurn/confirmSurrender):
//   (a) AUFLÖSUNG: die in der VORRUNDE gesetzten Telegraphen (c.ap) lösen aus —
//       JEDE Spieler-Einheit auf einem Ziel-Hex nimmt Schaden, unabhängig vom
//       Besitzer (Kreaturen sind neutral, kein "Verursacher"-Bezug — auch eine
//       Einheit, die erst NACH dem Telegraph dorthin gezogen ist, wird
//       getroffen). Kreaturen schaden Kreaturen nicht.
//   (b) BEWEGUNG: danach ziehen die Kreaturen (Jagd bei vorhandenem Ziel,
//       sonst Patrouille).
//   (c) NEUE TELEGRAPHEN: erneuter Ziel-Scan NACH der Bewegung — nur mit Ziel
//       bekommt die Kreatur ein neues c.ap, sonst wird ihr altes gelöscht
//       (keine Markierung ohne erkanntes Ziel).
// PRNG aus sd+rn+festem Salt NUR für echte Gleichstands-Tiebreaks (Bewegungs-
// ziele sind bereits deterministisch über Distanz/Position sortiert).
// Gibt { floats, events } zurück (Muster: Brand-Ticks/Moral-Kollaps).
function uwCreatureRoundPhase() {
    if (!gameState.uw || !gameState.uw.c || gameState.uw.c.length === 0) return { floats: [], events: [] };
    const rng = createPRNG((gameState.sd ^ (gameState.rn * 7919) ^ 0x5EED) | 0);
    const floats = [];
    const events = [];

    // (a) AUFLÖSUNG — jedes Ziel-Hex jeder noch lebenden Kreatur mit Telegraph
    // trifft JEDE dort stehende Spieler-Einheit (kein Besitzer-Filter). Jeder
    // Treffer-Hex macht Lärm (addUWNoise), unabhängig davon, ob dort gerade
    // wirklich eine Einheit stand — die Kreatur schlägt hörbar zu (Gehör,
    // Korrektur Juli 2026, gleiche Regel wie Dynamit/Stollenbruch oben).
    gameState.uw.c.forEach(creature => {
        if (creature.h <= 0 || !creature.ap) return;
        const stats = uwCreatureStats[creature.t];
        getOpenCreatureAttackHexes(gameState, creature).forEach(h => {
            addUWNoise(h.x, h.y, 'creature_attack');
            const target = uwUnitAt(h.x, h.y);
            if (!target) return; // Kreaturen schaden Kreaturen nicht
            const killed = creatureHitUnit(target, stats.dmg);
            floats.push({ x: h.x, y: h.y, val: stats.dmg });
            events.push({ type: 'creatureAtk', x: h.x, y: h.y, dmg: stats.dmg, killed });
        });
    });

    // (b) BEWEGUNG — erst NACH der Auflösung, damit eine Kreatur ihr eigenes,
    // gerade getroffenes Opfer nicht binnen desselben Aufrufs weiterjagt. Jeder
    // tatsächliche Ortswechsel macht ebenfalls Lärm (herumlaufende Kreaturen
    // sind hörbar, Gehör-Ausbau Korrektur Juli 2026) — kein Ping, wenn die
    // Kreatur diese Runde gar nicht von der Stelle kam (z.B. Steinpanzer ohne
    // gültigen Schritt).
    gameState.uw.c.forEach(creature => {
        if (creature.h <= 0) return;
        const fromX = creature.x, fromY = creature.y;
        moveCreatureForRound(creature, rng);
        if (creature.x !== fromX || creature.y !== fromY) addUWNoise(creature.x, creature.y, 'creature_move');
    });

    // (c) NEUE TELEGRAPHEN — Ziel-Scan NACH der Bewegung; ohne Ziel keine Marke.
    gameState.uw.c.forEach(creature => {
        if (creature.h <= 0) return;
        const stats = uwCreatureStats[creature.t];
        const target = uwNearestPlayerUnit(creature.x, creature.y, stats.aggro);
        if (!target) { delete creature.ap; return; }
        const patternCount = creature.t === UWC_WURM ? 4 : 2;
        creature.ap = { p: gameState.rn % patternCount, d: bestDirTowards(creature.x, creature.y, target.x, target.y) };
    });

    gameState.uw.c = gameState.uw.c.filter(c => c.h > 0);
    return { floats, events };
}

// Deterministischer Tiebreak für die Telegraph-Richtung: die Achsenrichtung
// (0-5, UW_HEX_DIRS-Index), deren Distanz-1-Hex dem Ziel am nächsten liegt;
// bei Gleichstand gewinnt der kleinste Index (Schleife läuft aufsteigend,
// strikte < -Prüfung überschreibt frühere Treffer nie).
function bestDirTowards(x, y, tx, ty) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < 6; i++) {
        const d = hexDistance(uwHexInDirection(x, y, i, 1), { x: tx, y: ty });
        if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
}

// Öffnet ein Fels-Hex dauerhaft (Muster wie digUWHex, aber ohne Einheiten-
// Bewegung/Lärm — Kreaturen graben lautlos "im Vorbeigehen").
function openUWHexPermanently(x, y) {
    if (!gameState.uw.d) gameState.uw.d = [];
    const idx = y * gameState.bw + x;
    if (!gameState.uw.d.includes(idx)) gameState.uw.d.push(idx);
}

// Ein Bewegungsschritt Richtung `target`: erster Nachbar (nach getNeighbors-
// Reihenfolge), der die Distanz STRIKT verringert und begehbar ist. Der
// Wühler (101) darf dabei massiven Fels aufgraben (needsDig=true — der Aufrufer
// öffnet ihn erst NACH einem erfolgreichen Schritt), Adern mit Restbestand
// umgeht auch er weiterhin. Der Wurm (103) bricht zusätzlich JEDEN Kandidaten
// weg, der weiter als sein leash-Wert vom Herzkaverne-Zentrum entfernt läge
// ("WURM-LEINE" — Jagd-Schritte, die das verletzen würden, entfallen).
function pickHuntStep(creature, target) {
    const curDist = hexDistance({ x: creature.x, y: creature.y }, target);
    const isWurm = creature.t === UWC_WURM;
    const heartCenter = isWurm ? getHeartCavernHexes(gameState)[0] : null;
    const leash = isWurm ? uwCreatureStats[UWC_WURM].leash : null;
    let best = null, bestDist = curDist;
    getNeighbors(creature.x, creature.y).forEach(n => {
        if (uwUnitAt(n.x, n.y) || uwCreatureAt(n.x, n.y)) return;
        if (isUnderworldTunnelHead(gameState, n.x, n.y)) return;
        if (heartCenter && hexDistance(n, heartCenter) > leash) return;
        let passable = isUnderworldOpen(gameState, n.x, n.y);
        let needsDig = false;
        if (!passable && creature.t === UWC_WUEHLER) {
            if (getUnderworldType(gameState, n.x, n.y) === UW_ADER) return; // Ader mit Restbestand: umgehen
            passable = true; needsDig = true;
        }
        if (!passable) return;
        const d = hexDistance(n, target);
        if (d < bestDist) { bestDist = d; best = { x: n.x, y: n.y, dig: needsDig }; }
    });
    return best;
}

// Ein Patrouille-Schritt (genau 1, kein vorhandenes Ziel) — Verhalten je Typ
// laut PLAN.md Abschn. 5. Spinne: bleibt im Nest-Umkreis 2. Wühler: zieht auf
// die nächste Lärmquelle (uw.n, Umkreis 4) zu, gräbt dabei wie im Jagd-Fall.
// Steinpanzer: nur Schritte, nach denen weiterhin eine Ader mit Restbestand
// angrenzt (bewacht seinen Posten, sonst steht er). Wurm: außerhalb Distanz 1
// vom Herzkaverne-Zentrum -> 1 Schritt zurück; sonst 1 Schritt auf das nächste
// freie Ring-1-Hex in der festen (deterministischen) Reihenfolge von
// hexRingAround ("im Uhrzeigersinn").
function movePatrolStep(creature, rng) {
    if (creature.t === UWC_SPINNE) {
        const nest = getNearestSpiderNest(gameState, creature.x, creature.y);
        const options = getNeighbors(creature.x, creature.y).filter(n =>
            isUnderworldOpen(gameState, n.x, n.y) &&
            !uwUnitAt(n.x, n.y) && !uwCreatureAt(n.x, n.y) &&
            !isUnderworldTunnelHead(gameState, n.x, n.y) &&
            (!nest || hexDistance({ x: n.x, y: n.y }, nest) <= 2)
        );
        if (options.length > 0) {
            const pick = options[Math.floor(rng() * options.length)];
            creature.x = pick.x; creature.y = pick.y;
        }
        return;
    }

    if (creature.t === UWC_WUEHLER) {
        const markers = (gameState.uw.n || []).filter(m => hexDistance({ x: creature.x, y: creature.y }, m) <= 4);
        if (markers.length === 0) return;
        let bestDist = Infinity, bestMarkers = [];
        markers.forEach(m => {
            const d = hexDistance({ x: creature.x, y: creature.y }, m);
            if (d < bestDist) { bestDist = d; bestMarkers = [m]; }
            else if (d === bestDist) bestMarkers.push(m);
        });
        const chosenMarker = bestMarkers[Math.floor(rng() * bestMarkers.length)];
        let best = null, bestNeighborD = hexDistance({ x: creature.x, y: creature.y }, chosenMarker);
        getNeighbors(creature.x, creature.y).forEach(n => {
            if (uwUnitAt(n.x, n.y) || uwCreatureAt(n.x, n.y)) return;
            if (isUnderworldTunnelHead(gameState, n.x, n.y)) return;
            if (getUnderworldType(gameState, n.x, n.y) === UW_ADER && !isUnderworldOpen(gameState, n.x, n.y)) return;
            const d = hexDistance(n, chosenMarker);
            if (d < bestNeighborD) { bestNeighborD = d; best = n; }
        });
        if (best) {
            openUWHexPermanently(best.x, best.y);
            creature.x = best.x; creature.y = best.y;
        }
        return;
    }

    if (creature.t === UWC_STEINPANZER) {
        const options = getNeighbors(creature.x, creature.y).filter(n =>
            isUnderworldOpen(gameState, n.x, n.y) && !uwUnitAt(n.x, n.y) && !uwCreatureAt(n.x, n.y) &&
            !isUnderworldTunnelHead(gameState, n.x, n.y) &&
            getNeighbors(n.x, n.y).some(nn => getUWVeinRemaining(gameState, nn.x, nn.y) > 0));
        if (options.length > 0) {
            const pick = options[Math.floor(rng() * options.length)];
            creature.x = pick.x; creature.y = pick.y;
        }
        return;
    }

    if (creature.t === UWC_WURM) {
        const center = getHeartCavernHexes(gameState)[0];
        const distToCenter = hexDistance({ x: creature.x, y: creature.y }, center);
        if (distToCenter > 1) {
            let best = null, bestD = distToCenter;
            getNeighbors(creature.x, creature.y).forEach(n => {
                if (!isUnderworldOpen(gameState, n.x, n.y) || uwUnitAt(n.x, n.y) || uwCreatureAt(n.x, n.y)) return;
                const d = hexDistance(n, center);
                if (d < bestD) { bestD = d; best = n; }
            });
            if (best) { creature.x = best.x; creature.y = best.y; }
        } else {
            const ring = hexRingAround(center, 1);
            const curIdx = ring.findIndex(h => h.x === creature.x && h.y === creature.y);
            for (let step = 1; step <= ring.length; step++) {
                const cand = ring[(curIdx + step + ring.length) % ring.length];
                if (!isUnderworldOpen(gameState, cand.x, cand.y)) continue;
                if (uwUnitAt(cand.x, cand.y) || uwCreatureAt(cand.x, cand.y)) continue;
                creature.x = cand.x; creature.y = cand.y;
                break;
            }
        }
    }
}

// Bewegung EINER Kreatur für die aktuelle Runde: Jagd (Ziel vorhanden, bis zu
// huntMove Schritte, stoppt bei Distanz 1 — nie AUF die Zieleinheit) oder
// Patrouille (kein Ziel, genau 1 Schritt, patrolMove ist für alle Kreaturen
// aktuell 1). Die Spinne legt danach IMMER (Jagd wie Patrouille) ein Netz auf
// ihrem aktuellen Hex ab (max. 1x pro Hex — erneutes Ablegen ist ein No-Op).
function moveCreatureForRound(creature, rng) {
    const stats = uwCreatureStats[creature.t];
    const target = uwNearestPlayerUnit(creature.x, creature.y, stats.aggro);

    if (target) {
        for (let step = 0; step < stats.huntMove; step++) {
            if (hexDistance({ x: creature.x, y: creature.y }, target) <= 1) break;
            const next = pickHuntStep(creature, target);
            if (!next) break;
            if (next.dig) openUWHexPermanently(next.x, next.y);
            creature.x = next.x; creature.y = next.y;
        }
    } else {
        movePatrolStep(creature, rng);
    }

    if (creature.t === UWC_SPINNE) {
        if (!gameState.uw.w) gameState.uw.w = {};
        gameState.uw.w[`${creature.x},${creature.y}`] = 1;
    }
}

// === UNTERWELT-KREATUREN: ANGRIFFSMUSTER-GEOMETRIE (rein, keine State-Mutation) ===
// Leitet die aktuellen Ziel-Hexes EINER Kreatur aus ihrem Telegraph (c.ap) ab —
// Telegraph-Hexes werden nie gespeichert (s. State-Kommentar in js/input.js),
// sondern immer aus (Position, ap) neu berechnet; Kreaturen bewegen sich
// während einer Runde nicht, daher driftet nichts. Ohne c.ap: leeres Array.
// Alle Ergebnisse werden auf isInsideMap gefiltert (Kartenrand).
function getCreatureAttackHexes(state, creature) {
    if (!creature.ap) return [];
    const { p, d } = creature.ap;
    const cx = creature.x, cy = creature.y;
    let hexes = [];

    if (creature.t === UWC_SPINNE) {
        if (p === 0) {
            // "Sprungbiss": Linie 2 in Richtung d.
            hexes = [uwHexInDirection(cx, cy, d, 1), uwHexInDirection(cx, cy, d, 2)];
        } else {
            // "Umklammern": Distanz-1-Hex in d + dessen 2 gemeinsame Nachbarn mit der Spinne.
            const t = uwHexInDirection(cx, cy, d, 1);
            hexes = getDynamiteTriangle(cx, cy, t.x, t.y);
        }
    } else if (creature.t === UWC_WUEHLER) {
        if (p === 0) {
            // "Grabstoß": Linie 3 in Richtung d.
            hexes = [1, 2, 3].map(dist => uwHexInDirection(cx, cy, d, dist));
        } else {
            // "Beben": Ring 1 (alle 6 Nachbarn).
            hexes = hexRingAround({ x: cx, y: cy }, 1);
        }
    } else if (creature.t === UWC_STEINPANZER) {
        if (p === 0) {
            // "Felsschlag": Ring 1.
            hexes = hexRingAround({ x: cx, y: cy }, 1);
        } else {
            // "Erdrutsch": 120°-Keil bis Distanz 2 in Richtung d.
            hexes = getWedgeHexes(cx, cy, d);
        }
    } else if (creature.t === UWC_WURM) {
        if (p === 0) {
            hexes = hexRingAround({ x: cx, y: cy }, 1);
        } else if (p === 1) {
            // NUR Ring 2 — Ring 1 bleibt sicher.
            hexes = hexRingAround({ x: cx, y: cy }, 2);
        } else if (p === 2) {
            // 6 Strahlen à 3 Felder (alle 6 Achsen, Distanz 1-3).
            for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
                for (let dist = 1; dist <= 3; dist++) hexes.push(uwHexInDirection(cx, cy, dirIdx, dist));
            }
        } else {
            // "Wirbel": zwei gegenüberliegende Erdrutsch-Keile in d und (d+3)%6.
            hexes = getWedgeHexes(cx, cy, d).concat(getWedgeHexes(cx, cy, (d + 3) % 6));
        }
    }

    return hexes.filter(h => isInsideMap(state, h.x, h.y));
}

// Wie getCreatureAttackHexes, aber auf tatsächlich OFFENE Hexes eingeschränkt
// (Korrektur Juli 2026, Jonathan): ein noch ungegrabenes Fels-Hex kann ohnehin
// nie eine Einheit tragen, darf also nie Teil des tatsächlichen Treffer-/
// Anzeige-Musters sein — sonst wirkte es, als schlage die Kreatur durch die
// Wand hindurch auf eine dahinterliegende offene Tasche. Getrennt von der
// reinen Geometrie-Funktion oben, damit deren Muster-Form weiterhin isoliert
// vom Terrain testbar bleibt (maptest M11, Abschnitt "Pattern-Geometrien").
function getOpenCreatureAttackHexes(state, creature) {
    return getCreatureAttackHexes(state, creature).filter(h => isUnderworldOpen(state, h.x, h.y));
}

// === UNTERWELT-SICHT & -GEHÖR (M9b) ===
// Netz-Geometrie persistent in p[].ue (compressFog-Muster wie p[].e), analog
// getVisibleHexes/updateExploration oben — plus SICHTWEITE 1 (Korrektur Juli
// 2026, Jonathans Playtest): Einheiten und eigene Stollenköpfe decken
// zusätzlich die direkt angrenzenden Hexes auf (persistent via
// updateUWExploration), sonst wären Felsbrocken, Kristalladern und Fundkammern
// direkt neben dem eigenen Gang praktisch unauffindbar. Tiefer in den Fels
// hinein sieht man weiterhin NICHTS (kein Radius-2+-Sichtfeld wie oben).
// M13 Diplomatie-Pass: analog zur Oberfläche (getVisibleHexes(playerId,
// includeAllies=true) vereint p[].e mit dem der Verbündeten) wird hier das
// persistente Stollen-Netz (p[].ue) mit dem aller Verbündeten vereint — ein
// Bündnis teilt die erkundete Tiefen-Geometrie genau wie den Oberflächen-Nebel.
function getVisibleUWHexes(playerId, includeAllies = true) {
    const set = new Set();
    if (window.DEBUG_UW_REVEAL !== false) {
        for (let y = 0; y < gameState.bh; y++)
            for (let x = 0; x < gameState.bw; x++)
                if (isInsideMap(gameState, x, y)) set.add(`${x},${y}`);
        return set;
    }
    const addUE = (pId) => {
        const pState = gameState.p[pId];
        if (!pState) return;
        (pState.ue || []).forEach(idx => {
            const x = idx % gameState.bw, y = Math.floor(idx / gameState.bw);
            set.add(`${x},${y}`);
        });
    };
    addUE(playerId);
    if (includeAllies) {
        const pState = gameState.p[playerId];
        (pState.al || []).forEach(allyId => addUE(allyId));
    }
    // Eigene (und verbündete) Stollenköpfe sind immer sichtbar, auch bevor je
    // eine eigene Einheit dort stand — der Tunnel selbst ist an der Oberfläche
    // ohnehin bekannt, das HUB darunter soll nicht erst "entdeckt" werden müssen.
    // SICHTWEITE 1 (Korrektur Juli 2026): Stollenköpfe UND eigene/verbündete
    // Einheiten decken zusätzlich ihre 6 Nachbarhexes live auf — sonst wären
    // Felsbrocken/Adern/Fundkammern direkt neben dem Gang unauffindbar.
    // (updateUWExploration persistiert dieselben Hexes zusätzlich in p[].ue.)
    const visibleOwners = includeAllies ? [playerId, ...((gameState.p[playerId].al) || [])] : [playerId];
    const addWithRing = (x, y) => {
        set.add(`${x},${y}`);
        getNeighbors(x, y).forEach(n => set.add(`${n.x},${n.y}`));
    };
    getUnderworldTunnelHeads(gameState).forEach(h => {
        if (visibleOwners.includes(h.owner)) addWithRing(h.x, h.y);
    });
    ((gameState.uw && gameState.uw.u) || []).forEach(u => {
        if (visibleOwners.includes(u.p)) addWithRing(u.x, u.y);
    });
    return set;
}

function uwOwnUnits(playerId) {
    return ((gameState.uw && gameState.uw.u) || []).filter(u => u.p === playerId);
}

// Bewegliches (fremde Einheiten) ist nur im Umkreis 2 eigener (oder verbündeter,
// M13 — Bündnisse teilen wie an der Oberfläche die volle Sicht) Tiefeneinheiten
// sichtbar, unabhängig von der persistenten Netz-Geometrie — bekannte Gänge
// können jederzeit Hinterhalte enthalten (PLAN.md Abschn. 3). `iv` (aktive,
// zeitlich befristete Tarnung wie bei der Assassine oben) macht eine Einheit
// UNABHÄNGIG vom Umkreis unsichtbar, nur der eigene Besitzer sieht sie — der
// Horcher (21) hat seit Korrektur Juli 2026 KEINE permanente Tarnung mehr
// (war zu stark), stattdessen die aktive Sprung-Fähigkeit (s. calculateHorcherJumpTargetsUW).
// Verbündete Einheiten selbst sind immer sichtbar (keine Umkreis-Beschränkung
// unter Bündnispartnern, exakt wie Oberflächen-Verbündete stets sichtbar sind).
function isUWUnitVisible(playerId, unit) {
    if (window.DEBUG_UW_REVEAL !== false) return true;
    if (unit.p === playerId) return true;
    const pState = gameState.p[playerId];
    if (unit.p !== undefined && pState.al && pState.al.includes(unit.p)) return true;
    if (unit.iv === 1) return false;
    const alliedIds = [playerId, ...((pState.al) || [])];
    return alliedIds.some(pid => uwOwnUnits(pid).some(o => hexDistance({ x: o.x, y: o.y }, { x: unit.x, y: unit.y }) <= 2));
}

// Kreaturen (M11) nutzen dieselbe Umkreis-2-Sichtregel wie fremde Spieler-
// Einheiten — isUWUnitVisible degradiert dafür schon korrekt (Kreaturen haben
// weder .p noch .iv), dieser Wrapper macht die Erweiterung nur explizit lesbar.
function isUWCreatureVisible(playerId, creature) {
    return isUWUnitVisible(playerId, creature);
}

// Liegt (x,y) im Umkreis `radius` einer eigenen (oder verbündeten) Tiefen-
// einheit? Gleiche Basis wie die Umkreis-2-Regel für Bewegliches, aber für
// ORTE statt Entities — z. B. Telegraph-Markierungen, die knapp außerhalb des
// eigenen Netzes liegen, aber in Sichtweite der eigenen Einheiten (Korrektur
// Juli 2026: ohne das war eine Kreatur neben dir sichtbar, ihr Angriffsziel
// aber nicht).
function uwHexNearOwnUnits(playerId, x, y, radius = 2) {
    if (window.DEBUG_UW_REVEAL !== false) return true;
    const pState = gameState.p[playerId];
    const ids = [playerId, ...((pState && pState.al) || [])];
    return ids.some(pid => uwOwnUnits(pid).some(o => hexDistance({ x: o.x, y: o.y }, { x, y }) <= radius));
}

function markUWExplored(playerId, x, y) {
    const pState = gameState.p[playerId];
    if (!pState.ue) pState.ue = [];
    const idx = y * gameState.bw + x;
    if (!pState.ue.includes(idx)) pState.ue.push(idx);
}

// Persistiert die Netz-Geometrie des aktiven Spielers — läuft bei jedem Render
// (wie updateExploration), rein additiv: jedes Hex, auf dem gerade eine eigene
// Tiefeneinheit steht (frisch gegraben, abgebaut, bewegt, kurz nach Kauf/
// Ebenenwechsel), wird dauerhaft Teil von p[].ue — PLUS Sichtweite 1 (Korrektur
// Juli 2026): auch die 6 Nachbarhexes jeder Einheit und jedes eigenen
// Stollenkopfs, damit einmal Gesehenes (Adern, Fundkammern, Felswände) wie an
// der Oberfläche dauerhaft auf der Karte bleibt.
function updateUWExploration() {
    const pId = gameState.cp;
    const markWithRing = (x, y) => {
        markUWExplored(pId, x, y);
        getNeighbors(x, y).forEach(n => markUWExplored(pId, n.x, n.y));
    };
    uwOwnUnits(pId).forEach(u => markWithRing(u.x, u.y));
    getUnderworldTunnelHeads(gameState).forEach(h => {
        if (h.owner === pId) markWithRing(h.x, h.y);
    });
}

// Gehör (Minimal-Implementierung, PLAN.md Abschn. 3+9): fremde Lärm-Marker aus
// der letzten beendeten Runde (gameState.uw.n) im Umkreis 3 einer eigenen
// Einheit erzeugen eine ungefähre Richtungsmarkierung — approximiert hier als
// das eigene Netz-Hex, das der Lärmquelle am nächsten liegt (kein exaktes Hex
// der Quelle selbst, aber auch kein Sektor-Winkel — Horcher/M10 macht daraus
// später eine exakte Ortung).
// === UNTERWELT-AKTIONEN (reine Zustandsmutation, DOM-frei testbar) ===
// input.js/abilities.js/ui.js rufen diese Funktionen aus den Klick-Handlern
// auf (dort kommen saveUndoState/turnActions/Rendering/Belegt-Checks dazu) —
// hier nur der Kern der jeweiligen Regel, damit er unabhängig vom DOM getestet
// werden kann (siehe maptest-Verifikation M9b).

// Bewegung: reine Ortsänderung + a=2 (Bewegungs-Zwischenzustand — "hat sich
// bewegt, darf noch GENAU eine weitere Aktion (Graben/Angreifen/Fähigkeit),
// aber NICHT nochmal bewegen", exaktes Pendant zu executeMoveTo/showTileUI an
// der Oberfläche, js/input.js — Korrektur Juli 2026). Web-Verbrauch und
// automatisches Aufsammeln eines herrenlosen Kristallhaufens laufen als
// Nebenwirkung mit — reine Zustandsmutation, damit der ganze Bewegungsschritt
// DOM-frei testbar bleibt (executeUWMoveTo in js/input.js bleibt ein dünner
// Wrapper: saveUndoState/turnActions/Toasts/Re-Öffnen des Aktionsmenüs).
// Eine Fundkammer am Ziel wird NICHT mehr automatisch geplündert (Korrektur
// Juli 2026) — Plündern ist jetzt eine eigene Button-Aktion wie "Dorf
// einnehmen" an der Oberfläche, siehe lootFundkammerAction.
// Gibt { picked } für die Toast-Texte des Aufrufers zurück.
function moveUWUnit(state, unit, x, y) {
    unit.x = x; unit.y = y;
    unit.a = 2;
    // mv = "hat sich diesen Zug bewegt" (transient, wie sm/br) — die Grubenwache
    // (17) heilt am Rundenende nur, wenn sie NICHT bewegt wurde; Angreifen allein
    // ist erlaubt (PLAN.md Abschn. 4, Korrektur Juli 2026).
    unit.mv = 1;
    const webKey = `${x},${y}`;
    if (state.uw && state.uw.w && state.uw.w[webKey]) delete state.uw.w[webKey];
    const picked = pickupUWCrystalDrop(state, unit);
    return { picked };
}

// Öffnet das Ziel-Hex dauerhaft und rückt die Einheit nach ("durchfressen") —
// Graben ERSETZT hier die Bewegung (der einzige Weg durch massiven Fels), gilt
// also für den a-Zustand wie eine normale Bewegung: die ERSTE Grabung des Zuges
// (unit.a war noch 0) hinterlässt a=2, denselben "Bewegen+Agieren"-Zwischen-
// zustand wie nach einer Bewegung durch offenes Gelände — Oberflächen-Parität
// (Korrektur Juli 2026, Bugfix: Arbeiter konnten nach dem Durchgraben von Fels
// nicht mehr abbauen, obwohl das Toggle wie beim Steinabbau keine Aktion
// verbraucht; nach einer normalen Bewegung ging das schon). Kam die Einheit
// bereits über eine Bewegung ODER eine vorherige Grabung auf a=2, verbraucht
// die nächste Grabung die Aktion vollständig (a=1) wie jede andere Fähigkeit.
// Das dg-Flag markiert "hat diesen Zug schon gegraben" — calculateDigsUW
// sperrt damit ein ZWEITES Graben für alle außer dem Bohrwagen (22, digMove=2,
// PLAN.md Abschn. 3/4, s. dort), der als einziger 2x/Zug graben darf.
function digUWHex(state, unit, x, y) {
    if (!state.uw) state.uw = { d: [], u: [], n: [], a: {} };
    if (!state.uw.d) state.uw.d = [];
    const idx = y * state.bw + x;
    if (!state.uw.d.includes(idx)) state.uw.d.push(idx);
    const wasFreshTurn = unit.a === 0;
    unit.x = x; unit.y = y;
    unit.a = wasFreshTurn ? 2 : 1;
    unit.dg = 1;
}

// Ein Abbau-Tick: Beutegräber (20) nimmt bis zu 2 statt 1 (nie mehr als der
// Restbestand hergibt), Träger bekommt exakt die tatsächlich entnommene Menge
// OHNE Obergrenze (Korrektur Juli 2026 — Tragen ist weiterhin nötig, nur das
// Limit fällt weg). Bei Restbestand 0 wird das Hex dauerhaft offen (uw.d) und
// der uw.a-Eintrag gelöscht. Verbraucht KEINE Aktion mehr (Toggle-Abbau wie
// beim Arbeiter/Stein, siehe processAutoMiningUW/startUWMining) — anders als
// beim einmaligen Graben ist Abbauen ein passiver Dauerzustand. Gibt den neuen
// Restbestand zurück.
function mineUWVein(state, unit, x, y) {
    if (!state.uw) state.uw = { d: [], u: [], n: [], a: {} };
    if (!state.uw.a) state.uw.a = {};
    if (!state.uw.d) state.uw.d = [];
    const key = `${x},${y}`;
    let remaining = state.uw.a[key];
    if (remaining === undefined) remaining = getUWVeinMaxAmount(state, x, y);
    const take = Math.min(remaining, unit.t === 20 ? 2 : 1);
    remaining -= take;
    unit.cr = (unit.cr || 0) + take;
    if (remaining <= 0) {
        const idx = y * state.bw + x;
        if (!state.uw.d.includes(idx)) state.uw.d.push(idx);
        delete state.uw.a[key];
    } else {
        state.uw.a[key] = remaining;
    }
    return Math.max(0, remaining);
}

// === UNTERWELT: AUTO-ABBAU (Korrektur Juli 2026) ===
// Läuft am Zugende wie processAutoMining (Steinabbau oben): jede eigene
// Tiefeneinheit mit gesetztem `mi` (Toggle, siehe startUWMining/js/abilities.js)
// baut 1 Tick ab, SOLANGE sie noch in Reichweite (Distanz <=1, deckt sowohl
// "angrenzend" als auch "auf einem Stollenkopf über der Ader stehend" ab) einer
// Ader mit Restbestand steht — sonst stoppt der Abbau automatisch (Bewegung
// weg, Ader erschöpft). Verbraucht keine Aktion, läuft für jeden eigenen Zug.
function processAutoMiningUW(pId) {
    if (!gameState.uw || !gameState.uw.u) return;
    const myWorkers = gameState.uw.u.filter(u => u.p === pId && u.mi);
    myWorkers.forEach(w => {
        if (!w.mi) return;
        let tx = w.mi.x, ty = w.mi.y;
        let inRange = getUWVeinRemaining(gameState, tx, ty) > 0 && hexDistance({ x: w.x, y: w.y }, { x: tx, y: ty }) <= 1;
        if (!inRange) {
            // Ziel weg/außer Reichweite: auf eine andere Ader in Reichweite
            // umschwenken statt zu stoppen (Muster: processAutoMining oben).
            const alt = calculateMineTargetsUW(w);
            if (alt.length > 0) { tx = alt[0].x; ty = alt[0].y; w.mi = { x: tx, y: ty }; inRange = true; }
        }
        if (inRange) {
            mineUWVein(gameState, w, tx, ty);
            addUWNoise(tx, ty, 'mine');
            if (getUWVeinRemaining(gameState, tx, ty) === 0) {
                // Ader erschöpft: Toggle für ALLE Einheiten lösen, die noch
                // darauf zeigten (Muster: processAutoMining/Steinabbau oben).
                gameState.uw.u.forEach(u => { if (u.mi && u.mi.x === tx && u.mi.y === ty) delete u.mi; });
            }
        } else {
            delete w.mi;
        }
    });
}

// === UNTERWELT: AUTO-ABLIEFERUNG (Korrektur Juli 2026) ===
// Läuft ebenfalls am Zugende: jede eigene Tiefeneinheit mit Fracht, die auf
// oder neben (Distanz <=1) einem eigenen nutzbaren Stollenkopf steht, liefert
// automatisch ab — kein manueller "Abliefern"-Klick mehr nötig.
function processUWCrystalAutoDeliver(pId) {
    if (!gameState.uw || !gameState.uw.u) return;
    const heads = getUnderworldTunnelHeads(gameState).filter(h => h.owner === pId);
    if (heads.length === 0) return;
    gameState.uw.u.filter(u => u.p === pId && u.cr > 0).forEach(u => {
        const inRange = heads.some(h => hexDistance({ x: u.x, y: u.y }, { x: h.x, y: h.y }) <= 1);
        if (inRange) deliverUWCrystals(gameState, pId, u);
    });
}

// Abliefern: verbraucht bewusst KEINE Aktion (Komfort, siehe PLAN.md) — wird
// jetzt automatisch von processUWCrystalAutoDeliver aufgerufen, die reine
// Buchungsfunktion bleibt aber eigenständig (u. a. von den Tests direkt genutzt).
function deliverUWCrystals(state, playerId, unit) {
    const pState = state.p[playerId];
    if (!pState.k) pState.k = 0;
    const amount = unit.cr || 0;
    pState.k += amount;
    unit.cr = 0;
    return amount;
}

// === UNTERWELT: KRISTALLE FALLEN LASSEN (Korrektur Juli 2026) ===
// Stirbt eine Tiefeneinheit mit Fracht, bleibt die Fracht als Haufen auf ihrem
// Hex liegen (uw.dr = {"x,y": Menge}, wie uw.a/uw.f/uw.w strukturiert) — eine
// andere trage-fähige Einheit (Arbeiter 7, Beutegräber 20) sammelt sie beim
// Betreten automatisch ein (pickupUWCrystalDrop).
function dropUWCrystalsOnDeath(state, unit) {
    if (!unit.cr) return;
    if (!state.uw.dr) state.uw.dr = {};
    const key = `${unit.x},${unit.y}`;
    state.uw.dr[key] = (state.uw.dr[key] || 0) + unit.cr;
}

// Einsammeln eines Kristallhaufens: nur trage-fähige Typen (Arbeiter 7,
// Beutegräber 20) — läuft beim Betreten des Hex (executeUWMoveTo, js/input.js)
// bzw. beim Nachrücken auf ein frisch getötetes Ziel (resolveUWAttack(OnCreature)).
// Uncapped wie normales Tragen. Gibt die eingesammelte Menge zurück.
function pickupUWCrystalDrop(state, unit) {
    if (unit.t !== 7 && unit.t !== 20) return 0;
    if (!state.uw.dr) return 0;
    const key = `${unit.x},${unit.y}`;
    const amount = state.uw.dr[key];
    if (!amount) return 0;
    unit.cr = (unit.cr || 0) + amount;
    delete state.uw.dr[key];
    return amount;
}

// Ebenenwechsel: reine Array-Umzüge zwischen u[] und uw.u (Belegt-/Stollenkopf-
// Checks laufen vorher in abilities.js, hier nur der Datenumzug). Veteranenstatus,
// Kills und getragene Kristalle wandern mit.
function ascendUWUnit(state, unit) {
    state.uw.u = state.uw.u.filter(u => u !== unit);
    const nextId = Math.max(0, ...state.u.map(u => u.i || 0)) + 1;
    const surfaceUnit = { i: nextId, p: unit.p, t: unit.t, x: unit.x, y: unit.y, h: unit.h, a: 0 };
    if (unit.vet) surfaceUnit.vet = 1;
    if (unit.k) surfaceUnit.k = unit.k;
    if (unit.cr) surfaceUnit.cr = unit.cr;
    state.u.push(surfaceUnit);
    return surfaceUnit;
}

function descendUWUnit(state, unit) {
    state.u = state.u.filter(u => u !== unit);
    if (!state.uw) state.uw = { d: [], u: [], n: [], a: {} };
    const nextId = Math.max(0, ...state.uw.u.map(u => u.i || 0)) + 1;
    const uwUnit = { i: nextId, p: unit.p, t: unit.t, x: unit.x, y: unit.y, h: unit.h, a: 0 };
    if (unit.vet) uwUnit.vet = 1;
    if (unit.k) uwUnit.k = unit.k;
    if (unit.cr) uwUnit.cr = unit.cr;
    state.uw.u.push(uwUnit);
    return uwUnit;
}

// Kauf am Stollenkopf: Gold abziehen + Einheit anlegen (Belegt-/Gold-Checks
// laufen vorher in ui.js).
function buyUWUnitAt(state, playerId, x, y, type) {
    const pState = state.p[playerId];
    const cost = getUnitCost(pState, type);
    pState.g -= cost;
    if (!state.uw) state.uw = { d: [], u: [], n: [], a: {} };
    if (!state.uw.u) state.uw.u = [];
    const nextId = Math.max(0, ...state.uw.u.map(u => u.i || 0)) + 1;
    // Feudalismus-Passiv (fb, wie buyUnit auf der Oberfläche): +1 Max-HP pro 2
    // Dörfer — betrifft insbesondere den Grubenritter (19), gilt aber generisch
    // wie oben für jede gekaufte Einheit.
    let fb = 0;
    if (pState.f.includes(0)) fb = Math.floor(Object.values(state.v).filter(v => v === playerId).length / 2);
    const unitObj = { i: nextId, p: playerId, t: type, x, y, fb: fb, a: 1 };
    if (pState.u.includes(1)) unitObj.vet = 1; // Waffenmeister-Upgrade: startet als Veteran
    unitObj.h = getUnitMaxHp(pState, type, unitObj);
    state.uw.u.push(unitObj);
    return unitObj;
}

// Lesbare Namen je Lärm-Ursache (Korrektur Juli 2026, Tooltip-Ausbau) — geteilt
// zwischen getUWNoisePings-Konsumenten (js/input.js Tooltip) und ggf. Debug-UI.
// Unterminierung gibt es nicht mehr (durch Dynamit ersetzt), taucht hier bewusst
// nicht auf.
const UW_NOISE_TYPE_NAMES = {
    dig: 'Graben', mine: 'Abbau', combat: 'Kämpfe', dynamite: 'Dynamit',
    collapse: 'Stollenbruch', creature_move: 'Kreatur (Bewegung)', creature_attack: 'Kreatur (Angriff)'
};

// Graben/Abbau/Dynamit/Stollenbruch/Kämpfe erzeugen Lärm — sammelt im laufenden
// Zug (siehe window.uwNoiseScratch, js/globals.js), wird erst in doEndTurn
// "scharf" (in gameState.uw.n übernommen, damit nur GEGNER ihn hören, siehe
// getUWNoisePings). `type` (Schlüssel aus UW_NOISE_TYPE_NAMES) macht den
// Lärm-Ping später per Tooltip lesbar (welche Art Geräusch war das).
function addUWNoise(x, y, type) {
    if (!window.uwNoiseScratch) window.uwNoiseScratch = [];
    window.uwNoiseScratch.push({ x, y, type });
}

// Horcher (21, M10): Lärm im Umkreis 5 einer eigenen Horcher-Einheit wird als
// EXAKTES Hex geortet (`exact: true`) statt der Richtungs-Näherung — "Lauschen".
function getUWNoisePings(playerId) {
    const markers = (gameState.uw && gameState.uw.n) || [];
    if (markers.length === 0) return [];
    const own = uwOwnUnits(playerId);
    if (own.length === 0) return [];
    const network = getVisibleUWHexes(playerId);
    const pings = [];
    markers.forEach(m => {
        const horcher = own.find(o => o.t === 21 && hexDistance({ x: o.x, y: o.y }, { x: m.x, y: m.y }) <= 5);
        if (horcher) { pings.push({ x: m.x, y: m.y, exact: true, type: m.type }); return; }

        const heard = own.some(o => hexDistance({ x: o.x, y: o.y }, { x: m.x, y: m.y }) <= 3);
        if (!heard) return;
        let best = null, bestDist = Infinity;
        network.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            const d = hexDistance({ x, y }, { x: m.x, y: m.y });
            if (d < bestDist) { bestDist = d; best = { x, y }; }
        });
        if (best) pings.push({ x: best.x, y: best.y, exact: false, type: m.type });
    });
    return pings;
}

// === FUNDKAMMERN & RELIQUIEN (M10, PLAN.md Abschn. 2+5+7) ===
// Beute deterministisch aus dem Seed (underworldHash, js/hex.js, eigener Salt-
// Kanal) statt Zufall — zweimal am selben Hex geplündert (sollte nie passieren,
// siehe uw.f-Flag) liefert also ohnehin immer dasselbe Ergebnis.
const RELIC_KEYS = ['blade', 'armor', 'tool', 'map'];

// Plündert eine Fundkammer (einmalig, global via state.uw.f geflaggt). Gibt
// null zurück, wenn schon geplündert, sonst { type: 'crystal'|'relic', ... }.
function lootFundkammer(state, playerId, unit, x, y) {
    const key = `${x},${y}`;
    if (!state.uw) state.uw = { d: [], u: [], n: [], a: {} };
    if (!state.uw.f) state.uw.f = {};
    if (state.uw.f[key]) return null;
    state.uw.f[key] = 1;

    const pState = state.p[playerId];
    const isCrystal = underworldHash(state, x, y, 2) < 0.5;
    if (isCrystal) {
        let amount = 2;
        if (unit.t === 20) amount += 1; // Beutegräber-Passiv: +1 extra bei Kristall-Fund
        if (!pState.k) pState.k = 0;
        pState.k += amount;
        return { type: 'crystal', amount };
    }
    const idx = Math.min(RELIC_KEYS.length - 1, Math.floor(underworldHash(state, x, y, 3) * RELIC_KEYS.length));
    const relic = RELIC_KEYS[idx];
    // "map" wirkt sofort wie beim Kauf (buyRelic, js/ui.js) und landet nie im
    // Inventar — über applyRelicToUnit ausgerüstet hätte sie keinen Effekt.
    if (relic === 'map') {
        applyMapRelic(state, playerId);
        return { type: 'relic', relic, instant: true };
    }
    if (!pState.rel) pState.rel = [];
    pState.rel.push(relic);
    return { type: 'relic', relic };
}

// Plündern als BUTTON-Aktion (Korrektur Juli 2026, ersetzt das Auto-Plündern
// beim Betreten): die Einheit muss AUF dem Fundkammer-Hex stehen und plündert
// per Aktionsmenü-Button — verbraucht wie "Dorf einnehmen" an der Oberfläche
// (startCapture, js/ui.js) die restlichen Aktionen des Zuges (a=1, aus a=0
// ODER a=2 nutzbar). Reine Zustandsmutation, DOM-frei testbar — der Button-
// Wrapper (window.startUWLootFundkammer, js/input.js) macht Undo/Toast/Recap.
// Gibt das Loot-Objekt zurück, null wenn hier nichts (mehr) zu plündern ist.
function lootFundkammerAction(state, unit) {
    if (!isFundkammerHex(state, unit.x, unit.y)) return null;
    const loot = lootFundkammer(state, unit.p, unit, unit.x, unit.y);
    if (loot) unit.a = 1;
    return loot;
}

// Reliquie auf eine Einheit ausrüsten (Klinge/Harnisch) — eine Reliquie pro
// Einheit, Oberfläche ODER Unterwelt (dieselbe Funktion, u.art wird von
// getUnitMaxHp/getExpectedDamage(UW) gleichermaßen gelesen).
function applyRelicToUnit(state, playerId, relicKey, unit) {
    const pState = state.p[playerId];
    const idx = (pState.rel || []).indexOf(relicKey);
    if (idx === -1 || unit.art) return false;
    unit.art = relicKey;
    if (relicKey === 'armor') {
        const maxHp = getUnitMaxHp(pState, unit.t, unit); // jetzt inkl. +10-Bonus
        unit.h = Math.min(maxHp, unit.h + 10);
    }
    pState.rel.splice(idx, 1);
    return true;
}

// Meisterwerkzeug auf ein Bauwerk: sofort volle HP. `target` ist das Struktur-
// Objekt (Mauer/Turm/Tunnel) mit `.h`, ODER der Spieler-State selbst fürs
// Startdorf (`.sh`) — maxHpFor wird für alles außer dem Startdorf übergeben.
function applyRelicToBuilding(state, playerId, target, maxHpFor) {
    const pState = state.p[playerId];
    const idx = (pState.rel || []).indexOf('tool');
    if (idx === -1) return false;
    if (target.sh !== undefined) target.sh = 30; else target.h = maxHpFor;
    pState.rel.splice(idx, 1);
    return true;
}

// Karte der Tiefe: wirkt sofort beim Kauf, landet nie in p[].rel — deckt
// Oberfläche (p[].e) UND Unterwelt-Netz (p[].ue) komplett und dauerhaft auf.
// p[].mr gewährt zusätzlich permanente 100%-LIVE-Sicht an der Oberfläche
// (getVisibleHexes) — nur p[].e zu setzen ließ die Felder außerhalb der
// eigenen Sichtweite abgedunkelt (Jonathans Playtest Juli 2026). Unten bleibt
// die Umkreis-2-Regel für Bewegliches bewusst bestehen (Hinterhalt-Design,
// PLAN.md Abschn. 3) — die Netz-Geometrie ist über p[].ue ohnehin voll offen.
function applyMapRelic(state, playerId) {
    const pState = state.p[playerId];
    const total = state.bw * state.bh;
    const all = Array.from({ length: total }, (_, i) => i);
    pState.e = all.slice();
    pState.ue = all.slice();
    pState.mr = 1;
}

// === MORAL-KOLLAPS (M12, PLAN.md Abschn. 3) ===
function hasUsableTunnel(state, playerId) {
    return (state.tu || []).some(t => t.o === playerId && t.r <= state.rn);
}

// Zu Beginn des eigenen Zuges: kein nutzbarer Tunnel mehr -> alle eigenen
// Tiefeneinheiten verlieren genau 1 HP (Tode normal abgewickelt). Gibt die
// Float-Liste zurück (leer = nichts passiert, auch wenn ein Tunnel da ist).
function applyMoralCollapse(state, playerId) {
    if (!state.uw || !state.uw.u || state.uw.u.length === 0) return [];
    if (hasUsableTunnel(state, playerId)) return [];
    const myUWUnits = state.uw.u.filter(u => u.p === playerId);
    if (myUWUnits.length === 0) return [];
    const floats = [];
    myUWUnits.forEach(u => {
        u.h -= 1;
        floats.push({ x: u.x, y: u.y, val: 1 });
        if (u.h <= 0) dropUWCrystalsOnDeath(state, u); // Korrektur Juli 2026
    });
    state.uw.u = state.uw.u.filter(u => u.h > 0);
    return floats;
}

// === DER HERZ-SIEG: ERSCHLIESSUNG (M12, PLAN.md Abschn. 8) ===
// Anzahl der eigenen Zugenden, die die Bedingung ununterbrochen halten muss
// (Korrektur Juli 2026: 4 -> 5, einzige Stelle, die diese Zahl definiert —
// js/input.js/js/ui.js/js/debug.js lesen sie von hier statt sie zu duplizieren).
const ERSCHLIESSUNG_TARGET = 5;

// Bedingung an EINEM Zugende: Wurm tot, eigene Einheit exakt im Herzkaverne-
// ZENTRUM, keine nicht-verbündete fremde Tiefeneinheit irgendwo in der ganzen
// Herzkaverne (getHeartCavernHexes, js/hex.js). Verbündete unterbrechen NICHT
// (gleiche al[]-Logik wie checkTeamWin, js/diplomacy.js).
function checkErschliessungProgress(state, playerId) {
    if (!state.uw || state.uw.wd !== 1) return false;
    const cx = Math.floor(state.bw / 2), cy = Math.floor(state.bh / 2);
    const ownInCenter = (state.uw.u || []).some(u => u.p === playerId && u.x === cx && u.y === cy);
    if (!ownInCenter) return false;
    const pState = state.p[playerId];
    const isAllied = (otherId) => otherId === playerId || (pState.al && pState.al.includes(otherId));
    const heartHexes = getHeartCavernHexes(state);
    const enemyPresent = (state.uw.u || []).some(u => !isAllied(u.p) && heartHexes.some(h => h.x === u.x && h.y === u.y));
    return !enemyPresent;
}

// Aktualisiert uw.hz um EINEN Zugenden-Schritt für `playerId` (den gerade
// endenden Spieler) — neu gestartet, fortgesetzt (n bis max. ERSCHLIESSUNG_TARGET)
// oder komplett zurückgesetzt (Unterbrechung, "Reset auf 0" statt Abbau um 1).
// Gibt ein Ereignis-Objekt für Toast/Recap zurück (oder null bei "nichts passiert").
//
// Bugfix (Juli 2026): wird für JEDES Zugende aufgerufen, nicht nur für den
// aktuellen Halter (der Aufrufer in input.js kennt playerId nur als "der
// gerade beendende Spieler", zyklisch über alle Spieler). Gehört der laufende
// Zähler einem ANDEREN Spieler, hat das Zugende von playerId keinerlei
// Aussagekraft über dessen Fortschritt (playerId kann per Definition nicht
// gleichzeitig im Zentrum stehen) — ohne diese Sperre hat jeder einzelne
// Zugwechsel eines unbeteiligten Spielers den Zähler des echten Halters auf 0
// zurückgeworfen, sodass er bei 2+ Spielern nie über 1/ERSCHLIESSUNG_TARGET hinauskam.
function advanceErschliessung(state, playerId) {
    if (state.uw.hz && state.uw.hz.p !== playerId) return null;
    const held = checkErschliessungProgress(state, playerId);
    if (held) {
        if (!state.uw.hz || state.uw.hz.p !== playerId) {
            state.uw.hz = { p: playerId, n: 1 };
        } else {
            state.uw.hz.n = Math.min(ERSCHLIESSUNG_TARGET, state.uw.hz.n + 1);
        }
        return { type: state.uw.hz.n === 1 ? 'start' : 'progress', p: playerId, n: state.uw.hz.n };
    }
    if (state.uw.hz) {
        const interrupted = state.uw.hz.p;
        delete state.uw.hz;
        return { type: 'reset', p: interrupted };
    }
    return null;
}

// Sieg durch Erschließung: n==ERSCHLIESSUNG_TARGET -> Erschließer + seine
// (noch lebenden) Verbündeten gewinnen — exakt wie ein regulärer Team-Sieg
// (checkTeamWin), nur unabhängig davon, ob noch andere Spieler leben.
function checkErschliessungWin(state) {
    if (!state.uw || !state.uw.hz || state.uw.hz.n < ERSCHLIESSUNG_TARGET) return null;
    const p = state.uw.hz.p;
    if (!state.p[p] || state.p[p].dead === 1) return null;
    const allies = (state.p[p].al || []).filter(id => state.p[id] && state.p[id].dead !== 1);
    return [p, ...allies].map(id => state.p[id]);
}
