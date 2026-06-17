// === SPRITE RENDERER ===
function drawPixelSprite(ctx, cx, cy, spriteKey, playerColor) {
    const arr = pixelSprites[spriteKey];
    if (!arr) return;
    const s = (spriteKey === 9) ? 3.3 : 2.5;
    const startX = cx - (5 * s);
    const startY = cy - (5 * s) - 6;
    for (let i = 0; i < 100; i++) {
        let val = arr[i];
        if (val === 0) continue;
        ctx.fillStyle = val === P ? playerColor : pal[val];
        ctx.fillRect(startX + (i % 10) * s, startY + Math.floor(i / 10) * s, s, s);
    }
}

// === ANIMATION SYSTEM ===
function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 1.0, dy: 0 });
    if (!isAnimating) { isAnimating = true; requestAnimationFrame(animateLoop); }
}

function spawnAttackAnim(fromX, fromY, toX, toY, type) {
    attackAnims.push({ fromX, fromY, toX, toY, type, progress: 0 });
    if (!isAnimating) { isAnimating = true; requestAnimationFrame(animateLoop); }
}

function animateLoop() {
    if (floatingTexts.length === 0 && attackAnims.length === 0) {
        isAnimating = false;
        drawScene(gameState);
        return;
    }

    drawScene(gameState);

    ctx.save();
    ctx.translate(camX, camY);
    ctx.scale(camScale, camScale);

    let aliveAnims = [];
    for (let anim of attackAnims) {
        anim.progress += anim.type === 'slash' ? 0.03 : 0.06;
        if (anim.progress > 1) continue;
        aliveAnims.push(anim);

        const tTerrain = getTerrainType(gameState, anim.toX, anim.toY);
        const tElev = tTerrain === 'hill' ? -thickness : 0;
        const fTerrain = getTerrainType(gameState, anim.fromX, anim.fromY);
        const fElev = fTerrain === 'hill' ? -thickness : 0;
        const from = getHexCenter(anim.fromX, anim.fromY);
        const to = getHexCenter(anim.toX, anim.toY);
        const p = anim.progress;

        if (anim.type === 'slash') {
            const alpha = p < 0.5 ? p * 2 : (1 - p) * 2;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ff6e40';
            ctx.lineWidth = 3;
            ctx.beginPath();
            const r = 14;
            const startAngle = -Math.PI * 0.8 + p * Math.PI * 0.6;
            ctx.arc(to.px, to.py + tElev - 4, r, startAngle, startAngle + Math.PI * 0.8);
            ctx.stroke();
            ctx.strokeStyle = '#ffab40';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else if (anim.type === 'arrow') {
            ctx.globalAlpha = 1;
            const cx = from.px + (to.px - from.px) * p;
            const cy = (from.py + fElev) + ((to.py + tElev) - (from.py + fElev)) * p - Math.sin(p * Math.PI) * 20;
            const angle = Math.atan2((to.py + tElev) - (from.py + fElev), to.px - from.px);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.fillStyle = '#c0c0c0';
            ctx.beginPath();
            ctx.moveTo(6, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-12, 0); ctx.stroke();
            ctx.restore();
        } else if (anim.type === 'fire') {
            const alpha = p < 0.4 ? 1 : Math.max(0, 1 - (p - 0.4) / 0.6);
            ctx.globalAlpha = alpha;
            const rng = createPRNG(Math.floor(p * 20));
            for (let i = 0; i < 8; i++) {
                const px2 = to.px + (rng() - 0.5) * 24;
                const py2 = to.py + tElev + (rng() - 0.5) * 16 - p * 15;
                const sz = 2 + rng() * 4;
                ctx.fillStyle = rng() > 0.5 ? '#ff6e40' : '#ffab00';
                ctx.beginPath(); ctx.arc(px2, py2, sz, 0, Math.PI * 2); ctx.fill();
            }
        }
    }
    attackAnims = aliveAnims;

    let stillAlive = [];
    for (let ft of floatingTexts) {
        ft.life -= 0.025;
        ft.dy -= 0.8;
        if (ft.life > 0) stillAlive.push(ft);

        const tTerrain = getTerrainType(gameState, ft.x, ft.y);
        const tElev = tTerrain === 'hill' ? -thickness : 0;
        const center = getHexCenter(ft.x, ft.y);
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.fillStyle = ft.color;
        ctx.font = "bold 24px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 4;
        const textY = center.py + tElev - 25 + ft.dy;
        ctx.strokeText(ft.text, center.px, textY);
        ctx.fillText(ft.text, center.px, textY);
    }
    ctx.globalAlpha = 1.0;
    ctx.restore();

    floatingTexts = stillAlive;
    requestAnimationFrame(animateLoop);
}

// === HEX DRAWING ===
function drawHexPath(cx, cy) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        const px = cx + hexSize * Math.cos(angle);
        const py = cy + (hexSize * Math.sin(angle)) * yCompress;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

function drawHex(x, y, terrainType, applyShroud, isRecap) {
    const center = getHexCenter(x, y);
    const colors = terrainColors[terrainType] || terrainColors.grass;
    const isHill = terrainType === 'hill';
    const topY = isHill ? center.py - 6 : center.py;
    const bottomY = center.py + thickness;

    if (!applyShroud) {
        drawHexPath(center.px, bottomY);
        ctx.fillStyle = colors.sideBottom || colors.side; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= 3; i++) {
            const angle = 2 * Math.PI / 6 * (i + 0.5);
            const px = center.px + hexSize * Math.cos(angle);
            const py = topY + (hexSize * Math.sin(angle)) * yCompress;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        for (let i = 3; i >= 0; i--) {
            const angle = 2 * Math.PI / 6 * (i + 0.5);
            const px = center.px + hexSize * Math.cos(angle);
            const py = bottomY + (hexSize * Math.sin(angle)) * yCompress;
            ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = colors.side; ctx.fill();

        ctx.beginPath();
        const angle0 = 2 * Math.PI / 6 * (0 + 0.5);
        ctx.moveTo(center.px + hexSize * Math.cos(angle0), topY + (hexSize * Math.sin(angle0)) * yCompress);
        ctx.lineTo(center.px + hexSize * Math.cos(angle0), bottomY + (hexSize * Math.sin(angle0)) * yCompress);
        const angle3 = 2 * Math.PI / 6 * (3 + 0.5);
        ctx.moveTo(center.px + hexSize * Math.cos(angle3), topY + (hexSize * Math.sin(angle3)) * yCompress);
        ctx.lineTo(center.px + hexSize * Math.cos(angle3), bottomY + (hexSize * Math.sin(angle3)) * yCompress);
        ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 1; ctx.stroke();

        ctx.beginPath();
        for (let i = 1; i <= 2; i++) {
            const angle = 2 * Math.PI / 6 * (i + 0.5);
            const px = center.px + hexSize * Math.cos(angle);
            ctx.moveTo(px, topY + (hexSize * Math.sin(angle)) * yCompress);
            ctx.lineTo(px, bottomY + (hexSize * Math.sin(angle)) * yCompress);
        }
        ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.stroke();
    }

    drawHexPath(center.px, topY);
    ctx.fillStyle = colors.top; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.stroke();

    const rng = createPRNG(x * 1000 + y);
    if (terrainType === 'forest' && !applyShroud) {
        const treeColors = ['#0d140e', '#1b3a1e', '#15291a', '#0a1f0d', '#2a4430'];
        const treePositions = [
            { dx: 0, dy: -4, sz: 7 }, { dx: -9, dy: 2, sz: 6 }, { dx: 8, dy: 3, sz: 5 },
            { dx: -4, dy: -1, sz: 5 }, { dx: 5, dy: -2, sz: 4 }
        ];
        treePositions.forEach((t, i) => {
            const tx = center.px + t.dx + (rng() - 0.5) * 3;
            const ty = center.py + t.dy + (rng() - 0.5) * 2;
            ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(tx, ty + t.sz); ctx.lineTo(tx, ty + t.sz + 4); ctx.stroke();
            ctx.fillStyle = treeColors[i % treeColors.length];
            ctx.beginPath(); ctx.moveTo(tx, ty - t.sz); ctx.lineTo(tx - t.sz, ty + t.sz); ctx.lineTo(tx + t.sz, ty + t.sz); ctx.fill();
            ctx.fillStyle = 'rgba(100,180,100,0.15)';
            ctx.beginPath(); ctx.moveTo(tx, ty - t.sz); ctx.lineTo(tx - t.sz * 0.4, ty + t.sz * 0.3); ctx.lineTo(tx + t.sz * 0.2, ty + t.sz * 0.3); ctx.fill();
        });
    } else if (isHill && !applyShroud) {
        for (let i = 0; i < 3; i++) {
            const sx = center.px + (rng() - 0.5) * 16;
            const sy = topY + (rng() - 0.5) * 8;
            ctx.fillStyle = rng() > 0.5 ? '#6d6056' : '#5a4d40';
            ctx.beginPath(); ctx.ellipse(sx, sy, 2 + rng() * 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(100,90,80,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center.px - 8, topY + 2); ctx.lineTo(center.px + 6, topY - 1);
        ctx.stroke();
    } else if (terrainType === 'grass' && !applyShroud) {
        ctx.strokeStyle = 'rgba(80,130,80,0.25)'; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const gx = center.px + (rng() - 0.5) * 18;
            const gy = center.py + (rng() - 0.5) * 10;
            ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + (rng() - 0.5) * 4, gy - 3 - rng() * 2); ctx.stroke();
        }
    }

    if (applyShroud) { drawHexPath(center.px, topY); ctx.fillStyle = "rgba(0, 0, 0, 0.65)"; ctx.fill(); }
    if (isRecap) { drawHexPath(center.px, topY); ctx.fillStyle = "rgba(255, 165, 0, 0.4)"; ctx.fill(); ctx.strokeStyle = "orange"; ctx.lineWidth = 2; ctx.stroke(); }
    if (selectedHex && selectedHex.x === x && selectedHex.y === y) { drawHexPath(center.px, topY); ctx.fillStyle = "rgba(255, 255, 255, 0.2)"; ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke(); }
    if (validMoves.some(m => m.x === x && m.y === y)) { drawHexPath(center.px, topY); ctx.fillStyle = "rgba(100, 255, 100, 0.3)"; ctx.fill(); }
    if (validAttacks.some(a => a.x === x && a.y === y)) { drawHexPath(center.px, topY); ctx.fillStyle = "rgba(255, 100, 100, 0.5)"; ctx.fill(); }
}

function drawEntity(x, y, color, hasActed, hp, maxHp, spriteKey, isStealth, unit) {
    const center = getHexCenter(x, y);
    const tType = getTerrainType(gameState, x, y);
    const elevation = tType === 'hill' ? -6 : 0;

    ctx.globalAlpha = isStealth ? (hasActed ? 0.3 : 0.85) : (hasActed ? 0.4 : 1.0);

    if (isStealth) {
        ctx.fillStyle = "rgba(100, 200, 255, 0.5)";
        ctx.beginPath();
        ctx.ellipse(center.px, center.py + elevation, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = isStealth ? "rgba(100, 200, 255, 0.3)" : "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(center.px, center.py + elevation, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    let isBuilding = (spriteKey === 'village' || spriteKey === 'startVillage' || spriteKey === 'tunnel');
    const offsetY = -2 + elevation;
    let actualSprite = spriteKey;
    if (actualSprite === 11 && unit && unit.dp === 1) actualSprite = "wagen_dp";

    if (isStealth && !hasActed) {
        ctx.globalAlpha = 0.4;
        drawPixelSprite(ctx, center.px - 2, center.py + offsetY, actualSprite, color);
        drawPixelSprite(ctx, center.px + 2, center.py + offsetY, actualSprite, color);
        ctx.globalAlpha = 0.85;
    }

    drawPixelSprite(ctx, center.px, center.py + offsetY, actualSprite, color);

    if (isBuilding) {
        ctx.fillStyle = '#111';
        ctx.fillRect(center.px + 11, center.py + elevation - 6, 1, 10);
        ctx.fillStyle = color === '#888888' ? '#e0e0e0' : color;
        ctx.fillRect(center.px + 12, center.py + elevation - 6, 4, 3);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
        ctx.strokeRect(center.px + 12, center.py + elevation - 6, 4, 3);
    }

    if (hp !== undefined && maxHp !== undefined) {
        const barW = 16; const barH = 4;
        const pct = Math.min(1, Math.max(0, hp / maxHp));
        const barY = center.py + offsetY + 8;
        const barX = center.px - barW / 2;
        ctx.fillStyle = "#ff1744"; ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = "#00e676"; ctx.fillRect(barX, barY, barW * pct, barH);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeRect(barX, barY, barW, barH);
    }

    if (unit && unit.vet) {
        ctx.fillStyle = '#e8b84a';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.strokeText('★', center.px, center.py + offsetY - 14);
        ctx.fillText('★', center.px, center.py + offsetY - 14);
    }

    if (unit && unit.mi) {
        ctx.fillStyle = '#fff176';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.strokeText('⛏', center.px + 14, center.py + offsetY - 10);
        ctx.fillText('⛏', center.px + 14, center.py + offsetY - 10);
    }
    ctx.globalAlpha = 1.0;
}

// === SCENE ===
function renderBoard(state) {
    if (!isAnimating) drawScene(state);
}

function drawScene(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(camX, camY);
    ctx.scale(camScale, camScale);

    updateExploration();
    const vis = getVisibleHexes(gameState.cp);
    const explored = gameState.p[gameState.cp].e || [];

    const visibleRecaps = (state.la || []).filter(a => {
        if (!vis.has(`${a.x},${a.y}`)) return false;
        return !state.u.some(u => u.p !== state.cp && u.iv === 1 && u.x === a.x && u.y === a.y);
    });

    for (let y = 0; y < state.bh; y++) {
        for (let x = 0; x < state.bw; x++) {
            if (!isInsideMap(state, x, y)) continue;
            const idx = y * state.bw + x;
            const isVisible = vis.has(`${x},${y}`);

            if (!explored.includes(idx)) {
                const center = getHexCenter(x, y);
                drawHexPath(center.px, center.py + thickness);
                ctx.fillStyle = "#0a0a0a"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.stroke();
                drawHexPath(center.px, center.py);
                ctx.fillStyle = "#141414"; ctx.fill(); ctx.strokeStyle = "#2e2e2e"; ctx.lineWidth = 1; ctx.stroke();
                continue;
            }

            const tType = getTerrainType(state, x, y);
            const isRecap = showRecap && visibleRecaps.some(a => a.x === x && a.y === y);
            drawHex(x, y, tType, !isVisible, isRecap);
        }
    }

    let renderQueue = [];

    if (state.tu) {
        state.tu.forEach(t => {
            if (vis.has(`${t.x1},${t.y1}`)) {
                renderQueue.push({ py: getHexCenter(t.x1, t.y1).py, type: 'building', vx: t.x1, vy: t.y1, ownerId: t.o, hp: t.h, maxHp: 13, spriteKey: "tunnel", isTunnel: true, rr: t.r });
            }
            if (vis.has(`${t.x2},${t.y2}`)) {
                renderQueue.push({ py: getHexCenter(t.x2, t.y2).py, type: 'building', vx: t.x2, vy: t.y2, ownerId: t.o, hp: t.h, maxHp: 13, spriteKey: "tunnel", isTunnel: true, rr: t.r });
            }
        });
    }

    if (state.wa) {
        state.wa.forEach(w => {
            if (vis.has(`${w.x},${w.y}`)) {
                renderQueue.push({ py: getHexCenter(w.x, w.y).py, type: 'wall', vx: w.x, vy: w.y, ownerId: w.o, hp: w.h, maxHp: 10, spriteKey: "wall" });
            }
        });
    }

    if (state.st) {
        state.st.forEach(s => {
            if (s.h > 0 && vis.has(`${s.x},${s.y}`)) {
                renderQueue.push({ py: getHexCenter(s.x, s.y).py, type: 'stone', vx: s.x, vy: s.y, hp: s.h, maxHp: 40, spriteKey: "stone" });
            }
        });
    }

    if (state.tw) {
        state.tw.forEach(tw => {
            if (tw.h > 0 && vis.has(`${tw.x},${tw.y}`)) {
                renderQueue.push({ py: getHexCenter(tw.x, tw.y).py, type: 'tower', vx: tw.x, vy: tw.y, ownerId: tw.o, hp: tw.h, maxHp: 15, spriteKey: "tower", acted: tw.a });
            }
        });
    }

    if (state.ct) {
        const ctColor = state.ct.ctrl === -1 ? "#888888" : getEntityColor(state.ct.ctrl);
        renderQueue.push({ py: getHexCenter(state.ct.x, state.ct.y).py, type: 'centerTower', vx: state.ct.x, vy: state.ct.y, color: ctColor });
    }

    for (const [key, ownerId] of Object.entries(state.v)) {
        if (vis.has(key) || ownerId === gameState.cp || (ownerId === -1 && explored.includes(parseInt(key.split(',')[1]) * state.bw + parseInt(key.split(',')[0])))) {
            const [vx, vy] = key.split(',').map(Number);
            let isStart = false; let hp = undefined; let spriteKey = "village";
            if (ownerId !== -1 && gameState.p[ownerId] && gameState.p[ownerId].sv === key) {
                isStart = true; hp = gameState.p[ownerId].sh; spriteKey = "startVillage";
            }
            renderQueue.push({ py: getHexCenter(vx, vy).py, type: 'building', vx, vy, ownerId, hp, spriteKey });
        }
    }

    state.u.forEach(unit => {
        if (unit.p !== gameState.cp && unit.iv === 1) return;
        if (vis.has(`${unit.x},${unit.y}`) || unit.p === gameState.cp) {
            renderQueue.push({ py: getHexCenter(unit.x, unit.y).py, type: 'unit', unit });
        }
    });

    renderQueue.sort((a, b) => a.py - b.py);

    renderQueue.forEach(item => {
        if (item.type === 'building') {
            if (item.isTunnel && item.rr > state.rn) ctx.globalAlpha = 0.4;
            drawEntity(item.vx, item.vy, getEntityColor(item.ownerId), false, item.hp, item.maxHp || 30, item.spriteKey, false);
            if (item.isTunnel && item.rr > state.rn) ctx.globalAlpha = 1.0;
        } else if (item.type === 'unit') {
            const u = item.unit;
            const maxHp = getUnitMaxHp(gameState.p[u.p], u.t, u);
            drawEntity(u.x, u.y, playerColors[u.p], u.a === 1, u.h, maxHp, u.t, u.iv === 1, u);
        } else if (item.type === 'wall') {
            drawEntity(item.vx, item.vy, getEntityColor(item.ownerId), false, item.hp, item.maxHp, item.spriteKey, false);
        } else if (item.type === 'stone') {
            drawEntity(item.vx, item.vy, "#9e9e9e", false, item.hp, item.maxHp, item.spriteKey, false);
        } else if (item.type === 'tower') {
            drawEntity(item.vx, item.vy, getEntityColor(item.ownerId), item.acted === 1, item.hp, item.maxHp, item.spriteKey, false);
        } else if (item.type === 'centerTower') {
            drawEntity(item.vx, item.vy, item.color, false, undefined, undefined, "watchtower", false);
        }
    });

    ctx.restore();
    updateUI();
}
