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

// Angrenzende FELS-Hexes, die noch nicht offen sind — ein Klick darauf gräbt UND
// rückt die Einheit nach (siehe executeUWDig in input.js). Kaverne/Ruine/Herz
// sind schon offen (keine Grab-Ziele), Kristalladern laufen über calculateMineTargetsUW.
// Graben ist Arbeiter (7, DIE Ebenen-Brücke — Korrektur Juli 2026) und Bohrwagen
// (22) vorbehalten (PLAN.md Abschn. 3).
function calculateDigsUW(unit) {
    if (unit.t !== 7 && unit.t !== 22) return [];
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

// Verfüllt ein gegrabenes Hex wieder zu massivem Fels (Stollenbruch, M12).
function collapseUWHex(state, x, y) {
    if (!state.uw || !state.uw.d) return;
    const idx = y * state.bw + x;
    state.uw.d = state.uw.d.filter(i => i !== idx);
}

// Unterminierung (M12, PLAN.md Abschn. 6): gültiges Oberflächen-Ziel exakt über
// dem Unterwelt-Hex (x,y) — Priorität Startdorf > Turm > Mauer > Tunnel (die
// überlappen real nie, Priorität ist reine Absicherung). Normale Dörfer sind
// NIE ein gültiges Ziel.
function getUnderminingTargetAt(state, x, y) {
    for (let i = 0; i < state.p.length; i++) {
        if (state.p[i].dead !== 1 && state.p[i].sv === `${x},${y}`) return { type: 'startvillage', ownerId: i };
    }
    const tower = (state.tw || []).find(t => t.x === x && t.y === y && t.h > 0);
    if (tower) return { type: 'tower', ref: tower, ownerId: tower.o };
    const wall = (state.wa || []).find(w => w.x === x && w.y === y);
    if (wall) return { type: 'wall', ref: wall, ownerId: wall.o };
    const tunnel = (state.tu || []).find(t => (t.x1 === x && t.y1 === y) || (t.x2 === x && t.y2 === y));
    if (tunnel) return { type: 'tunnel', ref: tunnel, ownerId: tunnel.o };
    return null;
}

// Wendet exakt `dmg` Unterminierungs-Schaden auf ein zuvor per
// getUnderminingTargetAt ermitteltes Ziel an — Struktur-Tod läuft über die
// BESTEHENDEN Zerstörungs-Pfade (Startdorf -> normale Spieler-tot-Logik, siehe
// executeAttackOnTarget/js/input.js für das Oberflächen-Pendant). `byPlayerId`
// erobert ein zerstörtes Startdorf (Muster: der aktuell aktive Spieler,
// entspricht immer dem Sprengmeister-Besitzer).
function applyUnderminingDamage(state, target, dmg, byPlayerId) {
    if (target.type === 'startvillage') {
        const p = state.p[target.ownerId];
        p.sh -= dmg;
        if (p.sh <= 0) {
            p.dead = 1;
            state.u = state.u.filter(u => u.p !== target.ownerId);
            if (state.uw) state.uw.u = (state.uw.u || []).filter(u => u.p !== target.ownerId);
            state.v[p.sv] = byPlayerId;
        }
    } else if (target.type === 'tower') {
        target.ref.h -= dmg;
        if (target.ref.h <= 0) state.tw = state.tw.filter(t => t !== target.ref);
    } else if (target.type === 'wall') {
        target.ref.h -= dmg;
        if (target.ref.h <= 0) state.wa = state.wa.filter(w => w !== target.ref);
    } else if (target.type === 'tunnel') {
        target.ref.h -= dmg;
        if (target.ref.h <= 0) state.tu = state.tu.filter(t => t !== target.ref);
    }
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
    // Stacking anderer Einheiten/Kreaturen dort wäre nur bei einem zweiten,
    // zeitgleichen Kill auf demselben Hex möglich, daher defensiv geprüft)
    if (!(state.uw.u || []).some(u => u.x === target.x && u.y === target.y) && !(state.uw.c || []).some(c => c.x === target.x && c.y === target.y && c.h > 0)) {
        attacker.x = target.x; attacker.y = target.y;
        delete attacker.ch; // Kammer verfällt bei Bewegung (M12) — auch beim Nachrücken
    }
    return result;
}

// === UNTERWELT-KREATUREN: KAMPF (M11, PLAN.md Abschn. 5) ===
// Unterwelt-Pendant zu resolveUWAttack, aber gegen ein uw.c[]-Ziel statt eine
// Spieler-Einheit: Kreaturen kontern normal (nur wenn sie den Treffer über-
// leben), der Alte Wurm IMMER (unbedingter Konter, "wer ihn angreift, erleidet
// SOFORT 8 DMG zurück" — auch bei einem tödlichen Treffer). Kreaturen-Kills
// zählen für Veteranenstatus UND geben dem Beutegräber (20) zusätzlich +1 Gold
// (Roster-Passiv "Kopfgeld-Upgrade greift auf Kreaturen", PLAN Abschn. 4).
function resolveUWAttackOnCreature(state, attacker, creature) {
    const cStats = uwCreatureStats[creature.t];
    // getExpectedDamageUW liest vom "Ziel" nur targetUnit.t/x/y (Engstellen-Check
    // für 17/19) — Kreaturen-Typ-IDs (100+) treffen diesen Zweig nie, die Funktion
    // ist also gefahrlos auch gegen Kreaturen wiederverwendbar.
    const finalDmg = getExpectedDamageUW(attacker, creature);
    creature.h -= finalDmg;
    const result = { finalDmg, killed: false, retDmg: 0, bonusGold: 0, wormDied: false };

    const isWurm = creature.t === UWC_WURM;
    if (isWurm || creature.h > 0) result.retDmg = cStats.dmg;

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
            delete attacker.ch; // Kammer verfällt bei Bewegung (M12) — auch beim Nachrücken
        }
    }
    return result;
}

