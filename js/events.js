// === EVENT SYSTEM ===
const gameEvents = [
    { icon: '☠️', name: 'Pest', desc: 'Eine Seuche breitet sich aus! Alle Einheiten verlieren 1 HP.', effect: (gs) => { gs.u.forEach(u => { u.h = Math.max(1, u.h - 1); }); } },
    { icon: '💰', name: 'Goldrausch', desc: 'Reiche Goldadern entdeckt! Alle Spieler erhalten +5 Gold.', effect: (gs) => { gs.p.forEach(p => { if (!p.dead) p.g += 5; }); } },
    { icon: '🌲', name: 'Reiche Ernte', desc: 'Die Wälder blühen! Alle Spieler erhalten +3 Holz.', effect: (gs) => { gs.p.forEach(p => { if (!p.dead) p.m += 3; }); } },
    { icon: '⚔️', name: 'Kriegslust', desc: 'Ein Hauch von Aggression liegt in der Luft! Alle Einheiten erhalten +2 HP.', effect: (gs) => { gs.u.forEach(u => { const max = getUnitMaxHp(gs.p[u.p], u.t, u); u.h = Math.min(max + 2, u.h + 2); }); } },
    { icon: '🌑', name: 'Finstere Nacht', desc: 'Dunkelheit verschlingt das Land. Sichtweite reduziert für diese Runde.', effect: (gs) => { /* thematic, no mechanical effect */ } },
    { icon: '🏰', name: 'Befestigung', desc: 'Die Dörfer werden verstärkt! Alle Hauptgebäude heilen +5 HP.', effect: (gs) => { gs.p.forEach(p => { if (!p.dead) p.sh = Math.min(30, p.sh + 5); }); } }
];

function checkForEvent() {
    if (!gameState || gameState.rn < 3) return null;
    const eventRng = createPRNG(gameState.sd + gameState.rn * 7);
    if (eventRng() > 0.3) return null;
    const idx = Math.floor(eventRng() * gameEvents.length);
    return gameEvents[idx];
}

function showEvent(evt) {
    pendingEvent = evt;
    eventIcon.textContent = evt.icon;
    eventTitle.textContent = evt.name;
    eventDesc.textContent = evt.desc;
    eventOverlay.style.display = 'flex';
}

window.dismissEvent = function () {
    if (pendingEvent) {
        pendingEvent = null;
    }
    eventOverlay.style.display = 'none';
    renderBoard(gameState);
};
