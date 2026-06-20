// === ABILITIES ===
window.useAbility = function (type) {
    const pState = gameState.p[gameState.cp];
    if (!selectedUnit) return;
    saveUndoState();

    if (type === 'ritter') {
        pState.m -= 3;
        let dmgDone = false;
        const canAttack = (targetId) => !(pState.al && pState.al.includes(targetId)) && !(pState.tc && pState.tc.includes(targetId));
        gameState.u.filter(u => u.p !== gameState.cp && canAttack(u.p) && hexDistance({ x: u.x, y: u.y }, { x: selectedUnit.x, y: selectedUnit.y }) <= 1).forEach(enemy => {
            enemy.h -= 4; spawnFloatingText(enemy.x, enemy.y, "-4", "#ff5252"); dmgDone = true;
        });
        gameState.u = gameState.u.filter(u => u.h > 0);

        for (let i = 0; i < gameState.p.length; i++) {
            if (i !== gameState.cp && gameState.p[i].dead === 0 && canAttack(i)) {
                let [vx, vy] = gameState.p[i].sv.split(',').map(Number);
                if (hexDistance({ x: vx, y: vy }, { x: selectedUnit.x, y: selectedUnit.y }) <= 1) {
                    gameState.p[i].sh -= 4; spawnFloatingText(vx, vy, "-4", "#ff5252"); dmgDone = true;
                    if (gameState.p[i].sh <= 0) {
                        gameState.p[i].dead = 1;
                        gameState.u = gameState.u.filter(u => u.p !== i);
                        gameState.v[`${vx},${vy}`] = gameState.cp;
                    }
                }
            }
        }
        if (gameState.tu) {
            gameState.tu.forEach(tun => {
                const canAttackTun = (targetId) => !(pState.al && pState.al.includes(targetId)) && !(pState.tc && pState.tc.includes(targetId));
                if (tun.o !== gameState.cp && canAttackTun(tun.o)) {
                    if (hexDistance({ x: tun.x1, y: tun.y1 }, { x: selectedUnit.x, y: selectedUnit.y }) <= 1 ||
                        hexDistance({ x: tun.x2, y: tun.y2 }, { x: selectedUnit.x, y: selectedUnit.y }) <= 1) {
                        tun.h -= 4; spawnFloatingText(tun.x1, tun.y1, "-4", "#ff5252"); dmgDone = true;
                    }
                }
            });
            gameState.tu = gameState.tu.filter(tun => tun.h > 0);
        }
        selectedUnit.a = 1; turnActions.push({ x: selectedUnit.x, y: selectedUnit.y, t: 'atk' });
        selectedUnit = null; validMoves = []; validAttacks = []; hideActionMenu();
        if (dmgDone) { infoPanel.innerHTML = `🌀 Rundumschlag ausgeführt!`; }
        renderBoard(gameState);
    }
    else if (type === 'berserker') {
        pState.m -= 2;
        selectedUnit.a = 0;
        selectedUnit.br = 1;
        validMoves = calculateMoves(selectedUnit); validAttacks = calculateAttacks(selectedUnit);
        infoPanel.innerHTML = `🩸 Blutrausch aktiv!<div class="info-detail" style="color: #4fc3f7;">Aktionspunkt wiederhergestellt. Einheit kann nochmals agieren.</div>`;
        hideActionMenu(); renderBoard(gameState);
    }
    else if (type === 'assassine') {
        pState.m -= 2;
        selectedUnit.iv = 1;
        infoPanel.innerHTML = `🌫️ Unsichtbarkeit aktiv!<div class="info-detail" style="color: #4fc3f7;">Für Feinde nicht mehr anvisierbar. Bricht sofort bei Angriff.</div>`;
        hideActionMenu(); renderBoard(gameState);
    }
    else if (type === 'tribok') {
        pState.m -= 3; window.specialActive = 'tribok';
        validAttacks = []; validMoves = [];
        for (let y = 0; y < gameState.bh; y++) {
            for (let x = 0; x < gameState.bw; x++) {
                if (isInsideMap(gameState, x, y) && hexDistance({ x, y }, { x: selectedUnit.x, y: selectedUnit.y }) <= 3) {
                    validAttacks.push({ x, y, isTribokAoE: true });
                }
            }
        }
        hideActionMenu(); infoPanel.innerHTML = `🔥 Flächenbrand Zielwahl<br><div class="info-detail" style="color: #4fc3f7;">Wähle ein markiertes Feld. 3 DMG im Zentrum, 2 DMG an alle Nachbarn.</div>`;
        renderBoard(gameState);
    }
    else if (type === 'tunnel') {
        window.specialActive = 'tunnel_step1';
        validAttacks = []; validMoves = [];
        for (let n of getNeighbors(selectedUnit.x, selectedUnit.y)) {
            const hasVillage = gameState.v[`${n.x},${n.y}`] !== undefined;
            const hasTunnel = gameState.tu && gameState.tu.some(t => (t.x1 === n.x && t.y1 === n.y) || (t.x2 === n.x && t.y2 === n.y));
            const hasWall = gameState.wa && gameState.wa.some(w => w.x === n.x && w.y === n.y);
            const hasStone = gameState.st && gameState.st.some(s => s.x === n.x && s.y === n.y && s.h > 0);
            const hasTower = gameState.tw && gameState.tw.some(tw => tw.x === n.x && tw.y === n.y && tw.h > 0);
            if (!gameState.u.some(u => u.x === n.x && u.y === n.y) && !hasVillage && !hasTunnel && !hasWall && !hasStone && !hasTower) {
                validMoves.push({ x: n.x, y: n.y });
            }
        }
        hideActionMenu(); infoPanel.innerHTML = `🚇 Tunnel Startpunkt<br><div class="info-detail" style="color: #4fc3f7;">Wähle ein markiertes, freies Feld neben dem Arbeiter (4🪨).</div>`;
        renderBoard(gameState);
    }
    else if (type === 'wall') {
        window.specialActive = 'wall_step1';
        validAttacks = []; validMoves = [];
        for (let n of getNeighbors(selectedUnit.x, selectedUnit.y)) {
            const hasVillage = gameState.v[`${n.x},${n.y}`] !== undefined;
            const hasTunnel = gameState.tu && gameState.tu.some(t => (t.x1 === n.x && t.y1 === n.y) || (t.x2 === n.x && t.y2 === n.y));
            const hasWall = gameState.wa && gameState.wa.some(w => w.x === n.x && w.y === n.y);
            const hasStone = gameState.st && gameState.st.some(s => s.x === n.x && s.y === n.y && s.h > 0);
            const hasTower = gameState.tw && gameState.tw.some(tw => tw.x === n.x && tw.y === n.y && tw.h > 0);
            if (!gameState.u.some(u => u.x === n.x && u.y === n.y) && !hasVillage && !hasTunnel && !hasWall && !hasStone && !hasTower) {
                validMoves.push({ x: n.x, y: n.y });
            }
        }
        hideActionMenu(); infoPanel.innerHTML = `🧱 Mauer errichten<br><div class="info-detail" style="color: #4fc3f7;">Wähle ein markiertes, freies Feld neben dem Arbeiter (1🪨).</div>`;
        renderBoard(gameState);
    }
    else if (type === 'tower') {
        window.specialActive = 'tower_step1';
        validAttacks = []; validMoves = [];
        for (let n of getNeighbors(selectedUnit.x, selectedUnit.y)) {
            const hasVillage = gameState.v[`${n.x},${n.y}`] !== undefined;
            const hasTunnel = gameState.tu && gameState.tu.some(t => (t.x1 === n.x && t.y1 === n.y) || (t.x2 === n.x && t.y2 === n.y));
            const hasWall = gameState.wa && gameState.wa.some(w => w.x === n.x && w.y === n.y);
            const hasStone = gameState.st && gameState.st.some(s => s.x === n.x && s.y === n.y && s.h > 0);
            const hasTower = gameState.tw && gameState.tw.some(tw => tw.x === n.x && tw.y === n.y && tw.h > 0);
            if (!gameState.u.some(u => u.x === n.x && u.y === n.y) && !hasVillage && !hasTunnel && !hasWall && !hasStone && !hasTower) {
                validMoves.push({ x: n.x, y: n.y });
            }
        }
        hideActionMenu(); infoPanel.innerHTML = `🗼 Turm errichten<br><div class="info-detail" style="color: #4fc3f7;">Wähle ein markiertes, freies Feld neben dem Arbeiter (5🪨).</div>`;
        renderBoard(gameState);
    }
    else if (type === 'detonate') {
        const cx = selectedUnit.x, cy = selectedUnit.y;
        let targets = [{ x: cx, y: cy }];
        getNeighbors(cx, cy).forEach(n => targets.push(n));

        const detDmg = pState.u.includes(9) ? 10 : 8;

        targets.forEach(t => {
            spawnAttackAnim(cx, cy, t.x, t.y, 'fire');

            gameState.u.forEach(u => {
                if (u.x === t.x && u.y === t.y && u !== selectedUnit) {
                    u.h -= detDmg;
                    spawnFloatingText(u.x, u.y, `-${detDmg}`, "#ff5252");
                }
            });

            for (let i = 0; i < gameState.p.length; i++) {
                if (gameState.p[i].dead === 0 && gameState.p[i].sv === `${t.x},${t.y}`) {
                    gameState.p[i].sh -= detDmg;
                    spawnFloatingText(t.x, t.y, `-${detDmg}`, "#ff5252");
                    if (gameState.p[i].sh <= 0) {
                        gameState.p[i].dead = 1;
                        gameState.u = gameState.u.filter(un => un.p !== i);
                        gameState.v[`${t.x},${t.y}`] = gameState.cp;
                    }
                }
            }

            if (gameState.tu) {
                gameState.tu.forEach(tun => {
                    if ((tun.x1 === t.x && tun.y1 === t.y) || (tun.x2 === t.x && tun.y2 === t.y)) {
                        tun.h -= detDmg;
                        spawnFloatingText(t.x, t.y, `-${detDmg}`, "#ff5252");
                    }
                });
            }

            if (gameState.wa) {
                gameState.wa.forEach(w => {
                    if (w.x === t.x && w.y === t.y) {
                        w.h -= detDmg;
                        spawnFloatingText(t.x, t.y, `-${detDmg}`, "#ff5252");
                    }
                });
                gameState.wa = gameState.wa.filter(w => w.h > 0);
            }

            if (gameState.tw) {
                gameState.tw.forEach(tw => {
                    if (tw.x === t.x && tw.y === t.y) {
                        tw.h -= detDmg;
                        spawnFloatingText(t.x, t.y, `-${detDmg}`, "#ff5252");
                    }
                });
                gameState.tw = gameState.tw.filter(tw => tw.h > 0);
            }
        });

        selectedUnit.h = 0;
        gameState.u = gameState.u.filter(u => u.h > 0);
        if (gameState.tu) gameState.tu = gameState.tu.filter(tun => tun.h > 0);

        turnActions.push({ x: cx, y: cy, t: 'atk' });
        selectedUnit = null; validMoves = []; validAttacks = []; window.specialActive = null;
        hideActionMenu(); infoPanel.innerHTML = "💥 BOOM! Saboteur detoniert!";
        renderBoard(gameState);
    }
    else if (type === 'elefant') {
        pState.m -= 3;
        window.specialActive = 'elefant_stampede';
        validMoves = []; validAttacks = [];
        for (let y = 0; y < gameState.bh; y++) {
            for (let x = 0; x < gameState.bw; x++) {
                if (isInsideMap(gameState, x, y) && hexDistance({ x, y }, { x: selectedUnit.x, y: selectedUnit.y }) <= 2 && (x !== selectedUnit.x || y !== selectedUnit.y)) {
                    validAttacks.push({ x, y, isStampede: true });
                }
            }
        }
        hideActionMenu();
        infoPanel.innerHTML = `🐘 Stampede – Zielwahl<br><div class="info-detail" style="color: #4fc3f7;">Wähle ein markiertes Feld (max. Distanz 2). Elefant trifft alle Feinde auf dem Weg (5 DMG, kein Gegenangriff).</div>`;
        renderBoard(gameState);
    }
    else if (type === 'kamel') {
        if (!pState.u.includes(8)) pState.m -= 1;
        selectedUnit.ps = 1;
        hideActionMenu();
        infoPanel.innerHTML = `🏹 Parthershot aktiviert! Greife jetzt an – danach kannst du dich noch einmal bewegen.`;
        renderBoard(gameState);
    }
};

