// === CANVAS CLICK HANDLER ===
function handleCanvasClick(clientX, clientY) {
    // Server mode: only the active player may interact with the board
    if (!isLegacyUrlMode && currentGameId && currentTurnSlot !== currentUserSlot) return;

    if (showRecap) { showRecap = false; renderBoard(gameState); }

    const rect = canvas.getBoundingClientRect();
    const rawX = (clientX - rect.left) * (canvas.width / rect.width);
    const rawY = (clientY - rect.top) * (canvas.height / rect.height);

    const mouseX = (rawX - camX) / camScale;
    const mouseY = (rawY - camY) / camScale;

    let closest = null; let minDist = Infinity; let closestIsHill = false; hideActionMenu();

    for (let y = 0; y < gameState.bh; y++) {
        for (let x = 0; x < gameState.bw; x++) {
            if (!isInsideMap(gameState, x, y)) continue;
            const center = getHexCenter(x, y);
            const tType = getTerrainType(gameState, x, y);
            const isHill = tType === 'hill';
            const topFaceY = isHill ? center.py - 6 : center.py;
            let dist = Math.sqrt((mouseX - center.px) ** 2 + ((mouseY - topFaceY) / yCompress) ** 2);

            if (isHill) {
                const sideBottom = center.py + thickness;
                if (mouseY > topFaceY && mouseY < sideBottom && Math.abs(mouseX - center.px) < hexWidth * 0.5) {
                    const sideDist = Math.abs(mouseX - center.px) + 4;
                    dist = Math.min(dist, sideDist);
                }
            }

            if (dist < minDist - 1 || (dist < minDist + 1 && isHill && !closestIsHill)) {
                minDist = dist; closest = { x, y }; closestIsHill = isHill;
            }
        }
    }

    if (closest && minDist < hexSize) {
        window.highlightedTunnelEnd = null;
        const clickedX = closest.x; const clickedY = closest.y;
        const vis = getVisibleHexes(gameState.cp); const isVisible = vis.has(`${clickedX},${clickedY}`);

        let clickedUnit = gameState.u.find(u => u.x === clickedX && u.y === clickedY);
        if (clickedUnit && clickedUnit.p !== gameState.cp && (!isVisible || clickedUnit.iv === 1)) clickedUnit = undefined;
        let clickedTower = (gameState.tw && isVisible) ? gameState.tw.find(tw => tw.x === clickedX && tw.y === clickedY && tw.h > 0) : null;

        if (window.specialActive === 'tower_shot') {
            const t = selectedTower;
            if (t && validAttacks.some(a => a.x === clickedX && a.y === clickedY && a.isTowerShot)) {
                const targetUnit = gameState.u.find(u => u.x === clickedX && u.y === clickedY);
                const targetTower = !targetUnit && gameState.tw && gameState.tw.find(tw => tw.x === clickedX && tw.y === clickedY && tw.h > 0);
                const targetWall = !targetUnit && !targetTower && gameState.wa && gameState.wa.find(w => w.x === clickedX && w.y === clickedY && w.h > 0);
                const clickedTunnelAttack = validAttacks.find(a => a.x === clickedX && a.y === clickedY && a.isTunnelShot);
                const targetTunnel = !targetUnit && !targetTower && !targetWall && clickedTunnelAttack && clickedTunnelAttack.tunnel;
                let targetBuildingOwner = -1;
                if (!targetUnit && !targetTower && !targetWall && !targetTunnel) {
                    for (let i = 0; i < gameState.p.length; i++) {
                        if (gameState.p[i].sv === `${clickedX},${clickedY}`) { targetBuildingOwner = i; break; }
                    }
                }
                if (targetUnit || targetTower || targetWall || targetTunnel || targetBuildingOwner >= 0) {
                    saveUndoState();
                    spawnAttackAnim(t.x, t.y, clickedX, clickedY, 'arrow');
                    spawnFloatingText(clickedX, clickedY, `-5`, "#ff5252");
                    if (targetUnit) {
                        targetUnit.h -= 5;
                        if (targetUnit.h <= 0) gameState.u = gameState.u.filter(u => u.i !== targetUnit.i);
                        infoPanel.innerHTML = `🗼 Turm feuert! (-5 HP)`;
                    } else if (targetTower) {
                        targetTower.h -= 5;
                        if (targetTower.h <= 0) { gameState.tw = gameState.tw.filter(tw => tw !== targetTower); infoPanel.innerHTML = `🗼 Feindlicher Turm zerstört!`; }
                        else infoPanel.innerHTML = `🗼 Turm feuert auf Turm! (-5 HP)`;
                    } else if (targetWall) {
                        targetWall.h -= 5;
                        if (targetWall.h <= 0) { gameState.wa = gameState.wa.filter(w => w !== targetWall); infoPanel.innerHTML = `🗼 Palisade zerstört!`; }
                        else infoPanel.innerHTML = `🗼 Turm feuert auf Palisade! (-5 HP)`;
                    } else if (targetTunnel) {
                        targetTunnel.h -= 5;
                        if (targetTunnel.h <= 0) { gameState.tu = gameState.tu.filter(tu => tu !== targetTunnel); infoPanel.innerHTML = `🗼 Tunnel zerstört!`; }
                        else infoPanel.innerHTML = `🗼 Turm feuert auf Tunnel! (-5 HP)`;
                    } else if (targetBuildingOwner >= 0) {
                        gameState.p[targetBuildingOwner].sh -= 5;
                        if (gameState.p[targetBuildingOwner].sh <= 0) {
                            gameState.p[targetBuildingOwner].dead = 1;
                            gameState.u = gameState.u.filter(u => u.p !== targetBuildingOwner);
                            gameState.v[`${clickedX},${clickedY}`] = gameState.cp;
                            infoPanel.innerHTML = `💀 HAUPTGEBÄUDE ZERSTÖRT! ${gameState.p[targetBuildingOwner].n} ist ausgeschieden!`;
                        } else infoPanel.innerHTML = `🗼 Turm feuert auf Hauptgebäude! (-5 HP)`;
                    }
                    t.a = 1;
                    window.specialActive = null; selectedTower = null; selectedHex = null; validAttacks = [];
                    renderBoard(gameState);
                }
            } else {
                window.specialActive = null; selectedTower = null; selectedHex = null; validAttacks = [];
                renderBoard(gameState);
            }
            return;
        }

        if (clickedTower && clickedTower.o === gameState.cp && clickedTower.a === 0 && !clickedUnit) {
            selectedTower = clickedTower;
            selectedHex = { x: clickedTower.x, y: clickedTower.y };
            window.specialActive = 'tower_shot';
            validMoves = [];
            const pState2 = gameState.p[gameState.cp];
            const canAttack = (targetId) => !(pState2.al && pState2.al.includes(targetId)) && !(pState2.tc && pState2.tc.includes(targetId));
            validAttacks = gameState.u
                .filter(u => u.p !== gameState.cp && u.iv !== 1 && canAttack(u.p) && hexDistance({ x: clickedTower.x, y: clickedTower.y }, { x: u.x, y: u.y }) <= 2)
                .map(u => ({ x: u.x, y: u.y, isTowerShot: true }));
            if (gameState.tw) for (let tw of gameState.tw)
                if (tw.h > 0 && tw.o !== gameState.cp && canAttack(tw.o) && hexDistance({ x: clickedTower.x, y: clickedTower.y }, { x: tw.x, y: tw.y }) <= 2)
                    validAttacks.push({ x: tw.x, y: tw.y, isTowerShot: true });
            if (gameState.wa) for (let w of gameState.wa)
                if (w.h > 0 && w.o !== gameState.cp && canAttack(w.o) && hexDistance({ x: clickedTower.x, y: clickedTower.y }, { x: w.x, y: w.y }) <= 2)
                    validAttacks.push({ x: w.x, y: w.y, isTowerShot: true });
            if (gameState.tu) for (let tu of gameState.tu)
                if (tu.h > 0 && tu.o !== gameState.cp && canAttack(tu.o)) {
                    if (hexDistance({ x: clickedTower.x, y: clickedTower.y }, { x: tu.x1, y: tu.y1 }) <= 2)
                        validAttacks.push({ x: tu.x1, y: tu.y1, isTowerShot: true, isTunnelShot: true, tunnel: tu });
                    if (hexDistance({ x: clickedTower.x, y: clickedTower.y }, { x: tu.x2, y: tu.y2 }) <= 2)
                        validAttacks.push({ x: tu.x2, y: tu.y2, isTowerShot: true, isTunnelShot: true, tunnel: tu });
                }
            for (let i = 0; i < gameState.p.length; i++)
                if (i !== gameState.cp && gameState.p[i].dead === 0 && canAttack(i)) {
                    const [vx, vy] = gameState.p[i].sv.split(',').map(Number);
                    if (hexDistance({ x: clickedTower.x, y: clickedTower.y }, { x: vx, y: vy }) <= 2)
                        validAttacks.push({ x: vx, y: vy, isTowerShot: true });
                }
            hideActionMenu();
            infoPanel.innerHTML = `🗼 Turm – Ziel wählen<br><div class="info-detail" style="color:#4fc3f7;">Reichweite 2 | 5 DMG | 1x pro Runde</div>`;
            renderBoard(gameState);
            return;
        }

        const targetAttack = validAttacks.find(a => a.x === clickedX && a.y === clickedY);
        const villageOwner = gameState.v[`${clickedX},${clickedY}`];
        const pState = gameState.p[gameState.cp];

        if (window.specialActive === 'tunnel_step1') {
            if (validMoves.some(m => m.x === clickedX && m.y === clickedY)) {
                window.tunnelStart = { x: clickedX, y: clickedY };
                window.specialActive = 'tunnel_step2';
                validMoves = [];
                const explored = pState.e || [];
                for (let y = 0; y < gameState.bh; y++) {
                    for (let x = 0; x < gameState.bw; x++) {
                        if (isInsideMap(gameState, x, y) && (x !== clickedX || y !== clickedY)) {
                            const idx = y * gameState.bw + x;
                            if (explored.includes(idx)) validMoves.push({ x, y });
                        }
                    }
                }
                infoPanel.innerHTML = `🚇 Tunnel Endpunkt<br><div class="info-detail" style="color: #4fc3f7;">Wähle ein beliebiges, bereits entdecktes Feld. Bei feindlicher Besatzung schlägt der Versuch fehl.</div>`;
                renderBoard(gameState);
            } else {
                window.specialActive = null; selectedUnit = null; validMoves = []; window.tunnelStart = null; renderBoard(gameState);
            }
            return;
        } else if (window.specialActive === 'tunnel_step2') {
            if (validMoves.some(m => m.x === clickedX && m.y === clickedY)) {
                const hasEnemy = gameState.u.some(u => u.p !== gameState.cp && u.x === clickedX && u.y === clickedY);
                const hasVillage = gameState.v[`${clickedX},${clickedY}`] !== undefined;
                const hasMain = gameState.p.some((p, i) => i !== gameState.cp && p.dead === 0 && p.sv === `${clickedX},${clickedY}`);
                const hasTunnel = gameState.tu && gameState.tu.some(t => (t.x1 === clickedX && t.y1 === clickedY) || (t.x2 === clickedX && t.y2 === clickedY));
                const hasWall = gameState.wa && gameState.wa.some(w => w.x === clickedX && w.y === clickedY);
                const hasStone = gameState.st && gameState.st.some(s => s.x === clickedX && s.y === clickedY && s.h > 0);
                const hasTower = gameState.tw && gameState.tw.some(tw => tw.x === clickedX && tw.y === clickedY && tw.h > 0);

                if (hasEnemy || hasVillage || hasMain || hasTunnel || hasWall || hasStone || hasTower) {
                    showToast("Feld blockiert!", "error");
                    validAttacks = [{ x: clickedX, y: clickedY }]; renderBoard(gameState);
                    setTimeout(() => { validAttacks = []; renderBoard(gameState); }, 600);
                    return;
                }

                saveUndoState();
                pState.s = (pState.s || 0) - 4;
                if (!gameState.tu) gameState.tu = [];
                gameState.tu.push({
                    x1: window.tunnelStart.x, y1: window.tunnelStart.y,
                    x2: clickedX, y2: clickedY,
                    r: gameState.rn + 1, o: gameState.cp, h: 13
                });

                selectedUnit.a = 1; turnActions.push({ x: clickedX, y: clickedY, t: 'cap', fx: window.tunnelStart.x, fy: window.tunnelStart.y });
                window.specialActive = null; selectedUnit = null; validMoves = []; window.tunnelStart = null;
                infoPanel.innerHTML = "🚇 Tunnelbau gestartet! (Nächste Runde fertig)"; renderBoard(gameState);
            } else {
                window.specialActive = null; selectedUnit = null; validMoves = []; window.tunnelStart = null; renderBoard(gameState);
            }
            return;
        } else if (window.specialActive === 'wall_step1') {
            if (validMoves.some(m => m.x === clickedX && m.y === clickedY)) {
                saveUndoState();
                pState.s = (pState.s || 0) - 1;
                if (!gameState.wa) gameState.wa = [];
                gameState.wa.push({ x: clickedX, y: clickedY, o: gameState.cp, h: 10 });

                selectedUnit.a = 1; turnActions.push({ x: clickedX, y: clickedY, t: 'cap', fx: selectedUnit.x, fy: selectedUnit.y });
                window.specialActive = null; selectedUnit = null; validMoves = [];
                infoPanel.innerHTML = "🧱 Palisade errichtet!"; renderBoard(gameState);
            } else {
                window.specialActive = null; selectedUnit = null; validMoves = []; renderBoard(gameState);
            }
            return;
        } else if (window.specialActive === 'tower_step1') {
            if (validMoves.some(m => m.x === clickedX && m.y === clickedY)) {
                saveUndoState();
                pState.s = (pState.s || 0) - 5;
                if (!gameState.tw) gameState.tw = [];
                gameState.tw.push({ x: clickedX, y: clickedY, o: gameState.cp, h: 15, a: 1 });
                selectedUnit.a = 1; turnActions.push({ x: clickedX, y: clickedY, t: 'cap', fx: selectedUnit.x, fy: selectedUnit.y });
                window.specialActive = null; selectedUnit = null; validMoves = [];
                infoPanel.innerHTML = "🗼 Turm errichtet!"; renderBoard(gameState);
            } else {
                window.specialActive = null; selectedUnit = null; validMoves = []; renderBoard(gameState);
            }
            return;
        }

        if (window.specialActive === 'elefant_stampede') {
            if (targetAttack && targetAttack.isStampede) {
                saveUndoState();
                const fromX = selectedUnit.x, fromY = selectedUnit.y;
                const toX = clickedX, toY = clickedY;
                const dist = hexDistance({ x: fromX, y: fromY }, { x: toX, y: toY });

                let pathHexes = [];
                if (dist === 2) {
                    const fromNbs = getNeighbors(fromX, fromY);
                    const toNbs = getNeighbors(toX, toY);
                    fromNbs.forEach(fn => { if (toNbs.some(tn => tn.x === fn.x && tn.y === fn.y)) pathHexes.push(fn); });
                }
                pathHexes.push({ x: toX, y: toY });

                const canAttack = (targetId) => !(pState.al && pState.al.includes(targetId)) && !(pState.tc && pState.tc.includes(targetId));
                pathHexes.forEach(ph => {
                    spawnAttackAnim(fromX, fromY, ph.x, ph.y, 'slash');
                    gameState.u.filter(u => u.x === ph.x && u.y === ph.y && u.p !== gameState.cp && canAttack(u.p)).forEach(enemy => {
                        enemy.h -= 5;
                        spawnFloatingText(enemy.x, enemy.y, "-5", "#ff5252");
                    });
                    for (let i = 0; i < gameState.p.length; i++) {
                        if (i !== gameState.cp && gameState.p[i].dead === 0 && canAttack(i) && gameState.p[i].sv === `${ph.x},${ph.y}`) {
                            gameState.p[i].sh -= 5;
                            spawnFloatingText(ph.x, ph.y, "-5", "#ff5252");
                            if (gameState.p[i].sh <= 0) { gameState.p[i].dead = 1; gameState.u = gameState.u.filter(un => un.p !== i); gameState.v[`${ph.x},${ph.y}`] = gameState.cp; }
                        }
                    }
                    if (gameState.wa) {
                        gameState.wa.forEach(w => {
                            if (w.x === ph.x && w.y === ph.y) {
                                w.h -= 5;
                                spawnFloatingText(ph.x, ph.y, "-5", "#ff5252");
                            }
                        });
                        gameState.wa = gameState.wa.filter(w => w.h > 0);
                    }
                });
                gameState.u = gameState.u.filter(u => u.h > 0);

                let landX = fromX, landY = fromY;
                for (let ph of pathHexes) {
                    if (!gameState.u.some(u => u.x === ph.x && u.y === ph.y) && !gameState.p.some((p, i) => i !== gameState.cp && p.dead === 0 && p.sv === `${ph.x},${ph.y}`)) {
                        landX = ph.x; landY = ph.y;
                    } else { break; }
                }
                selectedUnit.x = landX; selectedUnit.y = landY;
                selectedUnit.a = 1;
                turnActions.push({ x: toX, y: toY, t: 'atk', fx: fromX, fy: fromY });
                selectedUnit = null; validMoves = []; validAttacks = []; window.specialActive = null;
                hideActionMenu(); infoPanel.innerHTML = "🐘 Stampede ausgeführt!";
                renderBoard(gameState);
            } else {
                window.specialActive = null; selectedUnit = null; validMoves = []; validAttacks = []; renderBoard(gameState);
            }
            return;
        }

        if (window.specialActive === 'tribok' && targetAttack && targetAttack.isTribokAoE) {
            saveUndoState();
            spawnAttackAnim(selectedUnit.x, selectedUnit.y, targetAttack.x, targetAttack.y, 'fire');
            let targets = [{ x: targetAttack.x, y: targetAttack.y, dmg: 3 }];
            getNeighbors(targetAttack.x, targetAttack.y).forEach(n => targets.push({ x: n.x, y: n.y, dmg: 2 }));

            targets.forEach(t => {
                const canAttack = (targetId) => !(pState.al && pState.al.includes(targetId)) && !(pState.tc && pState.tc.includes(targetId));

                let uList = gameState.u.filter(u => u.x === t.x && u.y === t.y && u.p !== gameState.cp && canAttack(u.p));
                uList.forEach(u => { u.h -= t.dmg; spawnFloatingText(u.x, u.y, `-${t.dmg}`, "#ff5252"); });

                for (let i = 0; i < gameState.p.length; i++) {
                    if (i !== gameState.cp && gameState.p[i].dead === 0 && canAttack(i) && gameState.p[i].sv === `${t.x},${t.y}`) {
                        gameState.p[i].sh -= t.dmg; spawnFloatingText(t.x, t.y, `-${t.dmg}`, "#ff5252");
                        if (gameState.p[i].sh <= 0) {
                            gameState.p[i].dead = 1;
                            gameState.u = gameState.u.filter(un => un.p !== i);
                            gameState.v[`${t.x},${t.y}`] = gameState.cp;
                        }
                    }
                }

                if (gameState.tu) {
                    gameState.tu.forEach(tun => {
                        if (tun.o !== gameState.cp && canAttack(tun.o)) {
                            if ((tun.x1 === t.x && tun.y1 === t.y) || (tun.x2 === t.x && tun.y2 === t.y)) {
                                tun.h -= t.dmg;
                                spawnFloatingText(t.x, t.y, `-${t.dmg}`, "#ff5252");
                            }
                        }
                    });
                }

                if (gameState.tw) {
                    gameState.tw.forEach(tw => {
                        if (tw.o !== gameState.cp && canAttack(tw.o) && tw.x === t.x && tw.y === t.y) {
                            tw.h -= t.dmg;
                            spawnFloatingText(t.x, t.y, `-${t.dmg}`, "#ff5252");
                        }
                    });
                }

                if (gameState.wa) {
                    gameState.wa.forEach(w => {
                        if (w.o !== gameState.cp && canAttack(w.o) && w.x === t.x && w.y === t.y) {
                            w.h -= t.dmg;
                            spawnFloatingText(t.x, t.y, `-${t.dmg}`, "#ff5252");
                        }
                    });
                }
            });
            gameState.u = gameState.u.filter(u => u.h > 0);
            if (gameState.tu) gameState.tu = gameState.tu.filter(tun => tun.h > 0);
            if (gameState.tw) gameState.tw = gameState.tw.filter(tw => tw.h > 0);
            if (gameState.wa) gameState.wa = gameState.wa.filter(w => w.h > 0);
            selectedUnit.a = 1; turnActions.push({ x: targetAttack.x, y: targetAttack.y, t: 'atk', fx: selectedUnit.x, fy: selectedUnit.y });
            selectedUnit = null; validMoves = []; validAttacks = []; window.specialActive = null; renderBoard(gameState); return;
        } else if (window.specialActive === 'tribok') {
            window.specialActive = null; selectedUnit = null; validMoves = []; validAttacks = []; renderBoard(gameState); return;
        }

        if (selectedUnit && targetAttack) {
            saveUndoState();
            if (selectedUnit.iv === 1) { delete selectedUnit.iv; selectedUnit.cd = 2; }

            let targetType = 'unit';
            let targetOwnerId = targetAttack.target ? targetAttack.target.p : -1;
            if (targetAttack.isBuilding) {
                targetType = 'building';
                targetOwnerId = targetAttack.owner;
            } else if (targetAttack.isTunnelTarget) {
                targetType = 'tunnel';
                targetOwnerId = targetAttack.targetOwner;
            } else if (targetAttack.isTowerTarget) {
                targetType = 'tower';
                targetOwnerId = targetAttack.tower.o;
            } else if (targetAttack.isWallTarget) {
                targetType = 'wall';
                targetOwnerId = targetAttack.wall.o;
            }
            const finalDmg = getExpectedDamage(selectedUnit, targetType, targetOwnerId, targetAttack.target);
            const atkType = unitStats[selectedUnit.t].isMelee ? 'slash' : 'arrow';
            spawnAttackAnim(selectedUnit.x, selectedUnit.y, clickedX, clickedY, atkType);

            if (targetAttack.isBuilding) {
                gameState.p[targetAttack.owner].sh -= finalDmg;
                spawnFloatingText(targetAttack.x, targetAttack.y, `-${finalDmg}`, "#ff5252");

                if (gameState.p[targetAttack.owner].sh <= 0) {
                    gameState.p[targetAttack.owner].dead = 1;
                    gameState.u = gameState.u.filter(u => u.p !== targetAttack.owner);
                    gameState.v[`${clickedX},${clickedY}`] = gameState.cp;
                    infoPanel.innerHTML = `💀 HAUPTGEBÄUDE ZERSTÖRT!\n${gameState.p[targetAttack.owner].n} ist ausgeschieden!`;
                } else { infoPanel.innerHTML = `Hauptgebäude angegriffen! (-${finalDmg} HP)`; }
            } else if (targetAttack.isTunnelTarget) {
                targetAttack.tunnel.h -= finalDmg;
                spawnFloatingText(targetAttack.x, targetAttack.y, `-${finalDmg}`, "#ff5252");
                if (targetAttack.tunnel.h <= 0) {
                    gameState.tu = gameState.tu.filter(t => t !== targetAttack.tunnel);
                    infoPanel.innerHTML = `Tunnel zerstört!`;
                } else { infoPanel.innerHTML = `Tunnel angegriffen! (-${finalDmg} HP)`; }
            } else if (targetAttack.isWallTarget) {
                targetAttack.wall.h -= finalDmg;
                spawnFloatingText(targetAttack.x, targetAttack.y, `-${finalDmg}`, "#ff5252");
                if (targetAttack.wall.h <= 0) {
                    gameState.wa = gameState.wa.filter(w => w !== targetAttack.wall);
                    infoPanel.innerHTML = `Palisade zerstört!`;
                } else { infoPanel.innerHTML = `Palisade angegriffen! (-${finalDmg} HP)`; }
            } else if (targetAttack.isTowerTarget) {
                targetAttack.tower.h -= finalDmg;
                spawnFloatingText(targetAttack.x, targetAttack.y, `-${finalDmg}`, "#ff5252");
                if (targetAttack.tower.h <= 0) {
                    gameState.tw = gameState.tw.filter(t => t !== targetAttack.tower);
                    infoPanel.innerHTML = `Turm zerstört!`;
                } else { infoPanel.innerHTML = `Turm angegriffen! (-${finalDmg} HP)`; }
            } else {
                targetAttack.target.h -= finalDmg;
                spawnFloatingText(targetAttack.target.x, targetAttack.target.y, `-${finalDmg}`, "#ff5252");

                // Wagenburg thorns (Upgrade 11): melee attackers take 2 recoil
                const attackerUnit = selectedUnit;
                if (targetAttack.target.t === 11 && unitStats[attackerUnit.t].isMelee) {
                    const targetOwnerState = gameState.p[targetAttack.target.p];
                    if (targetOwnerState && targetOwnerState.u && targetOwnerState.u.includes(11)) {
                        attackerUnit.h -= 2;
                        spawnFloatingText(attackerUnit.x, attackerUnit.y, `-2`, "#ff5252");
                        if (attackerUnit.h <= 0) {
                            gameState.u = gameState.u.filter(u => u.i !== attackerUnit.i);
                            infoPanel.innerHTML = `Angriff! (-${finalDmg} HP)<br>Deine Einheit wurde durch Rückschlag besiegt!`;
                        }
                    }
                }

                if (targetAttack.target.h > 0) {
                    const targetStats = unitStats[targetAttack.target.t];
                    const dist = hexDistance({ x: clickedX, y: clickedY }, { x: attackerUnit.x, y: attackerUnit.y });
                    if (dist <= getUnitRange(gameState.p[targetAttack.target.p], targetAttack.target)) {
                        const retDmg = getExpectedDamage(targetAttack.target, 'unit', attackerUnit.p, attackerUnit);
                        const retAtkType = targetStats.isMelee ? 'slash' : 'arrow';
                        setTimeout(() => {
                            if (attackerUnit.h > 0) {
                                spawnAttackAnim(clickedX, clickedY, attackerUnit.x, attackerUnit.y, retAtkType);
                                attackerUnit.h -= retDmg;
                                spawnFloatingText(attackerUnit.x, attackerUnit.y, `-${retDmg}`, "#ff5252");
                                if (attackerUnit.h <= 0) {
                                    gameState.u = gameState.u.filter(u => u.i !== attackerUnit.i);
                                    infoPanel.innerHTML += `<br>Deine Einheit wurde im Gegenangriff besiegt!`;
                                }
                                renderBoard(gameState);
                            }
                        }, 600);
                    }
                }

                if (targetAttack.target.h <= 0) {
                    gameState.u = gameState.u.filter(u => u.i !== targetAttack.target.i);
                    checkVeteran(selectedUnit);

                    const isMainBuilding = gameState.p.some(p => p.dead !== 1 && p.sv === `${clickedX},${clickedY}`);
                    if (getUnitRange(pState, selectedUnit) === 1 && !isMainBuilding) {
                        selectedUnit.x = clickedX;
                        selectedUnit.y = clickedY;
                        if (gameState.ct && gameState.ct.x === clickedX && gameState.ct.y === clickedY && gameState.ct.ctrl !== gameState.cp) {
                            gameState.ct.ctrl = gameState.cp;
                            spawnFloatingText(clickedX, clickedY, "Wachturm erobert!", "#ffd700");
                            showToast('🗼 Wachturm erobert!', 'gold');
                        }
                    }
                    if (pState.u.includes(2)) { pState.g += 3; infoPanel.innerHTML = `Angriff! (-${finalDmg} HP) | +3G Kopfgeld!`; } else { infoPanel.innerHTML = `Angriff! (-${finalDmg} HP)`; }
                } else { infoPanel.innerHTML = `Angriff! (-${finalDmg} HP)`; }
            }
            turnActions.push({ x: clickedX, y: clickedY, t: 'atk', fx: selectedUnit.x, fy: selectedUnit.y });
            if (selectedUnit.ps) { selectedUnit.a = 4; selectedUnit.ps = 0; } else { selectedUnit.a = 1; }
            selectedUnit = null; validMoves = []; validAttacks = []; selectedHex = null;
        }
        else if (selectedUnit && validMoves.some(m => m.x === clickedX && m.y === clickedY)) {
            saveUndoState();
            const prevX = selectedUnit.x, prevY = selectedUnit.y;

            let targetX = clickedX; let targetY = clickedY; let teleported = false;
            if (gameState.tu) {
                let tunnel = gameState.tu.find(t => t.r <= gameState.rn && ((t.x1 === clickedX && t.y1 === clickedY) || (t.x2 === clickedX && t.y2 === clickedY)));
                if (tunnel) {
                    let linkX = tunnel.x1 === clickedX ? tunnel.x2 : tunnel.x1;
                    let linkY = tunnel.y1 === clickedY ? tunnel.y2 : tunnel.y1;
                    if (!gameState.u.some(u => u.x === linkX && u.y === linkY) && !gameState.v[`${linkX},${linkY}`]) {
                        targetX = linkX; targetY = linkY; teleported = true;
                    }
                }
            }

            selectedUnit.x = targetX; selectedUnit.y = targetY;

            if (gameState.ct && gameState.ct.x === targetX && gameState.ct.y === targetY && gameState.ct.ctrl !== gameState.cp) {
                gameState.ct.ctrl = gameState.cp;
                spawnFloatingText(targetX, targetY, "Wachturm erobert!", "#ffd700");
                showToast('🗼 Wachturm erobert!', 'gold');
            }

            if (selectedUnit.iv === 1) {
                const targetLoc = `${targetX},${targetY}`;
                const vOwner = gameState.v[targetLoc];
                let isEnemyStart = false;
                for (let i = 0; i < gameState.p.length; i++) { if (i !== gameState.cp && gameState.p[i].sv === targetLoc && gameState.p[i].dead === 0) isEnemyStart = true; }

                if ((vOwner !== undefined && vOwner !== gameState.cp) || isEnemyStart) {
                    delete selectedUnit.iv;
                    selectedUnit.cd = 2;
                    spawnFloatingText(targetX, targetY, "Enttarnt!", "#ffb74d");
                }
            }

            if (teleported) { selectedUnit.a = 0; }
            else if (selectedUnit.a === 4) { selectedUnit.a = 1; }
            else if ((selectedUnit.t === 3 && pState.u.includes(1)) || selectedUnit.t === 8) { selectedUnit.a = 2; }
            else { selectedUnit.a = 2; }

            turnActions.push({ x: targetX, y: targetY, t: 'mv', fx: prevX, fy: prevY });

            selectedHex = { x: targetX, y: targetY };
            validMoves = [];
            validAttacks = calculateAttacks(selectedUnit);

            const vOwner = gameState.v[`${targetX},${targetY}`];
            let isStartAtTarget = false;
            for (let i = 0; i < gameState.p.length; i++) { if (gameState.p[i].sv === `${targetX},${targetY}`) isStartAtTarget = true; }

            const canCapture = (vOwner === -1)
                ? (selectedUnit.a === 0 || selectedUnit.a === 2)
                : (selectedUnit.a === 0);
            const canCap = vOwner !== undefined && vOwner !== gameState.cp && !isStartAtTarget && canCapture && !(pState.al && pState.al.includes(vOwner)) && !(pState.tc && pState.tc.includes(vOwner));

            let hasAbilities = false;
            if (selectedUnit.t === 3 && pState.m >= 3) hasAbilities = true;
            if (selectedUnit.t === 4 && selectedUnit.a === 1 && !selectedUnit.br && pState.m >= 2) hasAbilities = true;
            if (selectedUnit.t === 5 && !selectedUnit.iv && !selectedUnit.cd && pState.m >= 2) hasAbilities = true;
            if (selectedUnit.t === 6 && pState.m >= 4) hasAbilities = true;
            if (selectedUnit.t === 7) {
                const adjStone = gameState.st && gameState.st.some(s => s.h > 0 && hexDistance({ x: s.x, y: s.y }, { x: selectedUnit.x, y: selectedUnit.y }) === 1);
                if (adjStone || (pState.s || 0) > 0) hasAbilities = true;
            }
            if (selectedUnit.t === 8) hasAbilities = true;
            if (selectedUnit.t === 9 && pState.m >= 3) hasAbilities = true;
            if (selectedUnit.t === 10 && pState.m >= 1 && !selectedUnit.ps) hasAbilities = true;
            if (selectedUnit.t === 11) hasAbilities = true;

            if (validAttacks.length > 0 || canCap || hasAbilities) {
                showTileUI(targetX, targetY, selectedUnit);
            } else {
                selectedUnit = null; validMoves = []; validAttacks = []; selectedHex = null;
            }
        }
        else {
            showTileUI(clickedX, clickedY, clickedUnit);
        }
        renderBoard(gameState);
    }
}

