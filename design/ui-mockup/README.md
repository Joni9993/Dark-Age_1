# Pixel-UI — Entwurf

Quelldateien des UI-Entwurfs, aus dem `css/game.css` und `js/icons.js`
hervorgegangen sind. Der begehbare Entwurf (elf Artboards + Design-System-Tafel)
liegt als Design-Canvas online:
<https://claude.ai/code/artifact/5ea1aa3e-7561-4d67-ace1-770613b501b1>

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/*.body.html` | Ein Artboard je Datei — **hier wird bearbeitet** |
| `parts/style.css` | Gemeinsames Stylesheet der Artboards (Vorlage für `css/game.css`) |
| `parts/sprite.html` | Das Icon-Set — **Quelle für `js/icons.js`** |
| `parts/gen_map.mjs` | Erzeugt `parts/map.html`, die SVG-Hexkarte im Look des 3D-Renderers |
| `build.mjs` | Baut aus `src/` + `parts/` die fertigen `*.dc.html`-Artboards |
| `canvas.json` | Anordnung der Artboards auf der Leinwand |

## Neu bauen

```bash
node parts/gen_map.mjs   # nur nötig, wenn die Kartendarstellung geändert wurde
node build.mjs           # erzeugt die *.dc.html neu
```

## Icons ändern

Das Icon-Set wird in `parts/sprite.html` gepflegt (12×12-Raster, `<rect>`-Pixel,
`shape-rendering="crispEdges"`). Danach `js/icons.js` neu erzeugen — die Datei
ist generiert und darf nicht von Hand bearbeitet werden. Das Erzeugungsskript
liest den `<svg>`-Block aus `parts/sprite.html`, bettet ihn als String ein und
schreibt die Namensliste dazu; es lag im Scratchpad der Session und ist bei
Bedarf in wenigen Zeilen neu geschrieben.

## Was im Spiel noch Emoji ist

Alle **Buttons** und **Ressourcen-Angaben** laufen über das Icon-Set. Emoji
stehen nur noch in **Fließtext-Strings**: Toasts, Info-Panel-Sätze und die
Namen in `js/data.js` (`"🏰 Feudalismus"`, `"⚔️ Grubenritter"` …). Die bleiben
bewusst, weil dieselben Strings auch in `textContent`, `title`-Attributen und
Server-Nachrichten landen — dort wäre `<svg>`-Markup sichtbarer Quelltext.
Wer sie umstellen will, muss zuerst Anzeige- und Datentext trennen.