window.startMining = function () {
    if (!selectedUnit || selectedUnit.t !== 7) return;
    saveUndoState();
    const adj = (gameState.st || []).filter(s => s.h > 0 && hexDistance({ x: s.x, y: s.y }, { x: selectedUnit.x, y: selectedUnit.y }) === 1);
    if (adj.length === 0) { showToast("Kein Steinhaufen neben dir.", "error"); return; }
    adj.sort((a, b) => b.h - a.h);
    selectedUnit.mi = { x: adj[0].x, y: adj[0].y };
    hideActionMenu();
    infoPanel.innerHTML = `⛏️ Abbau gestartet!<div class="info-detail" style="color:#4fc3f7;">Am Rundenende: +1🪨, Steinhaufen -1 (solange du daneben stehst).</div>`;
    renderBoard(gameState);
};

window.stopMining = function () {
    if (!selectedUnit || selectedUnit.t !== 7) return;
    saveUndoState();
    delete selectedUnit.mi;
    hideActionMenu();
    infoPanel.innerHTML = `⛏️ Abbau gestoppt.`;
    renderBoard(gameState);
};

window.toggleDeploy = function () {
    if (!selectedUnit || selectedUnit.t !== 11) return;
    saveUndoState();
    selectedUnit.dp = selectedUnit.dp === 1 ? 0 : 1;
    selectedUnit.a = 1;
    hideActionMenu();
    infoPanel.innerHTML = selectedUnit.dp === 1 ? `⛺ Wagenburg aufgeschlagen!` : `🐎 Wagenburg mobil.`;
    renderBoard(gameState);
};

