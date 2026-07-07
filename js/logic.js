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
    dmg += getVeteranBonus(attackerUnit);

    const maxHp = getUnitMaxHp(pState, attackerUnit.t, attackerUnit);
    let scaled = Math.max(1, Math.round(dmg * (attackerUnit.h / maxHp)));

    if (targetType === 'unit' && targetUnit && targetUnit.p === targetOwnerId) {
        const hasAura = gameState.u.some(u =>
            u.p === targetOwnerId && u.t === 11 && u.dp === 1 &&
            hexDistance({ x: u.x, y: u.y }, { x: targetUnit.x, y: targetUnit.y }) === 1
        );
        if (hasAura) scaled = Math.max(1, scaled - 1);
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
        const target = gameState.st.find(s => s.x === w.mi.x && s.y === w.mi.y && s.h > 0);
        const stillAdj = target && hexDistance({ x: w.x, y: w.y }, { x: target.x, y: target.y }) === 1;
        if (stillAdj) {
            const tx = target.x, ty = target.y;
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
function getVisibleHexes(playerId) {
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
    if (mainState.al) mainState.al.forEach(allyId => addV(allyId));
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
