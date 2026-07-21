// === UNDO ===
function updateUndoButton() {
    const item = document.getElementById('menu-undo-item');
    if (item) item.disabled = undoStack.length === 0;
}

function saveUndoState() {
    undoStack.push({ gs: JSON.parse(JSON.stringify(gameState)), ta: [...turnActions] });
    if (undoStack.length > 10) undoStack.shift();
    updateUndoButton();
}

window.undoLastAction = function () {
    if (undoStack.length === 0) { showToast('Nichts rückgängig zu machen.', 'error'); return; }
    const snap = undoStack.pop();
    gameState = snap.gs;
    turnActions = snap.ta;
    selectedUnit = null; validMoves = []; validAttacks = []; selectedHex = null;
    window.highlightedTunnelEnd = null; window.specialActive = null; window.demolishTargets = [];
    // Unterwelt-Auswahl (selectedUWUnit, uwValidMoves/Digs/Attacks, ...) muss beim
    // Undo ebenfalls verworfen werden — sonst bleibt sie auf der VOR dem Undo
    // mutierten Live-Referenz stehen, die nach dem gameState-Austausch nicht mehr
    // Teil von gameState.uw.u ist (verwaist). Ein Klick auf einen noch gecachten
    // uwValidDigs/-Attacks-Eintrag (handleUnderworldClick prüft diese Arrays VOR
    // einer Neuberechnung) würde dann z.B. eine Grabung/Abbau über die verwaiste
    // Einheit auslösen, ohne dass die echte Einheit sich bewegt hat oder eine
    // Aktion kostet — sichtbar u.a. als "Abbau trotz keiner Nachbarschaft mehr".
    clearUWSelection();
    updateUndoButton();
    renderBoard(gameState);
    showToast('↩ Rückgängig', 'info');
};

// === GAME MENU ===
window.toggleGameMenu = function () {
    const popup = document.getElementById('game-menu-popup');
    if (!popup) return;
    popup.style.display = popup.style.display === 'none' ? '' : 'none';
};

window.closeGameMenu = function () {
    const popup = document.getElementById('game-menu-popup');
    if (popup) popup.style.display = 'none';
};

document.addEventListener('click', e => {
    if (!e.target.closest('#game-menu-popup') && !e.target.closest('#menu-btn')) {
        closeGameMenu();
    }
});

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

    const income = calculateIncome(pId);
    resourceHud.innerHTML = `💰 ${pState.g} <span class="income-text">(+${income.g})</span> | 🪵 ${pState.m} <span class="income-text">(+${income.m})</span> | 🪨 ${pState.s || 0}`;
    // Kristalle (Unterwelt-Ressource, pState.k) nur einblenden, sobald der Spieler
    // welche besitzt — vor dem ersten Abbau ist die Ressource für die meisten
    // Spieler irrelevant und würde die HUD-Zeile nur unnötig verlängern.
    if (pState.k > 0) {
        resourceHud.innerHTML += ` | 💎 ${pState.k}`;
    }
    // Erschließungs-Countdown (M12): dauerhaft im HUD ALLER Spieler sichtbar,
    // solange uw.hz existiert — "volle Information, kein heimlicher Sieg".
    // Kurzform ohne Label/Klammern (Korrektur Juli 2026): der volle Fortschritt
    // (n/TARGET) steht jetzt zusätzlich direkt über dem Herz auf der Karte
    // (js/render3d.js, nur bei Oberflächen-Kamera sichtbar) — die HUD-Zeile bleibt
    // als kompakter Fallback für die Unterwelt-Kamera-Ansicht, muss aber auf
    // schmalen Smartphone-Breiten nicht mehr die volle Ressourcenzeile sprengen.
    if (gameState.uw && gameState.uw.hz) {
        const hzName = gameState.p[gameState.uw.hz.p] ? gameState.p[gameState.uw.hz.p].n : '?';
        resourceHud.innerHTML += ` | 🌍 ${hzName} ${gameState.uw.hz.n}/${ERSCHLIESSUNG_TARGET}`;
    }

    infoPanel.style.color = playerColors[pId];
    // Unterwelt-Auswahl (Korrektur Juli 2026, Tooltip-Fix): diese Bedingung kannte
    // bisher nur die Oberflächen-Selektion (selectedUnit/selectedHex) — jeder
    // renderBoard()-Aufruf ruft am Ende der 3D-render()-Funktion (js/render3d.js)
    // updateUI() auf, das dann JEDES Unterwelt-Info-Panel (showUnderworldTileUI,
    // js/input.js) sofort wieder mit der generischen Rundenzeile überschrieben hat
    // — der eigentliche Grund, warum in der Unterwelt praktisch nie ein Tooltip zu
    // sehen war, unabhängig davon, wie viel showUnderworldTileUI selbst anzeigt.
    if (!selectedUnit && !selectedHex && !selectedUWUnit && !window.selectedUnderworldHex && window.specialActive !== 'tribok') {
        const actualTurnId = (currentTurnSlot !== null && currentTurnSlot !== undefined) ? currentTurnSlot : gameState.cp;
        const actualTurnName = gameState.p[actualTurnId]?.n ?? pState.n;
        infoPanel.innerHTML = `Runde ${gameState.rn} | ${actualTurnName} ist am Zug.<div class="info-detail">Tippe auf Einheiten oder Dörfer für Details.</div>`;
    }

    updateScoreboard();
}