// === TILE SELECTION UI ===
function showTileUI(clickedX, clickedY, clickedUnit) {
    const vis = getVisibleHexes(gameState.cp);
    const isVisible = vis.has(`${clickedX},${clickedY}`);
    const pState = gameState.p[gameState.cp];
    const villageOwner = gameState.v[`${clickedX},${clickedY}`];
    let isStart = false; let svHp = 0; let svOwner = -1;
    for (let i = 0; i < gameState.p.length; i++) { if (gameState.p[i].sv === `${clickedX},${clickedY}`) { isStart = true; svHp = gameState.p[i].sh; svOwner = i; } }

    selectedHex = { x: clickedX, y: clickedY };

    if (clickedUnit) {
        const maxHp = getUnitMaxHp(gameState.p[clickedUnit.p], clickedUnit.t, clickedUnit);
        const ownerName = formatOwnerName(clickedUnit.p, gameState.cp);
        const moveStat = getUnitMove(gameState.p[clickedUnit.p], clickedUnit.t, clickedUnit);
        const atkDmg = unitStats[clickedUnit.t].dmg;

        let expectedDmgText = "";
        if (selectedUnit && selectedUnit.p === gameState.cp && clickedUnit.p !== gameState.cp && validAttacks.some(a => a.x === clickedX && a.y === clickedY)) {
            const expDmg = getExpectedDamage(selectedUnit, 'unit', clickedUnit.p, clickedUnit);
            expectedDmgText = `<br><span style="color:#ff1744">Angriff: ~${expDmg} DMG</span>`;
        }

        let vetText = clickedUnit.vet ? ' | <span style="color:var(--gold)">★ Veteran (+1 DMG)</span>' : '';
        infoPanel.innerHTML = `${ownerName} ${unitStats[clickedUnit.t].name} (${clickedUnit.h}/${maxHp} HP)<div class="info-detail">Bewegung: ${moveStat} | Angriff: ${atkDmg}${vetText}</div>${expectedDmgText}`;

    } else if (isStart && isVisible) {
        const ownerName = formatOwnerName(svOwner, gameState.cp);
        let extraInfo = svOwner === gameState.cp ? "Produziert Einheiten" : "Zerstören um Spieler zu besiegen";

        let expectedDmgText = "";
        if (selectedUnit && selectedUnit.p === gameState.cp && svOwner !== gameState.cp && validAttacks.some(a => a.x === clickedX && a.y === clickedY)) {
            const expDmg = getExpectedDamage(selectedUnit, 'building', svOwner);
            expectedDmgText = `<br><span style="color:#ff1744">Angriff: ~${expDmg} DMG</span>`;
        }

        infoPanel.innerHTML = `${ownerName} Hauptgebäude (${svHp}/30 HP)<div class="info-detail">${extraInfo}</div>${expectedDmgText}`;
    } else if (villageOwner !== undefined) {
        if (villageOwner === -1) {
            infoPanel.innerHTML = `Neutrales Dorf<div class="info-detail">Einnehmen für +2 Gold & +1 Holz pro Runde</div>`;
        } else {
            const ownerName = formatOwnerName(villageOwner, gameState.cp);
            let gInc = 2; if (gameState.p[villageOwner].f.includes(3)) gInc = 3;
            infoPanel.innerHTML = `${ownerName} Dorf<div class="info-detail">Produziert +${gInc} Gold & +1 Holz pro Runde</div>`;
        }
    } else {
        let tunnel = gameState.tu ? gameState.tu.find(t => (t.x1 === clickedX && t.y1 === clickedY) || (t.x2 === clickedX && t.y2 === clickedY)) : null;
        if (tunnel && isVisible) {
            const ownerName = formatOwnerName(tunnel.o, gameState.cp);
            let expectedDmgText = "";
            if (selectedUnit && selectedUnit.p === gameState.cp && tunnel.o !== gameState.cp && validAttacks.some(a => a.x === clickedX && a.y === clickedY)) {
                const expDmg = getExpectedDamage(selectedUnit, 'tunnel', tunnel.o);
                expectedDmgText = `<br><span style="color:#ff1744">Angriff: ~${expDmg} DMG</span>`;
            }
            window.highlightedTunnelEnd = { x: tunnel.x1 === clickedX ? tunnel.x2 : tunnel.x1, y: tunnel.y1 === clickedY ? tunnel.y2 : tunnel.y1 };
            infoPanel.innerHTML = `${ownerName} Tunnel (${tunnel.h}/13 HP)${tunnel.r > gameState.rn ? " [Im Bau]" : ""}${expectedDmgText}`;
        } else if (gameState.wa && gameState.wa.some(w => w.x === clickedX && w.y === clickedY)) {
            const wall = gameState.wa.find(w => w.x === clickedX && w.y === clickedY);
            const ownerName = formatOwnerName(wall.o, gameState.cp);
            let expectedDmgText = "";
            if (selectedUnit) {
                const expDmg = getExpectedDamage(selectedUnit, 'wall', wall.o);
                expectedDmgText = `<br><span style="color:#ff1744">Angriff: ~${expDmg} DMG</span>`;
            }
            infoPanel.innerHTML = `${ownerName} Palisade (${wall.h}/10 HP)${expectedDmgText}`;
        } else if (gameState.st && gameState.st.some(s => s.x === clickedX && s.y === clickedY && s.h > 0) && isVisible) {
            const st = gameState.st.find(s => s.x === clickedX && s.y === clickedY);
            infoPanel.innerHTML = `Steinvorkommen (${st.h}/40)<div class="info-detail">Benötigt Arbeiter zum Abbau</div>`;
        } else if (gameState.ct && gameState.ct.x === clickedX && gameState.ct.y === clickedY) {
            const ctOwnerName = gameState.ct.ctrl === -1 ? "Neutraler" : formatOwnerName(gameState.ct.ctrl, gameState.cp);
            const ctRange = Math.ceil(gameState.rad * 0.7);
            infoPanel.innerHTML = `🗼 ${ctOwnerName} Wachturm<div class="info-detail">Kartenzentrum · gewährt ${ctRange} Felder Sichtweite</div>`;
        } else if (gameState.tw && gameState.tw.some(tw => tw.x === clickedX && tw.y === clickedY && tw.h > 0) && isVisible) {
            const tw = gameState.tw.find(tw => tw.x === clickedX && tw.y === clickedY);
            const ownerName = formatOwnerName(tw.o, gameState.cp);
            let expectedDmgText = "";
            if (selectedUnit && selectedUnit.p === gameState.cp && tw.o !== gameState.cp && validAttacks.some(a => a.x === clickedX && a.y === clickedY)) {
                const expDmg = getExpectedDamage(selectedUnit, 'tower', tw.o);
                expectedDmgText = `<br><span style="color:#ff1744">Angriff: ~${expDmg} DMG</span>`;
            }
            infoPanel.innerHTML = `${ownerName} Turm (${tw.h}/15 HP)<div class="info-detail">Range 2 | 5 DMG</div>${expectedDmgText}`;
        } else {
            let tType = getTerrainType(gameState, clickedX, clickedY);
            let tName = tType === 'forest' ? 'Wald' : tType === 'hill' ? 'Hügel' : 'Grasland';
            let tInfo = tType === 'forest' ? 'Sicht blockiert, Schutz für Assassinen' : tType === 'hill' ? '+1 DMG für Fernkämpfer' : 'Normales Gelände';
            infoPanel.innerHTML = `${tName}<div class="info-detail">${tInfo}</div>`;
        }
    }

    if (clickedUnit && clickedUnit.p === gameState.cp && (clickedUnit.a === 0 || clickedUnit.a === 2 || clickedUnit.a === 4 || (clickedUnit.t === 4 && clickedUnit.a === 1))) {
        let isOwnActive = (clickedUnit.a === 0 || clickedUnit.a === 2);
        let isOwnBerserkerUsed = clickedUnit.t === 4 && clickedUnit.a === 1;

        if (isOwnActive || isOwnBerserkerUsed || clickedUnit.a === 4) {
            selectedUnit = clickedUnit;
            validMoves = (clickedUnit.a === 0 || clickedUnit.a === 4) ? calculateMoves(clickedUnit) : [];
            validAttacks = (clickedUnit.a === 0 || clickedUnit.a === 2) ? calculateAttacks(clickedUnit) : [];

            let menuHtml = '';

            if (clickedUnit.t === 3 && (clickedUnit.a === 0 || clickedUnit.a === 2)) {
                if (pState.m >= 3) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #3949ab;" onclick="useAbility('ritter')">🌀 Rundumschlag (3🪵)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🌀 Rundumschlag (3🪵)</button>`;
            }
            if (clickedUnit.t === 4 && clickedUnit.a === 1) {
                if (pState.m >= 2 && !clickedUnit.br) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #e53935;" onclick="useAbility('berserker')">🩸 Blutrausch (2🪵)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🩸 Blutrausch (2🪵)</button>`;
            }
            if (clickedUnit.t === 5 && !clickedUnit.iv && !clickedUnit.cd) {
                if (pState.m >= 2) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #43a047;" onclick="useAbility('assassine')">🌫️ Tarnung (2🪵)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🌫️ Tarnung (2🪵)</button>`;
            }
            if (clickedUnit.t === 6 && (clickedUnit.a === 0 || clickedUnit.a === 2)) {
                if (pState.m >= 3) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #fb8c00;" onclick="useAbility('tribok')">🔥 Flächenbrand (3🪵)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🔥 Flächenbrand (3🪵)</button>`;
            }
            if (clickedUnit.t === 9 && (clickedUnit.a === 0 || clickedUnit.a === 2)) {
                if (pState.m >= 3) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #5d4037;" onclick="useAbility('elefant')">🐘 Stampede (3🪵)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🐘 Stampede (3🪵)</button>`;
            }
            if (clickedUnit.t === 10 && (clickedUnit.a === 0 || clickedUnit.a === 2) && !clickedUnit.ps) {
                const kCost = pState.u.includes(8) ? 0 : 1;
                if (pState.m >= kCost) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #e65100;" onclick="useAbility('kamel')">🏹 Parthershot (${kCost}🪵)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🏹 Parthershot (${kCost}🪵)</button>`;
            }
            if (clickedUnit.t === 10 && clickedUnit.ps) {
                menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #bf360c;" disabled>🏹 Parthershot aktiv – Greif an!</button>`;
            }

            if (clickedUnit.t === 7 && (clickedUnit.a === 0 || clickedUnit.a === 2)) {
                const adjStone = gameState.st && gameState.st.some(s => s.h > 0 && hexDistance({ x: s.x, y: s.y }, { x: clickedUnit.x, y: clickedUnit.y }) === 1);
                if (adjStone && !clickedUnit.mi) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #616161;" onclick="startMining()">⛏️ Abbau starten</button>`;
                if (clickedUnit.mi) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #455a64;" onclick="stopMining()">🛑 Abbau stoppen</button>`;

                const stones = pState.s || 0;
                if (stones >= 1) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #795548;" onclick="useAbility('wall')">🧱 Mauer (1🪨)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🧱 Mauer (1🪨)</button>`;

                if (stones >= 4) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #5d4037;" onclick="useAbility('tunnel')">🚇 Tunnel (4🪨)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🚇 Tunnel (4🪨)</button>`;

                if (stones >= 5) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #37474f;" onclick="useAbility('tower')">🗼 Turm (5🪨)</button>`;
                else menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; opacity: 0.5;" disabled>🗼 Turm (5🪨)</button>`;
            }

            if (clickedUnit.t === 11 && (clickedUnit.a === 0 || clickedUnit.a === 2)) {
                const label = clickedUnit.dp === 1 ? '🐎 Abbauen' : '⛺ Aufschlagen';
                menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #263238;" onclick="toggleDeploy()">${label}</button>`;
            }

            if (gameState.tu) {
                let onTunnel = gameState.tu.find(t => (t.x1 === clickedUnit.x && t.y1 === clickedUnit.y) || (t.x2 === clickedUnit.x && t.y2 === clickedUnit.y));
                if (onTunnel) {
                    window.highlightedTunnelEnd = { x: onTunnel.x1 === clickedUnit.x ? onTunnel.x2 : onTunnel.x1, y: onTunnel.y1 === clickedUnit.y ? onTunnel.y2 : onTunnel.y1 };
                    if (onTunnel.r <= gameState.rn && (clickedUnit.a === 0 || clickedUnit.a === 2)) {
                        menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #8d6e63;" onclick="useTunnel()">🚇 Durch Tunnel gehen</button>`;
                    }
                }
                if (clickedUnit.t === 7 && (clickedUnit.a === 0 || clickedUnit.a === 2)) {
                    const adjTunnel = gameState.tu.find(t => t.o === gameState.cp && (
                        hexDistance({ x: t.x1, y: t.y1 }, { x: clickedUnit.x, y: clickedUnit.y }) === 1 ||
                        hexDistance({ x: t.x2, y: t.y2 }, { x: clickedUnit.x, y: clickedUnit.y }) === 1
                    ));
                    if (adjTunnel) menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #4e342e;" onclick="demolishTunnel(${adjTunnel.x1},${adjTunnel.y1})">🚇 Tunnel abreißen (+2🪨)</button>`;
                }
            }
            if (clickedUnit.t === 7 && (clickedUnit.a === 0 || clickedUnit.a === 2) && gameState.wa) {
                gameState.wa.filter(w => w.o === gameState.cp && hexDistance({ x: w.x, y: w.y }, { x: clickedUnit.x, y: clickedUnit.y }) === 1).forEach(w => {
                    menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #4e342e;" onclick="demolishWall(${w.x},${w.y})">🧱 Mauer abreißen</button>`;
                });
            }

            const canCapture = (villageOwner === -1)
                ? (clickedUnit.a === 0 || clickedUnit.a === 2)
                : (clickedUnit.a === 0);

            if (villageOwner !== undefined && villageOwner !== gameState.cp && !isStart && canCapture && !(pState.al && pState.al.includes(villageOwner)) && !(pState.tc && pState.tc.includes(villageOwner))) {
                menuHtml += `<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #ff1744;" onclick="startCapture()">Dorf einnehmen</button>`;
            }

            if (clickedUnit.t === 8 && (clickedUnit.a === 0 || clickedUnit.a === 2)) { menuHtml += '<button class="action-btn" style="padding: 8px; font-size: 0.9rem; background: #d84315;" onclick="useAbility(\'detonate\')">💥 Sprengen</button>'; }

            if (menuHtml) showActionMenu(menuHtml);
            infoPanel.innerHTML += `<div class="info-detail" style="color: #fff176;">Einheit ausgewählt. Ziel oder Aktion wählen.</div>`;

            let specInfo = "";
            if (clickedUnit.t === 3) specInfo = "Spezial: Fügt allen benachbarten Feinden 4 DMG zu.";
            if (clickedUnit.t === 4) specInfo = "Spezial: Aktionspunkt nach Angriff wiederherstellen.";
            if (clickedUnit.t === 5) specInfo = "Spezial: Unsichtbar für Feinde. Bricht bei Angriff." + (clickedUnit.cd ? ` (Cooldown: ${clickedUnit.cd} Runden)` : "");
            if (clickedUnit.t === 6) specInfo = "Spezial: AoE-Angriff auf Zielgebiet (Reichweite 3).";
            if (clickedUnit.t === 7) specInfo = "Spezial: ⛏️ Abbau starten (gratis). Kann 🧱 Mauer (1🪨), 🚇 Tunnel (4🪨), 🗼 Turm (5🪨) bauen.";
            if (clickedUnit.t === 8) specInfo = "Spezial: Kann sich bewegen und explodieren (AoE 8 DMG). Zerstört sich selbst und schädigt auch eigene Truppen!";
            if (clickedUnit.t === 9) specInfo = "Spezial: Stampede – Wähle ein Ziel (max. Distanz 2). Elefant trifft alle Feinde auf dem Weg (5 DMG, kein Gegenangriff) und bewegt sich dorthin.";
            if (clickedUnit.t === 10) specInfo = "Spezial: Parthershot (1🪵) – Aktiviere vor dem Angriff. Nach dem Angriff kann der Kamelreiter sich noch einmal bewegen (Rückzug/Neupositionierung)." + (clickedUnit.ps ? " ► AKTIV – Jetzt angreifen!" : "");
            if (clickedUnit.t === 11) specInfo = `Spezial: ⛺ Aufschlagen / 🐎 Abbauen (gratis, verbraucht Zug). Stationär: Reichweite 2, Bewegung 0. Aura: -1 einkommender DMG für befreundete Nachbarn.`;

            if (specInfo) infoPanel.innerHTML += `<div class="info-detail" style="color: #4fc3f7;">${specInfo}</div>`;
        }
    }
    else if (!clickedUnit && villageOwner === gameState.cp) {
        selectedUnit = null; validMoves = []; validAttacks = [];
        let menuHtml = '';
        const mkBtn = (t, icon, name, col = '') => {
            const hp = getUnitMaxHp(pState, t), mv = getUnitMove(pState, t, null), dmg = unitStats[t].dmg, cost = getUnitCost(pState, t), rg = unitStats[t].range;
            return `<button class="action-btn" style="padding: 6px 8px; font-size: 0.9rem; display:flex; flex-direction:column; align-items:center; gap:4px; ${col ? 'border-color: ' + col + ';' : ''}" onclick="window.buyUnit(${t})">
                <div>${icon} ${name} (${cost}G)</div>
                <div style="font-size: 0.65rem; color: #b0bec5; display: flex; gap: 8px;"><span>❤️${hp}</span><span>⚔️${dmg}</span><span>👟${mv}</span><span>🎯${rg}</span></div>
            </button>`;
        };
        menuHtml += mkBtn(0, '⚔️', 'Schwert') + mkBtn(1, '🏹', 'Bogen') + mkBtn(2, '🐎', 'Pferd');
        menuHtml += mkBtn(7, '⛏️', 'Arbeiter', '#fff176');
        if (pState.f.includes(0)) {
            menuHtml += mkBtn(3, '🛡️', 'Ritter', '#fff176');
            menuHtml += mkBtn(10, '🐪', 'Kamelreiter', '#e65100');
        }
        if (pState.f.includes(1)) {
            menuHtml += mkBtn(4, '🪓', 'Berserker', '#fff176');
            menuHtml += mkBtn(8, '💣', 'Saboteur', '#fff176');
        }
        if (pState.f.includes(2)) {
            menuHtml += mkBtn(5, '🗡️', 'Assassine', '#fff176');
            menuHtml += mkBtn(9, '🐘', 'Elefant', '#a1887f');
        }
        if (pState.f.includes(3)) {
            menuHtml += mkBtn(6, '🏗️', 'Tribok', '#fff176');
            menuHtml += mkBtn(11, '🚚', 'Wagenburg', '#fff176');
        }
        showActionMenu(menuHtml); infoPanel.innerHTML += `<div class="info-detail" style="color: #fff176;">Was möchtest du rekrutieren?</div>`;
    } else { selectedUnit = null; validMoves = []; validAttacks = []; }
}

