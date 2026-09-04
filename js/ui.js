// === UNDO ===
function updateUndoButton() {
    const item = document.getElementById('menu-undo-item');
    if (!item) return;
    // Ranked: Knopf bleibt sichtbar (statt zu verschwinden), aber dauerhaft
    // gesperrt mit erklärendem Text — kein toter Knopf ohne Hinweis, warum er
    // nichts tut (Entscheidung Jonathan, Aug 2026).
    if (isRankedGame) {
        item.disabled = true;
        item.textContent = '↩ Rückgängig — im Ranked gesperrt';
    } else {
        item.disabled = undoStack.length === 0;
        item.textContent = '↩ Rückgängig';
    }
}

function saveUndoState() {
    if (isRankedGame) return;   // kein Rückgängig im Ranked — Deep-Copy erst gar nicht anlegen
    undoStack.push({ gs: JSON.parse(JSON.stringify(gameState)), ta: [...turnActions] });
    if (undoStack.length > 10) undoStack.shift();
    updateUndoButton();
}

window.undoLastAction = function () {
    // window-global (Konsole erreichbar) — Guard hier zusätzlich zum
    // deaktivierten Menüknopf, nicht nur UI-Kosmetik.
    if (isRankedGame) { showToast('Im Ranked kann nichts rückgängig gemacht werden.', 'error'); return; }
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
    updateUndoButton();
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
// Dropdown hängt direkt unter dem #scoreboard-Trigger links auf (nicht mehr
// zentriertes Modal, nicht oben rechts wie das Menü — Jonathans Feedback:
// soll dort aufklappen, wo man auf die Punktzahl tippt). Schließt wie vorher
// per Klick außerhalb.
window.toggleScoreboard = function () {
    scoreboardOpen = !scoreboardOpen;
    document.getElementById('scoreboard-popup').style.display = scoreboardOpen ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
    const popup = document.getElementById('scoreboard-popup');
    if (scoreboardOpen && popup && !scoreboard.contains(e.target) && !popup.contains(e.target)) {
        scoreboardOpen = false;
        popup.style.display = 'none';
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

    // Nur der Spitzenreiter im HUD selbst (statt einer Badge pro Spieler) —
    // die Ressourcenleiste braucht bei mehr Ressourcen (Kristalle jetzt immer
    // sichtbar) den Platz, den vorher N Badges belegt haben. Der Rest bleibt
    // einen Tipp auf das Dropdown entfernt (Jonathans Feedback: "genügt, wenn
    // nur Platz 1 gezeigt wird").
    const leader = scores[0];
    let compactHtml = '';
    if (leader) {
        const opacity = leader.isDead ? 'opacity:0.3;' : '';
        compactHtml += `<span class="score-badge" style="${opacity}">`;
        compactHtml += `<span class="score-dot" style="background:${playerColors[leader.i]}"></span>`;
        compactHtml += `<span>${leader.isDead ? '✗' : leader.score}</span>`;
        compactHtml += `</span><span class="score-compact-chevron">▾</span>`;
    }
    scoreCompact.innerHTML = compactHtml;

    // Rundenzahl direkt im Rangliste-Header statt in der oberen HUD-Zeile —
    // zusammen mit dem Erschließungs-Status unten (score-hz-badge) auf
    // Jonathans Vorschlag hier gebündelt, weil dafür schon Platz ist, ohne
    // etwas anderes zu verdrängen (siehe #resource-hud in game.css).
    const popupHeader = document.getElementById('scoreboard-popup-header');
    // innerHTML statt textContent: die Kopfzeile trägt ein Icon, kein Emoji
    if (popupHeader) popupHeader.innerHTML = `${icon('crown', 'ic-14')} Rangliste · Runde ${gameState.rn}`;

    const modalContent = document.getElementById('scoreboard-modal-content');
    if (modalContent) {
        let html = '';
        scores.forEach((s, rank) => {
            // Fraktions-Icons (erstes Emoji aus factions[id].name) direkt in der
            // Kopfzeile — sollen auf den ersten Blick sichtbar sein, siehe
            // Forschungen/Reliquien dagegen erst per Antippen (score-card-details,
            // per Klick auf die Karte auf-/zugeklappt — Chevron zeigt an, dass da
            // mehr ist. Jonathans Feedback: die volle Aufschlüsselung für JEDEN
            // Spieler auf einmal "verliert seinen Charme" / wirkt überladen).
            const facIcons = (s.p.f || []).map(fid => icon(factions[fid].ic, 'ic-12')).join('');
            // Erschließungs-Status (M12, war früher in der oberen HUD-Zeile,
            // s.o.): "volle Information, kein heimlicher Sieg" heißt, er muss
            // weiter auf den ersten Blick sichtbar sein — also auch hier in
            // der eingeklappten Kopfzeile, nicht hinter dem Antippen versteckt.
            const hzBadge = (gameState.uw && gameState.uw.hz && gameState.uw.hz.p === s.i)
                ? `<span class="score-hz-badge" title="Erschließung der Unterwelt">🌍 ${gameState.uw.hz.n}/${ERSCHLIESSUNG_TARGET}</span>`
                : '';
            const clickable = !s.isDead;
            html += `<div class="score-card ${s.isDead ? 'score-dead' : ''}" ${clickable ? 'onclick="this.classList.toggle(\'expanded\')"' : ''}>`;
            html += `<div class="score-card-header">`;
            html += `<span class="score-rank">${rank + 1}.</span>`;
            html += `<span class="score-dot" style="color:${playerColors[s.i]};background:${playerColors[s.i]}"></span>`;
            html += `<span class="score-name">${s.p.n}</span>`;
            if (facIcons) html += `<span class="score-factions">${facIcons}</span>`;
            if (hzBadge) html += hzBadge;
            html += `<span class="score-total">${s.isDead ? 'Besiegt' : s.score + ' Pkt'}</span>`;
            if (clickable) html += `<span class="score-chevron">▸</span>`;
            html += `</div>`;
            if (clickable) {
                const upgradeNames = (s.p.u || []).map(uid => upgrades[uid].name);

                const relicParts = [];
                if (s.p.rb) relicParts.push(`${RELICS.blade.icon} ${RELICS.blade.name}`);
                if (s.p.ra) relicParts.push(`${RELICS.armor.icon} ${RELICS.armor.name}`);
                if (s.p.mr) relicParts.push(`${RELICS.map.icon} ${RELICS.map.name}`);
                const toolCount = (s.p.rel || []).filter(r => r === 'tool').length;
                if (toolCount) relicParts.push(`${RELICS.tool.icon} ${RELICS.tool.name} ×${toolCount}`);

                html += `<div class="score-card-details">`;
                html += `<div class="score-subrow"><b>Forschungen:</b> ${upgradeNames.length ? upgradeNames.join(', ') : '—'}</div>`;
                html += `<div class="score-subrow"><b>Reliquien:</b> ${relicParts.length ? relicParts.join(', ') : '—'}</div>`;
                html += `</div>`;
            }
            html += `</div>`;
        });
        html += `<div class="score-legend">10 Punkte pro Dorf · 5 pro Einheit · 1 pro Gold</div>`;
        modalContent.innerHTML = html;
    }
}

// === MAIN UI UPDATE ===
function updateUI() {
    const pId = gameState.cp; const pState = gameState.p[pId];
    if (!pState.f) pState.f = []; if (!pState.of) pState.of = []; if (!pState.u) pState.u = [];

    const income = calculateIncome(pId);
    // Kristalle (pState.k) sind jetzt von Anfang an mit in der Leiste (auch bei
    // 0) statt erst ab dem ersten Abbau eingeblendet zu werden — Jonathans
    // Wunsch, die Ressource durchgehend sichtbar zu haben. Der dadurch
    // entstandene Platzbedarf ist der Grund, warum die Punktzahl-Anzeige
    // links (score-compact, s.o.) jetzt nur noch den Spitzenreiter statt
    // einer Badge pro Spieler zeigt.
    resourceHud.innerHTML =
        `<span class="res">${icon('gold', 'ic-14')}<b>${pState.g}</b><span class="income-text">+${income.g}</span></span>` +
        `<span class="res">${icon('wood', 'ic-14')}<b>${pState.m}</b><span class="income-text">+${income.m}</span></span>` +
        `<span class="res">${icon('stone', 'ic-14')}<b>${pState.s || 0}</b></span>` +
        `<span class="res">${icon('crystal', 'ic-14')}<b>${pState.k || 0}</b></span>`;
    // Erschließungs-Countdown (M12) stand früher zusätzlich hier in der HUD-
    // Zeile ("| 🌍 Name n/TARGET") — bei langen Spielernamen reichte selbst
    // Kürzen per Ellipsis nicht, weil Leader-Badge + alle vier Ressourcen +
    // Menü-Button allein auf schmalen Phones schon die volle Breite
    // beanspruchen (Jonathans Meldung, Screenshot zeigte den verdeckten
    // Menü-Button trotz Ellipsis-Fix). Jetzt komplett aus der Leiste entfernt
    // und stattdessen direkt beim betroffenen Spieler im Ranglisten-Dropdown
    // angezeigt (updateScoreboard, dort ist Platz für beliebig lange Namen
    // via Ellipsis vorhanden, ohne dass etwas anderes verdrängt wird) — die
    // Karte über dem Herz (js/render3d.js) bleibt weiterhin der primäre
    // Fortschrittsanzeiger auf der Oberflächen-Kamera.

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
        // Beendete Partie (window.gameFinished, gesetzt in bootGame): "X ist am
        // Zug" wäre schlicht falsch — hier zieht niemand mehr. Diese Ansicht
        // erreicht man über den Rückblick-Knopf im Sieg-/Niederlage-Screen.
        infoPanel.innerHTML = window.gameFinished
            ? `Spiel beendet nach ${gameState.rn} ${gameState.rn === 1 ? 'Runde' : 'Runden'}.<div class="info-detail">Endstellung — tippe auf Einheiten oder Dörfer für Details.</div>`
            : `Runde ${gameState.rn} | ${actualTurnName} ist am Zug.<div class="info-detail">Tippe auf Einheiten oder Dörfer für Details.</div>`;
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
/**
 * Rollen-Icon einer Einheit. Bewusst nach ROLLE statt je Einheitentyp: das
 * sagt beim Antippen mehr aus als ein Porträt und kommt ohne ein eigenes Icon
 * für jede der 16 Einheiten aus.
 */
function unitRoleIcon(type) {
    const st = unitStats[type] || {};
    if (st.isAir) return 'wing';
    if (type === 7) return 'pick';          // Arbeiter
    if (st.isMelee === false || st.range > 1) return 'bow';
    return 'sword';
}

/**
 * Kopfzeile fürs Info-Panel: Icon, Name, Marken, HP rechts — darunter die
 * segmentierte HP-Leiste.
 *
 * Existiert als EIN Baustein, weil die Info-Panels an zehn Stellen gebaut
 * werden (Oberfläche, Unterwelt, Kreatur, Hauptgebäude, Dorf, neutrales Dorf,
 * Palisade, Turm, Tunnel, Wachturm) und genau deshalb auseinandergelaufen
 * waren: die Unterwelt hatte eine HP-Leiste, die Oberfläche nicht. Wer eine
 * neue Info-Zeile ergänzt, nimmt diese Funktion.
 *
 * @param {object} o
 * @param {string} o.icon   Icon-Name (js/icons.js)
 * @param {string} o.name   Anzeigename
 * @param {string} [o.color] Farbe des Namens (Besitzerfarbe)
 * @param {number} [o.cur]  aktuelle HP — zusammen mit max weglassen bei
 *                          Objekten ohne Trefferpunkte (Dorf, Wachturm)
 * @param {number} [o.max]  maximale HP
 * @param {string} [o.tone] 'foe' färbt die HP-Leiste rot
 * @param {Array}  [o.badges] [{text, cls}] — Veteran, fliegt, brennt …
 */
function infoHead(o) {
    const badges = (o.badges || []).filter(Boolean)
        .map(b => `<span class="ip-badge ${b.cls || ''}">${b.text}</span>`).join('');
    const name = o.color
        ? `<span class="ip-name" style="color:${o.color}">${o.name}</span>`
        : `<span class="ip-name">${o.name}</span>`;
    const hp = o.max
        ? `<span class="ip-hp">${o.cur}<span class="ip-hp-max">/${o.max}</span></span>`
        : '';
    return `<div class="ip-head">${icon(o.icon, 'ic-20')}${name}${badges}${hp}</div>`
        + (o.max ? hpBar(o.cur, o.max, o.tone) : '');
}

/** Statistik-Zeile mit Icons statt "Bewegung: 1 | Angriff: 5". */
function infoStats(pairs) {
    return '<div class="ip-stats">' + pairs.filter(Boolean)
        .map(([ic, val]) => `<span class="ip-stat">${icon(ic, 'ic-12')}${val}</span>`).join('')
        + '</div>';
}

/**
 * Segmentierte HP-Leiste fuers Info-Panel: **ein Block = ein HP**. Man soll die
 * Bloecke abzaehlen koennen ("haelt noch drei Treffer aus") - deshalb wird die
 * Anzahl nicht skaliert.
 *
 * Eine fruehere Fassung fasste ab 20 Bloecken zusammen, damit die Leiste nicht
 * aus dem Panel laeuft. Das war falsch: das Hauptgebaeude (30 HP) und der Alte
 * Wurm (24 HP) zeigten dadurch dauerhaft zu wenige Bloecke. Dass es passt,
 * loest jetzt das Layout - die Bloecke schrumpfen per flex-shrink
 * (css/game.css), statt dass die Zahl verfaelscht wird.
 *
 * HP_BAR_LIMIT ist nur eine Notbremse gegen absurd viele DOM-Knoten; bis dahin
 * stimmt die Anzahl exakt.
 *
 * @param {number} cur  aktuelle HP
 * @param {number} max  maximale HP
 * @param {string} [tone] 'foe' faerbt die Leiste in Gegnerfarbe
 */
const HP_BAR_LIMIT = 60;
function hpBar(cur, max, tone) {
    max = Math.max(1, max | 0);
    cur = Math.max(0, cur | 0);
    // Bewusst NICHT nach oben geklemmt: das Ereignis "Kriegslust" hebt Einheiten
    // auf max+2. Geklemmt haette die Leiste dann volle Bloecke gezeigt, waehrend
    // die Zahl daneben "12/10" sagt — die Bonus-HP waeren unsichtbar gewesen.
    const over = Math.max(0, cur - max);
    const base = Math.min(cur, max);

    const slots = Math.min(max, HP_BAR_LIMIT);
    const overSlots = Math.min(over, Math.max(0, HP_BAR_LIMIT - slots));
    const filled = slots === max
        ? base
        : (base === 0 ? 0 : Math.max(1, Math.round(base / max * slots)));

    const title = `${cur}/${max} HP` + (over ? ` (+${over} Bonus)` : '');
    let html = `<span class="hp-bar${tone === 'foe' ? ' hp-bar-foe' : ''}" title="${title}">`;
    for (let i = 0; i < slots; i++) html += `<i${i < filled ? '' : ' class="off"'}></i>`;
    for (let i = 0; i < overSlots; i++) html += '<i class="over"></i>';
    return html + '</span>';
}


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
        draftCardsContainer.innerHTML += `<div class="card fac-card" onclick="selectFaction(${id}, ${cost})">
            <div class="fac-head">${icon(fac.ic, 'ic-24')}<h3>${fac.name}</h3></div>
            <div class="fac-sep"></div>
            <p>${fac.passive}</p>
            <span class="fac-label">Spezial</span>
            <span class="fac-special">${fac.special}</span>
            <div class="fac-cost"><span class="badge-cost">${icon('wood', 'ic-12')} ${cost}</span>
                <span class="badge-cost">${icon('village', 'ic-12')} ${fac.reqV}</span></div>
        </div>`;
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
            researchCardsContainer.innerHTML += `<div class="${cls}" ${onClick}><h3>${upg.name}</h3><p>${upg.desc}</p><div class="cost">${isBought ? "Gekauft" : `${icon('wood', 'ic-12')} ${upg.m} Holz`}</div></div>`;
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
            const fb = Math.floor(myVillages / 3);
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
            ? boughtUpgrades.map(([, u]) => `<div class="fac-upgrade">${icon('check', 'ic-12')} ${u.name}</div>`).join('')
            : `<div class="fac-upgrade fac-upgrade-none">Noch keine Forschung gekauft.</div>`;

        html += `<div class="card fac-card" style="flex:1 1 100%; cursor:default;">
            <div class="fac-head">${icon(fac.ic, 'ic-24')}<h3>${fac.name}</h3></div>
            <div class="fac-sep"></div>
            <p>${fac.passive}</p>
            <div class="passive-value">${passiveValue}</div>
            <span class="fac-label">Spezial</span>
            <span class="fac-special">${fac.special}</span>
            <div class="fac-sep"></div>
            ${upgradeLines}
        </div>`;
    });

    const status = window.getKulturStatus();
    if (status.stage !== null) {
        if (status.canBuy) {
            html += `<div class="card" style="flex:1 1 100%;" onclick="window.handleFactionBuyClick(${status.cost})">
                <h3>${status.stage}. Kultur wählen</h3><div class="fac-cost"><span class="badge-cost">${icon('wood', 'ic-12')} ${status.cost} Holz</span></div>
            </div>`;
        } else {
            const missing = [];
            if (status.villages < status.reqVillages) missing.push(`${status.reqVillages - status.villages} Dörfer`);
            if (status.wood < status.cost) missing.push(`${status.cost - status.wood} Holz`);
            html += `<div class="card disabled" style="flex:1 1 100%;">
                <h3>${status.stage}. Kultur wählen</h3><div class="fac-cost"><span class="badge-cost">${icon('wood', 'ic-12')} ${status.cost} Holz</span></div>
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
                fb = Math.floor(Object.values(gameState.v).filter(v => v === gameState.cp).length / 3);
            }
            // nb ("neu gebaut"): a===1 allein reicht nicht, um "gerade gekauft" von
            // "hat diese Runde schon angegriffen" zu unterscheiden — der Berserker
            // missbrauchte das sonst, um Blutrausch (Fähigkeit setzt a zurück) direkt
            // im Kaufzug zu nutzen und dann noch zu laufen/anzugreifen. Wird zusammen
            // mit br beim Rundenende gelöscht (js/input.js doEndTurn).
            const unitObj = { i: nextId, p: gameState.cp, t: type, x: selectedHex.x, y: selectedHex.y, fb: fb, a: 1, nb: 1 };
            if (pState.u.includes(1)) unitObj.vet = 1;
            unitObj.h = getUnitMaxHp(pState, type, unitObj);
            gameState.u.push(unitObj);
            turnActions.push({ x: selectedHex.x, y: selectedHex.y, t: 'buy', ut: type });
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
    turnActions.push({ x, y, t: 'buy', ut: type, uw: true });
    hideActionMenu();
    renderBoard(gameState); updateUI();
};

// === RELIQUIEN-SHOP (M10) ===
// Kauf läuft über das Reliquien-Fenster (window.openRelicShop, Radialmenü "🏺
// Reliquien") statt übers Dorf-Menü — dort war laut Jonathan "kein Platz dafür".
// "instant"-Reliquien (Klingenschmiede/Bollwerk/Karte) wirken sofort
// (applyInstantRelic, js/logic.js) und landen nie im Inventar; nur "tool"
// (target: "building") geht in p[].rel und wird separat ausgerüstet
// (window.startRelicEquip -> handleRelicTargetClick).
window.buyRelic = function (key) {
    const pState = gameState.p[gameState.cp];
    const def = RELICS[key];
    if (!def || (pState.k || 0) < def.cost) { showToast('Nicht genug Kristalle!', 'error'); return; }
    saveUndoState();
    pState.k -= def.cost;
    if (def.target === 'instant') {
        applyInstantRelic(gameState, gameState.cp, key);
        // Karte der Tiefe wirkt erst ab dem nächsten Zug (Undo-Exploit-Fix,
        // js/logic.js queueMapRelic/activatePendingMapRelic) — Klingenschmiede/
        // Bollwerk bleiben sofort wirksam, dort gibt es nichts zu "sehen" und
        // damit nichts, was ein Undo im Nachhinein nicht sauber zurücknähme.
        const msg = key === 'map' ? 'wirkt ab deinem nächsten Zug!' : 'wirkt dauerhaft!';
        showToast(`${def.icon} ${def.name} ${msg}`, 'gold');
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
    let html = `<div class="crystal-header">${icon('crystal', 'ic-20')} ${crystals} Kristalle</div>`;
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

// === HANDEL-FENSTER (Radialmenü "⚖️ Handel") ===
// Tauscht Gold/Holz/Stein 1:1 in beide Richtungen. Kristalle sind bewusst
// NICHT kaufbar (nur "Verkaufen: Kristalle" -> 1 💎 gibt 3 einer Kaufressource)
// — sonst wären Reliquien rein per Gold ohne Unterwelt-Investment erreichbar
// (Jonathan, Juli 2026). Macht Kristalle nach dem Reliquien-Umbau (siehe
// applyInstantRelic, js/logic.js) zu einer dauerhaft nützlichen Ressource
// statt nach dem letzten Reliquienkauf tot zu liegen.
// UI (Korrektur Juli 2026, Smartphone-Feedback: <select>-Dropdowns wirkten
// "clunky" auf Touch-Geräten): Ressourcen-Wahl als große Chip-Buttons statt
// <select>, Menge als Slider (`.gift-slider`-Muster von Diplomatie/sendResources
// wiederverwendet) statt Zahlenfeld — beides deutlich größere Touch-Ziele.
// `ic` ist der Icon-NAME (js/icons.js), nicht fertiges Markup: die drei
// Verwendungsstellen unten brauchen unterschiedliche Groessen.
const TRADE_RESOURCES = {
    g: { label: 'Gold', ic: 'gold' },
    m: { label: 'Holz', ic: 'wood' },
    s: { label: 'Stein', ic: 'stone' },
    k: { label: 'Kristalle', ic: 'crystal' },
};

let tradeSellKey = 'g';
let tradeBuyKey = 'm';

window.openTradeShop = function () {
    buildTradeShopContent();
    document.getElementById('trade-overlay').style.display = 'flex';
};

function buildTradeShopContent() {
    const pState = gameState.p[gameState.cp];
    // Kristalle sind nie kaufbar — falls die aktuelle Kauf-Auswahl gerade durch
    // die Verkaufen-Auswahl blockiert wird (gleiche Ressource) oder auf 'k'
    // zeigt (Altzustand), auf die erste gültige Alternative ausweichen.
    if (tradeBuyKey === tradeSellKey || tradeBuyKey === 'k') {
        tradeBuyKey = Object.keys(TRADE_RESOURCES).find(k => k !== 'k' && k !== tradeSellKey);
    }
    const balanceLine = Object.entries(TRADE_RESOURCES)
        .map(([key, r]) => `<span class="res">${icon(r.ic, 'ic-14')}<b>${pState[key] || 0}</b></span>`).join('');
    const chipRow = (selectedKey, keys, handlerName) => keys.map(key => {
        const r = TRADE_RESOURCES[key];
        const cls = 'trade-chip' + (key === selectedKey ? ' selected' : '');
        return `<button class="${cls}" onclick="${handlerName}('${key}')"><span class="trade-chip-icon">${icon(r.ic, 'ic-24')}</span>${r.label}</button>`;
    }).join('');
    const sellKeys = Object.keys(TRADE_RESOURCES);
    const buyKeys = Object.keys(TRADE_RESOURCES).filter(k => k !== 'k' && k !== tradeSellKey);
    const maxAmount = Math.max(0, pState[tradeSellKey] || 0);
    const minAmount = maxAmount > 0 ? 1 : 0;
    const startAmount = minAmount;
    const rate = tradeSellKey === 'k' ? 3 : 1;
    document.getElementById('trade-cards').innerHTML = `
        <div class="crystal-header">${balanceLine}</div>
        <div style="width:100%; display:flex; flex-direction:column; gap:16px;">
            <div>
                <div class="trade-section-label">Verkaufen</div>
                <div class="trade-chip-row">${chipRow(tradeSellKey, sellKeys, 'window.selectTradeSell')}</div>
            </div>
            <div class="trade-rate">${icon(TRADE_RESOURCES[tradeSellKey].ic, 'ic-20')} 1 &nbsp;→&nbsp; ${rate} ${icon(TRADE_RESOURCES[tradeBuyKey].ic, 'ic-20')}</div>
            <div>
                <div class="trade-section-label">Kaufen</div>
                <div class="trade-chip-row">${chipRow(tradeBuyKey, buyKeys, 'window.selectTradeBuy')}</div>
            </div>
            <div class="gift-row">
                <span class="gift-label">Menge <b id="trade-amount-out">${startAmount}</b>/${maxAmount}</span>
                <input type="range" class="gift-slider" id="trade-amount" min="${minAmount}" max="${maxAmount}" value="${startAmount}" step="1" style="--fill: ${maxAmount > minAmount ? (startAmount - minAmount) / (maxAmount - minAmount) * 100 : 0}%"
                    oninput="window.updateTradePreview()">
            </div>
            <div id="trade-preview" class="passive-value" style="text-align:center;"></div>
            <button class="action-btn" onclick="window.handleTradeClick()">Tauschen</button>
        </div>`;
    window.updateTradePreview();
}

window.selectTradeSell = function (key) {
    tradeSellKey = key;
    buildTradeShopContent();
};

window.selectTradeBuy = function (key) {
    tradeBuyKey = key;
    buildTradeShopContent();
};

window.updateTradePreview = function () {
    const amountEl = document.getElementById('trade-amount');
    const amount = Math.max(0, Math.floor(Number(amountEl.value) || 0));
    const min = Number(amountEl.min) || 0;
    const max = Number(amountEl.max) || 0;
    document.getElementById('trade-amount-out').textContent = amount;
    amountEl.style.setProperty('--fill', (max > min ? (amount - min) / (max - min) * 100 : 0) + '%');
    const rate = tradeSellKey === 'k' ? 3 : 1;
    // textContent, kein innerHTML: hier kann kein Icon-Markup stehen -> Klartext.
    document.getElementById('trade-preview').textContent = `Du erhältst: ${amount * rate} ${TRADE_RESOURCES[tradeBuyKey].label}`;
};

window.handleTradeClick = function () {
    if (!isLegacyUrlMode && currentGameId && currentTurnSlot !== currentUserSlot) {
        showToast('Nur der aktive Spieler kann handeln', 'error'); return;
    }
    window.executeTrade();
};

window.executeTrade = function () {
    const pState = gameState.p[gameState.cp];
    const from = tradeSellKey, to = tradeBuyKey;
    const amount = Math.max(0, Math.floor(Number(document.getElementById('trade-amount').value) || 0));
    if (amount <= 0) { showToast('Bitte gib eine Menge ein!', 'error'); return; }
    if (from === to) { showToast('Verkaufen und Kaufen müssen sich unterscheiden!', 'error'); return; }
    if (to === 'k') { showToast('Kristalle können nicht gekauft werden!', 'error'); return; }
    if ((pState[from] || 0) < amount) { showToast('Nicht genug Ressourcen!', 'error'); return; }
    saveUndoState();
    const rate = from === 'k' ? 3 : 1;
    pState[from] -= amount;
    pState[to] = (pState[to] || 0) + amount * rate;
    const [svx, svy] = (pState.sv || '0,0').split(',').map(Number);
    turnActions.push({ x: svx, y: svy, t: 'trade' });
    showToast(`Verkauft: ${amount} ${TRADE_RESOURCES[from].label} → Gekauft: ${amount * rate} ${TRADE_RESOURCES[to].label}`, 'gold');
    buildTradeShopContent(); // Bestand geändert — Fenster bleibt offen, Muster wie handleRelicBuyClick
    updateUI();
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
        // vo = Vorbesitzer. Einzige Stelle, an der er noch bekannt ist — der
        // Rückblick (js/recap.js) kann daraus "hat DEIN Dorf erobert" machen,
        // was nach dem Besitzerwechsel aus dem State allein nicht mehr ableitbar ist.
        const prevOwner = gameState.v[loc];
        gameState.v[loc] = gameState.cp; selectedUnit.a = 1;
        turnActions.push({ x: selectedUnit.x, y: selectedUnit.y, t: 'cap', ut: selectedUnit.t, vo: prevOwner });
        selectedUnit = null; selectedHex = null; validMoves = []; validAttacks = [];
        hideActionMenu(); infoPanel.innerHTML = "Dorf eingenommen!"; renderBoard(gameState);
    }
};

// === INFO-PANEL: ABGESCHNITTENE TEXTE LESBAR MACHEN ===
// #info-panel hat pointer-events:none, damit man die Karte durch das Panel
// hindurch ziehen kann — das unterbindet aber auch das Scrollen, sodass alles
// jenseits der max-height schlicht unlesbar war. Statt die ~60 Zuweisungen an
// infoPanel.innerHTML einzeln anzufassen, beobachtet ein MutationObserver den
// Inhalt und schaltet das Panel nur bei echtem Überlauf scrollbar
// (.is-scrollable, siehe css/game.css).
(function initInfoPanelScrollWatch() {
    if (!infoPanel) return;

    function syncEndState() {
        // 1px Toleranz: scrollTop ist fraktional, sobald der Zoom nicht 100% ist
        const atEnd = infoPanel.scrollHeight - infoPanel.scrollTop - infoPanel.clientHeight <= 1;
        infoPanel.classList.toggle('is-at-end', atEnd);
    }

    function syncOverflow() {
        const overflows = infoPanel.scrollHeight > infoPanel.clientHeight + 1;
        infoPanel.classList.toggle('is-scrollable', overflows);
        if (overflows) syncEndState();
        else infoPanel.classList.remove('is-at-end');
    }

    // Neuer Text → immer oben beginnen, sonst hängt das Panel im alten Scrollstand
    new MutationObserver(() => { infoPanel.scrollTop = 0; syncOverflow(); })
        .observe(infoPanel, { childList: true, subtree: true, characterData: true });

    infoPanel.addEventListener('scroll', syncEndState, { passive: true });
    window.addEventListener('resize', syncOverflow);
    syncOverflow();
})();

