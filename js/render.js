// === SPRITE RENDERER ===
function drawPixelSprite(ctx, cx, cy, spriteKey, playerColor) {
    const arr = pixelSprites[spriteKey];
    if (!arr) return;
    const size = Math.round(Math.sqrt(arr.length));
    const s = ((spriteKey === 9) ? 3.3 : 2.5) * 10 / size;
    const startX = cx - (size / 2 * s);
    const startY = cy - (size / 2 * s) - 6;
    for (let i = 0; i < arr.length; i++) {
        let val = arr[i];
        if (val === 0) continue;
        ctx.fillStyle = spritePixelColor(val, playerColor);
        ctx.fillRect(startX + (i % size) * s, startY + Math.floor(i / size) * s, s, s);
    }
}

// === ANIMATION SYSTEM ===
// Globale Delegates — der aktive Renderer (2D oder 3D) übernimmt die Umsetzung.
function spawnFloatingText(x, y, text, color) {
    Renderer.spawnFloatingText(x, y, text, color);
}

function spawnAttackAnim(fromX, fromY, toX, toY, type) {
    Renderer.spawnAttackAnim(fromX, fromY, toX, toY, type);
}

function _spawnFloatingText2D(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 1.0, dy: 0 });
    if (!isAnimating) { isAnimating = true; requestAnimationFrame(animateLoop); }
}

