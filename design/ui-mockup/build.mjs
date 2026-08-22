// Baut aus src/*.body.html + parts/ die fertigen <Name>.dc.html-Artboards.
//   node parts/gen_map.mjs && node build.mjs
// Marker im Body:  <!--MAP-->  wird durch parts/map.html ersetzt.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(dir, p), 'utf8');

const css = read('parts/style.css');
const sprite = read('parts/sprite.html');
const map = read('parts/map.html');
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
  + 'family=MedievalSharp&family=Pixelify+Sans:wght@400;500;600;700&family=Silkscreen:wght@400;700&display=swap">';

for (const f of readdirSync(join(dir, 'src')).filter(f => f.endsWith('.body.html'))) {
  const name = f.replace('.body.html', '');
  const body = read(join('src', f)).replace('<!--MAP-->', map);
  const doc = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${fonts}
<style>
${css}
</style>
</helmet>
${sprite}
${body}
</x-dc>
</body>
</html>
`;
  writeFileSync(join(dir, `${name}.dc.html`), doc);
  console.log(`gebaut: ${name}.dc.html  (${(doc.length / 1024).toFixed(0)} KB)`);
}
