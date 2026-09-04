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
const RECAP_HOSTILE = ['atk', 'cap', 'collapse', 'detonate', 'dynamite', 'chamber'];

// kind → { ic (js/icons.js), k (Farbklasse, siehe css/game.css .rc-k-*),
//          one/many (Beschriftung ohne Einheit), prio (Sortierung),
//          vb (Verbform MIT Einheit: "Pferd bewegt") }
//
// `vb` steht bewusst in der Einzahl und die Anzahl hängt als "×3" rechts an der
// Zeile, statt in den Text eingebaut zu werden: im Deutschen müssten sonst
// Artikel und Verb mitgebeugt werden ("2× Arbeiter gräbt"), und für jede neue
// Aktionsart käme eine weitere Grammatikfalle dazu. Kinds ohne `vb` (oder
// Einträge ohne Einheitentyp, z.B. aus alten Blobs) nutzen weiter one/many.
// Unbekannte Arten fallen auf RECAP_FALLBACK.
const RECAP_KINDS = {
    atk:         { ic: 'sword',      k: 'fire',  one: 'Angriff',                    many: n => `${n} Angriffe`,                    prio: 0 },
    surrender:   { ic: 'flag',       k: 'fire',  one: 'Hat aufgegeben',             many: n => `${n}× aufgegeben`,                 prio: 0 },
    cap:         { ic: 'village',    k: 'gold',  one: 'Dorf erobert',               many: n => `${n} Dörfer erobert`,              prio: 1, vb: 'erobert ein Dorf' },
    deploy:      { ic: 'shield',     k: 'build', one: 'Wagenburg umgestellt',       many: n => `${n}× Wagenburg umgestellt`,       prio: 3, vb: 'stellt um' },
    collapse:    { ic: 'boom',       k: 'fire',  one: 'Stollen gesprengt',          many: n => `${n}× Stollen gesprengt`,          prio: 1, vb: 'sprengt den Stollen' },
    detonate:    { ic: 'boom',       k: 'fire',  one: 'Ladung gezündet',            many: n => `${n} Ladungen gezündet`,           prio: 1 },
    dynamite:    { ic: 'dynamite',   k: 'fire',  one: 'Dynamit gelegt',             many: n => `${n}× Dynamit gelegt`,             prio: 1 },
    chamber:     { ic: 'dynamite',   k: 'fire',  one: 'Sprengkammer angelegt',      many: n => `${n} Sprengkammern angelegt`,      prio: 1 },
    erschl:      { ic: 'hex',        k: 'gold',  one: 'Herz der Tiefe erschlossen', many: n => `${n}× am Herz der Tiefe`,          prio: 1 },
    wormdeath:   { ic: 'skull',      k: 'earth', one: 'Der Alte Wurm ist gefallen', many: n => `${n}× Alter Wurm gefallen`,        prio: 1 },
    buy:         { ic: 'users',      k: 'gold',  one: 'Einheit ausgehoben',         many: n => `${n} Einheiten ausgehoben`,        prio: 2, vb: 'ausgehoben' },
    tower:       { ic: 'tower',      k: 'build', one: 'Turm errichtet',             many: n => `${n} Türme errichtet`,             prio: 3, vb: 'errichtet einen Turm' },
    wall:        { ic: 'wall',       k: 'build', one: 'Palisade errichtet',         many: n => `${n} Palisaden errichtet`,         prio: 3, vb: 'errichtet eine Palisade' },
    tunnel:      { ic: 'tunnel',     k: 'build', one: 'Tunnel begonnen',            many: n => `${n} Tunnel begonnen`,             prio: 3, vb: 'beginnt einen Tunnel' },
    loot:        { ic: 'urn',        k: 'gold',  one: 'Fundkammer geplündert',      many: n => `${n} Fundkammern geplündert`,      prio: 3 },
    relicbuy:    { ic: 'urn',        k: 'gold',  one: 'Reliquie erworben',          many: n => `${n} Reliquien erworben`,          prio: 3 },
    relicuse:    { ic: 'urn',        k: 'gold',  one: 'Reliquie eingesetzt',        many: n => `${n} Reliquien eingesetzt`,        prio: 3 },
    trade:       { ic: 'scales',     k: 'gold',  one: 'Handel getrieben',           many: n => `${n}× Handel getrieben`,           prio: 4 },
    mine:        { ic: 'crystal',    k: 'earth', one: 'Kristallader angebrochen',   many: n => `${n} Kristalladern angebrochen`,   prio: 4 },
    deliver:     { ic: 'crystal',    k: 'gold',  one: 'Kristalle abgeliefert',      many: n => `${n}× Kristalle abgeliefert`,      prio: 4 },
    pickup:      { ic: 'crystal',    k: 'earth', one: 'Kristalle aufgenommen',      many: n => `${n}× Kristalle aufgenommen`,      prio: 4 },
    dig:         { ic: 'pick',       k: 'earth', one: 'Stollen gegraben',           many: n => `${n} Felder gegraben`,             prio: 5, vb: 'gräbt' },
    asc:         { ic: 'arrow-up',   k: 'earth', one: 'Aufgestiegen',               many: n => `${n}× aufgestiegen`,               prio: 5, vb: 'steigt auf' },
    desc:        { ic: 'arrow-down', k: 'earth', one: 'Abgetaucht',                 many: n => `${n}× abgetaucht`,                 prio: 5, vb: 'taucht ab' },
    jump:        { ic: 'jump',       k: 'earth', one: 'Durch den Stollen gesprungen', many: n => `${n} Stollensprünge`,            prio: 5, vb: 'springt durch den Stollen' },
    mv:          { ic: 'move',       k: 'move',  one: 'Bewegung',                   many: n => `${n} Bewegungen`,                  prio: 6, vb: 'bewegt' }
};
const RECAP_FALLBACK = { ic: 'hex', k: 'move', one: 'Aktion', many: n => `${n} Aktionen`, prio: 7 };

