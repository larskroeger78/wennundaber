# Wenn und Aber Bike Crew – The Aber Version

Enduro-Browserspiel für den Rollentrainer (Van Rysel D100, Anbindung folgt) mit Tastaturmodus zum Testen.
Erste Strecke: Halde Großes Holz in Bergkamen – asphaltierter Uphill, Zwischenplateau mit blauem Leuchtmarker,
Gipfelplateau mit Leuchtstab, Abfahrt über den Trail „Highway“.

## Starten

Voraussetzung: Node.js 18 oder neuer.

```bash
npm install
npm run dev
```

Dann die angezeigte Adresse (http://localhost:5173) in Chrome öffnen.

Steuerung im Tastaturmodus: ↑ treten · ← → lenken · ↓ bremsen · R neu starten.
Abfahrten sind neutral: Tempo entsteht nur durchs Treten.

## Aufbau

- `index.html` – Seite mit Canvas und HUD
- `src/game.js` – gesamter Spielcode (Stand Prototyp 0.5, wird in Module aufgeteilt)
- `src/style.css` – HUD und Startmenü
- `public/assets/` – Platz für Fototexturen, 3D-Modelle und Himmelspanoramen

## Stand und nächste Schritte

Alle Texturen, Bäume und Figuren werden derzeit im Code erzeugt.

1. Fototexturen, Himmelspanorama als Lichtquelle, Nachbearbeitung
2. 3D-Modelle für Vegetation, Bike, Fahrer und Joggerinnen mit Laufanimation
3. Echtes Gelände der Halde aus Höhendaten, Wegeverlauf aus GPX
4. Trailabschnitte aus GoPro-Aufnahmen
5. Trainer-Anbindung über Web Bluetooth (nur Chrome/Edge)