// === POINTER / TOUCH EVENTS ===
canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX; dragStartY = e.clientY;
    camStartX = camX; camStartY = camY;
    canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX; const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
    camX = camStartX + dx; camY = camStartY + dy;
    if (!isAnimating) requestAnimationFrame(() => drawScene(gameState));
});

canvas.addEventListener('pointerup', (e) => {
    isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
    if (!hasMoved) handleCanvasClick(e.clientX, e.clientY);
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoom = Math.exp(wheel * zoomIntensity);

    camX = e.clientX - (e.clientX - camX) * zoom;
    camY = e.clientY - (e.clientY - camY) * zoom;
    camScale *= zoom;
    camScale = Math.max(0.4, Math.min(camScale, 3.0));

    if (!isAnimating) requestAnimationFrame(() => drawScene(gameState));
}, { passive: false });

canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        initialCamScale = camScale;
        initialCamX = camX; initialCamY = camY;
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && initialPinchDist) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const zoom = dist / initialPinchDist;
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        camScale = initialCamScale * zoom;
        camScale = Math.max(0.4, Math.min(camScale, 3.0));

        camX = centerX - (centerX - initialCamX) * (camScale / initialCamScale);
        camY = centerY - (centerY - initialCamY) * (camScale / initialCamScale);

        if (!isAnimating) requestAnimationFrame(() => drawScene(gameState));
    }
}, { passive: false });