// Schwächste angrenzende Spieler-Einheit einer Kreatur — deterministischer
// Tiebreak (niedrigste HP, dann Position), kein Zufall nötig.
function findWeakestAdjacentPlayerUnit(x, y) {
    const candidates = getNeighbors(x, y).map(n => uwUnitAt(n.x, n.y)).filter(Boolean);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (a.h - b.h) || (a.x - b.x) || (a.y - b.y));
    return candidates[0];
}

// Kreatur trifft eine Spieler-Einheit — kein Veteranen-Credit (Kreaturen kennen
// kein vet-Konzept), tötet aber normal; getragene Kristalle verfallen einfach
// (Auftrag: "keep simple"). Gibt true zurück, wenn die Einheit dabei starb.
function creatureHitUnit(target, dmg) {
    target.h -= dmg;
    if (target.h <= 0) {
        gameState.uw.u = gameState.uw.u.filter(u => u !== target);
        return true;
    }
    return false;
}

// Kreaturen-Zug (M11): deterministisch in doEndTurn (Muster: Brand-Ticks), PRNG
// aus sd+rn+cp NUR für echte Gleichstands-Tiebreaks (Angriffs-/Bewegungsziel
// selbst sind bereits vollständig deterministisch über HP/Position/Distanz
// sortiert — die PRNG kommt nur bei mehreren exakt gleich guten Optionen zum
// Zug, z. B. mehrere gleich weit entfernte Lärmquellen).
// Gibt Events zurück (für Recap/Toast in doEndTurn, z. B. Wurm-Tod).
function processUWCreatureTurn() {
    if (!gameState.uw || !gameState.uw.c || gameState.uw.c.length === 0) return [];
    const rng = createPRNG((gameState.sd ^ (gameState.rn * 7919) ^ (gameState.cp * 104729)) | 0);
    const events = [];

    gameState.uw.c.forEach(creature => {
        if (creature.h <= 0) return;
        const stats = uwCreatureStats[creature.t];

        if (creature.t === UWC_STEINPANZER) {
            // Bewegt sich NIE, greift nur an, wenn eine Einheit angrenzt.
            const target = findWeakestAdjacentPlayerUnit(creature.x, creature.y);
            if (target) {
                const killed = creatureHitUnit(target, stats.dmg);
                events.push({ type: 'creatureAtk', x: target.x, y: target.y, dmg: stats.dmg, killed });
            }
            return;
        }

        if (creature.t === UWC_WURM) {
            // Verlässt die Herzkaverne nie; AoE trifft ALLE angrenzenden Einheiten.
            getNeighbors(creature.x, creature.y).forEach(n => {
                const t = uwUnitAt(n.x, n.y);
                if (!t) return;
                const killed = creatureHitUnit(t, stats.dmg);
                events.push({ type: 'creatureAtk', x: t.x, y: t.y, dmg: stats.dmg, killed });
            });
            return;
        }

        if (creature.t === UWC_SPINNE) {
            const target = findWeakestAdjacentPlayerUnit(creature.x, creature.y);
            let attacked = false;
            if (target) {
                const killed = creatureHitUnit(target, stats.dmg);
                events.push({ type: 'creatureAtk', x: target.x, y: target.y, dmg: stats.dmg, killed });
                attacked = true;
            }
            // Legt auf ihrem AKTUELLEN Hex ein Netz ab (max. 1 pro Hex — ein
            // erneutes Ablegen auf demselben Hex ist ein No-Op).
            if (!gameState.uw.w) gameState.uw.w = {};
            gameState.uw.w[`${creature.x},${creature.y}`] = 1;
            // Bewegt sich nur, wenn sie nicht gerade verteidigt hat — bleibt im
            // Nest-Umkreis 2 (Nest wird aus der aktuellen Position abgeleitet,
            // nicht gespeichert, siehe getNearestSpiderNest). Meidet Stollenköpfe
            // wie jede Kreatur.
            if (!attacked) {
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
            }
            return;
        }

        if (creature.t === UWC_WUEHLER) {
            const target = findWeakestAdjacentPlayerUnit(creature.x, creature.y);
            if (target) {
                const killed = creatureHitUnit(target, stats.dmg);
                events.push({ type: 'creatureAtk', x: target.x, y: target.y, dmg: stats.dmg, killed });
            }
            // Zieht 1 Hex/Zug auf die nächstgelegene Lärmquelle im Umkreis 4 zu
            // (uw.n der LETZTEN Runde — von doEndTurn bereits "scharf" geschaltet,
            // BEVOR die Kreaturen ziehen, siehe Aufrufreihenfolge in input.js).
            // Ohne Lärm in Reichweite bleibt er stehen.
            const markers = (gameState.uw.n || []).filter(m => hexDistance({ x: creature.x, y: creature.y }, m) <= 4);
            if (markers.length > 0) {
                let bestDist = Infinity, bestMarkers = [];
                markers.forEach(m => {
                    const d = hexDistance({ x: creature.x, y: creature.y }, m);
                    if (d < bestDist) { bestDist = d; bestMarkers = [m]; }
                    else if (d === bestDist) bestMarkers.push(m);
                });
                const chosenMarker = bestMarkers[Math.floor(rng() * bestMarkers.length)];
                // Gräbt sich selbst durch Fels (uw.d, dauerhaft offen) und nutzt
                // dabei auch fremde, bereits offene Stollen — Kristalladern umgeht
                // er (KEINE Zerstörung), Stollenköpfe meidet er wie jede Kreatur.
                let best = null, bestNeighborD = hexDistance({ x: creature.x, y: creature.y }, chosenMarker);
                getNeighbors(creature.x, creature.y).forEach(n => {
                    if (uwUnitAt(n.x, n.y) || uwCreatureAt(n.x, n.y)) return;
                    if (isUnderworldTunnelHead(gameState, n.x, n.y)) return;
                    const nType = getUnderworldType(gameState, n.x, n.y);
                    if (nType === UW_ADER && !isUnderworldOpen(gameState, n.x, n.y)) return; // Adern umgeht er
                    const d = hexDistance(n, chosenMarker);
                    if (d < bestNeighborD) { bestNeighborD = d; best = n; }
                });
                if (best) {
                    if (!isUnderworldOpen(gameState, best.x, best.y)) {
                        if (!gameState.uw.d) gameState.uw.d = [];
                        const idx = best.y * gameState.bw + best.x;
                        if (!gameState.uw.d.includes(idx)) gameState.uw.d.push(idx);
                    }
                    creature.x = best.x; creature.y = best.y;
                }
            }
        }
    });

    gameState.uw.c = gameState.uw.c.filter(c => c.h > 0);
    return events;
}

