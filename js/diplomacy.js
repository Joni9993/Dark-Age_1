// === DIPLOMACY ===
function checkTeamWin(alivePlayers) {
    if (!(gameState.at || gameState.dp) || alivePlayers.length < 2) return null;
    const aliveIds = alivePlayers.map(p => gameState.p.indexOf(p));
    const firstAllies = gameState.p[aliveIds[0]].al || [];
    if (aliveIds.every(id => id === aliveIds[0] || firstAllies.includes(id))) return alivePlayers;
    return null;
}

// `winners` ist optional (Array der Sieger-Spielerobjekte). Fehlt es, bleibt die
// Statistikleiste leer — alle Aufrufer reichen es durch, aber showWin soll auch
// ohne funktionieren, falls später ein Siegpfad dazukommt.
function showWin(msg, winners) {
    if (window.closeRecap) closeRecap();   // Rückblick-Panel liegt fixed über allem
    canvasWrapper.style.display = 'none'; document.body.classList.remove('in-game');
    uiContainer.style.display = 'none';
    gameHud.style.display = 'none';
    document.getElementById('win-msg').innerText = msg;

    // "SIEG" stand bis Sept 2026 auch dem Verlierer im Gesicht — der Screen
    // kannte nur eine Anrede. Wer vor dem Gerät sitzt, weiß nur der Server-Modus
    // (currentUserSlot); im Hotseat/Legacy-Modus schaut immer der gerade
    // Ziehende zu, dort bleibt es beim Sieg-Screen.
    const mySlot = (typeof currentUserSlot === 'number' && gameState.p[currentUserSlot]) ? currentUserSlot : -1;
    const iWon = mySlot < 0 || (winners || []).indexOf(gameState.p[mySlot]) !== -1;
    const titleEl = document.getElementById('win-title');
    if (titleEl) titleEl.textContent = iWon ? 'SIEG' : 'NIEDERLAGE';
    const crownEl = document.querySelector('.win-crown use');
    if (crownEl) crownEl.setAttribute('href', iWon ? '#i-crown' : '#i-skull');
    winScreen.classList.toggle('is-defeat', !iWon);

    // Rückblick-Knopf, aber nur auf dem Weg über bootGame (window.gameFinished):
    // dort ist prepareRecap() direkt vorher gelaufen, die Gruppen stehen also
    // passend zum Endstand. Der zweite Weg hierher ist der Sieg MITTEN im
    // eigenen Zug (doEndTurn, js/input.js) — da ist der Log gerade erst
    // geschrieben und die Sichtfelder sind fürs Serialisieren schon komprimiert;
    // ein Rückblick daraus wäre bestenfalls der vom Zugbeginn. Wer ihn will,
    // öffnet die beendete Partie noch einmal aus der Liste. Nichts zu berichten
    // -> kein Knopf, statt ein leeres Panel anzubieten.
    const recapBtn = document.getElementById('win-recap-btn');
    if (recapBtn) {
        const n = window.recapEventCount ? window.recapEventCount() : 0;
        recapBtn.style.display = (window.gameFinished && n > 0) ? '' : 'none';
        recapBtn.textContent = `Rückblick ansehen (${n})`;
    }

    const statsEl = document.getElementById('win-stats');
    if (statsEl) {
        const ids = (winners || []).map(p => gameState.p.indexOf(p)).filter(i => i >= 0);
        if (ids.length) {
            const villages = Object.values(gameState.v || {}).filter(o => ids.includes(o)).length;
            const units = (gameState.u || []).filter(u => ids.includes(u.p)).length;
            const cell = (value, label) =>
                `<span class="win-stat"><span class="win-stat-value">${value}</span><span class="win-stat-label">${label}</span></span>`;
            statsEl.innerHTML = cell(gameState.rn, 'Runden')
                + '<span class="win-stat-sep"></span>'
                + cell(villages, villages === 1 ? 'Dorf' : 'Dörfer')
                + '<span class="win-stat-sep"></span>'
                + cell(units, units === 1 ? 'Einheit' : 'Einheiten');
            statsEl.style.display = 'flex';
        } else {
            statsEl.style.display = 'none';
        }
    }

    winScreen.style.display = 'flex';
}

// Sieg-/Endscreen beiseiteräumen und die Endstellung mit dem Rückblick zeigen.
// Gegenstück zu showWin: dieselben vier Anzeigen wieder an, aber ohne
// Interaktion (der Zug-beenden-Knopf bleibt aus, Aufgeben verschwindet aus dem
// Menü — das Spiel ist vorbei). Zurück ins Hauptmenü kommt man über das
// Spielmenü, der Rückblick selbst über den HUD-Knopf.
function showEndRecap() {
    winScreen.style.display = 'none';
    canvasWrapper.style.display = 'block';
    document.body.classList.add('in-game');
    uiContainer.style.display = 'flex';
    gameHud.style.display = 'flex';
    endTurnBtn.disabled = true;
    const surrenderItem = document.getElementById('menu-surrender-item');
    if (surrenderItem) surrenderItem.style.display = 'none';
    Renderer.resize();
    focusCamera();
    renderBoard(gameState);
    if (window.openRecap) openRecap();
}
window.showEndRecap = showEndRecap;

