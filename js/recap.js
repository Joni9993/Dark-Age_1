// === RÜCKBLICK (Recap) ===
//
// Was seit dem eigenen letzten Zug passiert ist. Ersetzt das alte
// Kino-Playback aus bootGame() (js/main.js), das dauerhaft deaktiviert war,
// weil es in der Praxis nicht funktioniert hat:
//
//   · es lief BLOCKIEREND — 1200 ms je Aktion, ohne Abbruch, und riss die
//     Kamera dabei quer über die Karte; bei einem vollen Gegnerzug waren das
//     zwanzig Sekunden Zwangskino, während der Spieler schon klicken wollte.
//   · es zeigte NUR DEN UNMITTELBAR VORHERIGEN ZUG: gameState.la wurde in
//     doEndTurn komplett überschrieben, also sah man bei 3+ Spielern die Züge
//     aller anderen Spieler nie.
//   · es war INHALTSLEER — ein einzelnes Glyph über einem Hex, ohne wer, ohne
//     was, ohne Bezug zum eigenen Besitz.
//   · es war EINMALIG — einmal weggeklickt (jeder Canvas-Klick setzte
//     showRecap auf false) war die Information für immer weg.
//
// Ersatz: ein nicht-blockierendes, wieder aufrufbares Panel. Der Log läuft
// jetzt über die ganze Runde (siehe recapAppendTurn), die Aktionen werden nach
// Spieler und Art zusammengefasst, Treffer auf eigenen Besitz stehen oben, und
// die Kamera bewegt sich ausschließlich, wenn der Spieler eine Zeile antippt.
//
// Der obere Teil dieser Datei (bis "=== PANEL ===") ist bewusst DOM-frei —
// maptest/verify_recap.js lädt ihn in Node und testet die Regeln direkt.

// Obergrenze für den mitgeführten Log. Ein voller Zug sind je nach Spieler
// ~5-25 Einträge; bei 6 Spielern deckt der Deckel eine komplette Runde ab und
// hält den state_blob klein (die Einträge sind das Einzige in gameState, das
// mit der Spielerzahl statt mit der Kartengröße wächst).
const RECAP_LOG_CAP = 180;

// Aktionsarten, die als Übergriff auf eigenen Besitz gelten dürfen. Eine
// Bewegung neben mein Dorf ist kein "betrifft dich" — ein Angriff darauf schon.
const RECAP_HOSTILE = ['atk', 'cap', 'collapse', 'detonate', 'dynamite', 'chamber', 'creatureAtk'];