function _spawnAttackAnim2D(fromX, fromY, toX, toY, type) {
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
    if (window.highlightedTunnelEnd && window.highlightedTunnelEnd.x === x && window.highlightedTunnelEnd.y === y) { drawHexPath(center.px, topY); ctx.fillStyle = "rgba(79, 195, 247, 0.45)"; ctx.fill(); ctx.strokeStyle = "#4fc3f7"; ctx.lineWidth = 2; ctx.stroke(); }
    if (window.demolishTargets && window.demolishTargets.some(t => t.x === x && t.y === y)) { drawHexPath(center.px, topY); ctx.fillStyle = "rgba(255, 152, 0, 0.5)"; ctx.fill(); ctx.strokeStyle = "#ff9800"; ctx.lineWidth = 2; ctx.stroke(); }
    if (window.selectedUnderworldHex && window.selectedUnderworldHex.x === x && window.selectedUnderworldHex.y === y) { drawHexPath(center.px, topY); ctx.fillStyle = "rgba(192, 132, 252, 0.35)"; ctx.fill(); ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawEntity(x, y, color, hasActed, hp, maxHp, spriteKey, isStealth, unit) {
    const center = getHexCenter(x, y);
    const tType = getTerrainType(gameState, x, y);
    const elevation = tType === 'hill' ? -6 : 0;

    let entityAlpha = isStealth ? (hasActed ? 0.3 : 0.85) : (hasActed ? 0.4 : 1.0);
    // Flieger: standardmäßig fast durchsichtig, in der Luftansicht voll sichtbar
    if (unit && unitStats[unit.t] && unitStats[unit.t].isAir && isFlying(unit)) entityAlpha *= window.airView ? 1 : 0.15;
    ctx.globalAlpha = entityAlpha;

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
    if (!isAnimating) Renderer.render(state);
}

// Unterwelt-2D-Fallback: einfache Draufsicht statt der leeren, blanken Karte —
// dunkle Fels-Hexes, hellere offene Hexes, Kristalladern mit Akzentfarbe,
// Herzkaverne markiert. Keine Perfektion nötig — Parität der Information, nicht
// der Optik (siehe Auftrag). Seit M9b: echte Netz-Sicht (getVisibleUWHexes)
// statt "immer alles zeigen", + Einheiten-Marker/Ziel-Highlights/Gehör-Pings.
const UW_2D_COLORS = {
    [UW_FELS]: '#232326', [UW_KAVERNE]: '#4a3c2a', [UW_ADER]: '#2e3a42',
    [UW_RUINE]: '#4a3c2a', [UW_HERZ]: '#4a2a2a'
};

// Sichtbarer Terrain-Typ inkl. Laufzeit-Zustand — gleiche Logik wie
// uwVisualType in render3d.js (dort ausführlicher kommentiert), hier als
// eigene, schlanke Kopie (2D-Fallback bleibt bewusst minimal/unabhängig).
function uw2DVisualType(x, y) {
    const t = getUnderworldType(gameState, x, y);
    if (t === UW_ADER) return getUWVeinRemaining(gameState, x, y) > 0 ? UW_ADER : UW_KAVERNE;
    if (t === UW_FELS && isUnderworldOpen(gameState, x, y)) return UW_KAVERNE;
    return t;
}

function drawUnderworldHex2D(x, y, uwVis, noisePings) {
    const center = getHexCenter(x, y);
    const key = `${x},${y}`;

    if (!uwVis.has(key)) {
        drawHexPath(center.px, center.py);
        ctx.fillStyle = "#0a0a0a"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.stroke();
        return;
    }

    const uType = uw2DVisualType(x, y);
    drawHexPath(center.px, center.py);
    ctx.fillStyle = UW_2D_COLORS[uType] || UW_2D_COLORS[UW_FELS];
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.stroke();

    if (uType === UW_ADER) {
        ctx.fillStyle = '#7fe3ff';
        ctx.beginPath(); ctx.arc(center.px, center.py, 3, 0, Math.PI * 2); ctx.fill();
        // Restbestand als Zahl (Korrektur Juli 2026, Parität zum 3D-Renderer)
        const rem = getUWVeinRemaining(gameState, x, y);
        if (rem > 0) { ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText(`💎${rem}`, center.px, center.py - 8); }
    } else if (uType === UW_RUINE) {
        ctx.strokeStyle = '#c9a24b'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(center.px - 6, center.py); ctx.lineTo(center.px + 6, center.py); ctx.stroke();
    } else if (uType === UW_HERZ) {
        ctx.fillStyle = '#ff6f61';
        ctx.beginPath(); ctx.arc(center.px, center.py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }

    // Herrenloser Kristallhaufen (Korrektur Juli 2026): fällt beim Tod eines
    // Trägers, wird von Arbeiter/Beutegräber beim Betreten automatisch eingesammelt.
    const dropAmount = gameState.uw && gameState.uw.dr && gameState.uw.dr[`${x},${y}`];
    if (dropAmount) {
        ctx.fillStyle = '#7fe3ff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`💎${dropAmount}`, center.px, center.py + 2);
    }

    // Tunnel-HUB (Korrektur Juli 2026): der Oberflächen-Tunnel wird auf sein
    // Startpunkt-Hex gespiegelt — 🚇-Symbol in der Besitzerfarbe + gemeinsamer
    // HP-Pool (t.h), gleiche Info wie das gespiegelte 3D-Gebäude.
    const hubTunnel = (gameState.tu || []).find(t => t.x1 === x && t.y1 === y);
    if (hubTunnel) {
        ctx.globalAlpha = hubTunnel.r > gameState.rn ? 0.4 : 1;
        ctx.fillStyle = playerColors[hubTunnel.o] || '#888';
        ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
        ctx.fillText('🚇', center.px, center.py + 4);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace';
        ctx.fillText(`${hubTunnel.h}`, center.px, center.py - 10);
        ctx.globalAlpha = 1;
    }

    // Ziel-Highlights: Bewegen grün, Graben bräunlich, Angreifen rot (M10) —
    // gleiche Farbwahl wie render3d.js. Abbauen läuft seit der Toggle-Umstellung
    // (Korrektur Juli 2026) ohne Ziel-Klick, kein Highlight mehr nötig.
    if (uwValidMoves.some(m => m.x === x && m.y === y)) { drawHexPath(center.px, center.py); ctx.fillStyle = "rgba(100, 255, 100, 0.35)"; ctx.fill(); }
    if (uwValidDigs.some(d => d.x === x && d.y === y)) { drawHexPath(center.px, center.py); ctx.fillStyle = "rgba(161, 102, 47, 0.55)"; ctx.fill(); }
    if (uwValidCollapse.some(c => c.x === x && c.y === y)) { drawHexPath(center.px, center.py); ctx.fillStyle = "rgba(255, 152, 0, 0.5)"; ctx.fill(); }
    if (uwValidDynamite.some(d => d.x === x && d.y === y)) { drawHexPath(center.px, center.py); ctx.fillStyle = "rgba(216, 67, 21, 0.55)"; ctx.fill(); }
    if (uwValidAttacks.some(a => a.x === x && a.y === y)) { drawHexPath(center.px, center.py); ctx.fillStyle = "rgba(255, 100, 100, 0.5)"; ctx.fill(); }

    // Ausstehende Dynamit-Ladung (Korrektur Juli 2026, ersetzt Unterminierung):
    // 🧨-Icon auf jedem der 3 Ziel-Hexes, solange die Ladung noch nicht detoniert
    // ist — rein unterirdisch, keine Anzeige an der Oberfläche.
    (gameState.uw && gameState.uw.dy || []).forEach(charge => {
        if (charge.hexes.some(h => h.x === x && h.y === y)) {
            ctx.fillStyle = '#ff6e40'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
            ctx.fillText('🧨', center.px, center.py - 6);
        }
    });

    // Tiefeneinheiten: eigene immer, fremde nur im Umkreis 2 eigener Einheiten
    // (isUWUnitVisible, js/logic.js). Icon pro Typ statt fixem ⛏ (M9b-Rest).
    const UW_UNIT_ICONS = { 7: '⛏', 17: '🛡', 18: '💥', 19: '⚔', 20: '🪙', 21: '👂', 22: '⚙' };
    const unit = uwUnitAt(x, y);
    if (unit && isUWUnitVisible(gameState.cp, unit)) {
        ctx.globalAlpha = unit.iv === 1 ? 0.5 : 1;
        ctx.fillStyle = playerColors[unit.p];
        ctx.beginPath(); ctx.arc(center.px, center.py, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        ctx.fillText(UW_UNIT_ICONS[unit.t] || '?', center.px, center.py + 3);
        if (unit.cr) { ctx.fillStyle = '#7fe3ff'; ctx.font = 'bold 8px monospace'; ctx.fillText(`💎${unit.cr}`, center.px, center.py - 10); }
        if (unit.art) { ctx.fillStyle = '#ba68c8'; ctx.font = 'bold 8px monospace'; ctx.fillText(RELICS[unit.art].icon, center.px + 9, center.py - 6); }
        ctx.globalAlpha = 1;
    }

    // Kreaturen (M11): neutral, gleiche Umkreis-2-Sichtregel (isUWCreatureVisible).
    const UW_CREATURE_ICONS = { [UWC_SPINNE]: '🕷', [UWC_WUEHLER]: '🦡', [UWC_STEINPANZER]: '🪨', [UWC_WURM]: '🐛' };
    const creature = uwCreatureAt(x, y);
    if (creature && isUWCreatureVisible(gameState.cp, creature)) {
        const isWurm = creature.t === UWC_WURM;
        ctx.fillStyle = '#7a3b3b';
        ctx.beginPath(); ctx.arc(center.px, center.py, isWurm ? 10 : 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = `bold ${isWurm ? 12 : 9}px monospace`; ctx.textAlign = 'center';
        ctx.fillText(UW_CREATURE_ICONS[creature.t] || '?', center.px, center.py + 4);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace';
        ctx.fillText(`${creature.h}`, center.px, center.py - (isWurm ? 15 : 11));
    }

    // Spinnennetze (M11): dezenter Bodenring.
    if (gameState.uw && gameState.uw.w && gameState.uw.w[`${x},${y}`]) {
        ctx.strokeStyle = 'rgba(221,221,221,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(center.px, center.py, 10, 0, Math.PI * 2); ctx.stroke();
    }

    // Gehör: Horcher-Ortung (exact) als deutlicheres rotes Fadenkreuz, sonst
    // ungefähre Richtungsmarkierung als kleines Symbol am Netzrand.
    const ping = noisePings.find(p => p.x === x && p.y === y);
    if (ping) {
        ctx.fillStyle = ping.exact ? '#ff5252' : '#ffb300'; ctx.font = `bold ${ping.exact ? 13 : 11}px monospace`; ctx.textAlign = 'center';
        ctx.fillText(ping.exact ? '🎯' : '👂', center.px, center.py - 14);
    }

    // Telegraphierte Kreaturen-Angriffe (Korrektur Juli 2026, "Runden-Phase +
    // Telegraph"): sichtbar sobald das Hex im eigenen Netz liegt (uwVis, s.o.),
    // UNABHÄNGIG von der Umkreis-2-Kreaturen-Sichtregel — die Markierung IST der
    // Fairness-Kern des Systems ("jeder hat genau einen Zug zum Ausweichen"),
    // die Kreatur dahinter darf verborgen bleiben (gruselig ist gewollt). Eigene
    // Farbe/Icon-Kombi (dunkles Rot-Overlay + 🎯), nicht mit den grün/braun/
    // orange/hellrot-halbtransparenten uwValid*-Auswahl-Highlights verwechselbar.
    const telegraph = (gameState.uw && gameState.uw.c || []).find(c =>
        c.h > 0 && c.ap && getCreatureAttackHexes(gameState, c).some(h => h.x === x && h.y === y));
    if (telegraph) {
        drawHexPath(center.px, center.py);
        ctx.fillStyle = "rgba(183, 28, 28, 0.5)"; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
        ctx.fillText('🎯', center.px, center.py + 4);
    }

    if (window.selectedUnderworldHex && window.selectedUnderworldHex.x === x && window.selectedUnderworldHex.y === y) {
        drawHexPath(center.px, center.py);
        ctx.fillStyle = "rgba(192, 132, 252, 0.35)"; ctx.fill();
        ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 2; ctx.stroke();
    }
}

function drawScene(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(camX, camY);
    ctx.scale(camScale, camScale);

    updateExploration();
    updateUWExploration();
    const vis = getVisibleHexes(gameState.cp);
    const explored = gameState.p[gameState.cp].e || [];

    // M13: gleiche uw/global-Sichtregeln wie der Recap-Playback in bootGame (siehe
    // dortiger Kommentar) — Unterwelt-Aktionen prüfen das Unterwelt-Netz statt der
    // Oberflächen-Sicht, globale Meldungen (Wurm-Tod/Erschließung) immer sichtbar.
    const visibleRecaps = (state.la || []).filter(a => {
        if (a.global) return true;
        if (a.uw) {
            const uwVis = getVisibleUWHexes(gameState.cp);
            if (!uwVis.has(`${a.x},${a.y}`)) return false;
            return !((gameState.uw && gameState.uw.u) || []).some(u => u.p !== gameState.cp && u.iv === 1 && u.x === a.x && u.y === a.y);
        }
        if (!vis.has(`${a.x},${a.y}`)) return false;
        return !state.u.some(u => u.p !== state.cp && u.iv === 1 && u.x === a.x && u.y === a.y);
    });

    // Unterwelt-Fokus (2): eigene, vom Oberflächen-Terrain unabhängige Draufsicht
    // statt der normalen Hex-Schleife (Netz-Sicht statt Oberflächen-Fog, siehe
    // getVisibleUWHexes/js/logic.js — "Unterwelt aufdecken" im Debug-Panel
    // übersteuert weiterhin alles).
    const uwVis = window.cameraFocus === 2 ? getVisibleUWHexes(gameState.cp) : null;
    const uwNoisePings = window.cameraFocus === 2 ? getUWNoisePings(gameState.cp) : [];

    for (let y = 0; y < state.bh; y++) {
        for (let x = 0; x < state.bw; x++) {
            if (!isInsideMap(state, x, y)) continue;

            if (window.cameraFocus === 2) {
                drawUnderworldHex2D(x, y, uwVis, uwNoisePings);
                continue;
            }

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
    // Unterwelt-Kamerafokus (2): Oberflächen-Ebene bleibt komplett aus — siehe
    // render3d.js für die ausführliche Begründung (keine Auswahl, keine
    // durchscheinenden HP-/Ressourcen-Zahlen; eigene Unterwelt-Entities fehlen
    // hier im 2D-Fallback noch ganz).
    if (window.cameraFocus !== 2) {

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
        if (!window.DEBUG_NO_FOG && unit.p !== gameState.cp && unit.iv === 1) return;
        if (vis.has(`${unit.x},${unit.y}`) || unit.p === gameState.cp) {
            renderQueue.push({ py: getHexCenter(unit.x, unit.y).py, type: 'unit', unit });
        }
    });

    } // window.cameraFocus !== 2

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

    // Erschließungs-Beben (M12, minimal): einfaches Text-Icon direkt auf dem
    // Canvas, nur in der Oberflächen-Ansicht. Dynamit (Korrektur Juli 2026) hat
    // bewusst KEINE Oberflächen-Anzeige mehr — es wirkt ausschließlich unten.
    if (window.cameraFocus !== 2) {
        if (state.uw && state.uw.hz && state.ct) {
            const c = getHexCenter(state.ct.x, state.ct.y);
            ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
            ctx.fillStyle = '#8d6e63';
            ctx.fillText('🌍', c.px, c.py - 26);
        }
    }

    ctx.restore();
    updateUI();
}

// === RENDERER FACADE ===
// Schnittstelle zwischen Spiellogik/Input und dem aktiven Renderer.
// render3d.js kann `Renderer` durch eine 3D-Implementierung ersetzen —
// Logik und Input sprechen nur noch über dieses Objekt mit der Grafik.
let _gestureStart = null;

function _requestRender() {
    if (!isAnimating) requestAnimationFrame(() => drawScene(gameState));
}

const Renderer2D = {
    init() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    },

    resize() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    },

    render(state) {
        drawScene(state);
    },

    // Liefert das angeklickte Hex {x,y} oder null. thresholdFactor > 1 erlaubt
    // großzügigeres Treffen (Debug-Werkzeuge).
    pickHex(clientX, clientY, thresholdFactor = 1) {
        const rect = canvas.getBoundingClientRect();
        const rawX = (clientX - rect.left) * (canvas.width / rect.width);
        const rawY = (clientY - rect.top) * (canvas.height / rect.height);
        const mouseX = (rawX - camX) / camScale;
        const mouseY = (rawY - camY) / camScale;

        let closest = null; let minDist = Infinity; let closestIsHill = false;

        for (let y = 0; y < gameState.bh; y++) {
            for (let x = 0; x < gameState.bw; x++) {
                if (!isInsideMap(gameState, x, y)) continue;
                const center = getHexCenter(x, y);
                const tType = getTerrainType(gameState, x, y);
                const isHill = tType === 'hill';
                const topFaceY = isHill ? center.py - 6 : center.py;
                let dist = Math.sqrt((mouseX - center.px) ** 2 + ((mouseY - topFaceY) / yCompress) ** 2);

                if (isHill) {
                    const sideBottom = center.py + thickness;
                    if (mouseY > topFaceY && mouseY < sideBottom && Math.abs(mouseX - center.px) < hexWidth * 0.5) {
                        const sideDist = Math.abs(mouseX - center.px) + 4;
                        dist = Math.min(dist, sideDist);
                    }
                }

                if (dist < minDist - 1 || (dist < minDist + 1 && isHill && !closestIsHill)) {
                    minDist = dist; closest = { x, y }; closestIsHill = isHill;
                }
            }
        }

        return (closest && minDist < hexSize * thresholdFactor) ? closest : null;
    },

    // Gesten laufen relativ zum Zustand bei beginGesture (kein Drift bei Pinch).
    beginGesture() {
        _gestureStart = { x: camX, y: camY, scale: camScale };
    },

    gesturePan(dx, dy) {
        if (!_gestureStart) return;
        camX = _gestureStart.x + dx;
        camY = _gestureStart.y + dy;
        _requestRender();
    },

    gestureZoom(factor, centerX, centerY) {
        if (!_gestureStart) return;
        camScale = Math.max(0.4, Math.min(_gestureStart.scale * factor, 3.0));
        camX = centerX - (centerX - _gestureStart.x) * (camScale / _gestureStart.scale);
        camY = centerY - (centerY - _gestureStart.y) * (camScale / _gestureStart.scale);
        _requestRender();
    },

    // Reine Draufsicht — keine Kamera-Rotation möglich, No-Op für Fassaden-Parität mit dem 3D-Renderer.
    gestureOrbit() {},

    wheelZoom(factor, centerX, centerY) {
        const newScale = Math.max(0.4, Math.min(camScale * factor, 3.0));
        const applied = newScale / camScale;
        camX = centerX - (centerX - camX) * applied;
        camY = centerY - (centerY - camY) * applied;
        camScale = newScale;
        _requestRender();
    },

    centerOn(hexX, hexY, scale) {
        if (scale !== undefined) camScale = scale;
        const center = getHexCenter(hexX, hexY);
        camX = (canvas.width / 2) - center.px;
        camY = (canvas.height / 2) - center.py;
    },

    spawnFloatingText: _spawnFloatingText2D,
    spawnAttackAnim: _spawnAttackAnim2D,

    // 2D hat keine echte Kamerafahrt/Kippung — die Oberfläche ist einfach dann
    // sichtbar, wenn der Kamerafokus nicht auf Unterwelt steht.
    isSurfaceVisible() {
        return window.cameraFocus !== 2;
    },

    setCameraFocus(focus) {
        canvas.classList.toggle('camera-focus-underworld', focus === 2);
        if (gameState) drawScene(gameState);
    }
};

let Renderer = Renderer2D;

// === KAMERAFOKUS-TOGGLE ===
// Drei Kamerafahrten im Zyklus: Standard -> Luftansicht (Vogelperspektive,
// Flieger 100% sichtbar, nur 3D) -> Unterwelt (Kamera schwenkt unter die
// Karte und blickt mit 90° auf ihre Unterseite, nur 3D; 2D-Fallback spiegelt
// nur das Canvas per CSS). window.airView bleibt als Kompatibilitäts-Flag
// bestehen — nur im Luftansicht-Zustand (1) aktiv — und steuert weiterhin
// die Klick-/Anvisier-Priorität bei gestapelten Hexes (input.js, logic.js).
window.cameraFocus = 0;   // 0 = Standard, 1 = Luftansicht, 2 = Unterwelt
window.airView = false;
window.cycleCameraFocus = function () {
    window.cameraFocus = (window.cameraFocus + 1) % 3;
    window.airView = (window.cameraFocus === 1);

    const btn = document.getElementById('camera-focus-btn');
    if (btn) {
        btn.classList.toggle('active', window.cameraFocus !== 0);
        btn.classList.toggle('focus-underworld', window.cameraFocus === 2);
    }

    if (window.cameraFocus === 2) {
        // Unterwelt: die komplette Oberflächen-Ebene ist nicht mehr anwählbar/
        // steuerbar — eine bestehende Auswahl (Boden- oder Lufteinheit) fällt weg.
        selectedUnit = null; selectedHex = null; validMoves = []; validAttacks = [];
        window.specialActive = null; hideActionMenu();
    } else if (selectedUnit) {
        if (!window.airView && typeof isFlying === 'function' && isFlying(selectedUnit)) {
            // Flieger sind außerhalb der Luftansicht nicht "beachtet" — Auswahl aufheben
            selectedUnit = null; selectedHex = null; validMoves = []; validAttacks = [];
            window.specialActive = null; hideActionMenu();
        } else if (selectedUnit.a === 0 || selectedUnit.a === 2 || selectedUnit.a === 4) {
            // Highlights an die neue Ebenen-Sicht anpassen (Luftziele ein-/ausblenden)
            validMoves = (selectedUnit.a === 0 || selectedUnit.a === 4) ? calculateMoves(selectedUnit) : [];
            validAttacks = (selectedUnit.a === 0 || selectedUnit.a === 2) ? calculateAttacks(selectedUnit) : [];
        }
    }

    if (Renderer.setCameraFocus) Renderer.setCameraFocus(window.cameraFocus);
    else if (gameState) renderBoard(gameState);
};