// Server mode: only the active player may act — everyone else is read-only/spectator (see handleCanvasClick).
function isMyActiveTurn() {
    return isLegacyUrlMode || !currentGameId || currentTurnSlot === currentUserSlot;
}

// Parameter heisst bewusst `ic` und nicht `icon`: sonst verdeckt er die
// globale icon()-Funktion aus js/icons.js innerhalb dieser Funktion.
function giftSliderRow(res, ic, i, max) {
    return `
        <div class="gift-row">
            <span class="gift-label">${icon(ic, 'ic-14')} <b id="gift-${res}-out-${i}">0</b>/${max}</span>
            <input type="range" class="gift-slider" id="gift-${res}-${i}" min="0" max="${max}" value="0" step="1" style="--fill: 0%"
                oninput="document.getElementById('gift-${res}-out-${i}').textContent=this.value; this.style.setProperty('--fill', (${max} > 0 ? this.value / ${max} * 100 : 0) + '%')">
        </div>
    `;
}

function giftForm(i) {
    if (!isMyActiveTurn()) {
        return `
            <div style="width: 100%; margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 0.72rem; color: var(--text-dim); text-align: left;">
                Ressourcen senden geht nur während deines eigenen Zuges.
            </div>
        `;
    }
    const pState = gameState.p[gameState.cp];
    return `
        <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 5px; padding-top: 5px; width: 100%; border-top: 1px solid rgba(255,255,255,0.08);">
            ${giftSliderRow('g', 'gold', i, pState.g)}
            ${giftSliderRow('m', 'wood', i, pState.m)}
            ${giftSliderRow('s', 'stone', i, pState.s)}
            <button class="action-btn" style="margin-top: 2px; padding: 6px 8px; font-size: 0.78rem;" onclick="sendResources(${i})">Senden</button>
        </div>
    `;
}

// Fasst die anderen (lebenden) Spieler aus Sicht von `cp` in drei Gruppen
// zusammen, statt sie einzeln mit sich wiederholenden "Verbündet mit: ..."
// Zeilen aufzuzählen (Jonathans Feedback: "selbe Info wird oft angezeigt"):
//   - myTeam: die eigenen Verbündeten (einzeln gelistet, weil man mit jedem
//     einzeln Ressourcen tauschen kann — giftForm ist pro Spieler)
//   - teams: fremde Bündnisse/Teams, transitiv über die al-Listen ihrer
//     Mitglieder aufgelöst und zu EINER Karte gebündelt (im festen Team-Modus,
//     js/mapgen.js state.at, sind das immer alle übrigen Spieler in
//     gleich großen Gruppen; in freier Diplomatie höchstens Paare, da dort
//     laut sendAlliance/acceptAlliance ohnehin nur 1 aktives Bündnis erlaubt ist)
//   - neutrals: Spieler ganz ohne Bündnis (nur in freier Diplomatie möglich —
//     im festen Team-Modus ist jeder Spieler von Anfang an einem Team
//     zugeteilt, siehe buildInitialGameState)
function computeDiplomacyGroups(cp) {
    const pState = gameState.p[cp];
    const myAllies = new Set(pState.al || []);
    const others = gameState.p
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => i !== cp && !p.dead);

    const myTeam = others.filter(({ i }) => myAllies.has(i)).map(({ i }) => i);
    const rest = others.filter(({ i }) => !myAllies.has(i));

    const teams = [];
    const seen = new Set();
    rest.forEach(({ p, i }) => {
        if (seen.has(i) || !p.al || p.al.length === 0) return;
        const teamIds = [...new Set([i, ...p.al])].filter(id => id !== cp && !gameState.p[id].dead);
        teamIds.forEach(id => seen.add(id));
        teams.push(teamIds.sort((a, b) => a - b));
    });

    const neutrals = rest.filter(({ i }) => !seen.has(i)).map(({ i }) => i);

    return { myTeam, teams, neutrals };
}