// kind → { ic (js/icons.js), k (Farbklasse, siehe css/game.css .rc-k-*),
//          one/many (Beschriftung), prio (Sortierung innerhalb eines Spielers) }
// Unbekannte Arten (alte Blobs, künftige Features) fallen auf RECAP_FALLBACK.
const RECAP_KINDS = {
    atk:         { ic: 'sword',      k: 'fire',  one: 'Angriff',                    many: n => `${n} Angriffe`,                    prio: 0 },
    creatureAtk: { ic: 'blood',      k: 'fire',  one: 'Kreatur greift an',          many: n => `${n} Kreaturangriffe`,             prio: 0 },
    cap:         { ic: 'village',    k: 'gold',  one: 'Dorf erobert',               many: n => `${n} Dörfer erobert`,              prio: 1 },
    collapse:    { ic: 'boom',       k: 'fire',  one: 'Stollen gesprengt',          many: n => `${n}× Stollen gesprengt`,          prio: 1 },
    detonate:    { ic: 'boom',       k: 'fire',  one: 'Ladung gezündet',            many: n => `${n} Ladungen gezündet`,           prio: 1 },
    dynamite:    { ic: 'dynamite',   k: 'fire',  one: 'Dynamit gelegt',             many: n => `${n}× Dynamit gelegt`,             prio: 1 },
    chamber:     { ic: 'dynamite',   k: 'fire',  one: 'Sprengkammer angelegt',      many: n => `${n} Sprengkammern angelegt`,      prio: 1 },
    erschl:      { ic: 'hex',        k: 'gold',  one: 'Herz der Tiefe erschlossen', many: n => `${n}× am Herz der Tiefe`,          prio: 1 },
    wormdeath:   { ic: 'skull',      k: 'earth', one: 'Der Alte Wurm ist gefallen', many: n => `${n}× Alter Wurm gefallen`,        prio: 1 },
    buy:         { ic: 'users',      k: 'gold',  one: 'Einheit ausgehoben',         many: n => `${n} Einheiten ausgehoben`,        prio: 2 },
    tower:       { ic: 'tower',      k: 'build', one: 'Turm errichtet',             many: n => `${n} Türme errichtet`,             prio: 3 },
    wall:        { ic: 'wall',       k: 'build', one: 'Palisade errichtet',         many: n => `${n} Palisaden errichtet`,         prio: 3 },
    tunnel:      { ic: 'tunnel',     k: 'build', one: 'Tunnel begonnen',            many: n => `${n} Tunnel begonnen`,             prio: 3 },
    loot:        { ic: 'urn',        k: 'gold',  one: 'Fundkammer geplündert',      many: n => `${n} Fundkammern geplündert`,      prio: 3 },
    relicbuy:    { ic: 'urn',        k: 'gold',  one: 'Reliquie erworben',          many: n => `${n} Reliquien erworben`,          prio: 3 },
    relicuse:    { ic: 'urn',        k: 'gold',  one: 'Reliquie eingesetzt',        many: n => `${n} Reliquien eingesetzt`,        prio: 3 },
    trade:       { ic: 'scales',     k: 'gold',  one: 'Handel getrieben',           many: n => `${n}× Handel getrieben`,           prio: 4 },
    mine:        { ic: 'crystal',    k: 'earth', one: 'Kristallader angebrochen',   many: n => `${n} Kristalladern angebrochen`,   prio: 4 },
    deliver:     { ic: 'crystal',    k: 'gold',  one: 'Kristalle abgeliefert',      many: n => `${n}× Kristalle abgeliefert`,      prio: 4 },
    pickup:      { ic: 'crystal',    k: 'earth', one: 'Kristalle aufgenommen',      many: n => `${n}× Kristalle aufgenommen`,      prio: 4 },
    dig:         { ic: 'pick',       k: 'earth', one: 'Stollen gegraben',           many: n => `${n} Felder gegraben`,             prio: 5 },
    asc:         { ic: 'arrow-up',   k: 'earth', one: 'Aufgestiegen',               many: n => `${n}× aufgestiegen`,               prio: 5 },
    desc:        { ic: 'arrow-down', k: 'earth', one: 'Abgetaucht',                 many: n => `${n}× abgetaucht`,                 prio: 5 },
    jump:        { ic: 'jump',       k: 'earth', one: 'Durch den Stollen gesprungen', many: n => `${n} Stollensprünge`,            prio: 5 },
    mv:          { ic: 'move',       k: 'move',  one: 'Bewegung',                   many: n => `${n} Bewegungen`,                  prio: 6 }
};
const RECAP_FALLBACK = { ic: 'hex', k: 'move', one: 'Aktion', many: n => `${n} Aktionen`, prio: 7 };

function recapKind(t) { return RECAP_KINDS[t] || RECAP_FALLBACK; }

// --- Log-Pflege -----------------------------------------------------------
// Wird am Zugende aufgerufen (js/input.js: doEndTurn, confirmSurrender) und
// hängt die Aktionen des gerade beendeten Zuges an den laufenden Log an, statt
// ihn zu überschreiben.
//
// Selbst-Beschneidung: sobald Spieler `pid` wieder am Zug war, haben ihn alle
// anderen Spieler zwischenzeitlich gesehen — seine alten Einträge dürfen weg.
// Damit enthält der Log immer genau "alles seit dem letzten Zug des Spielers,
// der als Nächstes dran ist", ohne einen zusätzlichen Rundenzähler im State.
// Einträge ohne `p` stammen aus Blobs von vor dieser Änderung und fallen beim
// ersten Zugende einmalig heraus (Migration, kein Sonderfall im Leser).
function recapAppendTurn(state, pid, actions) {
    actions.forEach(a => {
        a.p = pid;
        // Default-Löschung wie überall vor dem Komprimieren (js/input.js):
        // vo === -1 heißt "war neutral" und trägt keine Information.
        if (a.vo === -1) delete a.vo;
        // fx/fy (Herkunftsfeld) hatte genau EINEN Leser: die Angriffs-Animation
        // des alten Kino-Playbacks. Die ist weg, das Panel arbeitet mit dem
        // Zielfeld. Die Felder hier zentral zu streichen ist billiger als sie an
        // den ~10 turnActions.push-Stellen einzeln zu entfernen — und sie sind
        // ein Drittel des Logs, der seit der Rundenmitführung sechsmal so viele
        // Einträge trägt wie vorher. Wer sie wiederbelebt, streicht diese Zeilen.
        delete a.fx; delete a.fy;
    });
    const kept = (state.la || []).filter(a => a.p !== undefined && a.p !== pid);
    state.la = kept.concat(actions).slice(-RECAP_LOG_CAP);
    return state.la;
}

