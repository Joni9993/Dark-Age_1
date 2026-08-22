// Erzeugt parts/map.html — eine SVG-Hexkarte im Look des 3D-Renderers
// (Hex-Prismen mit Seitenflächen, Pinien, Hügel, Dorf, Einheiten, Fog).
// Geometrie: pointy-top, odd-r offset — wie js/hex.js.
// Aufruf: node parts/gen_map.mjs
import { writeFileSync } from 'node:fs';

const W = 390, H = 844;
const R = 40;                     // Hex-Radius
const HW = 0.8660254 * R;         // halbe Breite  = 34.64
const COL = HW * 2;               // 69.28
const ROW = R * 1.5;              // 60
const DEPTH = 10;                 // Prismenhöhe

// Farben 1:1 aus NEW_TERRAIN_COLORS (js/art.js)
const TER = {
  grass:  { top:'#2a3627', side:'#19221a' },
  forest: { top:'#1c2819', side:'#0f1710' },
  hill:   { top:'#4e3e2c', side:'#33271b' },
};

// deterministischer Hash statt Math.random — Karte bleibt bei jedem Build gleich
const h2 = (x, y) => {
  let n = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

const hexPoints = (d = 0) =>
  `0,${-R} ${HW},${-R / 2} ${HW},${R / 2} 0,${R} ${-HW},${R / 2} ${-HW},${-R / 2}`
    .split(' ').map(p => { const [a, b] = p.split(','); return `${a},${+b + d}`; }).join(' ');

const center = (c, r) => ({
  cx: HW + c * COL + (r % 2 ? HW : 0),
  cy: R + r * ROW - 40,
});

// Sonderfelder
const VILLAGE = [2, 5];            // eigenes Dorf
const ENEMY_VILLAGE = [4, 2];
const UNIT = [2, 7];               // ausgewählte Einheit (Ritter)
const UNIT2 = [1, 8];
const FOE = [3, 6];
const SELECTED = UNIT;
const REACH = [[1, 7], [3, 7], [2, 6], [2, 8], [1, 6], [3, 8]];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
const isIn = (list, c, r) => list.some(p => eq(p, [c, r]));

const out = [];
out.push(`<svg class="map" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">`);
out.push(`<rect width="${W}" height="${H}" fill="#050505"/>`);
out.push(`<defs>`);
out.push(`<polygon id="hx" points="${hexPoints()}"/>`);
out.push(`<polygon id="hxs" points="${-HW},${R / 2} 0,${R} ${HW},${R / 2} ${HW},${R / 2 + DEPTH} 0,${R + DEPTH} ${-HW},${R / 2 + DEPTH}"/>`);
out.push(`</defs>`);

const cols = 6, rows = 15;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const { cx, cy } = center(c, r);
    if (cy < -60 || cy > H + 60) continue;
    const n = h2(c, r);
    let kind = 'grass';
    if (n > 0.72) kind = 'forest';
    else if (n > 0.56) kind = 'hill';
    if (isIn([VILLAGE, ENEMY_VILLAGE], c, r)) kind = 'grass';
    const t = TER[kind];
    // leichte, deterministische Farbvariation pro Feld (wie der Renderer sie macht)
    const jitter = Math.round((h2(c + 99, r) - 0.5) * 10);
    const shade = (hex, d) => {
      const v = parseInt(hex.slice(1), 16);
      const cl = x => Math.max(0, Math.min(255, x + d));
      return '#' + [cl(v >> 16), cl((v >> 8) & 255), cl(v & 255)]
        .map(x => x.toString(16).padStart(2, '0')).join('');
    };
    out.push(`<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})">`);
    out.push(`<use href="#hxs" fill="${t.side}"/>`);
    out.push(`<use href="#hx" fill="${shade(t.top, jitter)}" stroke="#0d1310" stroke-width="1"/>`);

    if (kind === 'forest') {
      const pine = (px, py, s) =>
        `<g transform="translate(${px} ${py}) scale(${s})" shape-rendering="crispEdges">` +
        `<rect x="-2" y="2" width="4" height="7" fill="#3a2515"/>` +
        `<polygon points="0,-16 9,2 -9,2" fill="#16240f"/>` +
        `<polygon points="0,-16 3,2 -9,2" fill="#22331d"/>` +
        `<polygon points="0,-9 7,4 -7,4" fill="#1b2b14"/>` +
        `<polygon points="0,-9 2,4 -7,4" fill="#27391f"/></g>`;
      out.push(pine(-14, 8, .85) + pine(12, 2, .7) + pine(0, 16, .95));
    }
    if (kind === 'hill') {
      out.push(`<polygon points="-20,10 -8,-8 8,-8 20,10" fill="#5c4a34"/>`);
      out.push(`<polygon points="-8,-8 8,-8 14,2 -14,2" fill="#6b573d"/>`);
      out.push(`<polygon points="-20,10 -14,2 14,2 20,10" fill="#3f3223"/>`);
    }

    // Dörfer
    if (isIn([VILLAGE], c, r) || isIn([ENEMY_VILLAGE], c, r)) {
      const own = isIn([VILLAGE], c, r);
      const col = own ? '#00e5ff' : '#ff1744';
      out.push(`<g shape-rendering="crispEdges" transform="translate(0 -6)">
        <rect x="-16" y="-2" width="32" height="22" fill="#cabe98"/>
        <rect x="6" y="-2" width="10" height="22" fill="#a89878"/>
        <polygon points="0,-18 20,-2 -20,-2" fill="#8a2c0e"/>
        <polygon points="0,-18 6,-2 -20,-2" fill="#a53a13"/>
        <rect x="-4" y="8" width="8" height="12" fill="#5e3a20"/>
        <rect x="-22" y="-26" width="4" height="18" fill="#3a2515"/>
        <rect x="-18" y="-26" width="12" height="9" fill="${col}"/>
      </g>`);
    }

    // Reichweiten-Marker
    if (isIn(REACH, c, r)) {
      out.push(`<use href="#hx" fill="#e8b84a" opacity=".16"/>`);
      out.push(`<use href="#hx" fill="none" stroke="#e8b84a" stroke-width="2" opacity=".55"/>`);
    }

    // Einheiten
    const unit = (col, sel) => `<g shape-rendering="crispEdges" transform="translate(0 -4)">
      <ellipse cx="0" cy="14" rx="16" ry="5" fill="#000" opacity=".45"/>
      <rect x="-6" y="-26" width="12" height="5" fill="${col}"/>
      <rect x="-5" y="-21" width="10" height="8" fill="#c99361"/>
      <rect x="-3" y="-19" width="2" height="2" fill="#0e0c14"/>
      <rect x="1" y="-19" width="2" height="2" fill="#0e0c14"/>
      <rect x="-8" y="-13" width="16" height="14" fill="${col}"/>
      <rect x="-8" y="-13" width="16" height="3" fill="#0e0c14" opacity=".35"/>
      <rect x="-7" y="1" width="5" height="10" fill="#3a2515"/>
      <rect x="2" y="1" width="5" height="10" fill="#3a2515"/>
      <rect x="9" y="-24" width="3" height="20" fill="#9fabbc"/>
      <rect x="6" y="-6" width="9" height="3" fill="#8f6435"/>
      ${sel ? '<rect x="-9" y="-14" width="18" height="1" fill="#e8b84a"/>' : ''}
    </g>`;
    if (isIn([UNIT], c, r)) out.push(unit('#00e5ff', true));
    if (isIn([UNIT2], c, r)) out.push(unit('#00e5ff', false));
    if (isIn([FOE], c, r)) out.push(unit('#ff1744', false));

    // Auswahl-Rahmen
    if (eq([c, r], SELECTED)) {
      out.push(`<use href="#hx" fill="none" stroke="#e8b84a" stroke-width="3"/>`);
      out.push(`<use href="#hx" fill="none" stroke="#fff824" stroke-width="1" opacity=".7"/>`);
    }
    out.push(`</g>`);
  }
}

// Fog / Vignette: unerkundetes Gebiet läuft ins Schwarze
out.push(`<defs><radialGradient id="fog" cx="50%" cy="52%" r="62%">
  <stop offset="55%" stop-color="#050505" stop-opacity="0"/>
  <stop offset="100%" stop-color="#050505" stop-opacity=".95"/>
</radialGradient></defs>`);
out.push(`<rect width="${W}" height="${H}" fill="url(#fog)"/>`);
out.push(`</svg>`);

writeFileSync(new URL('./map.html', import.meta.url), out.join('\n'));
console.log('parts/map.html geschrieben');