// Namenszeile + Aktions-Buttons für einen einzelnen Spieler in freier
// Diplomatie (Anfragen/Annehmen/Ablehnen/Zurückziehen) — unverändert aus der
// bisherigen Logik übernommen, nur in eine wiederverwendbare Funktion
// ausgelagert, damit sowohl gebündelte Team-Karten als auch einzelne
// Neutrale-Karten sie nutzen können.
function renderDipActionRow(id, pState, maxReached) {
    const p = gameState.p[id];
    let actionBtn;
    if (pState.req && pState.req.includes(id)) {
        actionBtn = `<button class="action-btn dip-action-btn act-ally" onclick="acceptAlliance(${id})">${icon('check', 'ic-12')} Annehmen (5${icon('gold', 'ic-12')} 5${icon('wood', 'ic-12')})</button>
                     <button class="action-btn dip-action-btn" onclick="rejectAlliance(${id})">× Ablehnen</button>`;
    } else if (p.req && p.req.includes(gameState.cp)) {
        actionBtn = `<button class="action-btn dip-action-btn" onclick="withdrawAlliance(${id})">× Zurückziehen</button>`;
    } else if (maxReached) {
        actionBtn = `<button class="action-btn dip-action-btn" disabled>${icon('pact', 'ic-12')} Anfragen (5${icon('gold', 'ic-12')} 5${icon('wood', 'ic-12')})</button>`;
    } else {
        actionBtn = `<button class="action-btn dip-action-btn act-ally" onclick="sendAlliance(${id})">${icon('pact', 'ic-12')} Anfragen (5${icon('gold', 'ic-12')} 5${icon('wood', 'ic-12')})</button>`;
    }
    return `
        <div class="dip-card-header">
            <span class="dip-name" style="color: ${playerColors[id]}">${p.n}</span>
            <div class="dip-action-row">${actionBtn}</div>
        </div>
    `;
}

window.openDiplomacy = function () {
    const content = document.getElementById('dip-content');
    content.innerHTML = '';
    const pState = gameState.p[gameState.cp];
    const { myTeam, teams, neutrals } = computeDiplomacyGroups(gameState.cp);

    if (gameState.at) {
        if (myTeam.length) {
            const names = myTeam.map(id => gameState.p[id].n).join(', ');
            content.innerHTML += `<div class="dip-section-title">${icon('pact', 'ic-12')} Dein Team</div>`;
            content.innerHTML += `<div class="dip-card dip-card-ally">
                <div class="dip-team-names">Gemeinsam mit ${names}</div>
                ${myTeam.map(id => `
                    <div class="dip-member-row">
                        <div class="dip-card-header"><span class="dip-name" style="color: ${playerColors[id]}">${gameState.p[id].n}</span></div>
                        ${giftForm(id)}
                    </div>
                `).join('')}
            </div>`;
        }
        if (teams.length) {
            content.innerHTML += `<div class="dip-section-title">⚔️ Gegnerische Teams</div>`;
            teams.forEach(teamIds => {
                const names = teamIds.map(id => gameState.p[id].n).join(', ');
                content.innerHTML += `<div class="dip-card dip-card-enemy">
                    <div class="dip-card-header">
                        <span class="dip-name">${names}</span>
                        <span class="dip-badge dip-badge-enemy">⚔️ Feind</span>
                    </div>
                </div>`;
            });
        }
        document.getElementById('dip-overlay').style.display = 'flex';
        return;
    }

    const hasAlliance = pState.al && pState.al.length > 0;
    const hasOutReq = gameState.p.some(p => p.req && p.req.includes(gameState.cp));
    const maxReached = hasAlliance || hasOutReq;

    if (myTeam.length) {
        content.innerHTML += `<div class="dip-section-title">🤝 Dein Verbündeter</div>`;
        myTeam.forEach(id => {
            content.innerHTML += `<div class="dip-card dip-card-ally">
                <div class="dip-card-header">
                    <span class="dip-name" style="color: ${playerColors[id]}">${gameState.p[id].n}</span>
                    <button class="action-btn dip-action-btn act-fire" onclick="breakAlliance(${id})">Brechen</button>
                </div>
                ${giftForm(id)}
            </div>`;
        });
    }

    if (teams.length) {
        content.innerHTML += `<div class="dip-section-title">⚔️ Verbündete Gegner</div>`;
        teams.forEach(teamIds => {
            const names = teamIds.map(id => gameState.p[id].n).join(' & ');
            content.innerHTML += `<div class="dip-card dip-card-enemy">
                <div class="dip-team-names">${names} sind verbündet</div>
                ${teamIds.map(id => `<div class="dip-member-row">${renderDipActionRow(id, pState, maxReached)}</div>`).join('')}
            </div>`;
        });
    }

    if (neutrals.length) {
        content.innerHTML += `<div class="dip-section-title">◌ Neutral</div>`;
        neutrals.forEach(id => {
            content.innerHTML += `<div class="dip-card dip-card-neutral">${renderDipActionRow(id, pState, maxReached)}</div>`;
        });
    }

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