// === UNTERWELT-SICHT & -GEHÖR (M9b) ===
// Netz-Geometrie persistent in p[].ue (compressFog-Muster wie p[].e), analog
// getVisibleHexes/updateExploration oben, aber ohne Radius-Sichtfeld: sichtbar
// ist nur, was die eigenen Tiefeneinheiten je selbst betreten/gegraben haben.
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
    const visibleOwners = includeAllies ? [playerId, ...((gameState.p[playerId].al) || [])] : [playerId];
    getUnderworldTunnelHeads(gameState).forEach(h => {
        if (visibleOwners.includes(h.owner)) set.add(`${h.x},${h.y}`);
    });
    return set;
}

function uwOwnUnits(playerId) {
    return ((gameState.uw && gameState.uw.u) || []).filter(u => u.p === playerId);
}

// Bewegliches (fremde Einheiten) ist nur im Umkreis 2 eigener (oder verbündeter,
// M13 — Bündnisse teilen wie an der Oberfläche die volle Sicht) Tiefeneinheiten
// sichtbar, unabhängig von der persistenten Netz-Geometrie — bekannte Gänge
// können jederzeit Hinterhalte enthalten (PLAN.md Abschn. 3). Horcher (21,
// M10): passiv unsichtbar (iv=1, siehe doEndTurn/executeUWAttack) — wie die
// Assassine oben gilt das UNABHÄNGIG vom Umkreis, nur der eigene Besitzer sieht ihn.
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
    delete unit.ch; // Kammer verfällt bei Bewegung (M12) — Graben rückt ebenfalls nach
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
    myUWUnits.forEach(u => { u.h -= 1; floats.push({ x: u.x, y: u.y, val: 1 }); });
    state.uw.u = state.uw.u.filter(u => u.h > 0);
    return floats;
}

