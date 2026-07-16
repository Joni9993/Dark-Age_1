// === DIPLOMACY ===
function checkTeamWin(alivePlayers) {
    if (!(gameState.at || gameState.dp) || alivePlayers.length < 2) return null;
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

// Server mode: only the active player may act — everyone else is read-only/spectator (see handleCanvasClick).
function isMyActiveTurn() {
    return isLegacyUrlMode || !currentGameId || currentTurnSlot === currentUserSlot;
}

function giftSliderRow(res, icon, i, max) {
    return `
        <div class="gift-row">
            <span class="gift-label">${icon} <b id="gift-${res}-out-${i}">0</b>/${max}</span>
            <input type="range" class="gift-slider" id="gift-${res}-${i}" min="0" max="${max}" value="0" step="1" style="--fill: 0%"
                oninput="document.getElementById('gift-${res}-out-${i}').textContent=this.value; this.style.setProperty('--fill', (${max} > 0 ? this.value / ${max} * 100 : 0) + '%')">
        </div>
    `;
}

function giftForm(i) {
    if (!isMyActiveTurn()) {
        return `
            <div style="width: 100%; margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 0.72rem; color: var(--text-dim); text-align: left;">
                🔒 Ressourcen senden geht nur während deines eigenen Zuges.
            </div>
        `;
    }
    const pState = gameState.p[gameState.cp];
    return `
        <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 5px; padding-top: 5px; width: 100%; border-top: 1px solid rgba(255,255,255,0.08);">
            ${giftSliderRow('g', '💰', i, pState.g)}
            ${giftSliderRow('m', '🪵', i, pState.m)}
            ${giftSliderRow('s', '🪨', i, pState.s)}
            <button class="action-btn" style="margin-top: 2px; padding: 6px 8px; font-size: 0.78rem;" onclick="sendResources(${i})">🎁 Senden</button>
        </div>
    `;
}

window.openDiplomacy = function () {
    const content = document.getElementById('dip-content');
    content.innerHTML = '';
    const pState = gameState.p[gameState.cp];

    if (gameState.at) {
        gameState.p.forEach((p, i) => {
            if (i === gameState.cp || p.dead) return;
            const isAlly = pState.al && pState.al.includes(i);
            const otherAllies = (p.al || [])
                .filter(id => id !== gameState.cp && id !== i && !gameState.p[id].dead)
                .map(id => gameState.p[id].n);
            content.innerHTML += `
                <div style="display: flex; flex-direction: column; gap: 3px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: ${playerColors[i]}">${p.n}</span>
                        <span style="font-size: 0.8rem; color: ${isAlly ? '#69f0ae' : '#ff5252'}">${isAlly ? '🤝 Verbündeter' : '⚔️ Feind'}</span>
                    </div>
                    ${otherAllies.length ? `<span style="font-size: 0.72rem; color: #999; text-align: left;">🤝 Verbündet mit: ${otherAllies.join(', ')}</span>` : ''}
                    ${isAlly ? giftForm(i) : ''}
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

        const otherAllies = (p.al || [])
            .filter(id => id !== gameState.cp && id !== i && !gameState.p[id].dead)
            .map(id => gameState.p[id].n);

        const isAlly = pState.al && pState.al.includes(i);
        let actionBtn = '';
        if (isAlly) {
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
                ${otherAllies.length ? `<span style="font-size: 0.72rem; color: #999; width: 100%; text-align: left; margin-bottom: 5px;">🤝 Verbündet mit: ${otherAllies.join(', ')}</span>` : ''}
                <div style="display: flex; gap: 5px;">${actionBtn}</div>
                ${isAlly ? giftForm(i) : ''}
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

window.sendResources = function (id) {
    if (!isMyActiveTurn()) { showToast('Du bist nicht am Zug!', 'error'); return; }
    const pState = gameState.p[gameState.cp];
    const g = Math.max(0, Math.floor(Number(document.getElementById(`gift-g-${id}`).value) || 0));
    const m = Math.max(0, Math.floor(Number(document.getElementById(`gift-m-${id}`).value) || 0));
    const s = Math.max(0, Math.floor(Number(document.getElementById(`gift-s-${id}`).value) || 0));
    if (g === 0 && m === 0 && s === 0) { showToast('Bitte gib eine Menge ein!', 'error'); return; }
    if (g > pState.g || m > pState.m || s > pState.s) { showToast('Nicht genug Ressourcen!', 'error'); return; }
    pState.g -= g; pState.m -= m; pState.s -= s;
    const target = gameState.p[id];
    target.g += g; target.m += m; target.s += s;
    if (!target.gifts) target.gifts = [];
    target.gifts.push({ from: gameState.cp, g, m, s });
    showToast(`Ressourcen an ${target.n} gesendet!`, 'gold');
    openDiplomacy(); updateUI();
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
