// === RADIAL-MENÜ (Langdruck-Auswahlrad) ===
// Ersetzt die aus dem HUD entfernten Buttons Forschung/Kultur/Diplomatie/Zug-
// beenden (siehe CLAUDE.md-Auftrag "HUD-Umbau"): 0.7s Druck ohne Ziehen auf
// #canvas-wrapper (Timer + Auslösen in js/input.js, POINTER/TOUCH EVENTS)
// öffnet ein Rad aus 5 Kreisen zentriert am Druckpunkt.
//
// Auswahl-Modell (Auftrag Jonathan, Juli 2026): das Rad ist KEIN Drag-und-
// Loslassen-Menü mehr. Der Langdruck-Loslasser (onDocPointerUp) selbst wählt
// nichts mehr aus und schließt auch nichts — das Rad bleibt einfach stehen,
// sobald der Finger/Zeiger wieder abgehoben wird. Erst ein NEUER, separater
// Tap entscheidet: Tap auf einen Kreis löst dessen Aktion aus und schließt
// das Rad, Tap irgendwo daneben schließt es ohne Aktion. Dieser zweite Tap
// wird über einen capturing document-pointerdown-Listener abgefangen
// (onOutsidePointerDown) und per stopPropagation "verschluckt", damit er
// nicht zusätzlich einen Hex anklickt oder einen neuen Langdruck startet.
//
// Aktionen sind bewusst mit typeof/optional-chaining-Guards abgesichert:
// Fraktions-Fenster (window.openFactionOverview) und Reliquien-Shop
// (window.openRelicShop) existieren noch nicht — sie kommen in einem
// Folgeauftrag und sollen bis dahin als no-op laufen, ohne dass dieses Modul
// angepasst werden muss.
window.RadialMenu = (function () {
    // Reihenfolge bestimmt die Position im Kreis (erster Eintrag oben, dann im
    // Uhrzeigersinn) — rein kosmetisch, hat keine funktionale Bedeutung.
    const ITEMS = [
        { key: 'research', icon: '📜', label: 'Forschung' },
        { key: 'faction', icon: '⚜️', label: 'Fraktion' },
        { key: 'diplomacy', icon: '🤝', label: 'Diplomatie' },
        { key: 'relics', icon: '🏺', label: 'Reliquien' },
        { key: 'endturn', icon: '🏁', label: 'Zug beenden' },
    ];
    const RADIUS = 95;          // Abstand Kreis-Mittelpunkt <-> Druckpunkt, siehe CLAUDE.md-Auftrag (~90-100px)
    const CIRCLE_SIZE = 64;
    const DEAD_ZONE = 40;        // Innerhalb dieses Abstands vom Druckpunkt gilt "Mitte/Abbrechen", kein Kreis anvisiert

    let overlay = null;
    let items = [];              // {key, icon, label, cx, cy, el, disabled}
    let centerX = 0, centerY = 0;
    let activeKey = null;
    let isOpenFlag = false;
    // Bleibt bis zum nächsten pointerdown (input.js ruft dort resetPressConsumed()
    // auf) auf true stehen, sobald das Rad geöffnet wurde — Absicherung für
    // input.js' Klick-Unterdrückung, falls die Event-Reihenfolge zwischen dem
    // pointerup-Listener von input.js (auf #canvas-wrapper) und dem hier auf
    // document gebundenen Listener browserabhängig doch einmal anders läuft
    // als erwartet (siehe Kommentar in js/input.js).
    let pressConsumedFlag = false;

    // Zustand pro Kreis wird EINMAL beim Öffnen berechnet (CLAUDE.md-Auftrag:
    // "Zustand ändert sich während des Haltens nicht") — kein Live-Update, falls
    // sich z.B. gameState.at während des Haltens ändern würde (kann in der
    // Praxis nicht passieren, da währenddessen keine Aktion läuft, aber so ist
    // die Regel explizit im Code sichtbar statt implizit durch Zufall wahr).
    function computeDisabled() {
        const pState = gameState && gameState.p ? gameState.p[gameState.cp] : null;
        return {
            research: !pState || !pState.f || pState.f.length === 0,
            // Fraktions-Fenster kommt im Folgeauftrag (window.openFactionOverview)
            // — Kreis bleibt bis dahin aktiv, aber no-op (siehe triggerAction).
            faction: false,
            diplomacy: !(gameState && (gameState.at || gameState.dp)),
            // Reliquien-Shop kommt im Folgeauftrag (window.openRelicShop) — analog zu faction.
            relics: false,
            endturn: !!(endTurnBtn && endTurnBtn.disabled),
        };
    }

    // Druckpunkt in den Viewport klemmen, damit auch bei einem Druck nahe am
    // Bildschirmrand alle 5 Kreise vollständig sichtbar bleiben.
    function clampCenter(x, y) {
        const margin = RADIUS + CIRCLE_SIZE / 2 + 8;
        const vw = window.innerWidth, vh = window.innerHeight;
        return {
            x: Math.min(Math.max(x, margin), Math.max(margin, vw - margin)),
            y: Math.min(Math.max(y, margin), Math.max(margin, vh - margin)),
        };
    }

    function build(x, y) {
        overlay = document.getElementById('radial-menu-overlay');
        if (!overlay) return false;
        overlay.innerHTML = '';
        overlay.classList.remove('radial-menu-visible');
        overlay.style.display = 'block';

        const c = clampCenter(x, y);
        centerX = c.x; centerY = c.y;

        // Vignette: dezente Abdunkelung NUR um den Druckpunkt (kein Vollflächen-
        // Dimmer), Radius knapp über den äußeren Kreisen.
        overlay.style.background =
            `radial-gradient(circle at ${centerX}px ${centerY}px, transparent 0px, transparent ${RADIUS - CIRCLE_SIZE / 2}px, rgba(6, 6, 10, 0.6) ${RADIUS + CIRCLE_SIZE}px)`;

        const centerDot = document.createElement('div');
        centerDot.className = 'radial-center-dot';
        centerDot.style.left = centerX + 'px';
        centerDot.style.top = centerY + 'px';
        overlay.appendChild(centerDot);

        const disabled = computeDisabled();
        // "Fraktion" darf leuchten, sobald die nächste Kultur kaufbar ist (Jonathan:
        // sichtbarer Kaufanreiz analog zum Gold-Pulse anderswo) — Zustand einmalig
        // beim Öffnen berechnet, siehe Kommentar über computeDisabled().
        const factionAffordable = typeof window.getKulturStatus === 'function' && window.getKulturStatus().canBuy;
        items = ITEMS.map((def, i) => {
            const angle = -Math.PI / 2 + i * (2 * Math.PI / ITEMS.length);
            const cx = centerX + Math.cos(angle) * RADIUS;
            const cy = centerY + Math.sin(angle) * RADIUS;
            const el = document.createElement('div');
            el.className = 'radial-circle'
                + (disabled[def.key] ? ' disabled' : '')
                + (def.key === 'faction' && factionAffordable ? ' affordable' : '');
            el.style.left = cx + 'px';
            el.style.top = cy + 'px';
            el.innerHTML = `<span class="radial-icon">${def.icon}</span><span class="radial-label">${def.label}</span>`;
            overlay.appendChild(el);
            return { key: def.key, cx, cy, el, disabled: disabled[def.key] };
        });
        return true;
    }

    // Anvisiertes Ziel = Kreis mit kleinstem Abstand zum ZEIGER (nicht zum
    // Druckpunkt) — bewusst NICHT über elementFromPoint, siehe CSS-Kommentar
    // in css/game.css: der Finger verdeckt sonst genau das Ziel, das er
    // ansteuert. Innerhalb der Dead-Zone um den Druckpunkt gilt immer "Mitte".
    function updateHighlight(px, py) {
        const distToCenter = Math.hypot(px - centerX, py - centerY);
        let closest = null, closestDist = Infinity;
        for (const it of items) {
            const d = Math.hypot(px - it.cx, py - it.cy);
            if (d < closestDist) { closestDist = d; closest = it; }
        }
        const newActive = (distToCenter > DEAD_ZONE && closest) ? closest.key : null;
        if (newActive !== activeKey) {
            activeKey = newActive;
            for (const it of items) it.el.classList.toggle('active', it.key === activeKey);
        }
    }

    function triggerAction(key) {
        switch (key) {
            case 'research':
                if (typeof window.openResearch === 'function') window.openResearch();
                break;
            case 'faction':
                if (typeof window.openFactionOverview === 'function') window.openFactionOverview();
                break;
            case 'diplomacy':
                if (typeof window.openDiplomacy === 'function') window.openDiplomacy();
                break;
            case 'relics':
                if (typeof window.openRelicShop === 'function') window.openRelicShop();
                break;
            case 'endturn':
                endTurnBtn.click();
                break;
        }
    }

    function onDocPointerMove(e) { updateHighlight(e.clientX, e.clientY); }

    // Loslassen des ursprünglichen Langdrucks wählt nichts mehr aus — das Rad
    // bleibt offen stehen (siehe Kommentar oben). Nur die Vorschau-Markierung
    // wird zurückgesetzt, die Auswahl selbst passiert erst über einen neuen Tap.
    function onDocPointerUp(e) {
        document.removeEventListener('pointermove', onDocPointerMove);
        document.removeEventListener('pointerup', onDocPointerUp);
        document.removeEventListener('pointercancel', onDocPointerCancel);
        activeKey = null;
        for (const it of items) it.el.classList.remove('active');
        document.addEventListener('pointerdown', onOutsidePointerDown, true);
    }

    function onDocPointerCancel() {
        document.removeEventListener('pointermove', onDocPointerMove);
        document.removeEventListener('pointerup', onDocPointerUp);
        document.removeEventListener('pointercancel', onDocPointerCancel);
        close(null);
    }

    // Kreis unter (px, py), oder null falls der Tap daneben liegt.
    function hitTest(px, py) {
        let closest = null, closestDist = Infinity;
        for (const it of items) {
            const d = Math.hypot(px - it.cx, py - it.cy);
            if (d < closestDist) { closestDist = d; closest = it; }
        }
        return (closest && closestDist <= CIRCLE_SIZE / 2) ? closest : null;
    }

    // Der EINE Tap nach dem Öffnen, der entscheidet: Treffer schließt + löst aus,
    // daneben schließt ohne Aktion. In der capturing Phase auf document
    // registriert, damit dieser Tap per stopPropagation "verschluckt" wird,
    // bevor input.js ihn als normalen Karten-Klick oder neuen Langdruck sieht.
    function onOutsidePointerDown(e) {
        document.removeEventListener('pointerdown', onOutsidePointerDown, true);
        const hit = hitTest(e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation();
        close(hit ? hit.key : null);
    }

    function close(key) {
        if (!isOpenFlag) return;
        document.removeEventListener('pointerdown', onOutsidePointerDown, true);

        if (key) {
            const item = items.find(it => it.key === key);
            if (item && item.disabled) {
                if (key === 'research') {
                    if (typeof showToast === 'function') showToast('Erst eine Kultur wählen', 'error');
                }
                // andere deaktivierte Kreise (Diplomatie, Zug beenden während Readonly)
                // brauchen keinen eigenen Hinweistext — ihr gegrauter Zustand spricht für sich.
            } else {
                triggerAction(key);
            }
        }

        if (overlay) { overlay.innerHTML = ''; overlay.style.display = 'none'; overlay.classList.remove('radial-menu-visible'); }
        isOpenFlag = false;
        activeKey = null;
        items = [];
    }

    return {
        open(x, y) {
            if (isOpenFlag) return;
            if (!build(x, y)) return;
            isOpenFlag = true;
            pressConsumedFlag = true;
            // Einblend-Animation erst NACH dem Einfügen ins DOM anstoßen (siehe
            // CSS-Kommentar), sonst startet der Übergang sofort im Endzustand.
            requestAnimationFrame(() => { if (overlay) overlay.classList.add('radial-menu-visible'); });
            document.addEventListener('pointermove', onDocPointerMove);
            document.addEventListener('pointerup', onDocPointerUp);
            document.addEventListener('pointercancel', onDocPointerCancel);
        },
        isOpen() { return isOpenFlag; },
        wasPressConsumed() { return pressConsumedFlag; },
        resetPressConsumed() { pressConsumedFlag = false; },
    };
})();
