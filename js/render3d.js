// === 3D-RENDERER (Three.js) ===
// Implementiert die Renderer-Fassade aus render.js in echtem 3D:
// Hex-Tiles als Prismen, Einheiten/Gebäude als Voxel-Figuren aus den
// bestehenden 10×10-pixelSprites. Standard-Renderer; ?r2d=1 erzwingt den alten 2D-Modus.
// Die Spiellogik bleibt unberührt — dieses Modul liest nur gameState + die
// bestehenden Globals (validMoves, validAttacks, selectedHex, showRecap, ...).

(function () {
    if (typeof THREE === 'undefined') {
        console.warn('render3d: Three.js nicht geladen — bleibe beim 2D-Renderer.');
        return;
    }

    // ── Konstanten ────────────────────────────────────────────────────────────
    const TILE_H = thickness;              // Grundhöhe Gras/Wald (12)
    const HILL_H = thickness * 2;          // Hügel (24)
    const ROW_Z = hexSize * 1.5;           // Zeilenabstand in Weltkoordinaten
    const CAM_ELEV = Math.asin(yCompress); // ~40.5° — entspricht dem 2D-Look
    const FOV = 45;
    const VOXEL_CAP = 45000;               // Instanz-Budget für alle Entity-Voxel (inkl. 3D-Gebäude)

    const COL_UNEXPLORED = new THREE.Color('#141414');
    const SHROUD_MUL = 0.35;

    // ── Unterwelt-Unterseite (M9a) ─────────────────────────────────────────────
    // "Protrusion" Richtung Kamera: Die Unterwelt-Kamera steht weit unterhalb der
    // Karte und blickt nach oben (+Y) — je NEGATIVER die Y-Position eines Tiles,
    // desto NÄHER an der Kamera. Fels wirkt dadurch massiv/geschlossen (weit nach
    // unten Richtung Kamera vorgezogen), offene Typen (Kaverne/Ader/Ruine/Herz)
    // "ausgehöhlt" (näher an der y=0-Bodenebene, wirkt wie eine Vertiefung/Kavität).
    // Muss näher an y=0 bleiben als der Auswahl-Overlay-Versatz in addOverlay,
    // sonst würde der protrudierende Fels das lila Auswahl-Overlay verdecken.
    const UW_SOLID_DEPTH = 2.2;
    const UW_OPEN_DEPTH = 0.7;
    // ADER zählt zur SOLID-Tiefe (Korrektur Juli 2026): eine Kristallader mit
    // Restbestand ist massiver Fels (isUnderworldOpen = false, erst der Abbau
    // öffnet sie) — sie flach wie einen offenen Gang zu rendern, ließ Adern
    // begehbar wirken. uwVisualType liefert für leergebaute Adern ohnehin
    // UW_KAVERNE, die hier automatisch offen gerendert wird.
    function underworldDepth(uType) { return (uType === UW_FELS || uType === UW_ADER) ? UW_SOLID_DEPTH : UW_OPEN_DEPTH; }

    // Basisfarben je Unterwelt-Typ (bewusst hier lokal definiert, nicht in
    // art.js/pal — die Unterwelt-Grafik ist noch reiner Platzhalter, art.js
    // gehört einem parallel arbeitenden Agenten).
    const UW_COLORS = {
        [UW_FELS]: '#33333a', [UW_KAVERNE]: '#4d3c2a', [UW_ADER]: '#37363f',
        [UW_RUINE]: '#4a3c2a', [UW_HERZ]: '#5c3a22'
    };
    // Akzentfarben (Kristall-/Fund-/Herz-Glitzern) für Typen mit `accentPositions`
    const UW_ACCENT_COLORS = { [UW_ADER]: '#7fe3ff', [UW_RUINE]: '#c9a24b', [UW_HERZ]: '#ff6f61' };

    function worldPos(x, y) {
        return {
            wx: (x + 0.5 * (y % 2)) * hexWidth,
            wz: y * ROW_Z
        };
    }

    function tileHeight(tType) { return tType === 'hill' ? HILL_H : TILE_H; }

    // Y-Rotation, mit der die lokale X-Achse (Wand-Längsrichtung im Modell) auf die
    // Weltrichtung (dx, dz) zeigt. Mod π, da das Wandmodell an beiden Enden
    // spiegelsymmetrisch ist (180°-Rotation ergibt dasselbe Bild).
    function wallDirAngle(dx, dz) { return Math.atan2(-dz, dx); }

    // Rotation eines Mauer-Hex, ausgerichtet auf seine Mauer-Nachbarn, damit
    // aneinandergrenzende Mauersegmente sich optisch verbinden statt isoliert
    // dazustehen. Bei mehreren Nachbarn wird der Achsen-Mittelwert (doppelter
    // Winkel, um die π-Symmetrie sauber zu mitteln) verwendet — bei einer
    // geraden Linie ergibt das exakt die Verbindungsrichtung, bei einer Ecke
    // einen Kompromisswinkel zwischen beiden (kein eigenes Eck-Modell vorhanden).
    function computeWallRotation(x, y, wallSet) {
        const { wx, wz } = worldPos(x, y);
        let sx = 0, sz = 0, count = 0;
        getNeighbors(x, y).forEach(n => {
            if (!wallSet.has(`${n.x},${n.y}`)) return;
            const p = worldPos(n.x, n.y);
            const a = wallDirAngle(p.wx - wx, p.wz - wz);
            sx += Math.cos(2 * a); sz += Math.sin(2 * a); count++;
        });
        if (!count) return 0;
        return Math.atan2(sz, sx) / 2;
    }

    // ── Modul-Zustand ─────────────────────────────────────────────────────────
    let canvas3d = null, renderer = null, scene = null, camera = null;
    let tileMesh = null;                   // InstancedMesh aller Tiles
    let tileIndex = [];                    // instanceId -> {x, y, tType}
    let tileLookup = {};                   // "x,y" -> instanceId
    let builtSeed = null;
    let treeGroup = null;                  // Wald-Deko (pro Render neu)
    let decoGroup = null;                  // Boden-Schmutz/Pixel-Deko (pro Render neu)
    let voxelMesh = null;                  // Boden-Entity-Voxel
    let airVoxelMesh = null;               // Luft-Ebene (transparent umschaltbar)
    let shadowMesh = null;                 // Boden-Schatten unter Entities
    let overlayGroup = null;               // Highlights (Move/Attack/Selektion/...)
    let spriteGroup = null;                // HP-Balken, Veteranen-Stern, ⛏
    let lastState = null;
    let cam3d = { tx: 0, tz: 0, scale: 1.0, elev: CAM_ELEV, azim: 0 };
    let gestureStart = null;
    let anims3d = [];                      // Projektil-Animationen
    let floats3d = [];                     // DOM-Schadenszahlen
    let animRunning = false;
    // Kamerafokus: drei Kamerafahrten (Standard/Luftansicht/Unterwelt), siehe
    // Renderer3D.setCameraFocus(). Elevation = Blickwinkel in Grad über dem
    // Horizont (90 = senkrecht von oben, ~40.5 = normale Bodenansicht,
    // negativ = Kamera unter der Karte, blickt nach oben).
    const AIR_VIEW_ELEV = 50 * Math.PI / 180;
    // 180° + CAM_ELEV statt -CAM_ELEV: die Luftansicht kippt die Kamera bereits
    // weiter nach hinten/oben (40.5°→50°) — die Unterwelt-Fahrt setzt diese
    // Drehrichtung fort (über den Scheitel, weiter bis unter die Karte) statt
    // umzukehren und durch die Vorderkante/den Horizont zu tauchen. Der Winkel
    // ist der punktgespiegelte Standard-Blick: dieselbe Schräge wie die normale
    // Bodenansicht, nur von unten auf die Kartenunterseite — senkrecht von
    // unten (früher 270°) standen die Billboard-Einheiten in Kantenlage zur
    // Kamera und wurden zu flachen Strichen.
    const UNDERWORLD_ELEV = Math.PI + CAM_ELEV;
    const AIR_ALPHA_GROUND = 0.1;          // Deckkraft der Flieger außerhalb der Luftansicht
    let airAlpha = AIR_ALPHA_GROUND;
    let viewTween = null;                  // {start, dur, from:{elev,alpha}, to:{elev,alpha}}

    // Kleinster Vorwärts-Schritt (>0) von `current`, der auf einen zu
    // `nominal` kongruenten Winkel (mod 360°) trifft — damit der Kamerafokus-
    // Zyklus nie rückwärts fährt, egal wie oft schon rundherum gedreht wurde.
    function nextForwardElev(current, nominal) {
        const twoPi = Math.PI * 2;
        let delta = (nominal - current) % twoPi;
        if (delta <= 1e-9) delta += twoPi;
        return current + delta;
    }
    const raycaster = new THREE.Raycaster();
    const texCache = {};

    function baseDist() {
        // Distanz, bei der 1 Welteinheit ≈ 1 CSS-Pixel entspricht (Parität zu camScale=1)
        const h = canvas3d ? canvas3d.clientHeight : 800;
        return (h / 2) / Math.tan((FOV / 2) * Math.PI / 180);
    }

    // Kamera-Orientierung als starre Rotation (Pitch um Welt-X, dann Azimut um
    // Welt-Y) statt camera.lookAt(): lookAt sucht pro Frame neu die "up"-Richtung,
    // die dem festen Welt-Up (0,1,0) am nächsten kommt — an den Polen (Blick exakt
    // senkrecht, die die Unterwelt-Kamerafahrt beim Überqueren von elev=90°/270°
    // durchläuft) ist das unstetig und erzeugte dort einen sichtbaren Sprung/
    // Flip der Blickrichtung. Die starre Rotation ist für jeden Winkel stetig
    // (keine Singularität) und reproduziert exakt dieselbe Position wie zuvor —
    // dadurch bleibt sie auch zur Pan-/Zoom-Formel (camGroundAxes, nur vom
    // Azimut abhängig) konsistent, inklusive korrekt "mitgedrehter" Steuerung,
    // wenn die Kamera kopfüber unter der Karte hängt.
    const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
    const YAW_AXIS = new THREE.Vector3(0, 1, 0);
    const _qPitch = new THREE.Quaternion();
    const _qAzim = new THREE.Quaternion();

    function applyCamera() {
        const dist = baseDist() / cam3d.scale;
        const horiz = dist * Math.cos(cam3d.elev);
        camera.position.set(
            cam3d.tx + horiz * Math.sin(cam3d.azim),
            dist * Math.sin(cam3d.elev),
            cam3d.tz + horiz * Math.cos(cam3d.azim)
        );
        _qPitch.setFromAxisAngle(PITCH_AXIS, -cam3d.elev);
        _qAzim.setFromAxisAngle(YAW_AXIS, cam3d.azim);
        camera.quaternion.copy(_qAzim).multiply(_qPitch);
    }

    // sin(elev) als Divisor für Pan/Zoom — seit der Unterwelt-Kamerafahrt
    // durchläuft cam3d.elev beim Tween auch Werte nahe 0 (Horizont), wo eine
    // rohe Division explodieren würde; Betrag daher nach unten begrenzt.
    function safeSinElev() {
        const s = Math.sin(cam3d.elev);
        return Math.abs(s) < 0.05 ? (s < 0 ? -0.05 : 0.05) : s;
    }

    // Boden-Achsen der Kamera, mit dem Azimut mitgedreht (Standard bei azim=0:
    // rechts = Welt-X, "zur Kamera hin" = Welt-Z) — gemeinsame Basis für Pan,
    // Zoom-Mittelpunkt und das horizontale Billboarding der Voxel-Sprites.
    function camGroundAxes() {
        const a = cam3d.azim;
        const cosA = Math.cos(a), sinA = Math.sin(a);
        return { rx: cosA, rz: -sinA, fx: sinA, fz: cosA };
    }

    function requestRender3d() {
        if (lastState && !animRunning) Renderer3D.render(lastState);
    }

    // ── Aufbau ────────────────────────────────────────────────────────────────
    function ensureInit() {
        if (renderer) return;

        canvas3d = document.createElement('canvas');
        canvas3d.id = 'gameCanvas3d';
        canvasWrapper.insertBefore(canvas3d, canvasWrapper.firstChild);
        canvas.style.display = 'none';

        renderer = new THREE.WebGLRenderer({
            canvas: canvas3d,
            antialias: false,
            powerPreference: 'low-power'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        scene = new THREE.Scene();
        // Dunklere/rauere Redesign-Stimmung — bereits live (nicht mehr per DEBUG_ART gegated)
        scene.background = new THREE.Color('#07080d');

        const ambient = new THREE.AmbientLight(0xffffff, 0.45);
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(-0.4, 1, 0.6);
        scene.add(ambient, sun);

        camera = new THREE.PerspectiveCamera(FOV, 1, 10, 8000);

        treeGroup = new THREE.Group();
        decoGroup = new THREE.Group();
        overlayGroup = new THREE.Group();
        spriteGroup = new THREE.Group();
        scene.add(treeGroup, decoGroup, overlayGroup, spriteGroup);

        Renderer3D.resize();
    }

    // Grobkörnige Pixel-Noise-Textur (NearestFilter, große "Pixel") für den
    // Boden — bereits live. Bewusst geringer Kontrast und hohe Grundhelligkeit
    // (sanfter, heller — statt "dreckiger" 8-Bit-Look).
    let _noiseTex = null;
    function getNoiseTexture() {
        if (_noiseTex) return _noiseTex;
        const size = 16;                     // klein + NearestFilter → sichtbare Pixelblöcke
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const rng = createPRNG(4242);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const v = 195 + Math.floor(rng() * 40);   // schwacher Kontrast, wirkt ruhig/sanft
            g.fillStyle = `rgb(${v},${v},${v})`;
            g.fillRect(x, y, 1, 1);
        }
        for (let i = 0; i < 14; i++) {
            const v = 150 + Math.floor(rng() * 40);
            g.fillStyle = `rgb(${v},${v},${v})`;
            g.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
        }
        _noiseTex = new THREE.CanvasTexture(c);
        _noiseTex.magFilter = THREE.NearestFilter;
        _noiseTex.minFilter = THREE.NearestFilter;
        _noiseTex.wrapS = _noiseTex.wrapT = THREE.RepeatWrapping;
        _noiseTex.repeat.set(1.8, 1.8);      // pro Hex mehrfach kacheln → grobe, klar sichtbare Blöcke
        return _noiseTex;
    }

    // Alle Hexes, auf denen irgendein Bauwerk/Stein steht, egal ob Billboard oder
    // echtes 3D-Modell (Bäume aussparen — Wald würde sonst durch alles hindurchwachsen)
    function collectBuildingHexes(state) {
        const set = new Set();
        if (state.v) for (const key of Object.keys(state.v)) set.add(key);
        if (state.tu) state.tu.forEach(t => { set.add(`${t.x1},${t.y1}`); set.add(`${t.x2},${t.y2}`); });
        if (state.tw) state.tw.forEach(t => { if (t.h > 0) set.add(`${t.x},${t.y}`); });
        if (state.wa) state.wa.forEach(w => set.add(`${w.x},${w.y}`));
        if (state.st) state.st.forEach(s => { if (s.h > 0) set.add(`${s.x},${s.y}`); });
        if (state.ct) set.add(`${state.ct.x},${state.ct.y}`);
        return set;
    }

    // Teilmenge von collectBuildingHexes: nur Hexes, deren Bewohner aktuell
    // tatsächlich ein echtes 3D-Voxelmodell rendert (hängt von `voxelModels` ab,
    // das je nach Live-Freigabestand unterschiedliche Keys enthalten kann — aktuell
    // z.B. "stone" bereits live, Gebäude noch nicht). Für den Einheiten-Vorzieh-
    // Offset, der nur bei echten volumetrischen Körpern nötig ist (Billboards
    // verstecken Einheiten nicht auf die gleiche Art).
    function collectVoxelBodyHexes(state) {
        const set = new Set();
        if (voxelModels.stone && state.st) state.st.forEach(s => { if (s.h > 0) set.add(`${s.x},${s.y}`); });
        if (voxelModels.tower && state.tw) state.tw.forEach(t => { if (t.h > 0) set.add(`${t.x},${t.y}`); });
        if (voxelModels.wall && state.wa) state.wa.forEach(w => set.add(`${w.x},${w.y}`));
        if (voxelModels.tunnel && state.tu) state.tu.forEach(t => { set.add(`${t.x1},${t.y1}`); set.add(`${t.x2},${t.y2}`); });
        if (voxelModels.watchtower && state.ct) set.add(`${state.ct.x},${state.ct.y}`);
        if (state.v && (voxelModels.village || voxelModels.startVillage)) {
            for (const [key, ownerId] of Object.entries(state.v)) {
                const isStart = ownerId !== -1 && state.p[ownerId] && state.p[ownerId].sv === key;
                if (voxelModels[isStart ? 'startVillage' : 'village']) set.add(key);
            }
        }
        return set;
    }

    // Alle Hexes, auf denen aktuell eine Einheit steht — Wald dort ausdünnen,
    // damit man erkennt, was im Wald steht (reine Sicht-Deko, keine Spiellogik)
    function collectUnitHexes(state) {
        const set = new Set();
        if (state.u) state.u.forEach(u => set.add(`${u.x},${u.y}`));
        return set;
    }

    function buildTiles(state) {
        if (tileMesh) { scene.remove(tileMesh); tileMesh.dispose(); tileMesh.geometry.dispose(); tileMesh.material.dispose(); }
        tileIndex = []; tileLookup = {};

        const coords = [];
        for (let y = 0; y < state.bh; y++) {
            for (let x = 0; x < state.bw; x++) {
                if (!isInsideMap(state, x, y)) continue;
                coords.push({ x, y, tType: getTerrainType(state, x, y) });
            }
        }

        // Einheits-Prisma (Höhe 1, Spitze nach Norden), per Instanz in Y skaliert.
        // Vertex-Farben als Fake-AO: Deckel hell mit sanft abgedunkeltem Rand, Seiten
        // laufen nach unten dunkler zu, plus sanfte Pixel-Noise-Textur. Bereits live
        // (nicht mehr per DEBUG_ART gegated) — nur Gebäude/Einheiten bleiben vorerst
        // hinter dem Gate (Stein-Resource ist als Ausnahme bereits ebenfalls live).
        const geo = new THREE.CylinderGeometry(hexSize, hexSize, 1, 6, 1, false);
        const pos = geo.attributes.position, nrm = geo.attributes.normal;
        const vcol = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const ny = nrm.getY(i);
            let v;
            if (ny > 0.9) {
                const r = Math.sqrt(pos.getX(i) ** 2 + pos.getZ(i) ** 2) / hexSize;
                v = 1.0 - r * 0.08;                       // Deckel: Rand nur leicht dunkler
            } else if (ny < -0.9) {
                v = 0.4;                                  // Boden (unsichtbar)
            } else {
                v = 0.62 + (pos.getY(i) + 0.5) * 0.26;    // Seiten: unten dunkler, insgesamt heller
            }
            vcol[i * 3] = vcol[i * 3 + 1] = vcol[i * 3 + 2] = v;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(vcol, 3));
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: getNoiseTexture() });
        tileMesh = new THREE.InstancedMesh(geo, mat, coords.length);
        // Instanzen liegen über die ganze Karte verteilt — Three würde sonst anhand
        // der Geometrie-Bounds am Ursprung cullen und das Mesh beim Reinzoomen verwerfen
        tileMesh.frustumCulled = false;
        tileMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(coords.length * 3), 3);

        const m = new THREE.Matrix4();
        coords.forEach((c, i) => {
            const { wx, wz } = worldPos(c.x, c.y);
            const h = tileHeight(c.tType);
            m.makeScale(0.985, h, 0.985);       // minimale Fuge zwischen Tiles
            m.setPosition(wx, h / 2, wz);
            tileMesh.setMatrixAt(i, m);
            tileIndex.push(c);
            tileLookup[`${c.x},${c.y}`] = i;
        });
        tileMesh.instanceMatrix.needsUpdate = true;
        scene.add(tileMesh);
        builtSeed = `${state.sd}|${state.bw}|${state.bh}|${state.rad}`;
    }

    function updateTileColors(state, vis, explored) {
        const col = new THREE.Color();
        tileIndex.forEach((c, i) => {
            const idx = c.y * state.bw + c.x;
            if (!explored.includes(idx)) {
                col.copy(COL_UNEXPLORED);
            } else {
                col.set(terrainColors[c.tType].top);
                // Deterministische Farbvariation pro Tile gegen den Flächen-Einheitslook —
                // schmale Spanne für einen ruhigen, wenig fleckigen Boden. Bereits live.
                const j = (((c.x * 73856093) ^ (c.y * 19349663)) >>> 0) % 1000 / 1000;
                col.multiplyScalar(0.97 + j * 0.06);
                if (!vis.has(`${c.x},${c.y}`)) col.multiplyScalar(SHROUD_MUL);
            }
            tileMesh.setColorAt(i, col);
        });
        tileMesh.instanceColor.needsUpdate = true;
    }

    // Unterwelt-Unterseite: eigenes InstancedMesh je Tile (Terrain-Farbe/-Tiefe
    // nach `getUnderworldType`) + ein zweites, kleineres InstancedMesh für die
    // Kristall-/Ruinen-/Herzkaverne-Akzente. Gebaut wie tileMesh nur bei Seed-/
    // Kartenwechsel (uwBuiltSeed-Signatur), pro Frame nur sichtbar geschaltet
    // (drawScene3d) — kein Rebuild bei Kamera-Gesten.
    let uwTileMesh = null, uwAccentMesh = null, uwBuiltSeed = null;
    let uwTileIndex = [];      // instanceId -> {x, y} (uwTileMesh), für die Pro-Frame-Sichtfärbung
    let uwAccentIndex = [];    // instanceId -> {x, y} (uwAccentMesh), zum Ausblenden unerforschter Akzente
    // Echte Voxel-Felsbrocken (M-Auftrag "richtige Steine aus Voxeln"): eigenes
    // InstancedMesh, seed-memoisiert wie uwTileMesh/uwAccentMesh — NICHT über
    // das per-Frame-voxelMesh (bis zu ~370 Fels-Hexes je Karte, s. PLAN.md).
    let uwFelsMesh = null;
    let uwFelsIndex = [];      // instanceId -> {x, y} (uwFelsMesh), zum Wegparken unerforschter Brocken

    // Sichtbarer Terrain-Typ inkl. Laufzeit-Zustand (M9b): durchgegrabener Fels
    // zeigt sich wie eine Kaverne, eine leergegrabene Ader wie eine Kaverne ohne
    // Kristalle — getUnderworldType allein kennt nur den STATISCHEN Seed-Typ.
    function uwVisualType(state, x, y) {
        const t = getUnderworldType(state, x, y);
        if (t === UW_ADER) return getUWVeinRemaining(state, x, y) > 0 ? UW_ADER : UW_KAVERNE;
        if (t === UW_FELS && isUnderworldOpen(state, x, y)) return UW_KAVERNE;
        return t;
    }

    function buildUnderworldTiles(state) {
        // uw.d/uw.a und nutzbare Tunnel-Köpfe verändern die sichtbare Geometrie
        // (Graben/Abbau/Tunnelbau öffnen Hexes), ohne dass sich Seed/Kartengröße
        // ändern — die Cache-Signatur muss das mit einschließen, sonst zeigt das
        // Mesh nach dem Graben weiter den alten, massiven Fels (M9b-Auftrag).
        const uw = state.uw || {};
        const uwDigSig = Array.isArray(uw.d) ? uw.d.join(',') : (uw.d || '');
        const uwAderSig = uw.a ? Object.keys(uw.a).map(k => k + ':' + uw.a[k]).join(',') : '';
        const tuSig = (state.tu || []).map(t => `${t.x1},${t.y1}-${t.x2},${t.y2}-${t.o}-${t.r <= state.rn ? 1 : 0}`).join('|');
        const seedKey = `${state.sd}|${state.bw}|${state.bh}|${state.rad}|${uwDigSig}|${uwAderSig}|${tuSig}`;
        if (uwBuiltSeed === seedKey) return;
        uwBuiltSeed = seedKey;

        if (uwTileMesh) { scene.remove(uwTileMesh); uwTileMesh.dispose(); uwTileMesh.geometry.dispose(); uwTileMesh.material.dispose(); uwTileMesh = null; }
        if (uwAccentMesh) { scene.remove(uwAccentMesh); uwAccentMesh.dispose(); uwAccentMesh.geometry.dispose(); uwAccentMesh.material.dispose(); uwAccentMesh = null; }
        if (uwFelsMesh) { scene.remove(uwFelsMesh); uwFelsMesh.dispose(); uwFelsMesh.geometry.dispose(); uwFelsMesh.material.dispose(); uwFelsMesh = null; }

        // tileIndex ist zu diesem Zeitpunkt bereits von buildTiles() befüllt
        // (drawScene3d ruft beide im selben Seed-Wechsel-Zweig auf); Fallback
        // für den unwahrscheinlichen Fall eines direkten Aufrufs ohne das.
        const coords = tileIndex.length ? tileIndex.map(c => ({ x: c.x, y: c.y })) : (() => {
            const list = [];
            for (let y = 0; y < state.bh; y++) for (let x = 0; x < state.bw; x++) if (isInsideMap(state, x, y)) list.push({ x, y });
            return list;
        })();

        const geo = new THREE.CylinderGeometry(hexSize * 0.99, hexSize * 0.99, 1, 6, 1, false);
        const pos = geo.attributes.position, nrm = geo.attributes.normal;
        const vcol = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const ny = nrm.getY(i);
            // Von unten betrachtet ist die -Y-Kappe die dem Auge zugewandte
            // "Deckfläche" (umgekehrt zu tileMesh, das von oben betrachtet wird).
            const v = ny < -0.9 ? 1.0 : ny > 0.9 ? 0.5 : 0.75;
            vcol[i * 3] = vcol[i * 3 + 1] = vcol[i * 3 + 2] = v;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(vcol, 3));
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
        uwTileMesh = new THREE.InstancedMesh(geo, mat, coords.length);
        uwTileMesh.frustumCulled = false;
        uwTileMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(coords.length * 3), 3);

        uwTileIndex = coords;
        const accentPositions = [];
        // Massive Fels-Hexes (+ Adern mit Restbestand, die zählen als Fels bis
        // zum Abbau) — Sammelstelle für die echten Voxel-Felsbrocken weiter
        // unten (M-Auftrag "richtige Steine aus Voxeln").
        const felsPositions = [];
        const m = new THREE.Matrix4();
        const col = new THREE.Color();
        coords.forEach((c, i) => {
            const uType = uwVisualType(state, c.x, c.y);
            const depth = underworldDepth(uType);
            const { wx, wz } = worldPos(c.x, c.y);
            m.makeScale(0.985, depth, 0.985);
            m.setPosition(wx, -depth / 2, wz);
            uwTileMesh.setMatrixAt(i, m);

            col.set(UW_COLORS[uType] || UW_COLORS[UW_FELS]);
            // Deterministischer Farbjitter pro Tile, gleiches Muster wie updateTileColors
            const j = (((c.x * 92821) ^ (c.y * 68917)) >>> 0) % 1000 / 1000;
            col.multiplyScalar(0.9 + j * 0.2);
            uwTileMesh.setColorAt(i, col);

            if (uType === UW_ADER || uType === UW_RUINE || uType === UW_HERZ) {
                accentPositions.push({ x: c.x, y: c.y, uType, wx, wz, depth });
            }
            if (uType === UW_FELS || uType === UW_ADER) {
                felsPositions.push({ x: c.x, y: c.y, wx, wz, depth });
            }
            // Stollenköpfe bekommen KEINEN Tile-Akzent mehr — dort wird stattdessen
            // das Oberflächen-Tunnelgebäude 1:1 in die Unterwelt gespiegelt (inkl.
            // gemeinsamem HP-Pool), siehe den Tunnel-HUB-Block in drawScene3d.
        });
        uwTileMesh.instanceMatrix.needsUpdate = true;
        scene.add(uwTileMesh);

        // Kristall-/Fund-/Herz-Akzente: kleine unbeleuchtete Boxen ("Glitzern") an
        // den wenigen Sonder-Hexes — MeshBasicMaterial statt Lambert, damit sie
        // auch ohne direktes Licht als heller Akzent auffallen.
        const perHexAccents = 3;
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const accentMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
        uwAccentMesh = new THREE.InstancedMesh(boxGeo, accentMat, Math.max(1, accentPositions.length * perHexAccents * 2));
        uwAccentMesh.frustumCulled = false;
        uwAccentMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(uwAccentMesh.count * 3), 3);
        uwAccentIndex = [];
        let n = 0;
        accentPositions.forEach(a => {
            const rng = createPRNG(a.x * 1013 + a.y * 7919 + 55);
            const baseCol = new THREE.Color(UW_ACCENT_COLORS[a.uType] || '#7fe3ff');
            // Herzkaverne deutlich hervorgehoben: mehr + größere Akzent-Voxel
            const isHeart = a.uType === UW_HERZ;
            const count = isHeart ? perHexAccents * 2 : perHexAccents;
            for (let k = 0; k < count; k++) {
                if (n >= uwAccentMesh.count) break;
                const dx = (rng() - 0.5) * hexSize * 1.1;
                const dz = (rng() - 0.5) * hexSize * 1.1;
                const s = (isHeart ? 1.6 : 0.9) + rng() * (isHeart ? 1.0 : 0.6);
                m.makeScale(s, s, s);
                m.setPosition(a.wx + dx, -a.depth + s * 0.5, a.wz + dz);
                uwAccentMesh.setMatrixAt(n, m);
                col.copy(baseCol).multiplyScalar(0.85 + rng() * 0.4);
                uwAccentMesh.setColorAt(n, col);
                uwAccentIndex.push({ x: a.x, y: a.y });
                n++;
            }
        });
        uwAccentMesh.count = Math.max(n, 1);
        uwAccentMesh.instanceMatrix.needsUpdate = true;
        uwAccentMesh.instanceColor.needsUpdate = true;
        scene.add(uwAccentMesh);

        // Echte Voxel-Felsbrocken (M-Auftrag "richtige Steine aus Voxeln, leicht
        // unterschiedlich"): EIN InstancedMesh für alle Fels-/Ader-Hexes der
        // Karte (Muster: uwAccentMesh oben) statt über das per-Frame-voxelMesh
        // (bei bis zu ~370 Fels-Hexes je Karte ein spürbarer Unterschied) —
        // modelVoxels() (weiter unten definiert, aber zur Laufzeit längst
        // vorhanden) liefert je Variante die bereits Culling-bereinigte
        // Voxelliste + Basisgröße, exakt wie addVoxelModel sie für Gebäude
        // nutzt. Pro Hex: Variante/Rotation/Skalen-Jitter deterministisch aus
        // dem Hex selbst (createPRNG-Muster wie die Kristall-Akzente oben) —
        // gegrabene/abgebaute Hexes fallen automatisch aus felsPositions raus,
        // sobald buildUnderworldTiles nach uw.d/uw.a neu läuft (Cache-Signatur
        // s. seedKey oben).
        const FELS_VARIANTS = ['uw_fels_a', 'uw_fels_b', 'uw_fels_c'];
        if (felsPositions.length && FELS_VARIANTS.every(k => voxelModels[k])) {
            const variantData = FELS_VARIANTS.map(k => modelVoxels(k));
            // Variantenwahl ist rein vom Hex abhängig (createPRNG(seed) liefert bei
            // gleichem seed immer dieselbe Folge) — ein Vorab-Durchlauf bestimmt
            // daher exakt dieselbe Variante wie der Bau-Durchlauf unten und liefert
            // die WIRKLICHE Voxelsumme statt einer worst-case-Schätzung (jede
            // Variante <40 Voxel, aber 412 Fels-Hexes × größte Variante würde die
            // ~15k-Instanzbudget-Vorgabe knapp reißen; der Voranschlag hält den
            // Puffer exakt).
            let plannedTotal = 0;
            felsPositions.forEach(f => {
                const idx = Math.floor(createPRNG(f.x * 7247 + f.y * 5119 + 911)() * FELS_VARIANTS.length) % FELS_VARIANTS.length;
                plannedTotal += variantData[idx].voxels.length;
            });
            const felsGeo = new THREE.BoxGeometry(1, 1, 1);
            const felsMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
            uwFelsMesh = new THREE.InstancedMesh(felsGeo, felsMat, Math.max(1, plannedTotal));
            uwFelsMesh.frustumCulled = false;
            uwFelsMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(uwFelsMesh.count * 3), 3);
            uwFelsIndex = [];
            const fPos = new THREE.Vector3(), fQuat = new THREE.Quaternion(), fEuler = new THREE.Euler(), fScale = new THREE.Vector3();
            let fn = 0;
            felsPositions.forEach(f => {
                const rng = createPRNG(f.x * 7247 + f.y * 5119 + 911);
                const variant = variantData[Math.floor(rng() * FELS_VARIANTS.length) % FELS_VARIANTS.length];
                const rotY = Math.floor(rng() * 4) * (Math.PI / 2); // 0/90/180/270
                const scaleJitter = 0.85 + rng() * 0.3;
                const s = variant.s * scaleJitter;
                const topH = variant.h * s;
                // Gleiches Hänge-Prinzip wie addVoxelModel(mirrorY): groundY sitzt
                // an der Fels-"Deckenzähne"-Wurzel (Unterseite der flachen
                // uwTileMesh-Scheibe), die Voxel wachsen von dort nach unten
                // (Richtung Kamera) in den Raum.
                const groundY = -f.depth - topH;
                fEuler.set(0, rotY, 0);
                fQuat.setFromEuler(fEuler);
                fScale.set(s, s, s);
                const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
                variant.voxels.forEach(v => {
                    if (fn >= uwFelsMesh.count) return;
                    const lx = (v.x - (variant.w - 1) / 2) * s;
                    const lz = (v.z - (variant.d - 1) / 2) * s;
                    const ly = groundY + (v.y + 0.5) * s;
                    fPos.set(f.wx + lx * cosR + lz * sinR, ly, f.wz - lx * sinR + lz * cosR);
                    m.compose(fPos, fQuat, fScale);
                    uwFelsMesh.setMatrixAt(fn, m);
                    col.set(spritePixelColor(v.val, '#7d838f'));
                    uwFelsMesh.setColorAt(fn, col);
                    uwFelsIndex.push({ x: f.x, y: f.y });
                    fn++;
                });
            });
            uwFelsMesh.count = Math.max(fn, 1);
            uwFelsMesh.instanceMatrix.needsUpdate = true;
            uwFelsMesh.instanceColor.needsUpdate = true;
            scene.add(uwFelsMesh);
        }
    }

    // Pro-Frame-Sichtfärbung der Unterwelt-Terrain-Schicht (M9b): läuft bei jedem
    // Render, unabhängig vom seed-memoisierten Rebuild oben (gleiches Verhältnis
    // wie tileMesh/updateTileColors auf der Oberfläche) — Hexes außerhalb der
    // eigenen Netz-Geometrie (getVisibleUWHexes) werden auf COL_UNEXPLORED
    // abgedunkelt, unerforschte Akzent-Voxel zusätzlich weggeparkt (sonst
    // schiene ein Kristallglitzern durch die massive Dunkelheit).
    function updateUWTileColors(state, uwVis) {
        if (!uwTileMesh) return;
        const col = new THREE.Color();
        uwTileIndex.forEach((c, i) => {
            const vType = uwVisualType(state, c.x, c.y);
            if (uwVis.has(`${c.x},${c.y}`)) {
                col.set(UW_COLORS[vType] || UW_COLORS[UW_FELS]);
                const j = (((c.x * 92821) ^ (c.y * 68917)) >>> 0) % 1000 / 1000;
                col.multiplyScalar(0.9 + j * 0.2);
            } else {
                col.copy(COL_UNEXPLORED);
            }
            uwTileMesh.setColorAt(i, col);
        });
        uwTileMesh.instanceColor.needsUpdate = true;

        if (uwAccentMesh) {
            const parkM = new THREE.Matrix4();
            uwAccentIndex.forEach((a, i) => {
                if (uwVis.has(`${a.x},${a.y}`)) return; // sichtbar: Matrix kommt bereits korrekt aus buildUnderworldTiles
                parkM.makeScale(0, 0, 0);
                parkM.setPosition(0, -1000, 0);
                uwAccentMesh.setMatrixAt(i, parkM);
            });
            uwAccentMesh.instanceMatrix.needsUpdate = true;
        }

        // Fels-Voxel-Brocken folgen derselben Netz-Sichtregel wie die
        // Kristall-Akzente: unerforscht -> wegparken (kein Rebuild nötig, reine
        // Pro-Frame-Sichtbarkeit wie überall sonst in dieser Funktion).
        if (uwFelsMesh) {
            const parkM = new THREE.Matrix4();
            uwFelsIndex.forEach((a, i) => {
                if (uwVis.has(`${a.x},${a.y}`)) return; // sichtbar: Matrix kommt bereits korrekt aus buildUnderworldTiles
                parkM.makeScale(0, 0, 0);
                parkM.setPosition(0, -1000, 0);
                uwFelsMesh.setMatrixAt(i, parkM);
            });
            uwFelsMesh.instanceMatrix.needsUpdate = true;
        }
    }

    // Group.clear() entfernt Kinder nur aus der Szene, gibt aber ihre GPU-Buffer
    // (Geometrie/Material) NICHT frei. rebuildTrees/rebuildDeco erzeugen jedes Mal
    // ein komplett neues InstancedMesh und werden bei jeder Kamera-Geste (Pan/Zoom/
    // Orbit → requestRender3d → drawScene3d) neu aufgerufen, nicht nur bei
    // Spielzustands-Änderungen — ohne Dispose sammeln sich pro Sekunde mehrere
    // verwaiste Meshes an und laufen dem GPU-Speicher davon (Freeze, danach
    // schwarze Tiles durch WebGL-Kontextverlust).
    function disposeGroupChildren(group) {
        for (const child of group.children) {
            // InstancedMesh.dispose() gibt zusätzlich die GPU-Buffer von
            // instanceMatrix/instanceColor frei (liegen nicht in geometry.attributes,
            // geometry.dispose() allein reicht dafür nicht aus)
            if (child.dispose) child.dispose();
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        group.clear();
    }

    // Bäume/Deko sind weltfest — Kamera-Gesten (Pan/Zoom/Orbit) ändern an ihnen
    // nichts, drawScene3d läuft aber bei jeder Geste (~60×/s). Ohne Memoisierung
    // würde pro Frame ein neues InstancedMesh alloziert und wieder verworfen
    // (GPU-Churn, der nach Minuten zum Kontextverlust führen kann). Rebuild nur,
    // wenn sich die tatsächlichen Eingaben (Sicht/Gebäude/Einheiten-Hexes) ändern.
    let _treeSig = null, _decoSig = null;

    function rebuildTrees(state, vis, buildingHexes, unitHexes) {
        const sig = builtSeed + '|' + [...vis].join(',') + '|' + [...buildingHexes].join(',') + '|' + [...unitHexes].join(',');
        if (sig === _treeSig) return;
        _treeSig = sig;
        disposeGroupChildren(treeGroup);
        // Kein Wald-Bewuchs auf Hexes mit Gebäuden — Bäume würden durch die Modelle wachsen
        const forests = tileIndex.filter(c => c.tType === 'forest' && vis.has(`${c.x},${c.y}`) && !buildingHexes.has(`${c.x},${c.y}`));
        if (forests.length === 0) return;
        // Voxel-Baumvielfalt bereits live (nicht mehr per DEBUG_ART gegated) —
        // rebuildTreesClassic bleibt als Referenz/Rückfallebene erhalten.
        rebuildTreesNew(forests, unitHexes);
    }

    // Altes Live-Design (unverändert, aktuell nicht mehr aufgerufen): Tannen aus
    // Stamm + zwei gestaffelten Kronen-Kegeln
    function rebuildTreesClassic(forests) {
        const treePositions = [
            { dx: 0, dy: -4, sz: 7 }, { dx: -9, dy: 2, sz: 6 }, { dx: 8, dy: 3, sz: 5 },
            { dx: -4, dy: -1, sz: 5 }, { dx: 5, dy: -2, sz: 4 }
        ];
        const treeColors = ['#0d140e', '#1b3a1e', '#15291a', '#0a1f0d', '#2a4430'];
        const coneGeo = new THREE.ConeGeometry(1, 1, 5);
        const mesh = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), forests.length * treePositions.length);
        mesh.frustumCulled = false;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);

        const m = new THREE.Matrix4();
        const col = new THREE.Color();
        let n = 0;
        forests.forEach(c => {
            const { wx, wz } = worldPos(c.x, c.y);
            const rng = createPRNG(c.x * 1000 + c.y);
            treePositions.forEach((t, ti) => {
                const tx = wx + t.dx + (rng() - 0.5) * 3;
                const tz = wz + t.dy + (rng() - 0.5) * 2;
                const height = t.sz * 2.4;
                m.makeScale(t.sz, height, t.sz);
                m.setPosition(tx, TILE_H + height / 2, tz);
                mesh.setMatrixAt(n, m);
                col.set(treeColors[ti % treeColors.length]).multiplyScalar(1.6);
                mesh.setColorAt(n, col);
                n++;
            });
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        treeGroup.add(mesh);
    }

    // Redesign, bereits live: blockige Voxel-Bäume in 3 klar unterscheidbaren
    // Sorten (Kiefer dunkelgrün, rundes Laub oliv, kahles Totholz grau). Auf
    // Hexes mit einer Einheit werden weniger/kürzere Bäume gesetzt und nach
    // außen gerückt, damit man erkennt, was im Wald steht (reine Deko-Regel,
    // Sichtlinien-Logik/getVisibleHexes bleibt unberührt).
    const TREE_PARTS = {
        pine: [
            { dx: 0, dz: 0, y0: 0, y1: 0.35, w: 0.28, d: 0.28, col: 'trunk' },
            { dx: 0, dz: 0, yc: 0.48, h: 0.5, w: 1.0, d: 1.0, col: 'lo' },
            { dx: 0, dz: 0, yc: 0.74, h: 0.46, w: 0.68, d: 0.68, col: 'mid' },
            { dx: 0, dz: 0, yc: 0.96, h: 0.38, w: 0.4, d: 0.4, col: 'hi' }
        ],
        round: [
            { dx: 0, dz: 0, y0: 0, y1: 0.4, w: 0.26, d: 0.26, col: 'trunk' },
            { dx: 0, dz: 0, yc: 0.7, h: 0.56, w: 0.8, d: 0.8, col: 'oliveMid' },
            { dx: -0.5, dz: 0, yc: 0.66, h: 0.44, w: 0.46, d: 0.46, col: 'oliveLo' },
            { dx: 0.5, dz: 0, yc: 0.66, h: 0.44, w: 0.46, d: 0.46, col: 'oliveLo' },
            { dx: 0, dz: -0.5, yc: 0.66, h: 0.44, w: 0.46, d: 0.46, col: 'oliveHi' },
            { dx: 0, dz: 0.5, yc: 0.66, h: 0.44, w: 0.46, d: 0.46, col: 'oliveHi' }
        ],
        dead: [
            { dx: 0, dz: 0, y0: 0, y1: 0.85, w: 0.2, d: 0.2, col: 'dead' },
            { dx: 0.32, dz: 0, yc: 0.58, h: 0.14, w: 0.46, d: 0.14, col: 'dead' },
            { dx: -0.28, dz: 0.05, yc: 0.78, h: 0.12, w: 0.38, d: 0.12, col: 'dead' }
        ]
    };
    const TREE_COLORS = {
        trunk: '#3a281a', lo: '#16280f', mid: '#1e3417', hi: '#294a20',
        oliveLo: '#4a5424', oliveMid: '#5c6b2a', oliveHi: '#6d7f34',
        dead: '#5a564e'
    };
    const MAX_TREE_PARTS = 6;

    function pickTreeType(rng) {
        const r = rng();
        if (r < 0.48) return 'pine';
        if (r < 0.8) return 'round';
        return 'dead';
    }

    function rebuildTreesNew(forests, unitHexes) {
        const fullPositions = [
            { dx: -8, dy: -4, sz: 7 }, { dx: 8, dy: 3, sz: 6 }, { dx: -2, dy: 6, sz: 5 }
        ];
        const thinPositions = [
            { dx: -10, dy: -2, sz: 4.5 }, { dx: 10, dy: 5, sz: 4 }
        ];
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const mesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), forests.length * fullPositions.length * MAX_TREE_PARTS);
        mesh.frustumCulled = false;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);

        const m = new THREE.Matrix4();
        const col = new THREE.Color();
        let n = 0;
        forests.forEach(c => {
            const { wx, wz } = worldPos(c.x, c.y);
            const rng = createPRNG(c.x * 1000 + c.y);
            const occupied = unitHexes && unitHexes.has(`${c.x},${c.y}`);
            const positions = occupied ? thinPositions : fullPositions;
            const heightMul = occupied ? 0.55 : 1;
            positions.forEach(t => {
                const tx = wx + t.dx + (rng() - 0.5) * 3;
                const tz = wz + t.dy + (rng() - 0.5) * 2;
                const sz = t.sz * (0.8 + rng() * 0.4);
                const totalH = sz * 2.6 * heightMul;
                const type = pickTreeType(rng);
                const vary = 0.88 + rng() * 0.3;
                for (const p of TREE_PARTS[type]) {
                    const w = p.w * sz, d = p.d * sz;
                    let yCenter, h;
                    if (p.y0 !== undefined) { h = (p.y1 - p.y0) * totalH; yCenter = TILE_H + p.y0 * totalH + h / 2; }
                    else { h = p.h * totalH; yCenter = TILE_H + p.yc * totalH; }
                    if (n >= mesh.count) continue;
                    m.makeScale(w, h, d);
                    m.setPosition(tx + p.dx * sz, yCenter, tz + p.dz * sz);
                    mesh.setMatrixAt(n, m);
                    col.set(TREE_COLORS[p.col]).multiplyScalar(vary);
                    mesh.setColorAt(n, col);
                    n++;
                }
            });
        });
        mesh.count = Math.max(n, 1);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        treeGroup.add(mesh);
    }

    // Pixel-Schmutz auf den Tiles: dunkle Flecken, Steinchen, selten Knochen —
    // bricht die makellosen Flächen auf (dirty dark 8-bit). Bereits live.
    function rebuildDeco(state, vis, buildingHexes) {
        // Gleiche Memoisierung wie rebuildTrees — Deko ist weltfest, Rebuild nur
        // bei geänderter Sicht/Bebauung, nicht bei jeder Kamera-Geste
        const sig = builtSeed + '|' + [...vis].join(',') + '|' + [...buildingHexes].join(',');
        if (sig === _decoSig) return;
        _decoSig = sig;
        disposeGroupChildren(decoGroup);
        const tiles = tileIndex.filter(c => c.tType !== 'forest' && vis.has(`${c.x},${c.y}`) && !buildingHexes.has(`${c.x},${c.y}`));
        if (tiles.length === 0) return;

        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), tiles.length * 6);
        mesh.frustumCulled = false;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);

        const m = new THREE.Matrix4();
        const col = new THREE.Color();
        const base = new THREE.Color();
        const bone = new THREE.Color('#a8a290');
        let n = 0;
        tiles.forEach(c => {
            const { wx, wz } = worldPos(c.x, c.y);
            const gy = tileHeight(c.tType);
            base.set(terrainColors[c.tType].top);
            const rng = createPRNG(c.x * 7919 + c.y * 104729);
            const count = 2 + Math.floor(rng() * 4);
            for (let i = 0; i < count; i++) {
                const dx = (rng() - 0.5) * 30;
                const dz = (rng() - 0.5) * 26;
                const s = 2 + rng() * 1.6;
                m.makeScale(s, 1.1, s);
                m.setPosition(wx + dx, gy + 0.55, wz + dz);
                mesh.setMatrixAt(n, m);
                const roll = rng();
                if (roll < 0.06) col.copy(bone);                                   // Knochen/Gebein
                else if (roll < 0.45) col.copy(base).multiplyScalar(0.55);         // dunkler Fleck
                else if (roll < 0.75) col.copy(base).multiplyScalar(0.75);         // Schmutz
                else col.copy(base).multiplyScalar(1.35);                          // helles Geröll
                mesh.setColorAt(n, col);
                n++;
            }
        });
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        decoGroup.add(mesh);
    }

    // ── Entities als Voxel ────────────────────────────────────────────────────
    function ensureVoxelMesh() {
        if (voxelMesh) return;
        const geo = new THREE.BoxGeometry(1, 1, 1);
        voxelMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), VOXEL_CAP);
        voxelMesh.frustumCulled = false;
        voxelMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(VOXEL_CAP * 3), 3);
        scene.add(voxelMesh);

        // Eigenes transparentes Mesh für die Luft-Ebene (Flieger 10% <-> 100%)
        airVoxelMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({
            color: 0xffffff, transparent: true, opacity: airAlpha, depthWrite: false
        }), VOXEL_CAP);
        airVoxelMesh.frustumCulled = false;
        airVoxelMesh.renderOrder = 10;   // nach allem anderen zeichnen (Transparenz-Sortierung)
        airVoxelMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(VOXEL_CAP * 3), 3);
        scene.add(airVoxelMesh);

        const shadowGeo = new THREE.CircleGeometry(12, 16);
        shadowGeo.rotateX(-Math.PI / 2);
        shadowMesh = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }), 512);
        shadowMesh.frustumCulled = false;
        scene.add(shadowMesh);
    }

    const _vm = new THREE.Matrix4();
    const _vc = new THREE.Color();
    const _sPos = new THREE.Vector3();
    const _sScale = new THREE.Vector3(1, 1, 0.55);
    const _sQuat = new THREE.Quaternion();
    const _rPos = new THREE.Vector3();
    const _rQuat = new THREE.Quaternion();
    const _rEuler = new THREE.Euler();
    const _rScale = new THREE.Vector3();
    const _sEuler = new THREE.Euler();
    let _voxelCount = 0;
    let _airVoxelCount = 0;
    let _voxelAir = false;                 // Routing-Flag: addVoxelSprite -> Luft-Mesh
    let _shadowCount = 0;
    const _bottomRowCache = {};

    // Unterste gefüllte Pixelzeile eines Sprites — viele Sprites haben unten
    // transparente Zeilen und würden sonst über dem Boden schweben
    function spriteBottomRow(spriteKey, dict) {
        dict = dict || pixelSprites;
        const cacheKey = (dict === CLASSIC_PIXEL_SPRITES ? 'classic:' : '') + spriteKey;
        if (_bottomRowCache[cacheKey] !== undefined) return _bottomRowCache[cacheKey];
        const arr = dict[spriteKey];
        const size = Math.round(Math.sqrt(arr.length));
        let bottom = size - 1;
        for (let row = size - 1; row >= 0; row--) {
            if (arr.slice(row * size, row * size + size).some(v => v !== 0)) { bottom = row; break; }
        }
        _bottomRowCache[cacheKey] = { bottom, size };
        return _bottomRowCache[cacheKey];
    }

    // Klassische (Live-)Sprite-Farbe — unabhängig vom aktiven DEBUG_ART-Datensatz,
    // damit Einheiten im Debug-Modus trotz neuem Terrain/Gebäuden 1:1 wie im
    // echten Spiel aussehen.
    function classicSpriteColor(val, playerColor) {
        if (val === P) return playerColor;
        if (val === PD) return darkenHexColor(playerColor, 0.55);
        return CLASSIC_PAL[val];
    }

    // Zeichnet ein pixelSprite als "Pappaufsteller" aus Voxeln (Fläche zur Kamera)
    function addVoxelSprite(spriteKey, wx, wz, groundY, playerColor, dimFactor, tint, dict, colorFn) {
        dict = dict || pixelSprites;
        colorFn = colorFn || spritePixelColor;
        const arr = dict[spriteKey];
        if (!arr) return;
        const { bottom, size } = spriteBottomRow(spriteKey, dict);
        // Einheiten im 3D-Modus etwas größer als früher — bessere Lesbarkeit bei Zoom-out
        const s = ((spriteKey === 9) ? 3.4 : 2.6) * 10 / size;

        const mesh = _voxelAir ? airVoxelMesh : voxelMesh;
        // Sprites kippen mit der Kamera-Neigung (Anker: unterste Zeile), damit sie
        // auch in der 75°-Vogelperspektive lesbar bleiben, und drehen sich um die
        // Hochachse mit dem Kamera-Azimut mit, damit sie beim Rotieren immer mit
        // der Fläche zur Kamera stehen bleiben ("Pappaufsteller" folgt dem Blick).
        const pitch = cam3d.elev - CAM_ELEV;
        const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
        const { rx, rz, fx, fz } = camGroundAxes();
        for (let i = 0; i < arr.length; i++) {
            const val = arr[i];
            if (val === 0) continue;
            const idx = _voxelAir ? _airVoxelCount : _voxelCount;
            if (idx >= VOXEL_CAP) return;
            const colIdx = i % size, rowIdx = Math.floor(i / size);
            const across = (colIdx - (size - 1) / 2) * s;
            const dy = (bottom - rowIdx + 0.5) * s;
            const depth = dy * sinP;
            _vm.makeScale(s, s, s);
            _vm.setPosition(
                wx + across * rx + depth * fx,
                groundY + dy * cosP,
                wz + across * rz + depth * fz
            );
            mesh.setMatrixAt(idx, _vm);
            _vc.set(colorFn(val, playerColor));
            if (tint) _vc.lerp(tint, 0.45);
            if (dimFactor !== 1) _vc.multiplyScalar(dimFactor);
            mesh.setColorAt(idx, _vc);
            if (_voxelAir) _airVoxelCount++; else _voxelCount++;
        }
    }

    // Unterwelt-Einheiten als Voxel-Billboards (M9b, pixelSprites[7,17..22] — der
    // Arbeiter (7) nutzt dabei automatisch sein normales Oberflächen-Sprite, kein
    // separates Unterwelt-Asset). Eigene,
    // bewusst vereinfachte Kopie von addVoxelSprite statt Verzweigung: unter der
    // Karte steht die Kamera UNTER der y=0-Ebene und blickt nach OBEN — "hoch" im
    // Sprite muss deshalb Richtung Kamera (negatives Welt-Y) zeigen, umgekehrt zur
    // Oberfläche. Seit die Unterwelt-Kamera schräg statt senkrecht von unten
    // blickt (UNDERWORLD_ELEV = 180° + CAM_ELEV), kippen die Sprites wie der
    // Oberflächen-"Pappaufsteller" mit der Kamera-Neigung mit — Pitch ist die
    // Abweichung vom Unterwelt-Nominalwinkel, die Formel das punktgespiegelte
    // Pendant zu addVoxelSprite (y und Tiefenrichtung negiert). Reine
    // Präsentation, keine Spiellogik; Null-Risiko für die Boden-Darstellung.
    function addUWVoxelSprite(spriteKey, wx, wz, groundY, playerColor, dimFactor, sizeMultiplier) {
        const arr = pixelSprites[spriteKey];
        if (!arr) return;
        const { bottom, size } = spriteBottomRow(spriteKey, pixelSprites);
        // sizeMultiplier (M11): der Alte Wurm nutzt ein größeres 14x14-Sprite und
        // soll auch optisch deutlich größer wirken als die 10x10-Standardgröße —
        // die "10/size"-Normalisierung gleicht Quellauflösungen sonst automatisch
        // an, ein expliziter Multiplikator hebt ihn zusätzlich hervor.
        const s = 2.6 * 10 / size * (sizeMultiplier || 1);
        const pitch = cam3d.elev - UNDERWORLD_ELEV;
        const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
        const { rx, rz, fx, fz } = camGroundAxes();
        for (let i = 0; i < arr.length; i++) {
            const val = arr[i];
            if (val === 0) continue;
            if (_voxelCount >= VOXEL_CAP) return;
            const colIdx = i % size, rowIdx = Math.floor(i / size);
            const across = (colIdx - (size - 1) / 2) * s;
            const dy = (bottom - rowIdx + 0.5) * s;
            _vm.makeScale(s, s, s);
            _vm.setPosition(
                wx + across * rx - dy * sinP * fx,
                groundY - dy * cosP,
                wz + across * rz - dy * sinP * fz
            );
            voxelMesh.setMatrixAt(_voxelCount, _vm);
            _vc.set(spritePixelColor(val, playerColor));
            if (dimFactor !== 1) _vc.multiplyScalar(dimFactor);
            voxelMesh.setColorAt(_voxelCount, _vc);
            _voxelCount++;
        }
    }

    // ── Echte 3D-Voxelmodelle (Gebäude, Steine) ───────────────────────────────
    // Stehen fest in der Welt (kein Billboarding) — beim Orbiten sieht man sie
    // von allen Seiten. Innenliegende, nie sichtbare Voxel werden weggeworfen.
    const _modelCache = {};
    function modelVoxels(key) {
        if (_modelCache[key]) return _modelCache[key];
        const m = voxelModels[key];
        const d = m.layers.length, h = m.layers[0].length, w = m.layers[0][0].length;
        const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d) ? 0 : m.layers[z][y][x];
        const voxels = [];
        for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const val = at(x, y, z);
            if (!val) continue;
            if (at(x - 1, y, z) && at(x + 1, y, z) && at(x, y - 1, z) && at(x, y + 1, z) && at(x, y, z - 1) && at(x, y, z + 1)) continue;
            voxels.push({ x, y, z, val });
        }
        _modelCache[key] = { voxels, w, h, d, s: m.s || 2.5 };
        return _modelCache[key];
    }

    function addVoxelModel(key, wx, wz, groundY, playerColor, dimFactor, tint, rotY, mirrorY) {
        const { voxels, w, h, d, s } = modelVoxels(key);
        // Flieger mit 3D-Körper (Gleiter/Luftschraube) routen wie Billboard-Sprites
        // in die transparente Luft-Ebene; Gebäude setzen _voxelAir nie, bleiben also
        // immer im Boden-Mesh.
        const mesh = _voxelAir ? airVoxelMesh : voxelMesh;
        const rotate = !!rotY;
        if (rotate) { _rEuler.set(0, rotY, 0); _rQuat.setFromEuler(_rEuler); _rScale.set(s, s, s); }
        const cos = rotate ? Math.cos(rotY) : 1, sin = rotate ? Math.sin(rotY) : 0;
        for (const v of voxels) {
            const idx = _voxelAir ? _airVoxelCount : _voxelCount;
            if (idx >= VOXEL_CAP) return;
            const lx = (v.x - (w - 1) / 2) * s;
            const lz = (v.z - (d - 1) / 2) * s;
            // mirrorY (Unterwelt): vertikal gespiegelt gestapelt — die Kamera steht
            // UNTER der Karte und blickt nach oben, ohne Spiegelung stünde das
            // Modell aus ihrer Sicht auf dem Kopf (gleiches Prinzip wie die
            // invertierte Zeilenrichtung in addUWVoxelSprite).
            const ly = groundY + ((mirrorY ? v.y : (h - 1 - v.y)) + 0.5) * s;
            if (rotate) {
                // Modell (inkl. Würfelorientierung, damit die Voxel weiter bündig
                // aneinanderliegen) um Y rotiert, damit die Wand-Längsachse zum
                // Nachbar-Hex zeigt statt immer fix in Ost-West-Richtung.
                _rPos.set(wx + lx * cos + lz * sin, ly, wz - lx * sin + lz * cos);
                _vm.compose(_rPos, _rQuat, _rScale);
            } else {
                _vm.makeScale(s, s, s);
                _vm.setPosition(wx + lx, ly, wz + lz);
            }
            mesh.setMatrixAt(idx, _vm);
            _vc.set(spritePixelColor(v.val, playerColor));
            if (tint) _vc.lerp(tint, 0.45);
            if (dimFactor !== 1) _vc.multiplyScalar(dimFactor);
            mesh.setColorAt(idx, _vc);
            if (_voxelAir) _airVoxelCount++; else _voxelCount++;
        }
    }

    // Gesamthöhe eines 3D-Voxelmodells in Weltunits (für HP-Text-Platzierung über
    // Einheiten, die jetzt echte Körper statt fixer 10px-Billboards sind)
    function modelTopHeight(key) {
        const { h, s } = modelVoxels(key);
        return h * s;
    }

    // Kleine Besitzer-Flagge neben Gebäuden (Pendant zur 2D-Flagge)
    function addFlag(wx, wz, groundY, color) {
        const s = 2.5;
        const parts = [
            { dx: 11, dy: 2, c: '#111111' }, { dx: 11, dy: 4, c: '#111111' }, { dx: 11, dy: 6, c: '#111111' },
            { dx: 13.5, dy: 6, c: color }, { dx: 16, dy: 6, c: color }
        ];
        const { rx, rz } = camGroundAxes();
        for (const pt of parts) {
            if (_voxelCount >= VOXEL_CAP) return;
            _vm.makeScale(s, s, s);
            _vm.setPosition(wx + pt.dx * rx, groundY + pt.dy * s, wz + pt.dx * rz);
            voxelMesh.setMatrixAt(_voxelCount, _vm);
            _vc.set(pt.c === '#888888' ? '#e0e0e0' : pt.c);
            voxelMesh.setColorAt(_voxelCount, _vc);
            _voxelCount++;
        }
    }

    function addShadow(wx, wz, groundY) {
        if (_shadowCount >= 512) return;
        // Die Schatten-Ellipse ist entlang der Blickachse gestaucht (Perspektive) —
        // muss sich mit dem Kamera-Azimut mitdrehen, sonst zeigt die Stauchung nach
        // dem Rotieren in die falsche Richtung.
        _sPos.set(wx, groundY + 0.3, wz);
        _sEuler.set(0, cam3d.azim, 0);
        _sQuat.setFromEuler(_sEuler);
        _vm.compose(_sPos, _sQuat, _sScale);
        shadowMesh.setMatrixAt(_shadowCount, _vm);
        _shadowCount++;
    }

    // ── HP-Zahlen & Icons (kamera-orientierte Sprites) ────────────────────────
    function textTexture(text, color) {
        const key = text + color;
        if (texCache[key]) return texCache[key];
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        g.font = "bold 40px 'Courier New', monospace";
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 8; g.strokeStyle = '#000';
        g.strokeText(text, 32, 34);
        g.fillStyle = color;
        g.fillText(text, 32, 34);
        const tex = new THREE.CanvasTexture(c);
        texCache[key] = tex;
        return tex;
    }

    // SpriteMaterials werden wie die Text-Texturen gecacht: drawScene3d baut die
    // HP-/Icon-Sprites bei JEDER Kamera-Geste neu (spriteGroup.clear() gibt
    // Materialien nicht frei) — ein neues Material pro Sprite pro Frame leckte
    // GPU-seitig, bis nach ein paar Minuten Scrollen/Drehen der WebGL-Kontext
    // verloren ging (Bildschirm kurz schwarz, danach Tiles schwarz, HP-Texte weg).
    // Alpha wird auf 0.05er-Schritte gerundet, damit der Cache während des
    // Luftansicht-Tweens (kontinuierliches airAlpha) endlich bleibt.
    const spriteMatCache = {};
    function spriteMaterial(text, color, alpha) {
        const a = Math.round(alpha * 20) / 20;
        const key = text + '|' + color + '|' + a;
        let m = spriteMatCache[key];
        if (!m) {
            m = new THREE.SpriteMaterial({ map: textTexture(text, color), depthTest: false, transparent: true, opacity: a });
            spriteMatCache[key] = m;
        }
        return m;
    }

    // HP als Zahl: align -1 = links über der Einheit, +1 = rechts über dem Gebäude,
    // 0 = mittig (Steinhaufen). Unter 15% wechselt die Farbe auf Rot.
    function addHpText(value, wx, wz, y, align, isLow, alpha = 1) {
        const color = isLow ? '#ff5252' : '#ffffff';
        const sp = new THREE.Sprite(spriteMaterial(String(value), color, alpha));
        sp.scale.set(11, 11, 1);
        const { rx, rz } = camGroundAxes();
        sp.position.set(wx + align * 12 * rx, y, wz + align * 12 * rz);
        spriteGroup.add(sp);
    }

    function addIcon(char, color, wx, wz, y, size, alpha = 1, align = 0) {
        const sp = new THREE.Sprite(spriteMaterial(char, color, alpha));
        sp.scale.set(size, size, 1);
        const { rx, rz } = camGroundAxes();
        sp.position.set(wx + align * 12 * rx, y, wz + align * 12 * rz);
        spriteGroup.add(sp);
    }

    // ── Highlights ────────────────────────────────────────────────────────────
    const overlayGeo = new THREE.CylinderGeometry(hexSize * 0.98, hexSize * 0.98, 1, 6);
    // Materialien gecacht (es gibt nur eine Handvoll fester Farbe/Opacity-Kombis) —
    // Overlays werden pro Frame neu aufgebaut, neue Materialien pro Aufruf würden
    // ohne Dispose GPU-seitig lecken (siehe spriteMatCache)
    const overlayMatCache = {};
    // underside=true setzt das Overlay UNTER die Unterwelt-Terrain-Schicht statt
    // über den Tile-Deckel — die Unterwelt-Kamera steht unterhalb der Karte, ein
    // Overlay über dem Deckel läge hinter dem massiven Tile und wäre unsichtbar.
    // Der Offset muss näher an der Kamera bleiben als der am weitesten
    // protrudierende Unterwelt-Fels (UW_SOLID_DEPTH aus buildUnderworldTiles),
    // sonst würde der Fels das Auswahl-Overlay verdecken.
    function addOverlay(x, y, colorHex, opacity, state, underside) {
        const tType = getTerrainType(state, x, y);
        const { wx, wz } = worldPos(x, y);
        const key = colorHex + '|' + opacity;
        let mat = overlayMatCache[key];
        if (!mat) {
            mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity, depthWrite: false });
            overlayMatCache[key] = mat;
        }
        const mesh = new THREE.Mesh(overlayGeo, mat);
        mesh.position.set(wx, underside ? -(UW_SOLID_DEPTH + 0.8) : tileHeight(tType) + 0.6, wz);
        overlayGroup.add(mesh);
    }

    // ── Haupt-Render ──────────────────────────────────────────────────────────
    function drawScene3d(state) {
        ensureInit();
        lastState = state;

        updateExploration();
        updateUWExploration();
        const vis = getVisibleHexes(state.cp);
        const explored = state.p[state.cp].e || [];

        const seedKey = `${state.sd}|${state.bw}|${state.bh}|${state.rad}`;
        if (builtSeed !== seedKey) buildTiles(state);
        // Unterwelt-Terrain-Schicht (M9a) — eigene Seed-Signatur, rebuildet also
        // unabhängig von buildTiles' builtSeed-Guard, aber genauso memoisiert.
        buildUnderworldTiles(state);
        const buildingHexes = collectBuildingHexes(state);
        const voxelBodyHexes = collectVoxelBodyHexes(state);
        const unitHexes = collectUnitHexes(state);
        updateTileColors(state, vis, explored);
        rebuildTrees(state, vis, buildingHexes, unitHexes);
        // Boden-Schmutz-Deko bereits live (nicht mehr per DEBUG_ART gegated)
        rebuildDeco(state, vis, buildingHexes);
        ensureVoxelMesh();

        // Sprite-/Overlay-Layer leeren — deren Geometrien/Materialien sind gecacht
        // und geteilt (spriteMatCache/overlayMatCache/texCache), clear() allein
        // ist hier deshalb korrekt (nichts disposen, die Caches leben weiter)
        spriteGroup.clear();
        overlayGroup.clear();
        _voxelCount = 0;
        _airVoxelCount = 0;
        _voxelAir = false;
        _shadowCount = 0;
        airVoxelMesh.material.opacity = airAlpha;

        // M13: gleiche uw/global-Sichtregeln wie der Recap-Playback in bootGame (siehe
        // dortiger Kommentar) — Unterwelt-Aktionen prüfen das Unterwelt-Netz statt der
        // Oberflächen-Sicht, globale Meldungen (Wurm-Tod/Erschließung) immer sichtbar.
        const visibleRecaps = (state.la || []).filter(a => {
            if (a.global) return true;
            if (a.uw) {
                const uwVisR = getVisibleUWHexes(state.cp);
                if (!uwVisR.has(`${a.x},${a.y}`)) return false;
                return !((state.uw && state.uw.u) || []).some(u => u.p !== state.cp && u.iv === 1 && u.x === a.x && u.y === a.y);
            }
            if (!vis.has(`${a.x},${a.y}`)) return false;
            return !state.u.some(u => u.p !== state.cp && u.iv === 1 && u.x === a.x && u.y === a.y);
        });

        // Entity-Sammlung — identische Sichtbarkeitsregeln wie drawScene (render.js).
        // Sichtbarkeit der Oberflächen-Ebene (Einheiten, Dörfer, Steine, Türme,
        // Wachturm) hängt an der tatsächlichen Kameraposition, nicht am
        // cameraFocus-Zustand selbst: sin(elev) < 0 heißt, die Kamera ist gerade
        // unter der y=0-Bodenebene (Unterwelt-Seite) — das ist exakt der Moment,
        // in dem sich das Board optisch "umgedreht" hat. So bleibt die
        // Oberfläche während der ganzen Anflug-Kamerafahrt sichtbar und
        // verschwindet/erscheint erst am eigentlichen Umschlagpunkt, nicht schon
        // beim Tastendruck. Weder anwählbar (siehe input.js) noch sichtbar —
        // keine HP-/Ressourcen-Zahlen, die durch die Felder "durchscheinen".
        // Die Unterwelt hat seit M9a eine eigene Terrain-Schicht (uwTileMesh/
        // uwAccentMesh); seit M9b eine eigene Entity-Schicht (uw.u, siehe unten)
        // mit echten Sichtregeln (getVisibleUWHexes/isUWUnitVisible, js/logic.js) —
        // "Unterwelt aufdecken" (js/debug.js) übersteuert weiter alles.
        const surfaceVisible = Math.sin(cam3d.elev) >= 0;
        const uwVis = getVisibleUWHexes(state.cp);
        if (uwTileMesh) uwTileMesh.visible = !surfaceVisible;
        if (uwAccentMesh) uwAccentMesh.visible = !surfaceVisible;
        if (uwFelsMesh) uwFelsMesh.visible = !surfaceVisible;
        if (!surfaceVisible) updateUWTileColors(state, uwVis);
        const entities = [];
        if (surfaceVisible) {

        if (state.tu) state.tu.forEach(t => {
            [[t.x1, t.y1], [t.x2, t.y2]].forEach(([ex, ey]) => {
                if (vis.has(`${ex},${ey}`)) entities.push({ x: ex, y: ey, spriteKey: 'tunnel', ownerId: t.o, hp: t.h, maxHp: 13, dim: (t.r > state.rn) ? 0.4 : 1, flag: true, bn: t.bn });
            });
        });
        if (state.wa) {
            const wallSet = new Set(state.wa.map(w => `${w.x},${w.y}`));
            state.wa.forEach(w => {
                if (vis.has(`${w.x},${w.y}`)) entities.push({ x: w.x, y: w.y, spriteKey: 'wall', ownerId: w.o, hp: w.h, maxHp: 10, bn: w.bn, rot: computeWallRotation(w.x, w.y, wallSet) });
            });
        }
        if (state.st) state.st.forEach(s => {
            if (s.h > 0 && vis.has(`${s.x},${s.y}`)) entities.push({ x: s.x, y: s.y, spriteKey: 'stone', color: '#9e9e9e', hp: s.h, maxHp: 40 });
        });
        if (state.tw) state.tw.forEach(tw => {
            if (tw.h > 0 && vis.has(`${tw.x},${tw.y}`)) entities.push({ x: tw.x, y: tw.y, spriteKey: 'tower', ownerId: tw.o, hp: tw.h, maxHp: 15, dim: tw.a === 1 ? 0.45 : 1, bn: tw.bn });
        });
        if (state.ct) {
            entities.push({ x: state.ct.x, y: state.ct.y, spriteKey: 'watchtower', color: state.ct.ctrl === -1 ? '#888888' : getEntityColor(state.ct.ctrl) });
        }
        for (const [key, ownerId] of Object.entries(state.v)) {
            const [vx, vy] = key.split(',').map(Number);
            const idx = vy * state.bw + vx;
            if (vis.has(key) || ownerId === state.cp || (ownerId === -1 && explored.includes(idx))) {
                let hp, spriteKey = 'village', bn;
                if (ownerId !== -1 && state.p[ownerId] && state.p[ownerId].sv === key) {
                    hp = state.p[ownerId].sh; spriteKey = 'startVillage'; bn = state.p[ownerId].bn;
                }
                entities.push({ x: vx, y: vy, spriteKey, ownerId, hp, maxHp: 30, flag: true, bn });
            }
        }
        state.u.forEach(unit => {
            if (!window.DEBUG_NO_FOG && unit.p !== state.cp && unit.iv === 1) return;
            if (vis.has(`${unit.x},${unit.y}`) || unit.p === state.cp) {
                entities.push({ unit });
            }
        });

        const stealthTint = new THREE.Color('#64c8ff');
        entities.forEach(e => {
            if (e.unit) {
                const u = e.unit;
                const tType = getTerrainType(state, u.x, u.y);
                let { wx, wz } = worldPos(u.x, u.y);
                const gy = tileHeight(tType);
                let spriteKey = u.t;
                if (spriteKey === 11 && u.dp === 1) spriteKey = 'wagen_dp';
                if (spriteKey === 14 && u.ld === 1) spriteKey = 'fallschirm_ld';
                // Einheiten immer als 2D-Pixel-Billboard ("Pappaufsteller") rendern —
                // die echten 3D-Voxelkörper für Einheiten sind zurückgestellt, nur
                // Gebäude/Steine (separater Zweig unten) nutzen weiterhin voxelModels.
                const hasVoxelBody = false;
                // Steht die Einheit auf einem Hex mit echtem 3D-Voxelkörper (Gebäude im
                // Redesign, Stein-Resource bereits live), zur Kamera vorziehen — sonst
                // verschwindet der Sprite im Modell. Flache Billboards brauchen das nicht.
                if (voxelBodyHexes.has(`${u.x},${u.y}`)) {
                    const { fx, fz } = camGroundAxes();
                    wx += fx * hexSize * 0.55;
                    wz += fz * hexSize * 0.55;
                }
                const maxHp = getUnitMaxHp(state.p[u.p], u.t, u);
                // Flieger schweben über der Bodenebene; ihr Schatten bleibt am Boden
                const flying = isFlying(u);
                const hover = flying ? hexSize * 1.4 : 0;
                // Flieger-Voxel ins transparente Luft-Mesh; ihre Texte/Icons dämpfen mit
                _voxelAir = flying;
                const uiA = flying ? Math.max(airAlpha, 0.25) : 1;
                const isStealth = u.iv === 1;
                const dim = isStealth ? (u.a === 1 ? 0.35 : 0.8) : (u.a === 1 ? 0.45 : 1);
                addShadow(wx, wz, gy);
                const drawUnit = (dx, dz, tintColor, dimF) => {
                    if (hasVoxelBody) addVoxelModel(spriteKey, wx + dx, wz + dz, gy + hover, playerColors[u.p], dimF, tintColor);
                    // Einheiten nutzen wie Terrain/Gebäude den DEBUG_ART-geschalteten
                    // Datensatz (pixelSprites/spritePixelColor als Default) — im Debug-Modus
                    // also das NEW_*-Redesign, im Live-Spiel weiterhin CLASSIC_*.
                    else addVoxelSprite(spriteKey, wx + dx, wz + dz, gy + hover, playerColors[u.p], dimF, tintColor);
                };
                if (isStealth && u.a !== 1) {
                    // Geister-Doppelbild wie im 2D-Renderer (versetzte, stark gedimmte Kopien)
                    drawUnit(-2, 0.6, stealthTint, 0.25);
                    drawUnit(2, 0.6, stealthTint, 0.25);
                }
                drawUnit(0, 0, isStealth ? stealthTint : null, dim);
                _voxelAir = false;
                // Echte 3D-Körper haben unterschiedliche Höhen (Pferd > Assassine) —
                // HP-Text/Icons sitzen relativ zur tatsächlichen Modellhöhe statt am
                // festen 30px-Versatz der alten Billboard-Sprites.
                const topY = hasVoxelBody ? gy + hover + modelTopHeight(spriteKey) + 4 : gy + hover + 30;
                addHpText(u.h, wx, wz, topY, -1, u.h / maxHp < 0.15, uiA);
                if (u.vet) addIcon('★', '#e8b84a', wx, wz, topY + 4, 9, uiA);
                if (u.mi) addIcon('⛏', '#fff176', wx, wz, topY - 2, 11, uiA, 1);
                if (u.bn) addIcon('🔥', '#ff6e40', wx, wz, topY, 11, uiA, 1);
                if (u.cg) addIcon('📦', '#ffcc80', wx, wz, topY - 10, 10, uiA, 1);
                // Aufgestiegener Arbeiter mit Kristallfracht: auch oben sichtbar machen
                if (u.cr) addIcon(`💎${u.cr}`, '#7fe3ff', wx, wz, topY + 12, 11, uiA, 1);
            } else {
                const tType = getTerrainType(state, e.x, e.y);
                const { wx, wz } = worldPos(e.x, e.y);
                const gy = tileHeight(tType);
                const color = e.color || getEntityColor(e.ownerId);
                if (voxelModels[e.spriteKey]) {
                    // Echtes 3D-Modell — steht bündig auf dem Boden, kein Blob-Schatten
                    addVoxelModel(e.spriteKey, wx, wz, gy, color, e.dim || 1, null, e.rot || 0);
                } else {
                    addShadow(wx, wz, gy);
                    addVoxelSprite(e.spriteKey, wx, wz, gy, color, e.dim || 1, null);
                }
                if (e.flag) addFlag(wx, wz, gy, color);
                if (e.hp !== undefined && e.maxHp !== undefined) {
                    if (e.spriteKey === 'stone') {
                        // Stein-Restmenge mittig, immer weiß — dicht über dem Stein
                        addHpText(e.hp, wx, wz, gy + 16, 0, false);
                    } else {
                        addHpText(e.hp, wx, wz, gy + 30, 1, e.hp / e.maxHp < 0.15);
                    }
                }
                if (e.bn) addIcon('🔥', '#ff6e40', wx, wz, gy + 30, 11, 1, -1);
            }
        });

        // Dynamit (Korrektur Juli 2026) hat bewusst KEINE Oberflächen-Anzeige mehr
        // (ersetzt die alte Unterminierungs-Vorwarnung) — es wirkt ausschließlich
        // unten, siehe den Dynamit-Marker im Unterwelt-Zweig weiter unten.

        // Erschließung (M12, PLAN.md Abschn. 8): dauerhaftes Beben-Indiz am
        // zentralen Wachturm, solange eine Erschließung läuft — unconditional wie
        // der ct-Entity selbst (volle Information, kein heimlicher Fortschritt).
        if (state.uw && state.uw.hz && state.ct) {
            const gyCt = tileHeight(getTerrainType(state, state.ct.x, state.ct.y));
            const { wx, wz } = worldPos(state.ct.x, state.ct.y);
            addIcon('🌍', '#8d6e63', wx, wz, gyCt + 42, 14);
        }

        } else {
            // Tunnel-HUB (Korrektur Juli 2026): das Oberflächen-Tunnelgebäude wird
            // 1:1 auf sein Startpunkt-Hex in der Unterwelt gespiegelt — gleiches
            // Sprite, GEMEINSAMER HP-Pool (t.h, oben wie unten dieselbe Zahl).
            // Im Bau (r > rn) gedimmt wie an der Oberfläche. Nur der Startpunkt:
            // der Zielpunkt hat keinen Stollenkopf (js/hex.js).
            (state.tu || []).forEach(t => {
                if (!uwVis.has(`${t.x1},${t.y1}`)) return;
                const gyT = -underworldDepth(uwVisualType(state, t.x1, t.y1));
                const { wx, wz } = worldPos(t.x1, t.y1);
                const dimT = (t.r > state.rn) ? 0.4 : 1;
                if (voxelModels['tunnel']) {
                    // Echtes 3D-Voxelmodell wie an der Oberfläche (nicht das alte
                    // 2D-Sprite) — unter die Unterseiten-Ebene gehängt, gleiches
                    // Platzierungsmuster wie das Herzkaverne-Modell unten;
                    // mirrorY, damit es aus der Von-unten-Sicht richtig herum steht.
                    addVoxelModel('tunnel', wx, wz, -(underworldDepth(uwVisualType(state, t.x1, t.y1)) + modelTopHeight('tunnel')), playerColors[t.o], dimT, null, 0, true);
                    addHpText(t.h, wx, wz, gyT - modelTopHeight('tunnel') - 8, -1, t.h / 13 < 0.3);
                } else {
                    // Fallback ohne Modell (z. B. CLASSIC-Art ohne 3D-Datensatz)
                    addUWVoxelSprite('tunnel', wx, wz, gyT, playerColors[t.o], dimT);
                    addHpText(t.h, wx, wz, gyT - 34, -1, t.h / 13 < 0.3);
                }
            });

            const cx = Math.floor(state.bw / 2), cy = Math.floor(state.bh / 2);
            // Herzkaverne-Modell nur, solange NIEMAND auf dem Zentrums-Hex steht —
            // sonst thront der Wurm (oder eine Einheit) optisch "auf dem Gebirge"
            // obenauf statt in der Kaverne (Korrektur Juli 2026).
            const centerOccupied = ((state.uw && state.uw.u) || []).some(u => u.x === cx && u.y === cy)
                || ((state.uw && state.uw.c) || []).some(c => c.h > 0 && c.x === cx && c.y === cy);
            if (voxelModels['herzkaverne'] && !centerOccupied && uwVis.has(`${cx},${cy}`)) {
                // Herzkaverne deutlich hervorgehoben, falls der (parallel arbeitende)
                // Art-Agent bereits ein echtes Voxelmodell geliefert hat — sonst bleibt
                // es beim rein prozeduralen Akzent-Cluster aus buildUnderworldTiles.
                // Anmerkung: die genaue Stapelrichtung/Ausrichtung ist ohne visuellen
                // Abgleich mit dem fertigen Modell nicht endgültig kalibrierbar und
                // ggf. nachzujustieren, sobald das Modell vorliegt.
                const { wx, wz } = worldPos(cx, cy);
                addVoxelModel('herzkaverne', wx, wz, -(UW_OPEN_DEPTH + modelTopHeight('herzkaverne')), '#ff6f61', 1, null, 0, true);
            }

            // Tiefeneinheiten (M9b): eigene stehen immer, fremde nur im Umkreis 2
            // eigener Einheiten (isUWUnitVisible, js/logic.js — Hinterhalt-Regel).
            (state.uw && state.uw.u || []).forEach(u => {
                if (!isUWUnitVisible(state.cp, u)) return;
                if (!uwVis.has(`${u.x},${u.y}`)) return;
                const uType = uwVisualType(state, u.x, u.y);
                const groundY = -underworldDepth(uType);
                const { wx, wz } = worldPos(u.x, u.y);
                const dim = u.a === 1 ? 0.55 : 1;
                addUWVoxelSprite(u.t, wx, wz, groundY, playerColors[u.p], dim);
                const topY = groundY - 34;
                addHpText(u.h, wx, wz, topY, -1, u.h / getUnitMaxHp(state.p[u.p], u.t, u) < 0.15);
                if (u.vet) addIcon('★', '#e8b84a', wx, wz, topY - 4, 9);
                // Getragene Kristalle MIT Anzahl (Korrektur Juli 2026): "💎2" statt
                // nur eines Symbols — man soll auf einen Blick sehen, wie voll der
                // Träger ist (max. 3).
                if (u.cr) addIcon(`💎${u.cr}`, '#7fe3ff', wx, wz, topY - 12, 11, 1, 1);
                if (u.art) addIcon(RELICS[u.art].icon, '#ba68c8', wx, wz, topY - 4, 9, 1, -1);
            });

            // Kristalladern: Restbestand als Zahl direkt am Hex (Korrektur Juli
            // 2026 — wie die HP-Zahlen der Steinhaufen oben; das Glitzern allein
            // verriet nicht, wie viel noch drinsteckt). Fundkammern bekommen ein
            // 🏺-Icon, solange sie ungeplündert sind.
            uwTileIndex.forEach(c => {
                if (!uwVis.has(`${c.x},${c.y}`)) return;
                const rem = getUWVeinRemaining(state, c.x, c.y);
                const { wx, wz } = worldPos(c.x, c.y);
                if (rem > 0) {
                    const gyA = -underworldDepth(UW_ADER);
                    addIcon(`💎${rem}`, '#7fe3ff', wx, wz, gyA - 8, 11);
                } else if (isFundkammerHex(state, c.x, c.y) && !(state.uw && state.uw.f && state.uw.f[`${c.x},${c.y}`])) {
                    addIcon('🏺', '#c9a24b', wx, wz, -underworldDepth(UW_RUINE) - 8, 11);
                }
                // Herrenloser Kristallhaufen (Korrektur Juli 2026): fällt beim Tod
                // eines Trägers, wird von Arbeiter/Beutegräber beim Betreten
                // automatisch eingesammelt (pickupUWCrystalDrop, js/logic.js).
                const dropAmount = state.uw && state.uw.dr && state.uw.dr[`${c.x},${c.y}`];
                if (dropAmount) {
                    addIcon(`💎${dropAmount}`, '#7fe3ff', wx, wz, -underworldDepth(uwVisualType(state, c.x, c.y)) - 8, 11);
                }
            });

            // Ausstehende Dynamit-Ladungen (Korrektur Juli 2026, ersetzt
            // Unterminierung): 🧨-Icon auf jedem der 3 Ziel-Hexes — rein
            // unterirdisch, keine Anzeige an der Oberfläche.
            (state.uw && state.uw.dy || []).forEach(charge => {
                charge.hexes.forEach(h => {
                    if (!uwVis.has(`${h.x},${h.y}`)) return;
                    const { wx: dwx, wz: dwz } = worldPos(h.x, h.y);
                    addIcon('🧨', '#ff6e40', dwx, dwz, -underworldDepth(uwVisualType(state, h.x, h.y)) - 8, 12);
                });
            });

            // Kreaturen (M11): neutral, gleiche Umkreis-2-Sichtregel wie fremde
            // Einheiten (isUWCreatureVisible). Echtes 3D-Voxelmodell (Muster:
            // Tunnel-HUB/Herzkaverne, mirrorY für die Von-unten-Sicht) sobald
            // voxelModels[cStats.sprite] existiert — Kreaturen gehören
            // niemandem, daher ein neutraler Ton statt einer Spielerfarbe (die
            // Kreaturen-Modelle/-Sprites verwenden ohnehin keine P/p-Zeichen).
            // Fallback ohne Modell (z. B. CLASSIC-Art ohne 3D-Datensatz) bleibt
            // das alte Billboard-Sprite inkl. sizeMultiplier für den Wurm — mit
            // echtem Modell braucht der Wurm keinen sizeMultiplier mehr, seine
            // Größe steckt bereits im Modell selbst (s: 3.0 vs. 2.6, art.js).
            const UW_CREATURE_NEUTRAL_COLOR = '#e57373';
            (state.uw && state.uw.c || []).forEach(c => {
                if (c.h <= 0) return;
                if (!isUWCreatureVisible(state.cp, c)) return;
                if (!uwVis.has(`${c.x},${c.y}`)) return;
                const cStats = uwCreatureStats[c.t];
                const uType = uwVisualType(state, c.x, c.y);
                const groundY = -underworldDepth(uType);
                const { wx, wz } = worldPos(c.x, c.y);
                const isWurm = c.t === UWC_WURM;
                let topY;
                if (voxelModels[cStats.sprite]) {
                    const topH = modelTopHeight(cStats.sprite);
                    addVoxelModel(cStats.sprite, wx, wz, groundY - topH, UW_CREATURE_NEUTRAL_COLOR, 1, null, 0, true);
                    topY = groundY - topH - 8;
                } else {
                    addUWVoxelSprite(cStats.sprite, wx, wz, groundY, UW_CREATURE_NEUTRAL_COLOR, 1, isWurm ? 1.6 : 1);
                    topY = groundY - (isWurm ? 46 : 34);
                }
                addHpText(c.h, wx, wz, topY, -1, c.h / cStats.hp < 0.15);
            });

            // Spinnennetze (M11): dezentes Overlay auf jedem Netz-Hex im eigenen Netz.
            if (state.uw && state.uw.w) {
                Object.keys(state.uw.w).forEach(key => {
                    if (!uwVis.has(key)) return;
                    const [wx2, wy2] = key.split(',').map(Number);
                    addOverlay(wx2, wy2, 0xdddddd, 0.3, state, true);
                });
            }

            // Gehör (Minimal-Implementierung, PLAN.md Abschn. 3+9): Horcher-Ortung
            // (exact=true) heller/größer als die Richtungs-Näherung am Netzrand.
            getUWNoisePings(state.cp).forEach(p => addOverlay(p.x, p.y, p.exact ? 0xff5252 : 0xffb300, p.exact ? 0.65 : 0.5, state, true));

            // Telegraphierte Kreaturen-Angriffe (Korrektur Juli 2026, "Runden-Phase +
            // Telegraph"): sichtbar sobald das Hex im eigenen Netz liegt (uwVis),
            // UNABHÄNGIG von der Umkreis-2-Kreaturen-Sichtregel (isUWCreatureVisible)
            // — die Markierung selbst ist der Fairness-Kern des Systems ("jeder hat
            // genau einen Zug zum Ausweichen"), die Kreatur dahinter darf verborgen
            // bleiben (gruselig ist gewollt). Eigene Farbe (dunkles Rot, underside-
            // Overlay) + 🎯-Icon, nicht mit den grünen/roten uwValid*-Auswahl-
            // Overlays (validMoves/validAttacks o.ä.) verwechselbar.
            (state.uw && state.uw.c || []).forEach(c => {
                if (c.h <= 0 || !c.ap) return;
                getCreatureAttackHexes(state, c).forEach(h => {
                    if (!uwVis.has(`${h.x},${h.y}`)) return;
                    addOverlay(h.x, h.y, 0xb71c1c, 0.5, state, true);
                    const { wx: twx, wz: twz } = worldPos(h.x, h.y);
                    addIcon('🎯', '#ffffff', twx, twz, -underworldDepth(uwVisualType(state, h.x, h.y)) - 8, 12);
                });
            });
        } // surfaceVisible

        // Nicht genutzte Instanzen "parken"
        _vm.makeScale(0, 0, 0); _vm.setPosition(0, -1000, 0);
        for (let i = _voxelCount; i < voxelMesh.count; i++) voxelMesh.setMatrixAt(i, _vm);
        for (let i = _airVoxelCount; i < airVoxelMesh.count; i++) airVoxelMesh.setMatrixAt(i, _vm);
        for (let i = _shadowCount; i < shadowMesh.count; i++) shadowMesh.setMatrixAt(i, _vm);
        voxelMesh.count = Math.max(_voxelCount, 1);
        airVoxelMesh.count = Math.max(_airVoxelCount, 1);
        shadowMesh.count = Math.max(_shadowCount, 1);
        voxelMesh.instanceMatrix.needsUpdate = true;
        voxelMesh.instanceColor.needsUpdate = true;
        airVoxelMesh.instanceMatrix.needsUpdate = true;
        airVoxelMesh.instanceColor.needsUpdate = true;
        shadowMesh.instanceMatrix.needsUpdate = true;

        // Highlights — liest dieselben Globals wie der 2D-Renderer
        if (showRecap) visibleRecaps.forEach(a => addOverlay(a.x, a.y, 0xffa500, 0.4, state));
        validMoves.forEach(mv => addOverlay(mv.x, mv.y, 0x64ff64, 0.3, state));
        validAttacks.forEach(a => addOverlay(a.x, a.y, 0xff6464, 0.5, state));
        if (selectedHex) addOverlay(selectedHex.x, selectedHex.y, 0xffffff, 0.25, state);
        if (window.highlightedTunnelEnd) addOverlay(window.highlightedTunnelEnd.x, window.highlightedTunnelEnd.y, 0x4fc3f7, 0.45, state);
        if (window.demolishTargets) window.demolishTargets.forEach(t => addOverlay(t.x, t.y, 0xff9800, 0.5, state));
        if (!surfaceVisible && window.selectedUnderworldHex) {
            addOverlay(window.selectedUnderworldHex.x, window.selectedUnderworldHex.y, 0xc084fc, 0.55, state, true);
        }
        // Unterwelt-Ziel-Highlights: Bewegung grün wie oben, Graben bräunlich (eigene
        // Farbe, siehe M9b-Auftrag), Angreifen rot wie oben (M10), Stollenbruch orange
        // (M12), Dynamit dunkelrot (Korrektur Juli 2026) — alle unterseitig
        // (underside). Abbauen läuft seit der Toggle-Umstellung (Korrektur Juli
        // 2026) ohne Ziel-Klick, kein Highlight mehr nötig.
        if (!surfaceVisible) {
            uwValidMoves.forEach(mv => addOverlay(mv.x, mv.y, 0x64ff64, 0.3, state, true));
            uwValidDigs.forEach(d => addOverlay(d.x, d.y, 0xa1662f, 0.45, state, true));
            uwValidAttacks.forEach(a => addOverlay(a.x, a.y, 0xff6464, 0.5, state, true));
            uwValidCollapse.forEach(c => addOverlay(c.x, c.y, 0xff9800, 0.5, state, true));
            uwValidDynamite.forEach(d => addOverlay(d.x, d.y, 0xd84315, 0.55, state, true));
        }

        applyCamera();
        renderer.render(scene, camera);
        updateUI();
    }

    // ── Animationen ───────────────────────────────────────────────────────────
    function hexTop(state, x, y) {
        const { wx, wz } = worldPos(x, y);
        return new THREE.Vector3(wx, tileHeight(getTerrainType(state, x, y)), wz);
    }

    function toScreen(v3) {
        const v = v3.clone().project(camera);
        const rect = canvas3d.getBoundingClientRect();
        return {
            x: (v.x * 0.5 + 0.5) * rect.width,
            y: (-v.y * 0.5 + 0.5) * rect.height
        };
    }

    function startAnimLoop() {
        if (animRunning) return;
        animRunning = true;
        requestAnimationFrame(animLoop3d);
    }

    function animLoop3d() {
        if (anims3d.length === 0 && floats3d.length === 0 && !viewTween) {
            animRunning = false;
            if (lastState) drawScene3d(lastState);
            return;
        }

        // Luftansicht-Übergang: Kamera-Elevation + Flieger-Deckkraft weich blenden
        if (viewTween) {
            const p = Math.min(1, (performance.now() - viewTween.start) / viewTween.dur);
            const e = p * p * (3 - 2 * p);   // smoothstep
            cam3d.elev = viewTween.from.elev + (viewTween.to.elev - viewTween.from.elev) * e;
            airAlpha = viewTween.from.alpha + (viewTween.to.alpha - viewTween.from.alpha) * e;
            if (p >= 1) viewTween = null;
        }

        const alive = [];
        for (const a of anims3d) {
            a.progress += a.type === 'slash' ? 0.03 : 0.06;
            // Jede Angriffsanimation bekommt eine eigene Geometrie+Material
            // (spawnAttackAnim) — ohne Dispose leckt jeder Angriff GPU-Speicher,
            // gleicher Bug wie bei Bäumen/Deko (siehe disposeGroupChildren).
            if (a.progress > 1) { scene.remove(a.obj); a.obj.geometry.dispose(); a.obj.material.dispose(); continue; }
            alive.push(a);
            const p = a.progress;

            if (a.type === 'arrow') {
                a.obj.position.lerpVectors(a.from, a.to, p);
                a.obj.position.y += Math.sin(p * Math.PI) * 20 + 14;
                a.obj.lookAt(a.to.x, a.to.y + 14, a.to.z);
            } else if (a.type === 'slash') {
                const alpha = p < 0.5 ? p * 2 : (1 - p) * 2;
                a.obj.material.opacity = alpha;
                a.obj.scale.setScalar(0.7 + p * 0.9);
            } else if (a.type === 'fire') {
                const alpha = p < 0.4 ? 1 : Math.max(0, 1 - (p - 0.4) / 0.6);
                a.obj.material.opacity = alpha;
                a.obj.position.y = a.to.y + p * 18;
            }
        }
        anims3d = alive;

        const aliveFloats = [];
        for (const f of floats3d) {
            f.life -= 0.025;
            f.dy -= 0.8;
            if (f.life > 0) aliveFloats.push(f); else { f.el.remove(); continue; }
            const s = toScreen(f.pos);
            f.el.style.left = s.x + 'px';
            f.el.style.top = (s.y - 25 + f.dy) + 'px';
            f.el.style.opacity = Math.max(0, f.life);
        }
        floats3d = aliveFloats;

        if (lastState) drawScene3d(lastState);
        requestAnimationFrame(animLoop3d);
    }

    // ── Fassaden-Implementierung ──────────────────────────────────────────────
    const Renderer3D = {
        init() {
            ensureInit();
            Renderer3D.resize();
        },

        resize() {
            ensureInit();
            const w = canvasWrapper.clientWidth || window.innerWidth;
            const h = canvasWrapper.clientHeight || window.innerHeight;
            renderer.setSize(w, h, false);
            canvas3d.style.width = '100%';
            canvas3d.style.height = '100%';
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        },

        render(state) {
            drawScene3d(state);
        },

        pickHex(clientX, clientY) {
            if (!renderer || !tileMesh) return null;
            const rect = canvas3d.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(ndc, camera);
            const hits = raycaster.intersectObject(tileMesh);
            if (hits.length === 0) return null;
            const c = tileIndex[hits[0].instanceId];
            return c ? { x: c.x, y: c.y } : null;
        },

        beginGesture() {
            gestureStart = { tx: cam3d.tx, tz: cam3d.tz, scale: cam3d.scale, azim: cam3d.azim };
        },

        gesturePan(dx, dy) {
            if (!gestureStart) return;
            const wpp = 1 / cam3d.scale;   // Welt-Einheiten pro CSS-Pixel (bei baseDist-Kalibrierung)
            const a = gestureStart.azim;
            const cosA = Math.cos(a), sinA = Math.sin(a);
            const rx = cosA, rz = -sinA, fx = sinA, fz = cosA;
            const dyF = (dy * wpp) / safeSinElev();
            cam3d.tx = gestureStart.tx - dx * wpp * rx - dyF * fx;
            cam3d.tz = gestureStart.tz - dx * wpp * rz - dyF * fz;
            requestRender3d();
        },

        gestureOrbit(dAzim) {
            if (!gestureStart) return;
            cam3d.azim = gestureStart.azim + dAzim;
            requestRender3d();
        },

        gestureZoom(factor, centerX, centerY) {
            if (!gestureStart) return;
            const rect = canvas3d.getBoundingClientRect();
            const dx = centerX - rect.left - rect.width / 2;
            const dy = centerY - rect.top - rect.height / 2;
            const sinE = safeSinElev();
            const a = gestureStart.azim;
            const cosA = Math.cos(a), sinA = Math.sin(a);
            const rx = cosA, rz = -sinA, fx = sinA, fz = cosA;
            const dxW = dx / gestureStart.scale, dyW = dy / (gestureStart.scale * sinE);
            // Weltpunkt unter dem Pinch-Zentrum festhalten
            const wx = gestureStart.tx + dxW * rx + dyW * fx;
            const wz = gestureStart.tz + dxW * rz + dyW * fz;
            cam3d.scale = Math.max(0.4, Math.min(gestureStart.scale * factor, 3.0));
            const dxW2 = dx / cam3d.scale, dyW2 = dy / (cam3d.scale * sinE);
            cam3d.tx = wx - dxW2 * rx - dyW2 * fx;
            cam3d.tz = wz - dxW2 * rz - dyW2 * fz;
            requestRender3d();
        },

        wheelZoom(factor, centerX, centerY) {
            const rect = canvas3d.getBoundingClientRect();
            const dx = centerX - rect.left - rect.width / 2;
            const dy = centerY - rect.top - rect.height / 2;
            const sinE = safeSinElev();
            const { rx, rz, fx, fz } = camGroundAxes();
            const dxW = dx / cam3d.scale, dyW = dy / (cam3d.scale * sinE);
            // Weltpunkt unter dem Cursor festhalten (Parität zum 2D-Zoom)
            const wx = cam3d.tx + dxW * rx + dyW * fx;
            const wz = cam3d.tz + dxW * rz + dyW * fz;
            cam3d.scale = Math.max(0.4, Math.min(cam3d.scale * factor, 3.0));
            const dxW2 = dx / cam3d.scale, dyW2 = dy / (cam3d.scale * sinE);
            cam3d.tx = wx - dxW2 * rx - dyW2 * fx;
            cam3d.tz = wz - dxW2 * rz - dyW2 * fz;
            requestRender3d();
        },

        // Ob die Oberflächen-Ebene gerade tatsächlich zu sehen ist (Kamera über
        // der y=0-Bodenebene) — dieselbe Bedingung, die drawScene3d fürs Ein-/
        // Ausblenden der Oberflächen-Entities nutzt. input.js routet Klicks
        // danach zwischen normaler Oberflächen-Interaktion und der Unterwelt-
        // Feld-Auswahl, statt sich am cameraFocus-Zustand zu orientieren, der
        // während der Kamerafahrt schon vor dem tatsächlichen Umschlagpunkt wechselt.
        isSurfaceVisible() {
            return Math.sin(cam3d.elev) >= 0;
        },

        centerOn(hexX, hexY, scale) {
            if (scale !== undefined) cam3d.scale = scale;
            const { wx, wz } = worldPos(hexX, hexY);
            cam3d.tx = wx;
            cam3d.tz = wz;
        },

        spawnFloatingText(x, y, text, color) {
            ensureInit();
            const el = document.createElement('div');
            el.className = 'float-text';
            el.style.color = color;
            el.textContent = text;
            document.getElementById('float-layer').appendChild(el);
            floats3d.push({ el, pos: hexTop(gameState, x, y), life: 1.0, dy: 0 });
            startAnimLoop();
        },

        setCameraFocus(focus) {
            // Fährt die Kamera zur gewählten Kamerafahrt:
            // 0 Standard, 1 Luftansicht (Vogelperspektive, Flieger voll sichtbar),
            // 2 Unterwelt (Kamera schwenkt unter die Karte, blickt senkrecht auf
            // ihre Unterseite). Der ganze Zyklus dreht IMMER in dieselbe Richtung
            // weiter (nie rückwärts) — nextForwardElev() sucht dazu jeweils den
            // kleinsten Vorwärts-Schritt zum nächsten Ziel-Winkel (mod 360°),
            // egal von welchem (ggf. mitten in einer laufenden Fahrt
            // unterbrochenen) Winkel aus gestartet wird. Tempo skaliert mit dem
            // Schwenkwinkel, damit der weite Unterwelt-Schwenk nicht hektisch wirkt.
            ensureInit();
            const nominalElev = focus === 1 ? AIR_VIEW_ELEV : focus === 2 ? UNDERWORLD_ELEV : CAM_ELEV;
            const toAlpha = focus === 1 ? 1.0 : AIR_ALPHA_GROUND;
            const from = { elev: cam3d.elev, alpha: airAlpha };
            const to = { elev: nextForwardElev(cam3d.elev, nominalElev), alpha: toAlpha };
            const deltaDeg = (to.elev - from.elev) * 180 / Math.PI;
            viewTween = { start: performance.now(), dur: 350 + deltaDeg * 6, from, to };
            startAnimLoop();
        },

        spawnAttackAnim(fromX, fromY, toX, toY, type) {
            ensureInit();
            const from = hexTop(gameState, fromX, fromY);
            const to = hexTop(gameState, toX, toY);
            let obj;

            if (type === 'arrow') {
                obj = new THREE.Mesh(
                    new THREE.ConeGeometry(2, 10, 6),
                    new THREE.MeshBasicMaterial({ color: 0xc0c0c0 })
                );
                obj.geometry.rotateX(Math.PI / 2);
            } else if (type === 'slash') {
                obj = new THREE.Mesh(
                    new THREE.TorusGeometry(12, 1.6, 6, 24, Math.PI * 0.9),
                    new THREE.MeshBasicMaterial({ color: 0xff6e40, transparent: true, opacity: 0, depthTest: false })
                );
                obj.position.set(to.x, to.y + 14, to.z);
                obj.lookAt(camera.position);
            } else { // fire
                const rng = createPRNG(7);
                const pts = [];
                for (let i = 0; i < 8; i++) {
                    pts.push(new THREE.Vector3(
                        to.x + (rng() - 0.5) * 24,
                        to.y + 6 + (rng() - 0.5) * 10,
                        to.z + (rng() - 0.5) * 16
                    ));
                }
                obj = new THREE.Points(
                    new THREE.BufferGeometry().setFromPoints(pts),
                    new THREE.PointsMaterial({ color: 0xff6e40, size: 5, transparent: true, opacity: 1, depthTest: false })
                );
            }

            scene.add(obj);
            anims3d.push({ obj, from, to, type, progress: 0 });
            startAnimLoop();
        }
    };

    window.Renderer3D = Renderer3D;

    // 3D ist Standard-Renderer; ?r2d=1 erzwingt den alten 2D-Renderer (Legacy-Fallback)
    if (!new URLSearchParams(location.search).has('r2d')) {
        Renderer = Renderer3D;
    }
})();