canvas.addEventListener('touchend', e => { if (e.touches.length < 2) initialPinchDist = null; });

document.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        undoLastAction();
    }
});

// === CAMERA FOCUS ===
function focusCamera() {
    let targetHex = null;
    const pId = gameState.cp;
    const pState = gameState.p[pId];
    const vis = getVisibleHexes(pId);

    const visibleActions = (gameState.la || []).filter(a => vis.has(`${a.x},${a.y}`));
    if (visibleActions.length > 0) {
        targetHex = visibleActions[visibleActions.length - 1];
    } else {
        const myUnits = gameState.u.filter(u => u.p === pId);
        if (myUnits.length > 0) targetHex = myUnits[0];
        else {
            const myVillages = Object.keys(gameState.v).filter(k => gameState.v[k] === pId);
            if (myVillages.length > 0) {
                const [vx, vy] = myVillages[0].split(',').map(Number);
                targetHex = { x: vx, y: vy };
            } else if (pState.sv) {
                const [vx, vy] = pState.sv.split(',').map(Number);
                targetHex = { x: vx, y: vy };
            }
        }
    }

    if (targetHex) {
        const center = getHexCenter(targetHex.x, targetHex.y);
        camScale = 1.0;
        camX = (canvas.width / 2) - center.px;
        camY = (canvas.height / 2) - center.py;
    }
}

