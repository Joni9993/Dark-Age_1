// ============================================================================
// Kachel-Auswahl für den Setup-Screen (ersetzt die <select>-Dropdowns)
// ----------------------------------------------------------------------------
// Auf dem Handy sind native Dropdowns die schlechteste Variante: ein Tippen
// öffnet ein Systemmenü, das den halben Bildschirm verdeckt, und man sieht die
// Optionen nie nebeneinander. Kartengröße, Spielerzahl und Teams sind hier
// stattdessen direkt sichtbare, antippbare Kacheln.
//
// WICHTIG — die <select>-Elemente bleiben im DOM (nur per CSS versteckt) und
// sind weiterhin die Datenquelle: js/lobby.js, js/mapgen.js und js/globals.js
// lesen `mapSizeSelect.value` & Co. unverändert weiter. Die Kacheln schreiben
// nur in das <select> und lösen dort ein 'change'-Event aus. Dadurch braucht
// keine einzige bestehende Aufrufstelle angepasst zu werden — und ohne dieses
// Modul (oder bei einem Fehler darin) funktioniert der Screen mit den nativen
// Dropdowns immer noch.
// ============================================================================

window.Segmented = (function () {

    /** Kleine Hex-Vorschau: je größer der Radius, desto größer das Sechseck. */
    function hexPreview(r, active) {
        const c = 28;
        const pts = [
            [c, c - r], [c + r * 0.866, c - r / 2], [c + r * 0.866, c + r / 2],
            [c, c + r], [c - r * 0.866, c + r / 2], [c - r * 0.866, c - r / 2]
        ].map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
        // Dörfer als Punkte auf halbem Radius, Startdorf in Spielerfarbe
        const dots = [];
        const n = r < 16 ? 2 : (r < 20 ? 4 : 6);
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n + Math.PI / 6;
            dots.push(`<rect x="${(c + Math.cos(a) * r * 0.55 - 1.5).toFixed(1)}" y="${(c + Math.sin(a) * r * 0.55 - 1.5).toFixed(1)}" width="3" height="3" fill="#e8b84a"/>`);
        }
        return `<svg width="56" height="56" viewBox="0 0 56 56" shape-rendering="crispEdges" aria-hidden="true">
            <polygon points="${pts}" fill="#2a3627" stroke="${active ? '#8f6435' : '#5e3a20'}" stroke-width="2"/>
            ${dots.join('')}
            <rect x="26" y="26" width="4" height="4" fill="#00e5ff"/>
        </svg>`;
    }

    // Wie eine Option dargestellt wird. Fehlt ein Eintrag, fällt die Kachel auf
    // den Optionstext zurück — neue <option>s brechen also nichts.
    const PRESETS = {
        'map-size': {
            layout: 'row',
            render: (opt, active) => ({
                media: hexPreview(opt.value === '5' ? 14 : opt.value === '7' ? 18 : 22, active),
                title: opt.textContent.replace(/\s*\(.*\)$/, ''),
                sub: 'Radius ' + opt.value
            })
        },
        'player-count': {
            layout: 'row',
            render: (opt) => ({
                big: opt.value,
                sub: /Duell/.test(opt.textContent) ? 'Duell'
                    : /FFA/.test(opt.textContent) ? 'FFA' : 'Spieler'
            })
        },
        'team-mode': {
            layout: 'col',
            render: (opt) => {
                const meta = {
                    ffa: ['sword', 'Kein Bündnis', 'Jeder für sich — keine Pakte möglich'],
                    diplomacy: ['pact', 'Freie Diplomatie', 'Bündnisse und Waffenruhen im Spiel schließen'],
                    teams2: ['shield', 'Feste 2er-Teams', 'Teams stehen ab Spielstart fest'],
                    teams3: ['users', 'Feste 3er-Teams', 'Teams stehen ab Spielstart fest']
                }[opt.value];
                return meta
                    ? { icon: meta[0], title: meta[1], sub: meta[2] }
                    : { title: opt.textContent };
            }
        }
    };

    const controls = [];   // {select, box, cfg}

    function build(ctrl) {
        const { select, box, cfg } = ctrl;
        box.innerHTML = '';
        box.className = 'seg' + (cfg.layout === 'col' ? ' seg-col' : '');

        for (const opt of Array.from(select.options)) {
            const active = opt.value === select.value;
            const view = cfg.render(opt, active);

            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'seg-item'
                + (active ? ' seg-item-on' : '')
                + (opt.disabled ? ' seg-item-off' : '');
            tile.disabled = !!opt.disabled;
            tile.setAttribute('role', 'radio');
            tile.setAttribute('aria-checked', active ? 'true' : 'false');

            let html = '';
            if (view.media) html += view.media;
            if (view.icon && typeof icon === 'function') html += icon(view.icon, 'ic-20');
            if (view.big) html += `<span class="seg-big">${view.big}</span>`;
            if (view.title) html += `<span class="seg-title">${view.title}</span>`;
            if (view.sub) html += `<span class="seg-sub">${view.sub}</span>`;
            tile.innerHTML = html;

            tile.addEventListener('click', () => {
                if (opt.disabled) return;
                select.value = opt.value;
                // Bestehende Listener (renderNameInputs, updateTeamModeOptions)
                // hängen am 'change' des <select> — das muss also feuern.
                select.dispatchEvent(new Event('change', { bubbles: true }));
                refreshAll();
            });

            box.appendChild(tile);
        }
    }

    /** Kacheln neu aus dem <select> ableiten (Auswahl + disabled-Zustände). */
    function refreshAll() {
        controls.forEach(build);
    }

    function init() {
        for (const [id, cfg] of Object.entries(PRESETS)) {
            const select = document.getElementById(id);
            if (!select) continue;

            const box = document.createElement('div');
            box.setAttribute('role', 'radiogroup');
            const label = select.closest('.setup-group')?.querySelector('label');
            if (label) box.setAttribute('aria-label', label.textContent.trim());

            select.classList.add('seg-native');
            select.parentNode.insertBefore(box, select);

            const ctrl = { select, box, cfg };
            controls.push(ctrl);
            build(ctrl);
        }
    }

    init();
    return { refreshAll };
})();
