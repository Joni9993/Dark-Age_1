# Debug-Modus

Öffne `index.html?debug=1` im Browser — kein Login, kein Server.

## Panel (rechts oben, 🐞-Button)

| Sektion | Was es tut |
|---|---|
| **Spiel** | Spielerwechsel, Runde setzen, Neues Testspiel (Spielerzahl, Radius, Seed, Ressourcen-Boost) |
| **Cheats** | +10 Gold/Holz/Stein, alle Aktionen auffrischen |
| **Fog of War** | Checkbox — aus = alle Felder sichtbar inkl. unsichtbare Assassinen |
| **Klick-Werkzeug** | Einheit setzen, löschen, HP setzen, Dorf-Besitzer, Aktion verbraucht togglen |
| **State → URL** | Zustand in URL schreiben → Code ändern → F5 → exakt dort weitertesten |
| **Szenarien** | Spielstände in localStorage speichern/laden, JSON export/import |

## Hotseat

„Zug beenden" wechselt direkt zum nächsten Spieler — kein Link-Screen.

## Live-Code-Workflow

1. „State → URL" klicken
2. `js/*.js` im Editor ändern
3. F5 → selber Spielstand, neuer Code

Der Service Worker ist im Debug-Modus deaktiviert, damit Änderungen sofort greifen.

## Konsolen-Helfer (`window.dbg`)

```js
dbg.state()              // gameState lesen
dbg.give(0, 99, 99, 99) // Spieler 0: +99 Gold, +99 Holz, +99 Stein
dbg.switch(1)            // zu Spieler 1 wechseln
dbg.faction(0, 2)        // Spieler 0 Fraktion 2 (Spionage) geben
dbg.upgrade(0, 4)        // Spieler 0 Upgrade 4 geben
dbg.render()             // Board neu zeichnen
```

## Hinweis

Fog im laufenden Spiel ausschalten schreibt alle Felder in `p.e` (erkundet). Für echte Fog-Tests: Fog-Checkbox deaktivieren **bevor** du ein neues Testspiel startest.