// --- Sichtbarkeit ---------------------------------------------------------
// Dieselbe Fog-Regel wie bisher (M13): `global` immer, `uw` über das
// Unterwelt-Netz, sonst Oberflächensicht — unsichtbare Aktionen werden ganz
// weggelassen statt anonymisiert, sonst wäre allein ihre Existenz ein Leak.
// NEU: eigene Aktionen fliegen raus; ein Rückblick auf den eigenen Zug ist
// keine Information (und der Log führt sie bis zum eigenen Zugende noch mit).
// Die Sichtmengen werden einmal berechnet und nicht mehr je Eintrag — der alte
// Filter rief getVisibleHexes pro Aktion auf.
function recapVisibleActions(state, viewerId) {
    let visSurface = null, visUW = null;
    // Getarnte fremde Einheit steht JETZT auf dem Feld: dann fällt der Eintrag
    // weg, sonst verrät der Rückblick ihre Position (Regel kam ursprünglich aus
    // den beiden Renderern und gilt jetzt für Karte und Panel gleichermaßen).
    const hidden = (list, a) => (list || []).some(u => u.p !== viewerId && u.iv === 1 && u.x === a.x && u.y === a.y);
    return (state.la || []).filter(a => {
        if (a.p === viewerId) return false;
        if (a.global) return true;
        if (a.uw) {
            if (!visUW) visUW = getVisibleUWHexes(viewerId);
            if (!visUW.has(`${a.x},${a.y}`)) return false;
            return !hidden(state.uw && state.uw.u, a);
        }
        if (!visSurface) visSurface = getVisibleHexes(viewerId);
        if (!visSurface.has(`${a.x},${a.y}`)) return false;
        return !hidden(state.u, a);
    });
}

// Steht auf dem Hex etwas, das mir gehört? `vo` (Vorbesitzer, nur bei 'cap')
// deckt zusätzlich den Fall ab, dass mein Dorf gerade den Besitzer gewechselt
// hat — dann steht dort nichts Eigenes mehr, es ist aber die wichtigste
// Meldung der ganzen Runde.
function recapTouchesViewer(state, a, viewerId) {
    if (a.vo === viewerId) return true;
    if (RECAP_HOSTILE.indexOf(a.t) === -1) return false;
    const key = `${a.x},${a.y}`;
    if (state.v && state.v[key] === viewerId) return true;
    const me = state.p && state.p[viewerId];
    if (me && me.sv === key) return true;
    if ((state.u || []).some(u => u.p === viewerId && u.x === a.x && u.y === a.y)) return true;
    if ((state.wa || []).some(w => w.o === viewerId && w.x === a.x && w.y === a.y)) return true;
    if ((state.tw || []).some(t => t.o === viewerId && t.x === a.x && t.y === a.y)) return true;
    if ((state.tu || []).some(t => t.o === viewerId &&
        ((t.x1 === a.x && t.y1 === a.y) || (t.x2 === a.x && t.y2 === a.y)))) return true;
    if (state.uw && (state.uw.u || []).some(u => u.p === viewerId && u.x === a.x && u.y === a.y)) return true;
    return false;
}

