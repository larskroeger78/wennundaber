// Wandelt eine GPX-Datei (z. B. komoot) in eine Spielstrecke um: src/routes/<name>.json
// Punkte im 2-m-Raster, x = Ost, [1] = Nord, [2] = Höhe NHN; gleicher Ursprung wie die Mittwochsrunde (passt zum Geländemodell).
// Aufruf: node scripts/gpx-to-route.mjs datei.gpx tour2 "Anzeigename"
import fs from 'node:fs';
const [, , gpx, name, label] = process.argv;
if (!gpx || !name) { console.log('Aufruf: node scripts/gpx-to-route.mjs datei.gpx name "Anzeigename"'); process.exit(1); }
const ORIGIN = JSON.parse(fs.readFileSync(new URL('../src/routes/mittwochsrunde.json', import.meta.url), 'utf8')).origin;
const [LAT0, LON0] = ORIGIN, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
const t = fs.readFileSync(gpx, 'utf8');
const raw = [...t.matchAll(/<trkpt lat="([\d.\-]+)" lon="([\d.\-]+)">\s*<ele>([\d.\-]+)/g)].map(m => [(+m[2] - LON0) * KX, (+m[1] - LAT0) * KY, +m[3]]);
if (raw.length < 10) throw new Error('Keine Trackpunkte gefunden');
const pts = [raw[0]]; let acc = 0;                       // Stillstand/Dopplungen entfernen
for (let i = 1; i < raw.length; i++) { const d = Math.hypot(raw[i][0] - pts.at(-1)[0], raw[i][1] - pts.at(-1)[1]); if (d >= 0.5) pts.push(raw[i]); }
const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
const STEP = 2, out = []; let j = 0;
for (let s = 0; s <= cum.at(-1); s += STEP) {
  while (j < pts.length - 2 && cum[j + 1] < s) j++;
  const f = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1), a = pts[j], b = pts[j + 1];
  out.push([+(a[0] + (b[0] - a[0]) * f).toFixed(1), +(a[1] + (b[1] - a[1]) * f).toFixed(1), +(a[2] + (b[2] - a[2]) * f).toFixed(1)]);
}
fs.writeFileSync(new URL(`../src/routes/${name}.json`, import.meta.url), JSON.stringify({ name: label || name, origin: ORIGIN, step: STEP, pts: out }));
let hm = 0; for (let i = 1; i < out.length; i++) hm += Math.max(0, out[i][2] - out[i - 1][2]);
const xs = out.map(p => p[0]), zs = out.map(p => p[1]);
console.log(`${name}: ${out.length} Punkte, ${(cum.at(-1) / 1000).toFixed(2)} km, ~${Math.round(hm)} Hm (roh), x ${Math.min(...xs) | 0}..${Math.max(...xs) | 0}, Nord ${Math.min(...zs) | 0}..${Math.max(...zs) | 0}, Start-Ziel ${Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]).toFixed(0)} m`);
