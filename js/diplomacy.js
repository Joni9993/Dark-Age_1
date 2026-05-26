// === DIPLOMACY ===
function checkTeamWin(alivePlayers) {
    if (!gameState.at || alivePlayers.length < 2) return null;
    const aliveIds = alivePlayers.map(p => gameState.p.indexOf(p));
    const firstAllies = gameState.p[aliveIds[0]].al || [];
    if (aliveIds.every(id => id === aliveIds[0] || firstAllies.includes(id))) return alivePlayers;
    return null;
}

function showWin(msg) {
    canvasWrapper.style.display = 'none';
    uiContainer.style.display = 'none';
    gameHud.style.display = 'none';
    document.getElementById('win-msg').innerText = msg;
    winScreen.style.display = 'flex';
}

window.openDiplomacy = function () {
    const content = document.getElementById('dip-content');
    content.innerHTML = '';
    const pState = gameState.p[gameState.cp];

    if (gameState.at) {
        gameState.p.forEach((p, i) => {
            if (i === gameState.cp || p.dead) return;
            const isAlly = pState.al && pState.al.includes(i);
            content.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 5px;">
                    <span style="color: ${playerColors[i]}">${p.n}</span>
                    <span style="font-size: 0.8rem; color: ${isAlly ? '#69f0ae' : '#ff5252'}">${isAlly ? '🤝 Verbündeter' : '⚔️ Feind'}</span>
                </div>
            `;
        });
        document.getElementById('dip-overlay').style.display = 'flex';
        return;
    }

    const hasAlliance = pState.al && pState.al.length > 0;
    const hasOutReq = gameState.p.some(p => p.req && p.req.includes(gameState.cp));
    const maxReached = hasAlliance || hasOutReq;

    gameState.p.forEach((p, i) => {
        if (i === gameState.cp || p.dead) return;

        let actionBtn = '';
        if (pState.al && pState.al.includes(i)) {
            actionBtn = `<button class="action-btn" style="background: #e53935; padding: 4px 8px; font-size: 0.8rem;" onclick="breakAlliance(${i})">💔 Brechen</button>`;
        } else if (pState.req && pState.req.includes(i)) {
            actionBtn = `<button class="action-btn" style="background: #43a047; padding: 4px 8px; font-size: 0.8rem;" onclick="acceptAlliance(${i})">🤝 Annehmen (5💰 5🪵)</button>
                         <button class="action-btn" style="background: #888; padding: 4px 8px; font-size: 0.8rem; margin-top: 5px;" onclick="rejectAlliance(${i})">❌ Ablehnen</button>`;
        } else if (p.req && p.req.includes(gameState.cp)) {
            actionBtn = `<button class="action-btn" style="background: #e53935; padding: 4px 8px; font-size: 0.8rem;" onclick="withdrawAlliance(${i})">❌ Zurückziehen</button>`;
        } else {
            if (maxReached) {
                actionBtn = `<button class="action-btn" style="background: #3949ab; padding: 4px 8px; font-size: 0.8rem; opacity: 0.5;" disabled>✉️ Anfragen (5💰 5🪵)</button>`;
            } else {
                actionBtn = `<button class="action-btn" style="background: #3949ab; padding: 4px 8px; font-size: 0.8rem;" onclick="sendAlliance(${i})">✉️ Anfragen (5💰 5🪵)</button>`;
            }
        }

        content.innerHTML += `
            <div style="display: flex; flex-direction: column; align-items: flex-end; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 5px;">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; margin-bottom: 5px;">
                    <span style="color: ${playerColors[i]}">${p.n}</span>
                </div>
                <div style="display: flex; gap: 5px;">${actionBtn}</div>
            </div>
        `;
    });
    document.getElementById('dip-overlay').style.display = 'flex';
};

window.sendAlliance = function (id) {
    const pState = gameState.p[gameState.cp];
    if (pState.g < 5 || pState.m < 5) {
        showToast('Nicht genug Ressourcen! (5💰 5🪵 benötigt)', 'error'); return;
    }
    pState.g -= 5; pState.m -= 5;
    if (!gameState.p[id].req) gameState.p[id].req = [];
    if (!gameState.p[id].req.includes(gameState.cp)) gameState.p[id].req.push(gameState.cp);
    showToast('Bündnisanfrage an ' + gameState.p[id].n + ' gesendet!', 'info');
    openDiplomacy(); updateUI();
};

window.acceptAlliance = function (id) {
    const pState = gameState.p[gameState.cp];
    const hasAlliance = pState.al && pState.al.length > 0;
    const hasOutReq = gameState.p.some(p => p.req && p.req.includes(gameState.cp));
    if (hasAlliance || hasOutReq) { showToast('Du kannst nur 1 aktive Diplomatie haben!', 'error'); return; }
    if (pState.g < 5 || pState.m < 5) {
        showToast('Nicht genug Ressourcen zum Annehmen! (5💰 5🪵 benötigt)', 'error'); return;
    }
    pState.g -= 5; pState.m -= 5;
    if (!pState.req) pState.req = [];
    pState.req = pState.req.filter(reqId => reqId !== id);
    pState.req = [];
    if (!pState.al) pState.al = [];
    pState.al.push(id);
    if (!gameState.p[id].al) gameState.p[id].al = [];
    gameState.p[id].al.push(gameState.cp);
    showToast('Bündnis mit ' + gameState.p[id].n + ' geschlossen!', 'gold');
    openDiplomacy(); renderBoard(gameState); updateUI();
};

window.rejectAlliance = function (id) {
    const pState = gameState.p[gameState.cp];
    if (!pState.req) pState.req = [];
    pState.req = pState.req.filter(reqId => reqId !== id);
    showToast('Anfrage abgelehnt!', 'info');
    openDiplomacy();
};

window.withdrawAlliance = function (id) {
    if (gameState.p[id].req) {
        gameState.p[id].req = gameState.p[id].req.filter(reqId => reqId !== gameState.cp);
    }
    showToast('Anfrage zurückgezogen!', 'info');
    openDiplomacy();
};

window.breakAlliance = function (id) {
    if (gameState.at) { showToast('Feste Teams können nicht gebrochen werden!', 'error'); return; }
    const pState = gameState.p[gameState.cp];
    if (!pState.al) pState.al = [];
    pState.al = pState.al.filter(alId => alId !== id);
    if (gameState.p[id].al) gameState.p[id].al = gameState.p[id].al.filter(alId => alId !== gameState.cp);
    if (!pState.tc) pState.tc = [];
    pState.tc.push(id);
    showToast('Bündnis gebrochen! Waffenruhe für diese Runde.', 'error');
    openDiplomacy(); renderBoard(gameState);
};
