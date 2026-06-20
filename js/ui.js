// === UNDO ===
function saveUndoState() {
    undoStack.push({ gs: JSON.parse(JSON.stringify(gameState)), ta: [...turnActions] });
    if (undoStack.length > 10) undoStack.shift();
    const btn = document.getElementById('undo-btn');
    if (btn) btn.style.display = '';
}

window.undoLastAction = function () {
    if (undoStack.length === 0) { showToast('Nichts rückgängig zu machen.', 'error'); return; }
    const snap = undoStack.pop();
    gameState = snap.gs;
    turnActions = snap.ta;
    selectedUnit = null; validMoves = []; validAttacks = []; selectedHex = null;
    window.highlightedTunnelEnd = null; window.specialActive = null;
    hideActionMenu();
    const btn = document.getElementById('undo-btn');
    if (btn) btn.style.display = undoStack.length === 0 ? 'none' : '';
    renderBoard(gameState);
    showToast('↩ Rückgängig', 'info');
};

// === TOAST ===
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 2600);
}

// === SCOREBOARD ===
window.toggleScoreboard = function () {
    scoreboardOpen = !scoreboardOpen;
    scoreExpanded.classList.toggle('open', scoreboardOpen);
}

document.addEventListener('click', (e) => {
    if (scoreboardOpen && !scoreboard.contains(e.target)) {
        scoreboardOpen = false;
        scoreExpanded.classList.remove('open');
    }
});

function updateScoreboard() {
    if (!gameState || !scoreboard) return;
    let scores = gameState.p.map((p, i) => {
        const vCount = Object.values(gameState.v).filter(v => v === i).length;
        const uCount = gameState.u.filter(u => u.p === i).length;
        const isDead = p.dead === 1;
        const score = vCount * 10 + uCount * 5 + p.g;
        return { p, i, isDead, score };
    });
    scores.sort((a, b) => b.score - a.score);

    let compactHtml = '';
    scores.forEach(s => {
        const opacity = s.isDead ? 'opacity:0.3;' : '';
        compactHtml += `<span class="score-badge" style="${opacity}">`;
        compactHtml += `<span class="score-dot" style="background:${playerColors[s.i]}"></span>`;
        compactHtml += `<span>${s.isDead ? '✗' : s.score}</span>`;
        compactHtml += `</span>`;
    });
    scoreCompact.innerHTML = compactHtml;

    let expandedHtml = '';
    scores.forEach(s => {
        expandedHtml += `<div class="score-row ${s.isDead ? 'score-dead' : ''}">`;
        expandedHtml += `<span class="score-dot" style="color:${playerColors[s.i]};background:${playerColors[s.i]}"></span>`;
        expandedHtml += `<span>${s.p.n}: ${s.isDead ? 'Besiegt' : s.score + ' Pkt'}</span>`;
        expandedHtml += `</div>`;
    });
    scoreExpanded.innerHTML = expandedHtml;
}

// === MAIN UI UPDATE ===
function updateUI() {
    const pId = gameState.cp; const pState = gameState.p[pId];
    if (!pState.f) pState.f = []; if (!pState.of) pState.of = []; if (!pState.u) pState.u = [];
    let myVillages = Object.values(gameState.v).filter(v => v === pId).length;

    const income = calculateIncome(pId);
    resourceHud.innerHTML = `💰 ${pState.g} <span class="income-text">(+${income.g})</span> | 🪵 ${pState.m} <span class="income-text">(+${income.m})</span> | 🪨 ${pState.s || 0}`;

    infoPanel.style.color = playerColors[pId];
    if (!selectedUnit && !selectedHex && window.specialActive !== 'tribok') {
        const actualTurnId = (currentTurnSlot !== null && currentTurnSlot !== undefined) ? currentTurnSlot : gameState.cp;
        const actualTurnName = gameState.p[actualTurnId]?.n ?? pState.n;
        infoPanel.innerHTML = `Runde ${gameState.rn} | ${actualTurnName} ist am Zug.<div class="info-detail">Tippe auf Einheiten oder Dörfer für Details.</div>`;
    }

    upgradeBtn.style.display = 'block'; researchBtn.style.display = pState.f.length > 0 ? 'block' : 'none';
    const _n = gameState.p.length;
    document.getElementById('dip-btn').style.display = (_n >= 4 && _n % 2 === 0) ? 'block' : 'none';
    if (pState.f.length === 0) {
        upgradeBtn.innerText = "✨ 1. Kultur (10 Holz)";
        if (myVillages >= 2 && pState.m >= 10) { upgradeBtn.style.opacity = "1"; upgradeBtn.onclick = () => openDraft(10); }
        else { upgradeBtn.style.opacity = "0.5"; upgradeBtn.onclick = () => { infoPanel.innerText = `Für 1. Kultur fehlt:\n🏘️ ${Math.max(0, 2 - myVillages)} weitere Dörfer\n🪵 ${Math.max(0, 10 - pState.m)} Holz`; }; }
    } else if (pState.f.length === 1) {
        upgradeBtn.innerText = "✨ 2. Kultur (15 Holz)";
        if (myVillages >= 4 && pState.m >= 15) { upgradeBtn.style.opacity = "1"; upgradeBtn.onclick = () => openDraft(15); }
        else { upgradeBtn.style.opacity = "0.5"; upgradeBtn.onclick = () => { infoPanel.innerText = `Für 2. Kultur fehlt:\n🏘️ ${Math.max(0, 4 - myVillages)} weitere Dörfer\n🪵 ${Math.max(0, 15 - pState.m)} Holz`; }; }
    } else { upgradeBtn.style.display = 'none'; }
    updateScoreboard();
}