function recapKind(t) { return RECAP_KINDS[t] || RECAP_FALLBACK; }

// Gehoert der Eintrag ueberhaupt noch in den Rueckblick?
//
// Zwei Faelle, die beide aus laufenden Partien kommen, deren Blob aelter ist als
// der aktuelle Code:
//   · **Unbekannte Aktionsart.** Fruehere Versionen haben Arten protokolliert,
//     die es heute nicht mehr gibt (`creatureAtk`). Ohne diesen Filter landen sie
//     auf RECAP_FALLBACK und stehen als nichtssagendes "2 Aktionen" im Panel —
//     eine Zeile, die nichts aussagt, ist schlechter als gar keine. Dass keine
//     AKTUELL erzeugte Art hier durchfaellt, sichert maptest/verify_recap.js (g)
//     ab; der Fallback ist damit reine Verteidigung, keine Anzeigelogik.
//   · **Kein gueltiger Urheber.** `p: -1` (Kreaturen) und fehlendes `p` (Blobs von
//     vor der Urheber-Stempelung) wurden von der Selbst-Beschneidung in
//     recapAppendTurn nie erfasst — sie waeren bis zum Erreichen von
//     RECAP_LOG_CAP im Log haengen geblieben.
function recapEntryUsable(state, a) {
    if (!RECAP_KINDS[a.t]) return false;
    return typeof a.p === 'number' && a.p >= 0 && a.p < ((state.p && state.p.length) || 0);
}

// --- Flaechenschaden -------------------------------------------------------
// Feuersturm, Stampede, Tribok-Salve, Rundumschlag und die Saboteur-Detonation
// treffen mehrere Ziele auf einmal. Frueher stand dafuer EIN Eintrag auf dem
// Mittelpunkt, aus dem das Panel nur "Elefant greift an" machen konnte — wer
// getroffen wurde und wie hart, war nicht rekonstruierbar.
//
// Loesung: **je getroffenem Ziel ein eigener Eintrag, auf DESSEN Feld**. Das
// bringt drei Dinge geschenkt, die eine Sammel-Zeile mit Opferliste alle
// einzeln haette nachbauen muessen:
//   · die normale Fog-Regel greift je Ziel (ein Treffer, den ich nicht sehen
//     kann, taucht auch nicht auf),
//   · "trifft dich" und die Karten-Hervorhebung sitzen auf dem richtigen Feld,
//   · die Angriffszeile ist dieselbe wie bei einem Einzelangriff.
//
// Trifft die Faehigkeit nichts, bleibt ein Eintrag auf dem Mittelpunkt uebrig,
// damit "Bombenballon greift an" nicht ganz verschwindet.
//
// `attacker` ist {au: <Einheitentyp>} oder {ab: 'tower'}.
// Aufruf-Muster an den Faehigkeiten: Sammler anlegen, bei JEDEM Schadensblock
// die passende Methode direkt nach dem `h -= dmg` aufrufen (dann stimmt das
// Kill-Flag), am Ende flush().
function recapAoE(attacker) {
    const v = [];
    const kl = obj => (obj && obj.h <= 0) ? 1 : undefined;
    return {
        unit(u, dm) { v.push({ x: u.x, y: u.y, vk: 'unit', vt: u.t, vp: u.p, dm, kl: kl(u) }); },
        wall(w, dm) { v.push({ x: w.x, y: w.y, vk: 'wall', vp: w.o, dm, kl: kl(w) }); },
        tower(t, dm) { v.push({ x: t.x, y: t.y, vk: 'tower', vp: t.o, dm, kl: kl(t) }); },
        // Tunnel und Hauptgebaeude liegen nicht auf "ihrem" Objekt-Hex bzw. haben
        // zwei Enden — das getroffene Feld kommt deshalb vom Aufrufer.
        tunnel(t, x, y, dm) { v.push({ x, y, vk: 'tunnel', vp: t.o, dm, kl: kl(t) }); },
        building(pid, x, y, dm, dead) { v.push({ x, y, vk: 'building', vp: pid, dm, kl: dead ? 1 : undefined }); },
        flush(actions, cx, cy, extra) {
            if (v.length === 0) {
                actions.push(Object.assign({ x: cx, y: cy, t: 'atk' }, attacker, extra));
            } else {
                v.forEach(hit => actions.push(Object.assign({ t: 'atk' }, attacker, hit, extra)));
            }
            return v.length;
        }
    };
}

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
        // des alten Kino-Playbacks. Die Push-Stellen sind mit umgestellt worden;
        // das Löschen hier fängt nur noch laufende Partien ab, deren Blob die
        // Felder schon trägt. Wer sie wiederbelebt, streicht diese Zeile.
        delete a.fx; delete a.fy;
    });
    // Behalten wird nur, was ein anderer LEBENDER Slot in dieser Runde getan hat
    // und was der aktuelle Code auch beschriften kann — damit raeumt sich der Log
    // beim naechsten Zugende von selbst auf, statt Altlasten bis zum Deckel
    // mitzuschleppen (siehe recapEntryUsable).
    const kept = (state.la || []).filter(a => a.p !== pid && recapEntryUsable(state, a));
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
    return recapVisibleActionsFrom(state.la, state, viewerId, null, null);
}