window.addEventListener('resize', () => {
    if (canvasWrapper.style.display === 'block') {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        if (gameState) { focusCamera(); renderBoard(gameState); }
    }
});

// === SURRENDER ===
const surrenderOverlay = document.getElementById('surrender-overlay');
const surrenderMsg = document.getElementById('surrender-msg');

function openSurrenderDialog() {
    if (!gameState) return;
    const pName = gameState.p[gameState.cp].n;
    surrenderMsg.innerText = `${pName}, bist du sicher? Alle deine Einheiten und Dörfer gehen verloren. Diese Aktion kann nicht rückgängig gemacht werden.`;
    surrenderOverlay.classList.add('open');
}

function closeSurrenderDialog() {
    surrenderOverlay.classList.remove('open');
}

window.openSurrenderDialog = openSurrenderDialog;
window.closeSurrenderDialog = closeSurrenderDialog;

function confirmSurrender() {
    closeSurrenderDialog();

    const surrenderingId = gameState.cp;
    const surrenderingName = gameState.p[surrenderingId].n;

    gameState.p[surrenderingId].dead = 1;
    gameState.u = gameState.u.filter(u => u.p !== surrenderingId);

    Object.keys(gameState.v).forEach(k => {
        if (gameState.v[k] === surrenderingId) delete gameState.v[k];
    });

    gameState.la = turnActions;
    turnActions = [];

    let loopGuard = 0;
    do {
        gameState.cp++;
        if (gameState.cp >= gameState.p.length) { gameState.cp = 0; gameState.rn++; }
        loopGuard++;
    } while (gameState.p[gameState.cp].dead === 1 && loopGuard < gameState.p.length);

    const alivePlayers = gameState.p.filter(p => p.dead !== 1);
    const teamWinners = checkTeamWin(alivePlayers);
    const isWin = teamWinners || alivePlayers.length === 1;

    if (!isWin && gameState.rn > 1) {
        const pState = gameState.p[gameState.cp];
        const income = calculateIncome(gameState.cp);
        pState.g += income.g;
        pState.m += income.m;
    }

    gameState.p.forEach(p => {
        if (Array.isArray(p.e)) p.e = compressFog(p.e);
        if (p.al && p.al.length === 0) delete p.al;
        if (p.req && p.req.length === 0) delete p.req;
        if (p.tc && p.tc.length === 0) delete p.tc;
        if (p.of && p.of.length === 0) delete p.of;
        if (gameState.tu && gameState.tu.length === 0) delete gameState.tu;
        if (gameState.wa && gameState.wa.length === 0) delete gameState.wa;
        if (gameState.st && gameState.st.length === 0) delete gameState.st;
        if (gameState.tw && gameState.tw.length === 0) delete gameState.tw;
        if (p.dead === 0) delete p.dead;
    });
    gameState.u.forEach(u => {
        if (u.a === 0) delete u.a;
        if (u.dp === 0) delete u.dp;
        if (!u.mi) delete u.mi;
        delete u.i;
    });
    const encodedState = LZString.compressToEncodedURIComponent(JSON.stringify(gameState));

    gameState.p.forEach(p => {
        if (typeof p.e === 'string') p.e = decompressFog(p.e);
        if (!p.al) p.al = [];
        if (!p.req) p.req = [];
        if (!p.tc) p.tc = [];
        if (!p.of) p.of = [];
        if (p.dead === undefined) p.dead = 0;
    });
    if (!gameState.tu) gameState.tu = [];
    if (!gameState.wa) gameState.wa = [];
    if (!gameState.st) gameState.st = [];
    if (!gameState.tw) gameState.tw = [];
    gameState.u.forEach((u, idx) => {
        if (u.a === undefined) u.a = 0;
        if (!u.i) u.i = idx + 1;
        if (u.dp === undefined) u.dp = 0;
    });

    const nextPlayer = gameState.p[gameState.cp];
    if (teamWinners) {
        if (!isLegacyUrlMode && currentGameId) submitTurnToServer(encodedState, null, true);
        showWin(`${teamWinners.map(p => p.n).join(' & ')} gewinnen gemeinsam!`);
        return;
    }
    if (alivePlayers.length === 1) {
        if (!isLegacyUrlMode && currentGameId) submitTurnToServer(encodedState, null, true);
        showWin(`${alivePlayers[0].n} hat als Letzter überlebt! (${surrenderingName} hat aufgegeben)`);
        return;
    }
    if (!isLegacyUrlMode && currentGameId) {
        submitTurnToServer(encodedState, nextPlayer.n);
    } else {
        const baseUrl = window.location.href.split('?')[0];
        const newUrl = baseUrl + "?state=" + encodedState;
        try { window.history.pushState({ path: newUrl }, '', newUrl); } catch (e) { }
        canvasWrapper.style.display = 'none'; uiContainer.style.display = 'none'; gameHud.style.display = 'none';
        document.getElementById('link-box').style.display = '';
        document.getElementById('wa-share-btn').style.display = '';
        document.getElementById('intermission-back-btn').style.display = 'none';
        intermissionMsg.innerText = `${surrenderingName} hat aufgegeben! Kopiere diesen Link und schicke ihn an ${nextPlayer.n}.`;
        linkBox.value = newUrl;
        intermissionScreen.style.display = 'flex';
        waShareBtn.onclick = () => { window.open(`https://wa.me/?text=${encodeURIComponent(`Dein Zug in Dark Ages, ${nextPlayer.n}!\n${surrenderingName} hat aufgegeben.\nKlicke hier: ${newUrl}`)}`, '_blank'); };
        navigator.clipboard.writeText(newUrl).catch(() => {});
    }
}

