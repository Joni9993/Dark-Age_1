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

    function worldPos(x, y) {
        return {
            wx: (x + 0.5 * (y % 2)) * hexWidth,
            wz: y * ROW_Z
        };
    }

    function tileHeight(tType) { return tType === 'hill' ? HILL_H : TILE_H; }

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
    // Luftansicht: Kamera fährt in die Vogelperspektive, Flieger werden voll sichtbar.
    // ⚙️ Zum Experimentieren: Zahl unten = Blickwinkel in Grad über dem Horizont
    //    (90 = senkrecht von oben, ~40.5 = normale Bodenansicht)
    const AIR_VIEW_ELEV = 50 * Math.PI / 180;
    const AIR_ALPHA_GROUND = 0.1;          // Deckkraft der Flieger in der Bodenansicht
    let airAlpha = AIR_ALPHA_GROUND;
    let viewTween = null;                  // {start, dur, from:{elev,alpha}, to:{elev,alpha}}
    const raycaster = new THREE.Raycaster();
    const texCache = {};

    function baseDist() {
        // Distanz, bei der 1 Welteinheit ≈ 1 CSS-Pixel entspricht (Parität zu camScale=1)
        const h = canvas3d ? canvas3d.clientHeight : 800;
        return (h / 2) / Math.tan((FOV / 2) * Math.PI / 180);
    }

    function applyCamera() {
        const dist = baseDist() / cam3d.scale;
        const horiz = dist * Math.cos(cam3d.elev);
        camera.position.set(
            cam3d.tx + horiz * Math.sin(cam3d.azim),
            dist * Math.sin(cam3d.elev),
            cam3d.tz + horiz * Math.cos(cam3d.azim)
        );
        camera.lookAt(cam3d.tx, 0, cam3d.tz);
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

    function addVoxelModel(key, wx, wz, groundY, playerColor, dimFactor, tint) {
        const { voxels, w, h, d, s } = modelVoxels(key);
        // Flieger mit 3D-Körper (Gleiter/Luftschraube) routen wie Billboard-Sprites
        // in die transparente Luft-Ebene; Gebäude setzen _voxelAir nie, bleiben also
        // immer im Boden-Mesh.
        const mesh = _voxelAir ? airVoxelMesh : voxelMesh;
        for (const v of voxels) {
            const idx = _voxelAir ? _airVoxelCount : _voxelCount;
            if (idx >= VOXEL_CAP) return;
            _vm.makeScale(s, s, s);
            _vm.setPosition(
                wx + (v.x - (w - 1) / 2) * s,
                groundY + (h - 1 - v.y + 0.5) * s,
                wz + (v.z - (d - 1) / 2) * s
            );
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
    function addOverlay(x, y, colorHex, opacity, state) {
        const tType = getTerrainType(state, x, y);
        const { wx, wz } = worldPos(x, y);
        const key = colorHex + '|' + opacity;
        let mat = overlayMatCache[key];
        if (!mat) {
            mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity, depthWrite: false });
            overlayMatCache[key] = mat;
        }
        const mesh = new THREE.Mesh(overlayGeo, mat);
        mesh.position.set(wx, tileHeight(tType) + 0.6, wz);
        overlayGroup.add(mesh);
    }

    // ── Haupt-Render ──────────────────────────────────────────────────────────
    function drawScene3d(state) {
        ensureInit();
        lastState = state;

        updateExploration();
        const vis = getVisibleHexes(state.cp);
        const explored = state.p[state.cp].e || [];

        const seedKey = `${state.sd}|${state.bw}|${state.bh}|${state.rad}`;
        if (builtSeed !== seedKey) buildTiles(state);
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

        const visibleRecaps = (state.la || []).filter(a => {
            if (!vis.has(`${a.x},${a.y}`)) return false;
            return !state.u.some(u => u.p !== state.cp && u.iv === 1 && u.x === a.x && u.y === a.y);
        });

        // Entity-Sammlung — identische Sichtbarkeitsregeln wie drawScene (render.js)
        const entities = [];

        if (state.tu) state.tu.forEach(t => {
            [[t.x1, t.y1], [t.x2, t.y2]].forEach(([ex, ey]) => {
                if (vis.has(`${ex},${ey}`)) entities.push({ x: ex, y: ey, spriteKey: 'tunnel', ownerId: t.o, hp: t.h, maxHp: 13, dim: (t.r > state.rn) ? 0.4 : 1, flag: true, bn: t.bn });
            });
        });
        if (state.wa) state.wa.forEach(w => {
            if (vis.has(`${w.x},${w.y}`)) entities.push({ x: w.x, y: w.y, spriteKey: 'wall', ownerId: w.o, hp: w.h, maxHp: 10, bn: w.bn });
        });
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
            } else {
                const tType = getTerrainType(state, e.x, e.y);
                const { wx, wz } = worldPos(e.x, e.y);
                const gy = tileHeight(tType);
                const color = e.color || getEntityColor(e.ownerId);
                if (voxelModels[e.spriteKey]) {
                    // Echtes 3D-Modell — steht bündig auf dem Boden, kein Blob-Schatten
                    addVoxelModel(e.spriteKey, wx, wz, gy, color, e.dim || 1, null);
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
            const dyF = (dy * wpp) / Math.sin(cam3d.elev);
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
            const sinE = Math.sin(cam3d.elev);
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
            const sinE = Math.sin(cam3d.elev);
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

        setAirView(on) {
            // Fährt die Kamera in die Vogelperspektive (75° von oben) und blendet
            // die Flieger von 10% auf 100% — bzw. zurück
            ensureInit();
            viewTween = {
                start: performance.now(),
                dur: 400,
                from: { elev: cam3d.elev, alpha: airAlpha },
                to: on ? { elev: AIR_VIEW_ELEV, alpha: 1.0 } : { elev: CAM_ELEV, alpha: AIR_ALPHA_GROUND }
            };
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
