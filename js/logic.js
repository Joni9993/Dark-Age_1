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

function calculateMovesUW(unit) {
    const pState = gameState.p[unit.p];
    const moveStat = getUnitMove(pState, unit.t, unit);
    let moves = [];
    let queue = [{ x: unit.x, y: unit.y, steps: 0 }];
    let visited = new Set([`${unit.x},${unit.y}`]);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.steps > 0) moves.push({ x: current.x, y: current.y });
        if (current.steps < moveStat) {
            for (const n of getNeighbors(current.x, current.y)) {
                const key = `${n.x},${n.y}`;
                if (visited.has(key)) continue;
                if (!isUnderworldOpen(gameState, n.x, n.y)) continue;
                if (uwUnitAt(n.x, n.y)) continue; // besetzt, egal von wem (kein Stacking)
                visited.add(key);
                queue.push({ x: n.x, y: n.y, steps: current.steps + 1 });
            }
        }
    }
    return moves;
}

// Angrenzende FELS-Hexes, die noch nicht offen sind — ein Klick darauf gräbt UND
// rückt die Einheit nach (siehe executeUWDig in input.js). Kaverne/Ruine/Herz
// sind schon offen (keine Grab-Ziele), Kristalladern laufen über calculateMineTargetsUW.
// Graben ist Tunnelgräber (16) und Bohrwagen (22) vorbehalten (PLAN.md Abschn. 3).
function calculateDigsUW(unit) {
    if (unit.t !== 16 && unit.t !== 22) return [];
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
// Abbau ist Tunnelgräber (16) und Beutegräber (20) vorbehalten (PLAN.md Abschn. 4).
function calculateMineTargetsUW(unit) {
    if (unit.t !== 16 && unit.t !== 20) return [];
    const targets = [];
    const consider = (x, y) => {
        if (getUWVeinRemaining(gameState, x, y) > 0) targets.push({ x, y });
    };
    consider(unit.x, unit.y);
    getNeighbors(unit.x, unit.y).forEach(n => consider(n.x, n.y));
    return targets;
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
    return attacks;
}

// Unterwelt-Pendant zu getExpectedDamage: Plünderer-Nahkampf-Passiv, Veteranen-
// Bonus, Reliquie (Klinge), HP-Skalierung wie oben — zusätzlich die Engstellen-
// Schildstellung (Grubenwache 17 / Grubenritter 19 erleiden dort -1, min. 1).
function getExpectedDamageUW(attackerUnit, targetUnit) {
    const pState = gameState.p[attackerUnit.p];
    const stats = unitStats[attackerUnit.t];
    let dmg = stats.dmg;

    if (pState.f.includes(1) && stats.isMelee) dmg += 1;
    if (attackerUnit.art === 'blade') dmg += 5;
    dmg += getVeteranBonus(attackerUnit);

    const maxHp = getUnitMaxHp(pState, attackerUnit.t, attackerUnit);
    let scaled = Math.max(1, Math.round(dmg * (attackerUnit.h / maxHp)));

    if ((targetUnit.t === 17 || targetUnit.t === 19) && isChokepoint(gameState, targetUnit.x, targetUnit.y)) {
        scaled = Math.max(1, scaled - 1);
    }
    return scaled;
}

// Führt einen einzelnen Unterwelt-Angriff INSTANT aus — keine 600ms-Verzögerung,
// die übernimmt der Aufrufer (executeUWAttack, js/input.js) für den optischen
// Konterschlag; hier nur die reine Regel (Schaden, Kill, Beutegräber-Diebstahl,
// Nahkampf-Nachrücken), damit sie DOM-frei testbar ist (M10-Verifikation).
// Gibt { finalDmg, killed, stolenCrystals, retDmg } zurück — retDmg > 0 heißt
// "Ziel darf kontern" (überlebt UND Angreifer bleibt in seiner Reichweite).
function resolveUWAttack(state, attacker, target) {
    const finalDmg = getExpectedDamageUW(attacker, target);
    target.h -= finalDmg;
    const result = { finalDmg, killed: false, stolenCrystals: 0, retDmg: 0 };

    if (target.h > 0) {
        const dist = hexDistance({ x: attacker.x, y: attacker.y }, { x: target.x, y: target.y });
        if (dist <= unitStats[target.t].range) result.retDmg = getExpectedDamageUW(target, attacker);
        return result;
    }

    result.killed = true;
    state.uw.u = state.uw.u.filter(u => u !== target);
    checkVeteran(attacker);
    // Beutegräber (20): stiehlt getragene Kristalle des Opfers beim Kill (max. 3)
    if (attacker.t === 20 && target.cr) {
        const room = 3 - (attacker.cr || 0);
        const stolen = Math.min(room, target.cr);
        if (stolen > 0) { attacker.cr = (attacker.cr || 0) + stolen; result.stolenCrystals = stolen; }
    }
    // Nahkampf-Killer rückt aufs Ziel-Hex nach (frei, da das Ziel gerade starb —
    // Stacking anderer Einheiten dort wäre nur bei einem zweiten, zeitgleichen
    // Kill auf demselben Hex möglich, daher defensiv geprüft)
    if (!(state.uw.u || []).some(u => u.x === target.x && u.y === target.y)) {
        attacker.x = target.x; attacker.y = target.y;
    }
    return result;
}

// === UNTERWELT-SICHT & -GEHÖR (M9b) ===
// Netz-Geometrie persistent in p[].ue (compressFog-Muster wie p[].e), analog
// getVisibleHexes/updateExploration oben, aber ohne Radius-Sichtfeld: sichtbar
// ist nur, was die eigenen Tiefeneinheiten je selbst betreten/gegraben haben.
function getVisibleUWHexes(playerId) {
    const set = new Set();
    if (window.DEBUG_UW_REVEAL !== false) {
        for (let y = 0; y < gameState.bh; y++)
            for (let x = 0; x < gameState.bw; x++)
                if (isInsideMap(gameState, x, y)) set.add(`${x},${y}`);
        return set;
    }
    const pState = gameState.p[playerId];
    (pState.ue || []).forEach(idx => {
        const x = idx % gameState.bw, y = Math.floor(idx / gameState.bw);
        set.add(`${x},${y}`);
    });
    return set;
}

function uwOwnUnits(playerId) {
    return ((gameState.uw && gameState.uw.u) || []).filter(u => u.p === playerId);
}

// Bewegliches (fremde Einheiten) ist nur im Umkreis 2 eigener Tiefeneinheiten
// sichtbar, unabhängig von der persistenten Netz-Geometrie — bekannte Gänge
// können jederzeit Hinterhalte enthalten (PLAN.md Abschn. 3). Horcher (21,
// M10): passiv unsichtbar (iv=1, siehe doEndTurn/executeUWAttack) — wie die
// Assassine oben gilt das UNABHÄNGIG vom Umkreis, nur der eigene Besitzer sieht ihn.
function isUWUnitVisible(playerId, unit) {
    if (window.DEBUG_UW_REVEAL !== false) return true;
    if (unit.p === playerId) return true;
    if (unit.iv === 1) return false;
    return uwOwnUnits(playerId).some(o => hexDistance({ x: o.x, y: o.y }, { x: unit.x, y: unit.y }) <= 2);
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
// Ebenenwechsel), wird dauerhaft Teil von p[].ue.
function updateUWExploration() {
    const pId = gameState.cp;
    uwOwnUnits(pId).forEach(u => markUWExplored(pId, u.x, u.y));
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

// Öffnet das Ziel-Hex dauerhaft und rückt die Einheit nach ("durchfressen").
function digUWHex(state, unit, x, y) {
    if (!state.uw) state.uw = { d: [], u: [], n: [], a: {} };
    if (!state.uw.d) state.uw.d = [];
    const idx = y * state.bw + x;
    if (!state.uw.d.includes(idx)) state.uw.d.push(idx);
    unit.x = x; unit.y = y;
    unit.a = 1;
}

// Ein Abbau-Tick: Beutegräber (20) nimmt bis zu 2 statt 1 (nie mehr als der
// Restbestand hergibt), Träger bekommt exakt die tatsächlich entnommene Menge
// (max. 3 insgesamt). Bei Restbestand 0 wird das Hex dauerhaft offen (uw.d)
// und der uw.a-Eintrag gelöscht. Gibt den neuen Restbestand zurück.
function mineUWVein(state, unit, x, y) {
    if (!state.uw) state.uw = { d: [], u: [], n: [], a: {} };
    if (!state.uw.a) state.uw.a = {};
    if (!state.uw.d) state.uw.d = [];
    const key = `${x},${y}`;
    let remaining = state.uw.a[key];
    if (remaining === undefined) remaining = 4;
    const take = Math.min(remaining, unit.t === 20 ? 2 : 1);
    remaining -= take;
    if (!unit.cr) unit.cr = 0;
    unit.cr = Math.min(3, unit.cr + take);
    if (remaining <= 0) {
        const idx = y * state.bw + x;
        if (!state.uw.d.includes(idx)) state.uw.d.push(idx);
        delete state.uw.a[key];
    } else {
        state.uw.a[key] = remaining;
    }
    unit.a = 1;
    return Math.max(0, remaining);
}

// Abliefern: verbraucht bewusst KEINE Aktion (Komfort, siehe PLAN.md).
function deliverUWCrystals(state, playerId, unit) {
    const pState = state.p[playerId];
    if (!pState.k) pState.k = 0;
    const amount = unit.cr || 0;
    pState.k += amount;
    unit.cr = 0;
    return amount;
}

// Ebenenwechsel: reine Array-Umzüge zwischen u[] und uw.u (Belegt-/Stollenkopf-
// Checks laufen vorher in abilities.js, hier nur der Datenumzug). Veteranenstatus,
// Kills und getragene Kristalle wandern mit.
function ascendUWUnit(state, unit) {
    state.uw.u = state.uw.u.filter(u => u !== unit);
    const nextId = Math.max(0, ...state.u.map(u => u.i || 0)) + 1;
    const surfaceUnit = { i: nextId, p: unit.p, t: unit.t, x: unit.x, y: unit.y, h: unit.h, a: 1 };
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
    const uwUnit = { i: nextId, p: unit.p, t: unit.t, x: unit.x, y: unit.y, h: unit.h, a: 1 };
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
    // Horcher (21): passiv unsichtbar ab Aufstellung (siehe isUWUnitVisible/doEndTurn)
    if (type === 21) unitObj.iv = 1;
    state.uw.u.push(unitObj);
    return unitObj;
}

// Graben/Abbau/Unterminierung erzeugen Lärm — sammelt im laufenden Zug (siehe
// window.uwNoiseScratch, js/globals.js), wird erst in doEndTurn "scharf"
// (in gameState.uw.n übernommen, damit nur GEGNER ihn hören, siehe getUWNoisePings).
function addUWNoise(x, y) {
    if (!window.uwNoiseScratch) window.uwNoiseScratch = [];
    window.uwNoiseScratch.push({ x, y });
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
        if (horcher) { pings.push({ x: m.x, y: m.y, exact: true }); return; }

        const heard = own.some(o => hexDistance({ x: o.x, y: o.y }, { x: m.x, y: m.y }) <= 3);
        if (!heard) return;
        let best = null, bestDist = Infinity;
        network.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            const d = hexDistance({ x, y }, { x: m.x, y: m.y });
            if (d < bestDist) { bestDist = d; best = { x, y }; }
        });
        if (best) pings.push({ x: best.x, y: best.y, exact: false });
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
    if (!pState.rel) pState.rel = [];
    pState.rel.push(relic);
    return { type: 'relic', relic };
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
function applyMapRelic(state, playerId) {
    const pState = state.p[playerId];
    const total = state.bw * state.bh;
    const all = Array.from({ length: total }, (_, i) => i);
    pState.e = all.slice();
    pState.ue = all.slice();
}
