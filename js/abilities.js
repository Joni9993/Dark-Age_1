// === ABILITIES ===
window.useAbility = function (type) {
    const pState = gameState.p[gameState.cp];
    if (!selectedUnit) return;
    saveUndoState();

    if (type === 'ritter') {
        pState.m -= 3;
        let dmgDone = false;
        const canAttack = (targetId) => !(pState.al && pState.al.includes(targetId)) && !(pState.tc && pState.tc.includes(targetId));
        gameState.u.filter(u => u.p !== gameState.cp && canAttack(u.p) && !isFlying(u) && hexDistance({ x: u.x, y: u.y }, { x: selectedUnit.x, y: selectedUnit.y }) <= 1).forEach(enemy => {
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
            const hasCenterTower = gameState.ct && gameState.ct.x === n.x && gameState.ct.y === n.y;
            if (!groundUnitAt(n.x, n.y) && !hasVillage && !hasTunnel && !hasWall && !hasStone && !hasTower && !hasCenterTower) {
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
            const hasCenterTower = gameState.ct && gameState.ct.x === n.x && gameState.ct.y === n.y;
            if (!groundUnitAt(n.x, n.y) && !hasVillage && !hasTunnel && !hasWall && !hasStone && !hasTower && !hasCenterTower) {
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
            const hasCenterTower = gameState.ct && gameState.ct.x === n.x && gameState.ct.y === n.y;
            if (!groundUnitAt(n.x, n.y) && !hasVillage && !hasTunnel && !hasWall && !hasStone && !hasTower && !hasCenterTower) {
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
                if (u.x === t.x && u.y === t.y && u !== selectedUnit && !isFlying(u)) {
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
    else if (type === 'absprung') {
        // Fallschirmspringer: Ziel-Hex im Umkreis 2 wählen — Landung ist PERMANENT,
        // zählt wie Bewegung (a=2), danach darf er noch schießen
        window.specialActive = 'absprung';
        validAttacks = []; validMoves = [];
        for (let y = 0; y < gameState.bh; y++) {
            for (let x = 0; x < gameState.bw; x++) {
                if (!isInsideMap(gameState, x, y)) continue;
                if (hexDistance({ x, y }, { x: selectedUnit.x, y: selectedUnit.y }) > 2) continue;
                if (groundUnitAt(x, y)) continue;
                const key = `${x},${y}`;
                let isAliveSV = false;
                for (let i = 0; i < gameState.p.length; i++) {
                    if (gameState.p[i].dead === 0 && gameState.p[i].sv === key) isAliveSV = true;
                }
                const hasWall = gameState.wa && gameState.wa.some(w => w.x === x && w.y === y);
                const hasStone = gameState.st && gameState.st.some(s => s.x === x && s.y === y && s.h > 0);
                const hasTower = gameState.tw && gameState.tw.some(tw => tw.x === x && tw.y === y && tw.h > 0);
                const isEnemyTunnel = gameState.tu && gameState.tu.some(t => t.o !== gameState.cp && ((t.x1 === x && t.y1 === y) || (t.x2 === x && t.y2 === y)));
                if (!isAliveSV && !hasWall && !hasStone && !hasTower && !isEnemyTunnel) {
                    validMoves.push({ x, y });
                }
            }
        }
        hideActionMenu();
        infoPanel.innerHTML = `🪂 Absprung – Landeplatz wählen<br><div class="info-detail" style="color: #4fc3f7;">Freies Boden-Feld im Umkreis 2. Die Landung ist endgültig — danach darfst du noch schießen.</div>`;
        renderBoard(gameState);
    }
    else if (type === 'aufladen') {
        // Luftschraube: benachbarte (oder darunter stehende) EIGENE Bodeneinheit aufnehmen
        window.specialActive = 'aufladen';
        validAttacks = []; validMoves = [];
        const candidates = [{ x: selectedUnit.x, y: selectedUnit.y }, ...getNeighbors(selectedUnit.x, selectedUnit.y)];
        candidates.forEach(c => {
            const g = groundUnitAt(c.x, c.y);
            if (g && g.p === gameState.cp && !isHeavyUnit(g)) validMoves.push({ x: c.x, y: c.y });
        });
        hideActionMenu();
        infoPanel.innerHTML = `🚁 Aufladen – Einheit wählen<br><div class="info-detail" style="color: #4fc3f7;">Eigene leichte Bodeneinheit im Umkreis 1 (schwere Einheiten wie Elefant & Wagenburg können nicht transportiert werden).</div>`;
        renderBoard(gameState);
    }
    else if (type === 'absetzen') {
        // Luftschraube: Fracht auf freiem Boden-Hex im Umkreis 1 absetzen
        window.specialActive = 'absetzen';
        validAttacks = []; validMoves = [];
        const candidates = [{ x: selectedUnit.x, y: selectedUnit.y }, ...getNeighbors(selectedUnit.x, selectedUnit.y)];
        candidates.forEach(c => {
            if (groundUnitAt(c.x, c.y)) return;
            const key = `${c.x},${c.y}`;
            let isAliveSV = false;
            for (let i = 0; i < gameState.p.length; i++) {
                if (gameState.p[i].dead === 0 && gameState.p[i].sv === key) isAliveSV = true;
            }
            const hasWall = gameState.wa && gameState.wa.some(w => w.x === c.x && w.y === c.y);
            const hasStone = gameState.st && gameState.st.some(s => s.x === c.x && s.y === c.y && s.h > 0);
            const hasTower = gameState.tw && gameState.tw.some(tw => tw.x === c.x && tw.y === c.y && tw.h > 0);
            const isEnemyTunnel = gameState.tu && gameState.tu.some(t => t.o !== gameState.cp && ((t.x1 === c.x && t.y1 === c.y) || (t.x2 === c.x && t.y2 === c.y)));
            if (!isAliveSV && !hasWall && !hasStone && !hasTower && !isEnemyTunnel) validMoves.push({ x: c.x, y: c.y });
        });
        hideActionMenu();
        infoPanel.innerHTML = `⬇️ Absetzen – Feld wählen<br><div class="info-detail" style="color: #4fc3f7;">Freies Boden-Feld im Umkreis 1. Die abgesetzte Einheit hat diese Runde keine Aktion mehr.</div>`;
        renderBoard(gameState);
    }
    else if (type === 'sturzangriff') {
        // Gleiter: opfert sich für 9 Schaden auf ein Ziel im Umkreis 1 (Boden, Luft oder Gebäude)
        window.specialActive = 'sturzangriff';
        validMoves = [];
        validAttacks = [];
        const canAttack = (targetId) => !(pState.al && pState.al.includes(targetId)) && !(pState.tc && pState.tc.includes(targetId));
        const candidates = [{ x: selectedUnit.x, y: selectedUnit.y }, ...getNeighbors(selectedUnit.x, selectedUnit.y)];
        candidates.forEach(c => {
            if (c.x === selectedUnit.x && c.y === selectedUnit.y) {
                // eigenes Hex: nur die Bodeneinheit darunter kann Ziel sein
                const g = groundUnitAt(c.x, c.y);
                if (g && g.p !== gameState.cp && g.iv !== 1 && canAttack(g.p)) validAttacks.push({ x: c.x, y: c.y, isSturz: true });
                return;
            }
            const g = groundUnitAt(c.x, c.y);
            const a = airUnitAt(c.x, c.y);
            let hit = (g && g.p !== gameState.cp && g.iv !== 1 && canAttack(g.p)) || (a && a.p !== gameState.cp && a.iv !== 1 && canAttack(a.p));
            if (!hit) {
                const key = `${c.x},${c.y}`;
                for (let i = 0; i < gameState.p.length; i++) {
                    if (i !== gameState.cp && gameState.p[i].dead === 0 && canAttack(i) && gameState.p[i].sv === key) hit = true;
                }
                if (gameState.wa && gameState.wa.some(w => w.o !== gameState.cp && canAttack(w.o) && w.x === c.x && w.y === c.y)) hit = true;
                if (gameState.tw && gameState.tw.some(tw => tw.h > 0 && tw.o !== gameState.cp && canAttack(tw.o) && tw.x === c.x && tw.y === c.y)) hit = true;
                if (gameState.tu && gameState.tu.some(t => t.o !== gameState.cp && canAttack(t.o) && ((t.x1 === c.x && t.y1 === c.y) || (t.x2 === c.x && t.y2 === c.y)))) hit = true;
            }
            if (hit) validAttacks.push({ x: c.x, y: c.y, isSturz: true });
        });
        hideActionMenu();
        infoPanel.innerHTML = `💥 Sturzangriff – Ziel wählen<br><div class="info-detail" style="color: #4fc3f7;">9 DMG auf Boden-, Luft- oder Gebäudeziel im Umkreis 1. Der Gleiter zerschellt dabei!</div>`;
        renderBoard(gameState);
    }
    else if (type === 'feuersturm') {
        // Bombenballon: zündet das Feld direkt unter sich + alle 6 Nachbarn an.
        // Sofort fsDmg Schaden auf ALLE Bodeneinheiten und Gebäude (auch eigene — Friendly Fire!),
        // Überlebende bekommen das Brand-Tag (bn/bo) — Folgeschaden über doEndTurn, exakt wie
        // beim Einzelziel-Anzünden. Luft ist immun.
        pState.m -= unitStats[15].fsCost;
        const cx = selectedUnit.x, cy = selectedUnit.y;
        const fsDmg = unitStats[15].fsDmg;
        const targets = [{ x: cx, y: cy }, ...getNeighbors(cx, cy)];

        targets.forEach(t => {
            spawnAttackAnim(cx, cy, t.x, t.y, 'fire');

            gameState.u.forEach(u => {
                if (u.x === t.x && u.y === t.y && !isFlying(u)) {
                    u.h -= fsDmg;
                    spawnFloatingText(u.x, u.y, `-${fsDmg}`, "#ff5252");
                    if (u.h > 0) { u.bn = fsDmg; u.bo = gameState.cp; }
                }
            });

            for (let i = 0; i < gameState.p.length; i++) {
                if (gameState.p[i].dead === 0 && gameState.p[i].sv === `${t.x},${t.y}`) {
                    gameState.p[i].sh -= fsDmg;
                    spawnFloatingText(t.x, t.y, `-${fsDmg}`, "#ff5252");
                    if (gameState.p[i].sh <= 0) {
                        gameState.p[i].dead = 1;
                        gameState.u = gameState.u.filter(un => un.p !== i);
                        gameState.v[`${t.x},${t.y}`] = i === gameState.cp ? -1 : gameState.cp;
                    } else {
                        gameState.p[i].bn = fsDmg; gameState.p[i].bo = gameState.cp;
                    }
                }
            }

            if (gameState.tu) gameState.tu.forEach(tun => {
                if ((tun.x1 === t.x && tun.y1 === t.y) || (tun.x2 === t.x && tun.y2 === t.y)) {
                    tun.h -= fsDmg; spawnFloatingText(t.x, t.y, `-${fsDmg}`, "#ff5252");
                    if (tun.h > 0) { tun.bn = fsDmg; tun.bo = gameState.cp; }
                }
            });
            if (gameState.wa) gameState.wa.forEach(w => {
                if (w.x === t.x && w.y === t.y) {
                    w.h -= fsDmg; spawnFloatingText(t.x, t.y, `-${fsDmg}`, "#ff5252");
                    if (w.h > 0) { w.bn = fsDmg; w.bo = gameState.cp; }
                }
            });
            if (gameState.tw) gameState.tw.forEach(tw => {
                if (tw.x === t.x && tw.y === t.y) {
                    tw.h -= fsDmg; spawnFloatingText(t.x, t.y, `-${fsDmg}`, "#ff5252");
                    if (tw.h > 0) { tw.bn = fsDmg; tw.bo = gameState.cp; }
                }
            });
        });

        gameState.u = gameState.u.filter(u => u.h > 0);
        if (gameState.tu) gameState.tu = gameState.tu.filter(tun => tun.h > 0);
        if (gameState.wa) gameState.wa = gameState.wa.filter(w => w.h > 0);
        if (gameState.tw) gameState.tw = gameState.tw.filter(tw => tw.h > 0);

        selectedUnit.a = 1;
        turnActions.push({ x: cx, y: cy, t: 'atk' });
        selectedUnit = null; validMoves = []; validAttacks = []; window.specialActive = null;
        hideActionMenu(); infoPanel.innerHTML = "🌋 FEUERSTURM! Alle getroffenen Ziele brennen!";
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
    turnActions.push({ x: selectedUnit.x, y: selectedUnit.y, t: 'atk' });
    const deployed = selectedUnit.dp === 1;
    hideActionMenu();
    infoPanel.innerHTML = deployed ? `⛺ Wagenburg aufgeschlagen!` : `🐎 Wagenburg mobil.`;
    selectedUnit = null; validMoves = []; validAttacks = [];
    renderBoard(gameState);
};

window.startDemolishWall = function () {
    if (!selectedUnit || !gameState.wa) return;
    const adjWalls = gameState.wa.filter(w => w.o === gameState.cp && hexDistance({ x: w.x, y: w.y }, { x: selectedUnit.x, y: selectedUnit.y }) === 1);
    if (adjWalls.length === 0) return;
    if (adjWalls.length === 1) { demolishWall(adjWalls[0].x, adjWalls[0].y); return; }

    window.specialActive = 'demolish_wall';
    window.demolishTargets = adjWalls.map(w => ({ x: w.x, y: w.y }));
    hideActionMenu();
    infoPanel.innerHTML = `🧱 Mauer abreißen<br><div class="info-detail" style="color: #ffb74d;">Wähle eine markierte Mauer.</div>`;
    renderBoard(gameState);
};

window.startDemolishTunnel = function () {
    if (!selectedUnit || !gameState.tu) return;
    const adjTunnels = [];
    gameState.tu.forEach(t => {
        if (t.o !== gameState.cp) return;
        if (hexDistance({ x: t.x1, y: t.y1 }, { x: selectedUnit.x, y: selectedUnit.y }) === 1) adjTunnels.push({ x: t.x1, y: t.y1, x1: t.x1, y1: t.y1 });
        else if (hexDistance({ x: t.x2, y: t.y2 }, { x: selectedUnit.x, y: selectedUnit.y }) === 1) adjTunnels.push({ x: t.x2, y: t.y2, x1: t.x1, y1: t.y1 });
    });
    if (adjTunnels.length === 0) return;
    if (adjTunnels.length === 1) { demolishTunnel(adjTunnels[0].x1, adjTunnels[0].y1); return; }

    window.specialActive = 'demolish_tunnel';
    window.demolishTargets = adjTunnels;
    hideActionMenu();
    infoPanel.innerHTML = `🚇 Tunnel abreißen<br><div class="info-detail" style="color: #ffb74d;">Wähle einen markierten Tunnel.</div>`;
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
    window.specialActive = null; window.demolishTargets = [];
    hideActionMenu(); infoPanel.innerHTML = `🚇 Tunnel abgerissen! +2🪨`; renderBoard(gameState);
};

window.demolishWall = function (wx, wy) {
    if (!selectedUnit || !gameState.wa) return;
    saveUndoState();
    gameState.wa = gameState.wa.filter(w => !(w.x === wx && w.y === wy && w.o === gameState.cp));
    selectedUnit.a = 1;
    selectedUnit = null; validMoves = []; validAttacks = [];
    window.specialActive = null; window.demolishTargets = [];
    hideActionMenu(); infoPanel.innerHTML = `🧱 Mauer abgerissen!`; renderBoard(gameState);
};

window.useTunnel = function () {
    // Lufteinheiten & schwere Einheiten ignorieren Tunnel; Tunnelgräber (16) nutzen
    // exklusiv Aufsteigen/Abtauchen (uwAscend/uwDescend unten) — Konfliktfreiheit.
    if (!selectedUnit || isFlying(selectedUnit) || isHeavyUnit(selectedUnit) || selectedUnit.t === 16) return;
    saveUndoState();
    if (gameState.tu) {
        let tunnel = gameState.tu.find(t => t.r <= gameState.rn && ((t.x1 === selectedUnit.x && t.y1 === selectedUnit.y) || (t.x2 === selectedUnit.x && t.y2 === selectedUnit.y)));
        if (tunnel) {
            let linkX = tunnel.x1 === selectedUnit.x ? tunnel.x2 : tunnel.x1;
            let linkY = tunnel.y1 === selectedUnit.y ? tunnel.y2 : tunnel.y1;
            if (!groundUnitAt(linkX, linkY) && !gameState.v[`${linkX},${linkY}`]) {
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

// === UNTERWELT-EBENENWECHSEL (M9b) ===
// Nur der Tunnelgräber (16) wechselt die Ebene — Aktion am Stollenkopf bzw.
// Tunnel-Endpunkt oben (siehe PLAN.md Abschn. 3). Beide Richtungen verbrauchen
// die Aktion (a=1), verlieren aber weder Veteranenstatus noch getragene
// Kristalle — nur das Trägerobjekt wandert zwischen u[] und uw.u.
window.uwAscend = function () {
    if (!selectedUWUnit || selectedUWUnit.t !== 16) return;
    const { x, y } = selectedUWUnit;
    if (getStollenkopfOwner(gameState, x, y) !== gameState.cp) return;
    if (groundUnitAt(x, y) || gameState.v[`${x},${y}`] !== undefined) { showToast('Oberfläche blockiert!', 'error'); return; }
    saveUndoState();
    ascendUWUnit(gameState, selectedUWUnit);
    // KEIN uw:true (M13): die Einheit erscheint jetzt AUF der Oberfläche — sichtbar
    // über die Oberflächen-Sicht (Default), symmetrisch zu uwDescend unten.
    turnActions.push({ x, y, t: 'cap' });
    clearUWSelection();
    infoPanel.innerHTML = '🕳 Aufgestiegen zur Oberfläche!';
    hideActionMenu(); renderBoard(gameState); updateUI();
};

window.uwDescend = function () {
    if (!selectedUnit || selectedUnit.t !== 16) return;
    const { x, y } = selectedUnit;
    const ownHead = (gameState.tu || []).some(t => t.o === gameState.cp && t.r <= gameState.rn && ((t.x1 === x && t.y1 === y) || (t.x2 === x && t.y2 === y)));
    if (!ownHead) return;
    if (uwUnitAt(x, y) || uwCreatureAt(x, y)) { showToast('Unterwelt-Feld belegt!', 'error'); return; }
    saveUndoState();
    descendUWUnit(gameState, selectedUnit);
    // uw:true (M13): die Einheit verschwindet von der Oberfläche und taucht im
    // Unterwelt-Netz auf — nur dort sichtbar.
    turnActions.push({ x, y, t: 'cap', uw: true });
    selectedUnit = null; selectedHex = null; validMoves = []; validAttacks = [];
    infoPanel.innerHTML = '🕳 Abgetaucht in die Unterwelt!';
    hideActionMenu(); renderBoard(gameState); updateUI();
};

// Abliefern verbraucht bewusst KEINE Aktion (Komfort, siehe M9b-Auftrag) —
// nur am eigenen Stollenkopf möglich (Button-Gate in showUnderworldTileUI).
window.uwDeliverCrystals = function () {
    if (!selectedUWUnit || !selectedUWUnit.cr) return;
    saveUndoState();
    const unit = selectedUWUnit;
    const amount = deliverUWCrystals(gameState, gameState.cp, unit);
    showToast(`💎 ${amount} Kristalle abgeliefert!`, 'gold');
    // uw:true (M13): Ablieferung passiert am eigenen Stollenkopf unten — nur über
    // das Unterwelt-Netz sichtbar, gleiche Sichtbarkeitsregel wie Graben/Abbau.
    turnActions.push({ x: unit.x, y: unit.y, t: 'deliver', uw: true });
    updateUI();
    showUnderworldTileUI(unit.x, unit.y);
    renderBoard(gameState);
};

// === RELIQUIEN-ZIELAUSWAHL (M10) ===
// mkBtn/specialActive-Muster wie Tunnel/Mauer/Turm-Bau oben: startRelicEquip
// setzt den Modus, der NÄCHSTE Klick (Oberfläche ODER Unterwelt — beide Klick-
// Handler prüfen window.uwSpecialActive.startsWith('relic_') zuerst, siehe
// handleCanvasClick/handleUnderworldClick) liefert das Ziel.
window.startRelicEquip = function (key) {
    const def = RELICS[key];
    if (!def) return;
    window.uwSpecialActive = 'relic_' + key;
    hideActionMenu();
    showToast(def.target === 'building' ? `Wähle ein eigenes Bauwerk für ${def.name}` : `Wähle eine eigene Einheit für ${def.name}`, 'info');
};

function handleRelicTargetClick(clickedX, clickedY, underworld) {
    const key = window.uwSpecialActive.slice('relic_'.length);
    const def = RELICS[key];
    window.uwSpecialActive = null;
    if (!def) { renderBoard(gameState); return; }

    if (def.target === 'building') {
        // Meisterwerkzeug: nur Oberflächen-Bauwerke (Mauer/Turm/Tunnel/Startdorf) —
        // unten gibt es keine Bauwerke.
        if (underworld) { showToast('Das Meisterwerkzeug zielt auf Oberflächen-Bauwerke.', 'error'); renderBoard(gameState); return; }
        const wall = (gameState.wa || []).find(w => w.x === clickedX && w.y === clickedY && w.o === gameState.cp);
        const tower = (gameState.tw || []).find(t => t.x === clickedX && t.y === clickedY && t.o === gameState.cp);
        const tunnelEnd = (gameState.tu || []).find(t => t.o === gameState.cp && ((t.x1 === clickedX && t.y1 === clickedY) || (t.x2 === clickedX && t.y2 === clickedY)));
        const isOwnStart = gameState.p[gameState.cp].sv === `${clickedX},${clickedY}`;
        if (!wall && !tower && !tunnelEnd && !isOwnStart) { showToast('Kein eigenes Bauwerk auf diesem Feld.', 'error'); renderBoard(gameState); return; }
        saveUndoState();
        let ok = false;
        if (wall) ok = applyRelicToBuilding(gameState, gameState.cp, wall, 10);
        else if (tower) ok = applyRelicToBuilding(gameState, gameState.cp, tower, 15);
        else if (tunnelEnd) ok = applyRelicToBuilding(gameState, gameState.cp, tunnelEnd, 13);
        else ok = applyRelicToBuilding(gameState, gameState.cp, gameState.p[gameState.cp], undefined);
        if (ok) { showToast('🔧 Bauwerk repariert!', 'gold'); turnActions.push({ x: clickedX, y: clickedY, t: 'relicuse' }); }
    } else {
        // Klinge/Harnisch: eigene Einheit, Oberfläche ODER Unterwelt.
        const unit = underworld ? uwUnitAt(clickedX, clickedY) : groundUnitAt(clickedX, clickedY);
        if (!unit || unit.p !== gameState.cp) { showToast('Keine eigene Einheit auf diesem Feld.', 'error'); renderBoard(gameState); return; }
        if (unit.art) { showToast('Einheit trägt schon eine Reliquie.', 'error'); renderBoard(gameState); return; }
        saveUndoState();
        const ok = applyRelicToUnit(gameState, gameState.cp, key, unit);
        // uw:true nur wenn die ausgerüstete Einheit unten steht (M13) — die
        // Meisterwerkzeug-Variante oben bleibt Oberflächen-Sicht (Gebäude sind
        // immer oben).
        if (ok) { showToast(`${def.icon} ${def.name} ausgerüstet!`, 'gold'); turnActions.push({ x: clickedX, y: clickedY, t: 'relicuse', uw: underworld }); }
    }
    renderBoard(gameState); updateUI();
}