window.confirmSurrender = confirmSurrender;

// === END TURN CONFIRM DIALOG ===
const endTurnConfirmOverlay = document.getElementById('end-turn-confirm-overlay');
const endTurnConfirmMsg = document.getElementById('end-turn-confirm-msg');

function hasRemainingActions() {
    if (!gameState) return false;
    const pId = gameState.cp;
    const pState = gameState.p[pId];

    const myUnits = gameState.u.filter(u => u.p === pId);

    for (const unit of myUnits) {
        // Einheit kann sich noch bewegen oder angreifen
        if (!unit.a) {
            const moves = calculateMoves(unit);
            if (moves.length > 0) return true;
            const attacks = calculateAttacks(unit);
            if (attacks.length > 0) return true;
        }

        // Arbeiter: Fähigkeiten prüfen (Tunnel, Mauer, Turm bauen; Mining starten/stoppen)
        if (unit.t === 7 && !unit.a) {
            return true; // Arbeiter mit Aktion hat immer Optionen
        }

        // Spezielle Fähigkeiten die kein unit.a verbrauchen
        // Assassine: Unsichtbarkeit (noch nicht aktiv)
        if (unit.t === 5 && !unit.iv && !unit.a && pState.m >= 2) return true;
        // Ritter: Rundumschlag
        if (unit.t === 3 && !unit.a && pState.m >= 3) return true;
        // Berserker: Blutrausch (noch nicht used)
        if (unit.t === 4 && !unit.a && pState.m >= 2) return true;
        // Tribok: Spezial
        if (unit.t === 6 && !unit.a && pState.m >= 3) return true;
        // Elefant: Stampede
        if (unit.t === 9 && !unit.a && pState.m >= 3) return true;
        // Kamelreiter: Parthershot (und hat noch keine ps)
        if (unit.t === 10 && !unit.a && !unit.ps) return true;
        // Wagenburg: Aufstellen/Einpacken (verbraucht Aktion)
        if (unit.t === 11 && !unit.a) return true;
    }

    // Einheit kaufen: gibt es Dörfer des Spielers auf denen noch keine Einheit steht?
    const myVillageKeys = Object.entries(gameState.v)
        .filter(([k, v]) => v === pId)
        .map(([k]) => k);
    // Kaufbare Typen: Basis 0,1,2 + Fraktions-Einheiten
    const factionUnitMap = { 0: [3], 1: [4], 2: [5, 6], 3: [6, 7] };
    let buyableTypes = [0, 1, 2];
    if (pState.f) pState.f.forEach(fId => { if (factionUnitMap[fId]) buyableTypes = buyableTypes.concat(factionUnitMap[fId]); });
    const cheapest = Math.min(...buyableTypes.map(t => getUnitCost(pState, t)));
    for (const vk of myVillageKeys) {
        const [vx, vy] = vk.split(',').map(Number);
        const hasUnit = gameState.u.some(u => u.x === vx && u.y === vy);
        if (!hasUnit && pState.g >= cheapest) return true;
    }

    // Turm schießen: hat der Spieler Türme die noch schießen können?
    if (gameState.tw) {
        for (const tw of gameState.tw) {
            if (tw.o === pId && tw.h > 0 && !tw.a) return true;
        }
    }

    // Dorf einnehmen: Einheit steht auf feindlichem/neutralem Dorf und hat noch Aktion
    for (const unit of myUnits) {
        if (!unit.a) {
            const loc = `${unit.x},${unit.y}`;
            if (gameState.v[loc] !== undefined && gameState.v[loc] !== pId) return true;
        }
    }

    // Upgrade kaufen: Forschungsbaum
    if (pState.f && pState.f.length > 0) {
        const canBuyUpgrade = Object.entries(upgrades).some(([idStr, upg]) => {
            const id = parseInt(idStr);
            return pState.f.includes(upg.fac) && !pState.u.includes(id) && pState.g >= upg.g && pState.m >= upg.m;
        });
        if (canBuyUpgrade) return true;
    }

    return false;
}