// === DER HERZ-SIEG: ERSCHLIESSUNG (M12, PLAN.md Abschn. 8) ===
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
// endenden Spieler) — neu gestartet, fortgesetzt (n bis max. 4) oder komplett
// zurückgesetzt (Unterbrechung, "Reset auf 0" statt Abbau um 1). Gibt ein
// Ereignis-Objekt für Toast/Recap zurück (oder null bei "nichts passiert").
function advanceErschliessung(state, playerId) {
    const held = checkErschliessungProgress(state, playerId);
    if (held) {
        if (!state.uw.hz || state.uw.hz.p !== playerId) {
            state.uw.hz = { p: playerId, n: 1 };
        } else {
            state.uw.hz.n = Math.min(4, state.uw.hz.n + 1);
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

// Sieg durch Erschließung: n==4 -> Erschließer + seine (noch lebenden)
// Verbündeten gewinnen — exakt wie ein regulärer Team-Sieg (checkTeamWin),
// nur unabhängig davon, ob noch andere Spieler leben.
function checkErschliessungWin(state) {
    if (!state.uw || !state.uw.hz || state.uw.hz.n < 4) return null;
    const p = state.uw.hz.p;
    if (!state.p[p] || state.p[p].dead === 1) return null;
    const allies = (state.p[p].al || []).filter(id => state.p[id] && state.p[id].dead !== 1);
    return [p, ...allies].map(id => state.p[id]);
}
