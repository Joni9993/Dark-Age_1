// ── Sitzplatz-Vergabe beim Spielstart ────────────────────────────────────────
//
// Bis Aug 2026 bekam der Host beim Anlegen der Lobby fest Slot 0 und alle
// weiteren Spieler der Reihe nach die folgenden Slots. Slot 0 ist immer zuerst
// am Zug — der Host war also in jeder Partie Startspieler (in allen 49
// auswertbaren 1v1-Partien der Datenbank). Ein Rating-System würde einen daraus
// entstehenden Startvorteil dem Host als Spielstärke gutschreiben, deshalb
// werden die Sitzplätze beim Start gemischt.
//
// Was dabei zur PERSON gehört, ist einzig der Anzeigename `p[i].n`. Alles andere
// in `state.p[i]` (Startdorf `sv`, Sicht `e`, Ressourcen, Team-Zuordnung `al`)
// gehört zum SITZPLATZ und bleibt, wo es ist — die Startpositionen sind über
// mapgen bereits fair verteilt, gemischt wird nur, wer auf welchem sitzt.

const LZString = require('lz-string');

// seats: [{ slot, profile_id, username }], aufsteigend nach slot.
// Gibt den neuen State-Blob und die neue Slot-Belegung zurück.
// rng ist injizierbar, damit der Test deterministisch permutieren kann.
function shuffleSeats(seats, stateBlob, rng = Math.random) {
    if (!Array.isArray(seats) || seats.length < 2) {
        return { blob: stateBlob, assignments: (seats || []).map(s => ({ slot: s.slot, profile_id: s.profile_id })) };
    }

    // Fisher-Yates über die Profile; perm[i] sitzt danach auf seats[i].slot.
    const perm = seats.map(s => s.profile_id);
    for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
    }

    const state = JSON.parse(LZString.decompressFromEncodedURIComponent(stateBlob));
    if (!state || !Array.isArray(state.p)) {
        throw new Error('State-Blob enthält keine Spielerliste');
    }

    const nameOf = new Map(seats.map(s => [s.profile_id, s.username]));
    seats.forEach((seat, i) => {
        if (state.p[seat.slot]) state.p[seat.slot].n = nameOf.get(perm[i]);
    });

    return {
        blob: LZString.compressToEncodedURIComponent(JSON.stringify(state)),
        assignments: seats.map((seat, i) => ({ slot: seat.slot, profile_id: perm[i] }))
    };
}

module.exports = { shuffleSeats };