// Kern der Fog-Regel, losgelöst von WOHER die Sicht-Sets kommen: der normale
// Pfad (recapVisibleActions oben) berechnet sie live aus der aktuellen Karte;
// der Niederlage-Rückblick (finalizeDefeatLogs, s.u.) reicht stattdessen die
// beim Tod eingefrorenen Sets durch — der Sterbende hat danach keine Einheiten/
// Dörfer mehr, eine Live-Neuberechnung würde alles wegfiltern. `visSurface`/
// `visUW` als Set ODER null (dann wird bei Bedarf live berechnet, wie bisher).
function recapVisibleActionsFrom(actions, state, viewerId, visSurface, visUW) {
    // Getarnte fremde Einheit steht JETZT auf dem Feld: dann fällt der Eintrag
    // weg, sonst verrät der Rückblick ihre Position (Regel kam ursprünglich aus
    // den beiden Renderern und gilt jetzt für Karte und Panel gleichermaßen).
    const hidden = (list, a) => (list || []).some(u => u.p !== viewerId && u.iv === 1 && u.x === a.x && u.y === a.y);
    return (actions || []).filter(a => {
        if (a.p === viewerId) return false;
        // Alt-Eintraege ohne heutige Entsprechung fallen sofort raus, nicht erst
        // beim naechsten Zugende (recapAppendTurn) — sonst zeigt eine laufende
        // Partie beim ersten Laden noch einmal die alte, nichtssagende Zeile.
        if (!recapEntryUsable(state, a)) return false;
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

// Niederlage-Rückblick: beim Tod (killPlayer, js/logic.js) wird die Sicht des
// Sterbenden als _deathVis/_deathVisUW eingefroren, BEVOR seine Einheiten/
// Dörfer entfernt werden — der tödliche Angriff selbst landet aber erst hier,
// am Zugende, in state.la (recapAppendTurn ist bereits gelaufen). Wird von
// doEndTurn UND confirmSurrender aufgerufen (jeder Zug kann jemanden töten:
// Kampf, Brand-Tick, Aufgeben) — ein Aufruf für alle drei Fälle statt einer
// Sonderbehandlung je Todesursache. `defeatLog` wird nur EINMAL gesetzt (der
// Sterbende zieht nie wieder, es gibt also nur dieses eine Fenster).
//
// Der "nur einmal"-Schutz fragt bewusst nach der LÄNGE, nicht nach dem bloßen
// Vorhandensein: bootGame (js/main.js) normalisiert `defeatLog` bei jedem
// Zugstart auf `[]` für alle Spieler, und ein leeres Array ist truthy. Mit dem
// alten `|| p.defeatLog` stieg diese Funktion im echten Spiel deshalb IMMER
// sofort wieder aus — der Verlierer bekam nie ein Log, obwohl alles andere
// stimmte. Die Unit-Tests hatten es nicht gefangen, weil sie ihre States
// selbst bauen und bootGame gar nicht kennen (Sept 2026).
function finalizeDefeatLogs(state) {
    (state.p || []).forEach((p, i) => {
        if (p.dead !== 1 || !p._deathVis || (p.defeatLog && p.defeatLog.length)) return;
        const visSurface = new Set(p._deathVis);
        const visUW = new Set(p._deathVisUW || []);
        p.defeatLog = recapVisibleActionsFrom(state.la, state, i, visSurface, visUW);
        delete p._deathVis;
        delete p._deathVisUW;
    });
}

// Erschließungs-/Team-Sieg: diese Verlierer durchlaufen NIE killPlayer — sie
// gelten bewusst als "nicht besiegt", das Spiel endet nur unter ihnen weg
// (server/rating.js unterscheidet das absichtlich, eliminated bleibt FALSE).
// Trotzdem verdienen sie denselben Rückblick. Anders als finalizeDefeatLogs
// keine Zwei-Phasen-Sicht-Snapshot-Logik nötig: diese Spieler bleiben am
// Leben, ihre Einheiten/Dörfer stehen im Aufrufmoment noch, also liefert die
// normale LIVE recapVisibleActions bereits die richtige Sicht. `winners` ist
// das Array der Sieger-Spielerobjekte (teamWinners/erschlWinners/alivePlayers
// aus js/input.js, dieselbe Form wie bei showWin) — bei einer regulären
// Elimination (alivePlayers.length === 1) sind alle Nicht-Sieger ohnehin schon
// einzeln über finalizeDefeatLogs erfasst, der Aufruf hier ist dann ein no-op.
function finalizeGameEndLogs(state, winners) {
    const winnerIds = new Set((winners || []).map(w => state.p.indexOf(w)));
    (state.p || []).forEach((p, i) => {
        // Länge statt Vorhandensein — siehe finalizeDefeatLogs.
        if (p.dead === 1 || winnerIds.has(i) || (p.defeatLog && p.defeatLog.length)) return;
        p.defeatLog = recapVisibleActions(state, i);
    });
}

// Steht auf dem Hex etwas, das mir gehört? `vo` (Vorbesitzer, nur bei 'cap')
// deckt zusätzlich den Fall ab, dass mein Dorf gerade den Besitzer gewechselt
// hat — dann steht dort nichts Eigenes mehr, es ist aber die wichtigste
// Meldung der ganzen Runde.
function recapTouchesViewer(state, a, viewerId) {
    if (a.vo === viewerId) return true;
    // vp (Besitzer des Angriffsziels) ist die verlässlichere Auskunft als der
    // Blick aufs Hex — und zwar genau im wichtigsten Fall: eine ZERSTÖRTE
    // Einheit steht dort nicht mehr, ihr Verlust ist aber die Meldung, die man
    // am dringendsten sehen will. Ohne diese Zeile blieb ausgerechnet der Kill
    // unmarkiert, während der Streifschuss daneben rot war.
    if (a.vp === viewerId) return true;
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

// --- Beschriftung ---------------------------------------------------------
// Namen für Einheiten und Kreaturen. Beides liegt in js/data.js; die Funktionen
// hier sind die einzige Stelle, an der der Rückblick sie anfasst — fehlende
// Typen (alte Blobs, neue Einheiten vor dem Datenpflege-Pass) fallen auf einen
// neutralen Text zurück, statt "undefined" in die Zeile zu schreiben.
function recapUnitName(t) {
    if (t === undefined || t === null) return 'Einheit';
    const st = (typeof unitStats !== 'undefined' && unitStats) ? unitStats[t] : null;
    return (st && st.name) || 'Einheit';
}

// Wer hat angegriffen? Meist eine Einheit (`au`), es kann aber auch ein Bauwerk
// sein: der Turmschuss hat gar keine Einheit dahinter (`ab: 'tower'`).
function recapActorName(a) {
    if (a.ab === 'tower') return 'Turm';
    if (a.ab === 'fire') return 'Feuer';
    return recapUnitName(a.au);
}

function recapCreatureName(t) {
    const cs = (typeof uwCreatureStats !== 'undefined' && uwCreatureStats) ? uwCreatureStats[t] : null;
    return (cs && cs.name) || 'Kreatur';
}

// Wen hat es getroffen? `vk` (Zielart) und `vt` (Ziel-Einheitentyp) kommen aus
// executeAttackOnTarget/executeUWAttack (js/input.js). `vp === viewerId` wird zu
// "dein/deine …" — das ist die Information, wegen der man den Rückblick liest.
function recapVictimLabel(a, viewerId) {
    const mine = a.vp === viewerId;
    switch (a.vk) {
        case 'building': return mine ? 'dein Hauptgebäude' : 'Hauptgebäude';
        case 'wall':     return mine ? 'deine Palisade' : 'Palisade';
        case 'tower':    return mine ? 'deinen Turm' : 'Turm';
        case 'tunnel':   return mine ? 'deinen Tunnel' : 'Tunnel';
        case 'creature': return recapCreatureName(a.vt);
        case 'unit':     return (mine ? 'dein ' : '') + recapUnitName(a.vt);
        default:         return null;   // Flächenangriffe/Altbestand: kein Einzelziel
    }
}

// --- Verdichtung ----------------------------------------------------------
// Rohlog → Gruppen je Spieler, darin Zeilen. Zwei verschiedene Verdichtungen,
// mit Absicht:
//   · **Angriffe bekommen je eine eigene Zeile.** Wer, auf wen, wie viel Schaden,
//     tot ja/nein — das unterscheidet sich von Angriff zu Angriff, ein
//     zusammengefasstes "3 Angriffe" wirft genau die Information weg, die man
//     wissen will.
//   · **Alles andere wird je Einheitentyp gebündelt**: "2× Pferd bewegt" statt
//     zwei Zeilen. So steht trotzdem in jeder Zeile, WELCHE Einheit gehandelt
//     hat, ohne dass ein Zug mit zwölf Bewegungen das Panel flutet.
// Jede Zeile trägt ihre Hex-Liste mit — das Panel hebt beim Antippen alle
// zugehörigen Felder hervor und steppt die Kamera durch sie hindurch.
// Sortierung: Spieler, die mich angefasst haben, zuerst; innerhalb eines
// Spielers erst die Treffer, dann nach prio (Kampf vor Bewegung).
// `actions` ist optional: normalerweise wird die Sicht live berechnet
// (recapVisibleActions). Der Niederlage-Rückblick reicht stattdessen das
// bereits beim Tod gefilterte defeatLog durch (finalizeDefeatLogs) — derselbe
// Verdichtungs-/Sortier-Code, nur mit einer eingefrorenen statt einer live
// berechneten Quelle.
function buildRecapGroups(state, viewerId, actions) {
    const groups = new Map();
    let seq = 0;
    (actions || recapVisibleActions(state, viewerId)).forEach(a => {
        // recapEntryUsable garantiert einen gueltigen Spielerindex — die
        // Gruppierung braucht deshalb keinen Sonderfall fuer urheberlose
        // Eintraege mehr (der hiess frueher "Die Tiefe" und trug die
        // Kreaturen-Angriffe, die es im Rueckblick nicht mehr gibt).
        const pid = a.p;
        if (!groups.has(pid)) groups.set(pid, { pid, hits: 0, total: 0, rows: new Map() });
        const g = groups.get(pid);
        const hit = recapTouchesViewer(state, a, viewerId);
        // Angriffe: nie bündeln (eigener Schlüssel je Eintrag). Sonst nach
        // Aktionsart + Einheitentyp, Treffer getrennt von Nicht-Treffern.
        const rowKey = a.t === 'atk'
            ? `atk#${seq++}`
            : `${a.t}:${a.ut === undefined ? '' : a.ut}${hit ? '!' : ''}`;
        if (!g.rows.has(rowKey)) g.rows.set(rowKey, { t: a.t, ut: a.ut, hit, a, hexes: [] });
        g.rows.get(rowKey).hexes.push({ x: a.x, y: a.y, uw: !!a.uw });
        g.total++;
        if (hit) g.hits++;
    });

    const out = [];
    groups.forEach(g => {
        const rows = [...g.rows.values()].map(r => {
            const kd = recapKind(r.t);
            const n = r.hexes.length;
            const row = {
                t: r.t, hit: r.hit, hexes: r.hexes, ic: kd.ic, k: kd.k, prio: kd.prio,
                // Einheiten-Sprite links in der Zeile (js/art.js pixelSprites).
                // Bei Angriffen ist der Angreifer gemeint, sonst die handelnde Einheit.
                unit: r.t === 'atk' ? r.a.au : r.ut,
                label: (r.ut !== undefined && kd.vb)
                    ? `${recapUnitName(r.ut)} ${kd.vb}`
                    : (n === 1 ? kd.one : kd.many(n)),
                count: n
            };
            if (r.t === 'atk') {
                const victim = recapVictimLabel(r.a, viewerId);
                row.actor = recapActorName(r.a);
                // Bauwerk als Angreifer: eigenes Zeilensymbol, kein Einheiten-Sprite.
                if (r.a.ab) { row.ic = r.a.ab; row.unit = undefined; }
                row.victim = victim;
                row.victimUnit = (r.a.vk === 'unit' || r.a.vk === 'creature') ? r.a.vt : undefined;
                row.victimCreature = r.a.vk === 'creature';
                row.dmg = r.a.dm;
                row.killed = r.a.kl === 1;
                // Fallback-Text für Flächenangriffe und Einträge aus alten Blobs,
                // denen die Details fehlen — dann steht wenigstens der Angreifer da.
                row.label = victim ? `${row.actor} → ${victim}` : `${row.actor} greift an`;
            }
            return row;
        });
        rows.sort((a, b) => (b.hit - a.hit) || (a.prio - b.prio) || (b.count - a.count) || a.t.localeCompare(b.t));
        const pl = state.p ? state.p[g.pid] : null;
        out.push({
            pid: g.pid, hits: g.hits, total: g.total, rows,
            name: (pl && pl.n) || `Spieler ${g.pid + 1}`,
            color: (typeof playerColors !== 'undefined')
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
    // Flache Ereignisliste in Anzeigereihenfolge: EIN Eintrag je (Zeile, Feld).
    // Sie ist die Grundlage fürs Durchblättern — eine Zeile mit drei Angriffen
    // liefert drei Stationen, und das Blättern läuft am Zeilenende einfach in
    // die nächste Zeile weiter, statt in der Zeile zu kreisen.
    let recapFlat = [];
    let recapPos = -1;

    function el(id) { return document.getElementById(id); }

    // Liegt das Panel gerade DA, wohin die Kamera zielt?
    //
    // Renderer.centerOn setzt das gewählte Feld in die Mitte des Spielfelds.
    // Deckt das aufgeklappte Panel diese Mitte ab, wählt man ein Ereignis aus
    // und sieht das Ergebnis nicht — auf dem Handy ist das der Normalfall.
    // Bewusst geometrisch geprüft statt über einen Breakpoint geraten: die
    // Frage ist nicht "ist das ein Handy", sondern "verdeckt das Panel das
    // Ziel" — das trifft auch ein kleines Fenster am Desktop und ein Panel,
    // das durch viele Zeilen ungewöhnlich hoch geworden ist.
    function recapCoversTarget() {
        const panel = el('recap-panel');
        const wrap = document.getElementById('canvas-wrapper');
        if (!panel || !wrap) return false;
        const p = panel.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        const cx = w.left + w.width / 2, cy = w.top + w.height / 2;
        return cx >= p.left && cx <= p.right && cy >= p.top && cy <= p.bottom;
    }

    // Wer schaut zu? gameState.cp ist die richtige Antwort — auch für einen
    // wartenden Spieler im Servermodus, denn openGame (js/lobby.js) setzt cp
    // dort bereits auf den eigenen Slot, damit jeder seinen EIGENEN Fog sieht.
    // Der Rückblick erbt diese Regel und braucht keine zweite Slot-Logik.
    //
    // Ausnahme Zuschauer (ausgeschieden): dort bleibt cp der aktive Spieler und
    // die Karte ist ohnehin komplett aufgedeckt — ein "seit deinem letzten Zug"
    // hat für ihn weder Bedeutung noch eine eigene Sicht, auf die es sich
    // beziehen könnte. ABER: sein eigener Slot (currentUserSlot, js/lobby.js)
    // kann ein eingefrorenes defeatLog tragen (finalizeDefeatLogs) — das ist
    // kein "seit deinem letzten Zug" mehr, sondern der einmalige Blick auf die
    // eigene Niederlage. Ohne defeatLog bleibt es beim alten "kein Rückblick
    // statt einem falschen".
    function recapViewerId() {
        if (!gameState) return -1;
        const mySlot = (typeof currentUserSlot === 'number' && gameState.p && gameState.p[currentUserSlot])
            ? currentUserSlot : -1;
        // Beendete Partie (window.gameFinished, gesetzt in bootGame): der
        // Rückblick gehört dem, der vor dem Gerät sitzt. gameState.cp taugt hier
        // nicht — am Spielende zeigt er auf einen beliebigen, womöglich toten
        // Sitz — und isSpectator greift auch nicht: das ist nur der Besiegte,
        // der Sieger und der Erschließungs-Verlierer sind es nie. Ohne diese
        // Zeile hätte der Sieger nach dem letzten Zug den Rückblick eines
        // fremden Spielers gesehen (oder gar keinen).
        if (window.gameFinished) return mySlot >= 0 ? mySlot : gameState.cp;
        if (typeof isSpectator !== 'undefined' && isSpectator) {
            if (typeof currentUserSlot === 'number' && gameState.p && gameState.p[currentUserSlot] &&
                gameState.p[currentUserSlot].defeatLog && gameState.p[currentUserSlot].defeatLog.length > 0) {
                return currentUserSlot;
            }
            return -1;
        }
        return gameState.cp;
    }

    // Quelle für buildRecapGroups: undefined im Normalfall (live berechnet),
    // das eingefrorene defeatLog im Niederlage-Fall. Bewusst NICHT an
    // isSpectator gekoppelt: der Erschließungs-/Team-Sieg-Verlierer
    // (finalizeGameEndLogs, js/recap.js) bleibt eliminated=FALSE, ist also nie
    // isSpectator, kriegt aber trotzdem ein eingefrorenes defeatLog — dessen
    // bloße Anwesenheit ist bereits das verlässliche Signal, es wird an keiner
    // anderen Stelle für einen normal spielenden Spieler gesetzt.
    function recapSource(viewerId) {
        const p = gameState && gameState.p && gameState.p[viewerId];
        return (p && p.defeatLog && p.defeatLog.length > 0) ? p.defeatLog : undefined;
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

    // --- Einheiten-Sprite als Zeilen-Symbol -------------------------------
    // Zeichnet ein pixelSprite (js/art.js) einmalig in ein Offscreen-Canvas und
    // gibt eine data-URL zurueck. Ein <img> statt eines <canvas> je Zeile, damit
    // renderRecapPanel weiter reines innerHTML bleibt und ein erneutes Rendern
    // nichts kostet. Gecacht je (Sprite, Spielerfarbe) — das sind im Extremfall
    // ein paar Dutzend winzige Bitmaps ueber die ganze Partie.
    const _spriteCache = {};
    function recapSpriteURL(spriteKey, playerColor) {
        const key = spriteKey + '|' + playerColor;
        if (key in _spriteCache) return _spriteCache[key];
        const arr = (typeof pixelSprites !== 'undefined' && pixelSprites) ? pixelSprites[spriteKey] : null;
        if (!arr) return (_spriteCache[key] = null);
        const size = Math.round(Math.sqrt(arr.length));
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const cx = cv.getContext('2d');
        for (let i = 0; i < arr.length; i++) {
            if (!arr[i]) continue;
            cx.fillStyle = spritePixelColor(arr[i], playerColor);
            cx.fillRect(i % size, Math.floor(i / size), 1, 1);
        }
        return (_spriteCache[key] = cv.toDataURL());
    }

    // `cls` trennt Angreifer (volle Groesse) von Ziel (etwas kleiner) — ohne den
    // Groessenunterschied lesen sich zwei gleich grosse Sprites nebeneinander
    // wie ein Paar statt wie "der da hat den da getroffen".
    function recapSprite(spriteKey, playerColor, cls) {
        const url = (spriteKey === undefined || spriteKey === null) ? null : recapSpriteURL(spriteKey, playerColor);
        return url ? '<img class="recap-unit ' + (cls || '') + '" src="' + url + '" alt="">' : '';
    }

    function recapCreatureSprite(t) {
        const cs = (typeof uwCreatureStats !== 'undefined' && uwCreatureStats) ? uwCreatureStats[t] : null;
        return (cs && cs.sprite !== undefined) ? recapSprite(cs.sprite, '#9e9e9e', 'small') : '';
    }

    function renderRecapPanel() {
        const body = el('recap-body');
        if (!body) return;
        if (recapGroups.length === 0) {
            body.innerHTML = '<div class="recap-empty">Seit deinem letzten Zug ist in deinem Sichtfeld nichts passiert.</div>';
            return;
        }
        const viewer = recapViewerId();
        const myColor = (viewer >= 0 && typeof playerColors !== 'undefined')
            ? playerColors[viewer % playerColors.length] : '#9e9e9e';
        let html = '';
        recapGroups.forEach((g, gi) => {
            html += `<div class="recap-group${g.hits ? ' has-hit' : ''}">`;
            html += `<div class="recap-name"><span class="score-dot" style="background:${g.color}"></span>${escapeRecap(g.name)}</div>`;
            g.rows.forEach((r, ri) => {
                // Rechts haengt die Anzahl (x3) bzw. beim Durchsteppen die
                // Position (2/3) — siehe Kommentar bei RECAP_KINDS.vb.
                // data-n haelt die Anzahl fest, damit gotoRecapFlat den Zaehler
                // zwischen "x3" und "2/3" hin- und herschalten kann.
                const step = r.hexes.length > 1
                    ? `<span class="recap-step">&times;${r.hexes.length}</span>` : '';
                let text;
                if (r.t === 'atk' && r.victim) {
                    // Ziel-Sprite nur bei Einheiten/Kreaturen — Hauptgebaeude,
                    // Palisade, Turm und Tunnel haben kein Sprite in
                    // Einheitengroesse, die stehen als Text da.
                    const vSprite = r.victimCreature
                        ? recapCreatureSprite(r.victimUnit)
                        : (r.victimUnit !== undefined ? recapSprite(r.victimUnit, r.hit ? myColor : g.color, 'small') : '');
                    text = `${escapeRecap(r.actor)} <span class="recap-arrow">&rarr;</span> ${vSprite}${escapeRecap(r.victim)}`;
                } else {
                    text = escapeRecap(r.label);
                }
                // "trifft dich" nur, wo der Text es nicht schon sagt: eine
                // Angriffszeile mit benanntem Ziel liest sich bereits als
                // "→ dein Schwert", ein zusätzlicher Hinweis wäre genau die
                // Überladung, die das Panel vermeiden soll. Ohne benanntes Ziel
                // (Flächenangriff, erobertes Dorf, gesprengter Stollen) bleibt er.
                if (r.hit && !r.victim) text += '<b> · trifft dich</b>';
                const dmg = r.dmg ? `<span class="recap-dmg">&minus;${r.dmg}</span>` : '';
                const kill = r.killed ? `<span class="recap-kill">${icon('skull', 'ic-14')}</span>` : '';
                html += `<button class="recap-row rc-k-${r.k}${r.hit ? ' hit' : ''}" data-g="${gi}" data-r="${ri}" data-n="${r.hexes.length}">`
                    + `<span class="recap-ic">${icon(r.ic, 'ic-14')}</span>`
                    + recapSprite(r.unit, g.color)
                    + `<span class="recap-label">${text}</span>`
                    + dmg + kill + step
                    + `</button>`;
            });
            html += '</div>';
        });
        body.innerHTML = html;
        body.querySelectorAll('.recap-row').forEach(btn => {
            btn.addEventListener('click', () => selectRecapRow(+btn.dataset.g, +btn.dataset.r));
        });
    }

    // Antippen waehlt eine Station der flachen Ereignisliste: ALLE Felder der
    // zugehoerigen Zeile leuchten auf der Karte auf (window.recapFocus, gelesen
    // von js/render.js und js/render3d.js), die Kamera faehrt auf das Feld
    // dieser Station. Nichts laeuft von allein los — das ist der Kern des
    // Umbaus gegenueber dem alten Zwangs-Playback.
    function buildRecapFlat() {
        recapFlat = [];
        recapGroups.forEach((g, gi) => g.rows.forEach((r, ri) =>
            r.hexes.forEach((h, hi) => recapFlat.push({ gi, ri, hi }))));
        recapPos = -1;
    }

    function gotoRecapFlat(pos) {
        if (recapFlat.length === 0) return;
        recapPos = ((pos % recapFlat.length) + recapFlat.length) % recapFlat.length;
        const f = recapFlat[recapPos];
        const row = recapGroups[f.gi].rows[f.ri];
        const h = row.hexes[f.hi];

        const body = el('recap-body');
        if (body) {
            body.querySelectorAll('.recap-row').forEach(b => {
                const sel = +b.dataset.g === f.gi && +b.dataset.r === f.ri;
                b.classList.toggle('selected', sel);
                const step = b.querySelector('.recap-step');
                // Zaehler rechts: ausserhalb der Auswahl die Anzahl ("x3"),
                // in der Auswahl die Position innerhalb der Zeile ("2/3").
                if (step) step.innerHTML = sel
                    ? `${f.hi + 1}/${row.hexes.length}`
                    : `&times;${b.dataset.n}`;
            });
        }
        const posEl = el('recap-nav-pos');
        if (posEl) posEl.textContent = `${recapPos + 1}/${recapFlat.length}`;
        syncRecapSelState();

        window.recapFocus = { hexes: row.hexes, color: recapPulseColor(row.k) };
        Renderer.centerOn(h.x, h.y, 1.0);
        renderBoard(gameState);
    }

    // Blaettern (Pfeile im eingeklappten Zustand). Laeuft um, damit man nicht
    // an einem Ende haengen bleibt.
    function recapStep(delta) {
        if (recapPos < 0) gotoRecapFlat(0);
        else gotoRecapFlat(recapPos + delta);
    }

    function selectRecapRow(gi, ri) {
        const cur = recapPos >= 0 ? recapFlat[recapPos] : null;
        if (cur && cur.gi === gi && cur.ri === ri) gotoRecapFlat(recapPos + 1);
        else gotoRecapFlat(recapFlat.findIndex(f => f.gi === gi && f.ri === ri));
        // Verdeckt die Liste das Ziel der Kamerafahrt, klappt sie beim
        // Auswaehlen automatisch ein — sonst waehlt man ein Ereignis und sieht
        // genau das nicht, was man sehen wollte.
        if (!recapCollapsed && recapCoversTarget()) {
            setRecapCollapsed(true);
            // Nach dem Einklappen ist das Panel kleiner: noch einmal zentrieren,
            // damit das Feld auch wirklich in der freien Flaeche landet.
            gotoRecapFlat(recapPos);
        }
    }

    // Eingeklappt und noch nichts gewaehlt: statt eines leeren Kastens die
    // Kurzfassung ("7 Ereignisse, 2 treffen dich"). Bewusst NICHT automatisch
    // auf das erste Ereignis springen — das waere wieder eine Kamerafahrt, die
    // niemand ausgeloest hat, und genau davon ist der Rueckblick weg. Erst ein
    // Tippen auf > oder auf die Zeile bewegt etwas.
    function syncRecapSelState() {
        const panel = el('recap-panel');
        if (panel) panel.classList.toggle('has-sel', recapPos >= 0);
        const posEl = el('recap-nav-pos');
        if (posEl && recapPos < 0) posEl.textContent = `–/${recapFlat.length}`;
        const sum = el('recap-summary');
        if (sum) {
            const n = recapFlat.length;
            const hits = recapGroups.reduce((a, g) => a + g.hits, 0);
            sum.innerHTML = `<span class="recap-sum-n">${n}</span> ${n === 1 ? 'Ereignis' : 'Ereignisse'}`
                + (hits ? `<b> · ${hits === 1 ? 'eines trifft' : hits + ' treffen'} dich</b>` : '');
        }
    }

    // Ein-/Ausklappen. Eingeklappt zeigt das Panel nur noch die gewaehlte Zeile
    // (der Rest wird per CSS ausgeblendet) plus die Blaetter-Pfeile.
    let recapCollapsed = false;
    function setRecapCollapsed(on) {
        const panel = el('recap-panel');
        if (!panel) return;
        recapCollapsed = !!on && recapFlat.length > 0;
        panel.classList.toggle('collapsed', recapCollapsed);
        const btn = el('recap-list-btn');
        if (btn) {
            btn.innerHTML = icon(recapCollapsed ? 'menu' : 'chev-l', 'ic-14');
            btn.title = recapCollapsed ? 'Alle Eintraege zeigen' : 'Liste einklappen';
        }
        syncRecapSelState();
    }

    // Farben fuer die Karten-Hervorhebung kommen aus denselben CSS-Tokens wie die
    // Panelzeilen (kein zweiter, per Hand gepflegter Farbsatz im JS — vgl. die
    // Regel gegen Inline-Materialfarben in CLAUDE.md).
    function recapPulseColor(k) {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--rc-' + k);
        return (v && v.trim()) || '#cabe98';
    }

    // Auswahl aufheben: keine Zeile mehr markiert, keine Felder mehr hervorgehoben.
    function clearRecapFocus() {
        recapPos = -1;
        window.recapFocus = null;
    }

    function openRecap() {
        const panel = el('recap-panel');
        if (!panel) return;
        // Am Spielende bezieht sich der Rückblick nicht mehr auf "meinen letzten
        // Zug", sondern auf das Ende der Partie — der Titel sagt es, damit die
        // Zeilen nicht falsch eingeordnet werden.
        const titleText = el('recap-title-text');
        if (titleText) titleText.textContent = window.gameFinished ? 'So ging es aus' : 'Seit deinem letzten Zug';
        clearRecapFocus();
        renderRecapPanel();
        buildRecapFlat();
        // Standardzustand ist eingeklappt (Jonathan, Aug 2026): die volle Liste
        // deckt auf dem Handy das halbe Spielfeld ab. Das Handy ist die
        // Hauptplattform — die Liste ist die Ausnahme, nicht der Normalfall.
        setRecapCollapsed(true);
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
        clearRecapFocus();
        if (gameState) renderBoard(gameState);
    }

    // Zugstart (js/main.js): Gruppen bauen, Knopf setzen, Panel nur öffnen,
    // wenn es überhaupt etwas zu berichten gibt. Blockiert nichts — Ereignis-
    // und Diplomatie-Overlays laufen daneben weiter und liegen darüber.
    function prepareRecap() {
        closeRecap();     // Reste aus der vorherigen Partie/dem vorherigen Zug
        const viewer = recapViewerId();
        recapGroups = (viewer < 0 || !gameState) ? [] : buildRecapGroups(gameState, viewer, recapSource(viewer));
        refreshRecapButton();
        showRecap = false;
        if (recapGroups.length > 0) openRecap();
    }

    window.openRecap = openRecap;
    window.closeRecap = closeRecap;
    window.toggleRecap = function () { recapOpen ? closeRecap() : openRecap(); };
    window.toggleRecapList = function () { setRecapCollapsed(!recapCollapsed); };
    window.recapStep = recapStep;
    window.prepareRecap = prepareRecap;
    window.isRecapOpen = function () { return recapOpen; };
    // Anzahl der Ereignisse im aktuellen Rückblick — der Sieg-/Niederlage-Screen
    // (js/diplomacy.js) blendet seinen Rückblick-Knopf aus, wenn es nichts zu
    // berichten gibt, statt ein leeres Panel anzubieten.
    window.recapEventCount = function () { return recapGroups.reduce((s, g) => s + g.total, 0); };
    window.isRecapCollapsed = function () { return recapCollapsed; };
})();