// --- Verdichtung ----------------------------------------------------------
// Rohlog → Gruppen je Spieler, darin Zeilen je Aktionsart. Eine Zeile trägt
// ihre Hex-Liste mit, damit das Panel beim Antippen durchsteppen kann.
// Sortierung: Spieler, die mich angefasst haben, zuerst; innerhalb eines
// Spielers erst die Treffer, dann nach prio (Kampf vor Bewegung).
function buildRecapGroups(state, viewerId) {
    const groups = new Map();
    recapVisibleActions(state, viewerId).forEach(a => {
        const pid = a.p === undefined ? -1 : a.p;
        if (!groups.has(pid)) groups.set(pid, { pid, hits: 0, total: 0, rows: new Map() });
        const g = groups.get(pid);
        const hit = recapTouchesViewer(state, a, viewerId);
        // Treffer und Nicht-Treffer derselben Art bleiben getrennte Zeilen —
        // "2 Angriffe" und "Angriff · trifft dich" sind verschiedene Meldungen.
        const rowKey = a.t + (hit ? '!' : '');
        if (!g.rows.has(rowKey)) g.rows.set(rowKey, { t: a.t, hit, hexes: [] });
        g.rows.get(rowKey).hexes.push({ x: a.x, y: a.y, uw: !!a.uw });
        g.total++;
        if (hit) g.hits++;
    });

    const out = [];
    groups.forEach(g => {
        const rows = [...g.rows.values()].map(r => {
            const kd = recapKind(r.t);
            return {
                t: r.t, hit: r.hit, hexes: r.hexes, ic: kd.ic, k: kd.k,
                label: r.hexes.length === 1 ? kd.one : kd.many(r.hexes.length),
                prio: kd.prio
            };
        });
        rows.sort((a, b) => (b.hit - a.hit) || (a.prio - b.prio) || a.t.localeCompare(b.t));
        const pl = g.pid >= 0 && state.p ? state.p[g.pid] : null;
        out.push({
            pid: g.pid, hits: g.hits, total: g.total, rows,
            name: pl ? pl.n : 'Die Tiefe',
            // -1 = Kreaturen/Weltereignisse: keine Spielerfarbe, sondern Stein.
            color: (g.pid >= 0 && typeof playerColors !== 'undefined')
                ? playerColors[g.pid % playerColors.length] : '#7d838f'
        });
    });
    out.sort((a, b) => (b.hits - a.hits) || (a.pid - b.pid));
    return out;
}