// === KULTUR-STATUS (extrahiert aus dem ehemaligen #upgrade-btn-Steuerblock) ===
// Der Kultur-Button ist aus dem HUD entfernt (Teil B des HUD-Umbaus); die Kauf-
// Bedingungen (Dörfer-/Holz-Schwellen für 1./2. Kultur) werden aber weiterhin
// gebraucht — Konsument ist das künftige Fraktions-Fenster (window.openFactionOverview,
// kommt in einem Folgeauftrag). stage: null bedeutet "beide Kulturen bereits gewählt",
// also nichts mehr zu kaufen.
window.getKulturStatus = function () {
    const pState = gameState.p[gameState.cp];
    const myVillages = Object.values(gameState.v).filter(v => v === gameState.cp).length;
    let stage, cost, reqVillages;
    if (pState.f.length === 0) { stage = 1; cost = 10; reqVillages = 2; }
    else if (pState.f.length === 1) { stage = 2; cost = 15; reqVillages = 4; }
    else { return { stage: null, cost: null, reqVillages: null, villages: myVillages, wood: pState.m, canBuy: false }; }
    return {
        stage, cost, reqVillages,
        villages: myVillages,
        wood: pState.m,
        canBuy: myVillages >= reqVillages && pState.m >= cost,
    };
};