window.demolishTunnel = function (x1, y1) {
    if (!selectedUnit || !gameState.tu) return;
    saveUndoState();
    const tunnel = gameState.tu.find(t => t.x1 === x1 && t.y1 === y1 && t.o === gameState.cp);
    if (!tunnel) return;
    gameState.tu = gameState.tu.filter(t => t !== tunnel);
    gameState.p[gameState.cp].s = (gameState.p[gameState.cp].s || 0) + 2;
    selectedUnit.a = 1;
    selectedUnit = null; validMoves = []; validAttacks = []; window.highlightedTunnelEnd = null;
    hideActionMenu(); infoPanel.innerHTML = `🚇 Tunnel abgerissen! +2🪨`; renderBoard(gameState);
};

window.demolishWall = function (wx, wy) {
    if (!selectedUnit || !gameState.wa) return;
    saveUndoState();
    gameState.wa = gameState.wa.filter(w => !(w.x === wx && w.y === wy && w.o === gameState.cp));
    selectedUnit.a = 1;
    selectedUnit = null; validMoves = []; validAttacks = [];
    hideActionMenu(); infoPanel.innerHTML = `🧱 Mauer abgerissen!`; renderBoard(gameState);
};

window.useTunnel = function () {
    if (!selectedUnit) return;
    saveUndoState();
    if (gameState.tu) {
        let tunnel = gameState.tu.find(t => t.r <= gameState.rn && ((t.x1 === selectedUnit.x && t.y1 === selectedUnit.y) || (t.x2 === selectedUnit.x && t.y2 === selectedUnit.y)));
        if (tunnel) {
            let linkX = tunnel.x1 === selectedUnit.x ? tunnel.x2 : tunnel.x1;
            let linkY = tunnel.y1 === selectedUnit.y ? tunnel.y2 : tunnel.y1;
            if (!gameState.u.some(u => u.x === linkX && u.y === linkY) && !gameState.v[`${linkX},${linkY}`]) {
                const prevX = selectedUnit.x, prevY = selectedUnit.y;
                selectedUnit.x = linkX; selectedUnit.y = linkY;
                selectedUnit.a = 0;
                turnActions.push({ x: linkX, y: linkY, t: 'mv', fx: prevX, fy: prevY });
                selectedUnit = null; validMoves = []; validAttacks = []; selectedHex = null;
                hideActionMenu(); infoPanel.innerHTML = "Durch Tunnel teleportiert!"; renderBoard(gameState);
            } else {
                showToast("Ausgang blockiert!", "error");
            }
        }
    }
};