// === ACTION MENU ===
function hideActionMenu() { actionMenu.style.display = 'none'; actionMenu.innerHTML = ''; }
function showActionMenu(html) {
    actionMenu.innerHTML = html;
    actionMenu.style.display = 'flex';
    actionMenu.style.pointerEvents = 'none';
    actionMenu.style.opacity = '0.5';
    setTimeout(() => {
        actionMenu.style.pointerEvents = 'auto';
        actionMenu.style.opacity = '1';
    }, 300);
}

// === DRAFT / FACTION SELECTION ===
function openDraft(cost) {
    const pState = gameState.p[gameState.cp];
    let pool = [0, 1, 2, 3].filter(id => !pState.f.includes(id));
    let options = [];
    if (pState.of.length === 0) {
        let shuffled = pool.sort(() => 0.5 - Math.random());
        options = [shuffled[0], shuffled[1]].filter(opt => opt !== undefined);
        pState.of = options;
    } else {
        options = pState.of.filter(id => !pState.f.includes(id));
        if (options.length === 0) { pState.of = []; return openDraft(cost); }
    }
    draftCardsContainer.innerHTML = '';
    options.forEach(id => {
        const fac = factions[id];
        draftCardsContainer.innerHTML += `<div class="card" onclick="selectFaction(${id}, ${cost})"><h3>${fac.name}</h3><p style="white-space: pre-line;">${fac.desc}</p></div>`;
    });
    draftOverlay.style.display = 'flex';
}

window.selectFaction = function (id, cost) {
    const p = gameState.p[gameState.cp];
    p.m -= cost; p.f.push(id); p.of = [];
    draftOverlay.style.display = 'none'; infoPanel.innerHTML = `Kultur ${factions[id].name} gewählt!`; renderBoard(gameState);
}

// === RESEARCH ===
window.openResearch = function () {
    const pState = gameState.p[gameState.cp]; researchCardsContainer.innerHTML = '';
    Object.entries(upgrades).forEach(([idStr, upg]) => {
        const id = parseInt(idStr);
        if (pState.f.includes(upg.fac)) {
            const isBought = pState.u.includes(id); const canAfford = pState.g >= upg.g && pState.m >= upg.m;
            let cls = "card"; let onClick = "";
            if (isBought) { cls += " bought"; } else if (!canAfford) { cls += " disabled"; } else { onClick = `onclick="buyUpgrade(${id})"`; }
            researchCardsContainer.innerHTML += `<div class="${cls}" ${onClick}><h3>${upg.name}</h3><p>${upg.desc}</p><div class="cost">${isBought ? "Gekauft" : `🪵 ${upg.m} Holz`}</div></div>`;
        }
    });
    researchOverlay.style.display = 'flex';
}

window.buyUpgrade = function (id) {
    const upg = upgrades[id]; const pState = gameState.p[gameState.cp];
    if (pState.g >= upg.g && pState.m >= upg.m && !pState.u.includes(id)) {
        pState.g -= upg.g; pState.m -= upg.m; pState.u.push(id);
        if (id === 0) gameState.u.forEach(u => { if (u.p === gameState.cp && u.t === 0) u.h += 5; });
        researchOverlay.style.display = 'none'; infoPanel.innerHTML = `Forschung abgeschlossen: ${upg.name}!`; renderBoard(gameState);
    }
}

// === UNIT PURCHASING ===
window.buyUnit = function (type) {
    if (selectedHex) {
        const pState = gameState.p[gameState.cp];
        const cost = getUnitCost(pState, type);
        if (pState.g >= cost) {
            saveUndoState();
            pState.g -= cost;
            let nextId = Math.max(...gameState.u.map(u => u.i), 0) + 1;
            let fb = 0;
            if (pState.f.includes(0)) {
                fb = Math.floor(Object.values(gameState.v).filter(v => v === gameState.cp).length / 2);
            }
            const unitObj = { i: nextId, p: gameState.cp, t: type, x: selectedHex.x, y: selectedHex.y, fb: fb, a: 1 };
            if (pState.u.includes(1)) unitObj.vet = 1;
            unitObj.h = getUnitMaxHp(pState, type, unitObj);
            gameState.u.push(unitObj);
            turnActions.push({ x: selectedHex.x, y: selectedHex.y, t: 'buy' });
            selectedHex = null; hideActionMenu(); renderBoard(gameState);
        } else { showToast('Nicht genug Gold!', 'error'); }
    }
}

// === VILLAGE CAPTURE ===
window.startCapture = function () {
    if (selectedUnit) {
        saveUndoState();
        if (selectedUnit.iv === 1) {
            delete selectedUnit.iv;
            selectedUnit.cd = 2;
        }
        const loc = `${selectedUnit.x},${selectedUnit.y}`;
        gameState.v[loc] = gameState.cp; selectedUnit.a = 1; turnActions.push({ x: selectedUnit.x, y: selectedUnit.y, t: 'cap' });
        selectedUnit = null; selectedHex = null; validMoves = []; validAttacks = [];
        hideActionMenu(); infoPanel.innerHTML = "Dorf eingenommen!"; renderBoard(gameState);
    }
}