function openEndTurnConfirm() {
    const actions = [];
    const pId = gameState.cp;
    const pState = gameState.p[pId];
    const myUnits = gameState.u.filter(u => u.p === pId);

    // Sammle konkrete Hinweise
    for (const unit of myUnits) {
        if (!unit.a) {
            const moves = calculateMoves(unit);
            const attacks = calculateAttacks(unit);
            if (moves.length > 0) { actions.push(`${unitStats[unit.t].name} kann sich noch bewegen`); break; }
            if (attacks.length > 0) { actions.push(`${unitStats[unit.t].name} kann noch angreifen`); break; }
        }
    }

    if (gameState.tw && gameState.tw.some(tw => tw.o === pId && tw.h > 0 && !tw.a)) {
        actions.push('Ein Turm kann noch schießen');
    }

    const myVillageKeys = Object.entries(gameState.v).filter(([k, v]) => v === pId).map(([k]) => k);
    if (actions.length === 0 && myVillageKeys.length > 0) {
        const factionUnitMap = { 0: [3], 1: [4], 2: [5, 6], 3: [6, 7] };
        let buyableTypes = [0, 1, 2];
        if (pState.f) pState.f.forEach(fId => { if (factionUnitMap[fId]) buyableTypes = buyableTypes.concat(factionUnitMap[fId]); });
        const cheapest = Math.min(...buyableTypes.map(t => getUnitCost(pState, t)));
        for (const vk of myVillageKeys) {
            const [vx, vy] = vk.split(',').map(Number);
            if (!gameState.u.some(u => u.x === vx && u.y === vy) && pState.g >= cheapest) {
                actions.push('Du könntest noch eine Einheit kaufen');
                break;
            }
        }
    }

    const hint = actions.length > 0 ? actions[0] + '.' : 'Du hast noch mögliche Aktionen.';
    endTurnConfirmMsg.textContent = hint + ' Trotzdem beenden?';
    endTurnConfirmOverlay.classList.add('open');
}