// =========================== PANEL (DOM) ==================================
// Ab hier DOM-gebunden. Alles darüber ist in Node testbar.
if (typeof document !== 'undefined') (function () {

    let recapGroups = [];
    let recapOpen = false;
    // Zeile → welches ihrer Hexes beim nächsten Tippen angesteuert wird.
    // Wiederholtes Tippen läuft die Liste durch, statt immer aufs erste Hex zu
    // springen — so kommt man an alle drei Angriffe, nicht nur an den ersten.
    let recapCursors = {};

    function el(id) { return document.getElementById(id); }

    // Wer schaut zu? gameState.cp ist die richtige Antwort — auch für einen
    // wartenden Spieler im Servermodus, denn openGame (js/lobby.js) setzt cp
    // dort bereits auf den eigenen Slot, damit jeder seinen EIGENEN Fog sieht.
    // Der Rückblick erbt diese Regel und braucht keine zweite Slot-Logik.
    //
    // Ausnahme Zuschauer (ausgeschieden): dort bleibt cp der aktive Spieler und
    // die Karte ist ohnehin komplett aufgedeckt — ein "seit deinem letzten Zug"
    // hat für ihn weder Bedeutung noch eine eigene Sicht, auf die es sich
    // beziehen könnte. Also gar kein Rückblick statt einem falschen.
    function recapViewerId() {
        if (!gameState) return -1;
        if (typeof isSpectator !== 'undefined' && isSpectator) return -1;
        return gameState.cp;
    }

    function refreshRecapButton() {
        const btn = el('recap-btn');
        if (!btn) return;
        const n = recapGroups.reduce((s, g) => s + g.total, 0);
        const hits = recapGroups.reduce((s, g) => s + g.hits, 0);
        btn.style.display = n > 0 ? 'flex' : 'none';
        btn.classList.toggle('has-hit', hits > 0);
        const cnt = el('recap-btn-count');
        if (cnt) cnt.textContent = n > 99 ? '99+' : String(n);
    }

    function escapeRecap(s) {
        return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function renderRecapPanel() {
        const body = el('recap-body');
        if (!body) return;
        if (recapGroups.length === 0) {
            body.innerHTML = '<div class="recap-empty">Seit deinem letzten Zug ist in deinem Sichtfeld nichts passiert.</div>';
            return;
        }
        let html = '';
        recapGroups.forEach((g, gi) => {
            html += `<div class="recap-group${g.hits ? ' has-hit' : ''}">`;
            html += `<div class="recap-name"><span class="score-dot" style="background:${g.color}"></span>${escapeRecap(g.name)}</div>`;
            g.rows.forEach((r, ri) => {
                const step = r.hexes.length > 1 ? `<span class="recap-step">1/${r.hexes.length}</span>` : '';
                html += `<button class="recap-row rc-k-${r.k}${r.hit ? ' hit' : ''}" data-g="${gi}" data-r="${ri}">`
                    + `<span class="recap-ic">${icon(r.ic, 'ic-14')}</span>`
                    + `<span class="recap-label">${escapeRecap(r.label)}${r.hit ? '<b> · trifft dich</b>' : ''}</span>`
                    + step
                    + `</button>`;
            });
            html += '</div>';
        });
        body.innerHTML = html;
        body.querySelectorAll('.recap-row').forEach(btn => {
            btn.addEventListener('click', () => jumpToRecapRow(+btn.dataset.g, +btn.dataset.r, btn));
        });
    }

    // Kamerafahrt nur auf ausdrückliches Antippen — das ist der Kern des
    // Umbaus gegenüber dem alten Zwangs-Playback.
    function jumpToRecapRow(gi, ri, btn) {
        const row = recapGroups[gi] && recapGroups[gi].rows[ri];
        if (!row || row.hexes.length === 0) return;
        const key = gi + ':' + ri;
        const idx = (recapCursors[key] || 0) % row.hexes.length;
        recapCursors[key] = idx + 1;
        const h = row.hexes[idx];
        Renderer.centerOn(h.x, h.y, 1.0);
        renderBoard(gameState);
        spawnFloatingText(h.x, h.y, '◆', recapPulseColor(row.k));
        const step = btn && btn.querySelector('.recap-step');
        if (step) step.textContent = `${idx + 1}/${row.hexes.length}`;
    }

    // Farben für den Karten-Puls kommen aus denselben CSS-Tokens wie die
    // Panelzeilen (kein zweiter, per Hand gepflegter Farbsatz im JS — vgl. die
    // Regel gegen Inline-Materialfarben in CLAUDE.md).
    function recapPulseColor(k) {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--rc-' + k);
        return (v && v.trim()) || '#cabe98';
    }

    function openRecap() {
        const panel = el('recap-panel');
        if (!panel) return;
        renderRecapPanel();
        panel.classList.add('open');
        recapOpen = true;
        showRecap = true;             // Karten-Marker (js/render.js/render3d.js)
        if (gameState) renderBoard(gameState);
    }

    function closeRecap() {
        const panel = el('recap-panel');
        if (panel) panel.classList.remove('open');
        if (!recapOpen) return;
        recapOpen = false;
        showRecap = false;
        if (gameState) renderBoard(gameState);
    }

    // Zugstart (js/main.js): Gruppen bauen, Knopf setzen, Panel nur öffnen,
    // wenn es überhaupt etwas zu berichten gibt. Blockiert nichts — Ereignis-
    // und Diplomatie-Overlays laufen daneben weiter und liegen darüber.
    function prepareRecap() {
        closeRecap();     // Reste aus der vorherigen Partie/dem vorherigen Zug
        const viewer = recapViewerId();
        recapGroups = (viewer < 0 || !gameState) ? [] : buildRecapGroups(gameState, viewer);
        recapCursors = {};
        refreshRecapButton();
        showRecap = false;
        if (recapGroups.length > 0) openRecap();
    }

    window.openRecap = openRecap;
    window.closeRecap = closeRecap;
    window.toggleRecap = function () { recapOpen ? closeRecap() : openRecap(); };
    window.prepareRecap = prepareRecap;
    window.isRecapOpen = function () { return recapOpen; };
})();
