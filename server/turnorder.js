// ── Zug-Weitergabe prüfen ─────────────────────────────────────────────────────
// Der Client rechnet den nächsten Spieler selbst aus (js/input.js doEndTurn /
// confirmSurrender: cp++ und dabei tote Spieler überspringen) und schickt das
// Ergebnis als `next_slot` mit. Der Server prüfte bisher nur, DASS der
// Absender am Zug ist — nicht, an wen er weitergibt.
//
// Das reichte nicht (Bugfix Sept 2026, Dannys Meldung): scheiterte der Upload
// eines Zuges, blieb im Browser der bereits weitergedrehte Zustand stehen und
// war bedienbar (siehe submitTurnToServer, js/input.js). Ein zweites "Zug
// beenden" hätte dann den fremd gespielten Zug hochgeladen — mit dem eigenen
// Slot noch als current_slot, also formal gültig. Der übersprungene Spieler
// hätte seinen Zug nie bekommen und stattdessen die Folgen fremder Befehle
// vorgefunden.
//
// Regel: erlaubt ist genau der nächste Spieler in der Sitzordnung; überspringen
// darf man nur TOTE Slots. `nextSlot === fromSlot` ist zulässig, wenn alle
// anderen tot sind (letzter Überlebender). Ebenfalls zulässig ist ein toter
// `nextSlot` selbst: stirbt der neue aktive Spieler noch im selben Zugende an
// einem Brand-Tick (js/input.js), zeigt cp auf ihn — das räumt die
// Eliminierungs-Nachbereitung in routes/games.js hinterher auf.
function isValidHandover(state, fromSlot, nextSlot) {
    if (!state || !Array.isArray(state.p)) return true;   // unlesbar -> nicht blockieren
    const n = state.p.length;
    if (!Number.isInteger(n) || n < 1) return true;
    if (!Number.isInteger(fromSlot) || fromSlot < 0 || fromSlot >= n) return true;
    if (!Number.isInteger(nextSlot) || nextSlot < 0 || nextSlot >= n) return false;

    let slot = fromSlot;
    for (let guard = 0; guard < n; guard++) {
        slot = (slot + 1) % n;
        if (slot === nextSlot) return true;
        // Übersprungen werden darf nur, wer tot ist.
        if (state.p[slot] && state.p[slot].dead === 1) continue;
        return false;
    }
    return false;
}

module.exports = { isValidHandover };