function hideEndTurnConfirm() {
    endTurnConfirmOverlay.classList.remove('open');
}

function cancelEndTurn() {
    hideEndTurnConfirm();
    endTurnBtn.disabled = false;
}
window.cancelEndTurn = cancelEndTurn;

function doEndTurn() {

    gameState.la = turnActions; turnActions = [];
    undoStack = [];
    updateUndoButton();

    processAutoMining(gameState.cp);
    floatingTexts = [];
    attackAnims = [];
    isAnimating = false;

    gameState.u.filter(u => u.p === gameState.cp).forEach(u => {
        if (u.cd > 0) { u.cd--; if (u.cd === 0) delete u.cd; }
    });

    gameState.u.forEach(u => {
        u.a = 0;
        delete u.br;
    });
    if (gameState.p[gameState.cp].tc) gameState.p[gameState.cp].tc = [];

    let oldRn = gameState.rn;
    let loopGuard = 0;
    do {
        gameState.cp++;
        if (gameState.cp >= gameState.p.length) { gameState.cp = 0; gameState.rn++; }
        loopGuard++;
    } while (gameState.p[gameState.cp].dead === 1 && loopGuard < gameState.p.length);

    if (gameState.tw) gameState.tw.filter(tw => tw.o === gameState.cp).forEach(tw => tw.a = 0);

    if (gameState.rn > oldRn && gameState.rn >= 3) {
        const evt = checkForEvent();
        if (evt) evt.effect(gameState);
    }

    const alivePlayers = gameState.p.filter(p => p.dead !== 1);
    const teamWinners2 = checkTeamWin(alivePlayers);
    const isWin = teamWinners2 || alivePlayers.length === 1;

    const pId = gameState.cp; const pState = gameState.p[pId];
    let healsThisTurn = [];

    if (!isWin && gameState.rn > 1) {
        const income = calculateIncome(pId);
        pState.g += income.g;
        pState.m += income.m;

        if (pState.f && pState.f.includes(0)) {
            gameState.u.filter(u => u.p === pId).forEach(u => {
                const loc = `${u.x},${u.y}`;
                const maxHp = getUnitMaxHp(pState, u.t);
                if (gameState.v[loc] === pId && u.h < maxHp) {
                    const healAmount = Math.min(maxHp - u.h, 2);
                    u.h += healAmount;
                    healsThisTurn.push({ x: u.x, y: u.y, val: healAmount });
                }
            });
        }
    }
    gameState.th = healsThisTurn;

    selectedUnit = null; selectedHex = null; validMoves = []; validAttacks = []; window.specialActive = null; hideActionMenu();

    gameState.p.forEach(p => {
        if (Array.isArray(p.e)) p.e = compressFog(p.e);
        if (p.al && p.al.length === 0) delete p.al;
        if (p.req && p.req.length === 0) delete p.req;
        if (p.tc && p.tc.length === 0) delete p.tc;
        if (p.of && p.of.length === 0) delete p.of;
        if (gameState.tu && gameState.tu.length === 0) delete gameState.tu;
        if (gameState.wa && gameState.wa.length === 0) delete gameState.wa;
        if (gameState.st && gameState.st.length === 0) delete gameState.st;
        if (gameState.tw && gameState.tw.length === 0) delete gameState.tw;
        if (p.dead === 0) delete p.dead;
    });
    gameState.u.forEach(u => {
        if (u.a === 0) delete u.a;
        if (u.dp === 0) delete u.dp;
        if (!u.mi) delete u.mi;
        delete u.i;
    });
    const encodedState = LZString.compressToEncodedURIComponent(JSON.stringify(gameState));

    gameState.p.forEach(p => {
        if (typeof p.e === 'string') p.e = decompressFog(p.e);
        if (!p.al) p.al = [];
        if (!p.req) p.req = [];
        if (!p.tc) p.tc = [];
        if (!p.of) p.of = [];
        if (p.dead === undefined) p.dead = 0;
    });
    if (!gameState.tu) gameState.tu = [];
    if (!gameState.wa) gameState.wa = [];
    if (!gameState.st) gameState.st = [];
    if (!gameState.tw) gameState.tw = [];
    gameState.u.forEach((u, idx) => {
        if (u.a === undefined) u.a = 0;
        if (!u.i) u.i = idx + 1;
        if (u.dp === undefined) u.dp = 0;
    });

    if (teamWinners2) {
        if (!isLegacyUrlMode && currentGameId) submitTurnToServer(encodedState, null, true);
        showWin(`${teamWinners2.map(p => p.n).join(' & ')} gewinnen gemeinsam!`);
        return;
    }
    if (alivePlayers.length === 1) {
        if (!isLegacyUrlMode && currentGameId) submitTurnToServer(encodedState, null, true);
        showWin(`${alivePlayers[0].n} hat als Letzter überlebt!`);
        return;
    }
    if (!isLegacyUrlMode && currentGameId) {
        submitTurnToServer(encodedState, pState.n);
    } else {
        const baseUrl = window.location.href.split('?')[0];
        const newUrl = baseUrl + "?state=" + encodedState;
        try { window.history.pushState({ path: newUrl }, '', newUrl); } catch (e) { }
        canvasWrapper.style.display = 'none'; uiContainer.style.display = 'none'; gameHud.style.display = 'none';
        document.getElementById('link-box').style.display = '';
        document.getElementById('wa-share-btn').style.display = '';
        document.getElementById('intermission-back-btn').style.display = 'none';
        intermissionMsg.innerText = `Kopiere diesen Link und schicke ihn an ${pState.n}.`;
        linkBox.value = newUrl; intermissionScreen.style.display = 'flex';
        waShareBtn.onclick = () => { window.open(`https://wa.me/?text=${encodeURIComponent(`Dein Zug in Dark Ages, ${pState.n}!\nKlicke hier: ${newUrl}`)}`, '_blank'); };
        navigator.clipboard.writeText(newUrl).catch(() => {});
    }
}

// === END TURN ===
endTurnBtn.addEventListener('click', () => {
    if (endTurnBtn.disabled) return;
    endTurnBtn.disabled = true;
    if (hasRemainingActions()) {
        openEndTurnConfirm();
    } else {
        doEndTurn();
    }
});

function confirmEndTurn() {
    hideEndTurnConfirm();
    endTurnBtn.disabled = true;
    doEndTurn();
}
window.confirmEndTurn = confirmEndTurn;


// === SERVER TURN SUBMISSION ===
async function submitTurnToServer(encodedState, nextPlayerName, isFinished = false) {
    endTurnBtn.disabled = true;

    const eliminatedSlots = gameState.p
        .map((p, i) => (p.dead === 1 ? i : null))
        .filter(i => i !== null);

    try {
        await api.post(`/api/games/${currentGameId}/turn`, {
            state_blob:       encodedState,
            next_slot:        gameState.cp,
            next_round:       gameState.rn,
            eliminated_slots: eliminatedSlots,
            game_finished:    isFinished,
        });
        if (!isFinished) showServerIntermission(nextPlayerName);
    } catch (err) {
        showToast('Fehler: ' + err.message);
        endTurnBtn.disabled = false;
    }
}
