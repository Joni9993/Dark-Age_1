# Patchnotes v0.3.0 – Lufteinheiten & 3D-Engine

## 3D-Darstellung
- Renderer auf Three.js umgestellt: Hex-Felder als 3D-Prismen, Einheiten/Gebäude als Voxel-Figuren aus den bestehenden Pixel-Sprites
- Kamera, Zoom, Klick-Erkennung vollständig auf 3D umgestellt
- 2D-Ansicht bleibt als Fallback verfügbar

## Neu: Lufteinheiten
- Jede Fraktion erhält eine vierte, fliegende Spezialeinheit:
  - Feudalismus – Luftschraube: 7 Gold, 14 HP, Bewegung 2, greift Boden und Luft an. Fähigkeit „Lufttransport": trägt eine eigene Bodeneinheit über Fronten hinweg

  - Plünderer – Gleiter: 6 Gold, 8 HP, Bewegung 4, greift Boden und Luft an. Fähigkeit „Sturzangriff": 9 Schaden auf Boden-, Luft- oder Gebäudeziel, Einheit wird dabei zerstört

  - Spionage – Fallschirmspringer: 4 Gold, 10 HP, Fernkampf (Reichweite 2). Fähigkeit „Absprung": permanente Landung auf einem Feld im Umkreis 3, danach normale Bodeneinheit

  - Gilden – Bombenballon: 9 Gold, 14 HP, greift nur Bodenziele an. „Anzünden" (Normalangriff, 8 Schaden über 2 Runden) und „Feuersturm" (5 Holz, trifft 7 Felder inklusive eigener Einheiten)

- Lufteinheiten ignorieren Bodenhindernisse (Mauern, Türme, Steine, Einheiten, Tunnel) bei der Bewegung

- Boden- und Lufteinheit können sich ein Feld teilen

- Lufteinheiten können keine Dörfer einnehmen und keine Tunnel benutzen

- Rekrutierbar im Dorf, sobald die jeweilige Fraktion gewählt wurde

## Luft-Kampfregeln
- Nahkampf-Bodeneinheiten können Lufteinheiten nicht angreifen

- Fernkampf-Bodeneinheiten, können Lufteinheiten angreifen

- Veteranen-System gilt auch für Lufteinheiten (2 Kills = +1 Schaden)

## Luftansicht
- Neuer Button im HUD schaltet zwischen Boden- und Luftansicht um
- Bodenansicht: Lufteinheiten sind nur zu 10 % sichtbar
- Luftansicht: Lufteinheiten voll sichtbar, Kamera kippt in eine steilere Vogelperspektive
- Außerhalb der Luftansicht sind Lufteinheiten nicht anwählbar und nicht anvisierbar – auch nicht durch Türme

## Bedienung
- Teilen sich zwei Einheiten (oder eine Einheit und der eigene, einsatzbereite Turm) ein Feld, erscheint eine Auswahl mit beiden Optionen zum Antippen
- Ist ein Feld gleichzeitig gültiges Bewegungs- und Angriffsziel (z. B. Fernkampfeinheit neben gegnerischer Lufteinheit), erscheint jetzt eine Wahl: „Angreifen" oder „Hierher bewegen" – statt automatischem Angriff