// === ACTION MENU ===
function hideActionMenu() { actionMenu.style.display = 'none'; actionMenu.innerHTML = ''; }
function showActionMenu(html) {
    actionMenu.innerHTML = html;
    actionMenu.style.display = 'flex';
    // Rekrutierungs-Leisten starten in der MITTE statt ganz links (Gegenstück
    // zur Zentrierung per auto-Margins in css/game.css, .recruit-scroll):
    // mit 2 Fraktionen läuft die Leiste über, und von der Mitte aus erreicht
    // man beide Enden mit halb so weitem Scrollen statt immer nur nach rechts.
    // scrollWidth/clientWidth erzwingen hier das Layout, deshalb NACH dem
    // display='flex' — vorher wären beide 0.
    actionMenu.querySelectorAll('.recruit-scroll').forEach(el => {
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
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

// === FRAKTIONS-FENSTER (Radialmenü "⚜️ Fraktion") ===
// Ersetzt keinen alten Button — Kultur/Forschung waren zuvor getrennte HUD-Buttons,
// dieses Fenster fasst "was bringt mir meine gewählte Kultur GERADE JETZT" +
// "nächste Kultur kaufen" an einer Stelle zusammen (HUD-Umbau, CLAUDE.md-Auftrag).
// Inhalt wird bei jedem Öffnen frisch aus gameState gebaut, nicht zwischengespeichert.
window.openFactionOverview = function () {
    const pState = gameState.p[gameState.cp];
    const myVillages = Object.values(gameState.v).filter(v => v === gameState.cp).length;
    let html = '';

    if (pState.f.length === 0) {
        html += `<div class="card" style="flex:1 1 100%; text-align:left; cursor:default;">
            <p>Kulturen ("Kultur-Pfeiler") sind das Fraktionssystem des Spiels: du wählst bis zu 2 der 4 Kulturen
            (Feudalismus, Plünderer, Spionage, Gilden). Jede schaltet sofort 2 Spezialeinheiten, eine passive
            Fähigkeit und 3 Forschungs-Upgrades frei.</p>
        </div>`;
    }

    pState.f.forEach(facId => {
        const fac = factions[facId];
        // Aktuell wirksamer Passiv-Wert pro Kultur (Jonathan: "wie stark diese im
        // Moment sind" soll sichtbar sein, nicht nur der abstrakte Beschreibungstext).
        let passiveValue = '';
        if (facId === 0) {
            // Formel exakt wie beim Rekrutieren selbst (buyUnit, js/ui.js), sonst
            // würde die Anzeige bei künftigen Balance-Änderungen dort lautlos veralten.
            const fb = Math.floor(myVillages / 2);
            passiveValue = `Aktuell: +${fb} Max-HP für neu rekrutierte Einheiten`;
        } else if (facId === 1) {
            const meleeCount = gameState.u.filter(u => u.p === gameState.cp && unitStats[u.t].isMelee).length;
            passiveValue = `Aktuell: +1 DMG für ${meleeCount} eigene Nahkampf-Einheit${meleeCount === 1 ? '' : 'en'}`;
        } else if (facId === 2) {
            passiveValue = `Aktuell: +1 Sichtweite auf allen eigenen Einheiten & Gebäuden`;
        } else if (facId === 3) {
            // Bonus direkt aus calculateIncome (js/logic.js) isoliert statt hart
            // codiert — damit die Anzeige nie von der echten Formel abweichen kann.
            const income = calculateIncome(gameState.cp);
            const extraGold = income.g - myVillages * 2;
            passiveValue = `Aktuell: +${extraGold} Gold/Runde`;
        }

        const boughtUpgrades = Object.entries(upgrades).filter(([id, u]) => u.fac === facId && pState.u.includes(parseInt(id)));
        const upgradeLines = boughtUpgrades.length
            ? boughtUpgrades.map(([, u]) => `<div style="font-size:0.7rem; color: var(--text-dim);">✅ ${u.name}</div>`).join('')
            : `<div style="font-size:0.7rem; color: var(--text-dim);">Noch keine Forschung gekauft.</div>`;

        html += `<div class="card" style="flex:1 1 100%; text-align:left; cursor:default;">
            <h3>${fac.name}</h3>
            <p style="white-space:pre-line;">${fac.desc}</p>
            <div class="passive-value">${passiveValue}</div>
            <div style="margin-top:6px; border-top:1px solid rgba(180,150,100,0.2); padding-top:6px;">${upgradeLines}</div>
        </div>`;
    });

    const status = window.getKulturStatus();
    if (status.stage !== null) {
        if (status.canBuy) {
            html += `<div class="card" style="flex:1 1 100%;" onclick="window.handleFactionBuyClick(${status.cost})">
                <h3>✨ ${status.stage}. Kultur wählen (${status.cost} Holz)</h3>
            </div>`;
        } else {
            const missing = [];
            if (status.villages < status.reqVillages) missing.push(`🏘️ ${status.reqVillages - status.villages} Dörfer`);
            if (status.wood < status.cost) missing.push(`🪵 ${status.cost - status.wood} Holz`);
            html += `<div class="card disabled" style="flex:1 1 100%;">
                <h3>✨ ${status.stage}. Kultur wählen (${status.cost} Holz)</h3>
                <p>Fehlt: ${missing.join(', ')}</p>
            </div>`;
        }
    } else {
        html += `<div style="text-align:center; color: var(--text-dim); font-size:0.85rem;">Beide Kulturen gewählt.</div>`;
    }

    document.getElementById('faction-cards').innerHTML = html;
    document.getElementById('faction-overlay').style.display = 'flex';
};

// Server-Readonly-Guard analog zu handleCanvasClick (js/input.js): im Server-
// Modus darf nur der aktive Spieler kaufen, Zuschauer/Wartende sehen das Fenster
// nur lesend.
window.handleFactionBuyClick = function (cost) {
    if (!isLegacyUrlMode && currentGameId && currentTurnSlot !== currentUserSlot) {
        showToast('Nur der aktive Spieler kann kaufen', 'error'); return;
    }
    document.getElementById('faction-overlay').style.display = 'none';
    openDraft(cost);
};

// === UNIT PURCHASING ===
window.buyUnit = function (type) {
    if (selectedHex) {
        const pState = gameState.p[gameState.cp];
        const cost = getUnitCost(pState, type);
        // Ebenen-Check: Flieger brauchen freie Luft-Ebene, Bodeneinheiten freie Boden-Ebene
        const blocked = unitStats[type].isAir ? airUnitAt(selectedHex.x, selectedHex.y) : groundUnitAt(selectedHex.x, selectedHex.y);
        if (blocked) { showToast(unitStats[type].isAir ? 'Luft-Ebene über dem Dorf ist belegt!' : 'Auf dem Dorf steht schon eine Einheit!', 'error'); return; }
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

// === UNTERWELT-EINHEITEN-KAUF (M9b) ===
// Pendant zu buyUnit: kauft am eigenen Stollenkopf (window.selectedUnderworldHex,
// gesetzt von showUnderworldTileUI) statt im Dorf, legt die Einheit in uw.u statt u[] an.
window.buyUWUnit = function (type) {
    if (!window.selectedUnderworldHex) return;
    const { x, y } = window.selectedUnderworldHex;
    const pState = gameState.p[gameState.cp];
    if (getStollenkopfOwner(gameState, x, y) !== gameState.cp) return;
    if (uwUnitAt(x, y) || uwCreatureAt(x, y)) { showToast('Stollenkopf ist belegt!', 'error'); return; }
    const cost = getUnitCost(pState, type);
    if (pState.g < cost) { showToast('Nicht genug Gold!', 'error'); return; }
    saveUndoState();
    buyUWUnitAt(gameState, gameState.cp, x, y, type);
    turnActions.push({ x, y, t: 'buy', uw: true });
    hideActionMenu();
    renderBoard(gameState); updateUI();
};

// === RELIQUIEN-SHOP (M10) ===
// Kauf läuft über das Reliquien-Fenster (window.openRelicShop, Radialmenü "🏺
// Reliquien") statt übers Dorf-Menü — dort war laut Jonathan "kein Platz dafür".
// "map" wirkt sofort (applyMapRelic, js/logic.js) und landet nie im Inventar;
// alle anderen gehen in p[].rel und werden separat ausgerüstet
// (window.startRelicEquip -> handleRelicTargetClick).
window.buyRelic = function (key) {
    const pState = gameState.p[gameState.cp];
    const def = RELICS[key];
    if (!def || (pState.k || 0) < def.cost) { showToast('Nicht genug Kristalle!', 'error'); return; }
    saveUndoState();
    pState.k -= def.cost;
    if (key === 'map') {
        applyMapRelic(gameState, gameState.cp);
        showToast('🗺️ Karte der Tiefe wirkt — gesamte Karte aufgedeckt!', 'gold');
    } else {
        if (!pState.rel) pState.rel = [];
        pState.rel.push(key);
        showToast(`${def.icon} ${def.name} erworben!`, 'gold');
    }
    // Koordinate fürs Rekap: es gibt kein ausgewähltes Dorf-Hex mehr (Kauf läuft
    // über das Reliquien-Fenster) — eigenes Startdorf als stabiler Ersatzwert,
    // Fallback 0,0 falls pState.sv ausnahmsweise fehlt.
    const [svx, svy] = (pState.sv || '0,0').split(',').map(Number);
    turnActions.push({ x: svx, y: svy, t: 'relicbuy' });
    renderBoard(gameState); updateUI();
};

// === RELIQUIEN-FENSTER (Radialmenü "🏺 Reliquien") ===
// Baut Shop (kaufbar) + Inventar (ausrüstbar) bei jedem Öffnen frisch aus
// gameState — Bestand ändert sich durch Kauf, das Overlay bleibt dabei aber
// offen (siehe handleRelicBuyClick), muss also neu aufgebaut statt nur einmal
// erzeugt werden.
window.openRelicShop = function () {
    buildRelicShopContent();
    document.getElementById('relic-overlay').style.display = 'flex';
};

function buildRelicShopContent() {
    const pState = gameState.p[gameState.cp];
    const crystals = pState.k || 0;
    let html = `<div class="crystal-header">💎 ${crystals} Kristalle</div>`;
    if (crystals === 0) {
        html += `<div style="text-align:center; color: var(--text-dim); font-size:0.8rem; margin-bottom:10px;">Kristalle entstehen durch Abbau an Kristalladern in der Unterwelt.</div>`;
    }

    html += `<div class="cards-container" style="max-width:600px;">`;
    Object.entries(RELICS).forEach(([key, def]) => {
        const afford = crystals >= def.cost;
        const cls = afford ? 'card' : 'card disabled';
        const onclick = afford ? `onclick="window.handleRelicBuyClick('${key}')"` : '';
        html += `<div class="${cls}" ${onclick}>
            <h3>${def.icon} ${def.name}</h3>
            <p>${def.desc}</p>
            <div class="cost">💎 ${def.cost}</div>
        </div>`;
    });
    html += `</div>`;

    html += `<h3 style="color: var(--gold); font-family: 'MedievalSharp', cursive; margin: 4px 0 8px; width:100%; text-align:center;">Inventar</h3>`;
    if (pState.rel && pState.rel.length > 0) {
        const counts = {};
        pState.rel.forEach(r => counts[r] = (counts[r] || 0) + 1);
        html += `<div style="display:flex; flex-direction:column; gap:6px; width:100%; margin-bottom:10px;">`;
        Object.entries(counts).forEach(([key, n]) => {
            const def = RELICS[key];
            html += `<div class="card" style="flex-direction:row; justify-content:space-between; align-items:center; text-align:left; cursor:default;">
                <span>${def.icon} ${def.name} (x${n})</span>
                <button class="action-btn" style="padding:6px 10px; font-size:0.75rem; margin:0;" onclick="window.handleRelicEquipClick('${key}')">Ausrüsten</button>
            </div>`;
        });
        html += `</div>`;
    } else {
        html += `<div style="text-align:center; color: var(--text-dim); font-size:0.85rem; margin-bottom:10px;">Keine Reliquien im Besitz.</div>`;
    }

    document.getElementById('relic-cards').innerHTML = html;
}

// Server-Readonly-Guard analog zu handleCanvasClick (js/input.js) — Kauf UND
// Ausrüsten sind Aktionen, dürfen also im Server-Modus nur vom aktiven Spieler
// ausgelöst werden.
window.handleRelicBuyClick = function (key) {
    if (!isLegacyUrlMode && currentGameId && currentTurnSlot !== currentUserSlot) {
        showToast('Nur der aktive Spieler kann kaufen', 'error'); return;
    }
    window.buyRelic(key);
    buildRelicShopContent(); // Bestand/Inventar geändert — Overlay bewusst NICHT schließen
};

window.handleRelicEquipClick = function (key) {
    if (!isLegacyUrlMode && currentGameId && currentTurnSlot !== currentUserSlot) {
        showToast('Nur der aktive Spieler kann ausrüsten', 'error'); return;
    }
    document.getElementById('relic-overlay').style.display = 'none';
    window.startRelicEquip(key);
};

// === VILLAGE CAPTURE ===
window.startCapture = function () {
    if (selectedUnit && !isFlying(selectedUnit)) {
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
