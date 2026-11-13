import { overpass, ARGS, WANT_QUERY, elementsOrNull } from './overpass.mjs';
// Liest die Untergründe entlang der Mittwochsrunde aus OpenStreetMap (Overpass-API)
// und schreibt src/routes/mittwochsrunde.surf.json (je Streckenpunkt: 0 Asphalt, 1 Schotter, 2 Trail).
// Aufruf: npm run surfaces   (Node 18+, Internet nötig)
import fs from 'node:fs';

const NAME = ARGS[0] || 'tour2';            // npm run surfaces [-- mittwochsrunde]
const ROUTE = new URL(`../src/routes/${NAME}.json`, import.meta.url);
const OUT = new URL(`../src/routes/${NAME}.surf.json`, import.meta.url);
const route = JSON.parse(fs.readFileSync(ROUTE, 'utf8'));
const [lat0, lon0] = route.origin;
const KX = 111320 * Math.cos(lat0 * Math.PI / 180), KY = 111320;
const P = route.pts;

const PAVED = new Set(['asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett', 'cobblestone', 'metal']);
const LOOSE = new Set(['compacted', 'fine_gravel', 'gravel', 'unpaved', 'pebblestone', 'rock']);
const SOFT = new Set(['dirt', 'earth', 'ground', 'grass', 'mud', 'sand', 'woodchips', 'grass_paver']);

export function classify(t) {
  const s = t.surface;
  if (s) { if (PAVED.has(s)) return 0; if (LOOSE.has(s)) return 1; if (SOFT.has(s)) return 2; }
  const h = t.highway;
  if (h === 'track') return t.tracktype === 'grade1' ? 0 : (t.tracktype === 'grade4' || t.tracktype === 'grade5') ? 2 : 1;
  if (h === 'path' || h === 'bridleway') return 2;
  if (h === 'footway' || h === 'pedestrian' || h === 'steps') return 1;
  return 0; // cycleway, service, residential, unclassified, tertiary ...
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function assign(ways) {
  const segs = [];
  for (const w of ways) {
    if (!w.geometry || !w.tags || !w.tags.highway) continue;
    const c = classify(w.tags);
    const g = w.geometry.map(n => [(n.lon - lon0) * KX, (n.lat - lat0) * KY]);
    for (let i = 1; i < g.length; i++) segs.push([g[i - 1][0], g[i - 1][1], g[i][0], g[i][1], c]);
  }
  const out = new Array(P.length).fill(-1);
  for (let i = 0; i < P.length; i++) {
    let best = 1e9, bc = -1;
    for (const s of segs) {
      const d = segDist(P[i][0], P[i][1], s[0], s[1], s[2], s[3]);
      if (d < best) { best = d; bc = s[4]; }
    }
    if (best < 18) out[i] = bc;
  }
  // Lücken mit dem letzten bekannten Wert füllen
  let last = 1;
  for (let i = 0; i < out.length; i++) { if (out[i] < 0) out[i] = last; else last = out[i]; }
  // Abschnitte unter 40 Punkten (80 m) dem Vorgänger zuschlagen
  let a = 0;
  for (let i = 1; i <= out.length; i++) {
    if (i === out.length || out[i] !== out[a]) { if (i - a < 40 && a > 0) for (let j = a; j < i; j++) out[j] = out[a - 1]; a = i; }
  }
  return out;
}

async function main() {
  const lats = P.map(p => lat0 + p[1] / KY), lons = P.map(p => lon0 + p[0] / KX);
  const bb = [Math.min(...lats) - 0.001, Math.min(...lons) - 0.0015, Math.max(...lats) + 0.001, Math.max(...lons) + 0.0015].join(',');
  const q = `[out:json][timeout:60];way["highway"](${bb});out tags geom;`;
  if (WANT_QUERY) { console.log('\nIn https://overpass-turbo.eu einfügen → „Ausführen“ → Export → „Rohdaten direkt aus Overpass API“ (JSON) speichern, dann:\n  npm run surfaces -- --datei=PFAD/export.json\n\n' + q + '\n'); return; }
  console.log('Frage OpenStreetMap ab …');
  const off = await elementsOrNull();
  const data = off ? { elements: off } : await overpass(q, 3, 30);
  const out = assign(data.elements);
  fs.writeFileSync(OUT, JSON.stringify(out));
  const cnt = [0, 1, 2].map(k => out.filter(v => v === k).length * 2);
  console.log(`Fertig: ${data.elements.length} Wege gelesen. Asphalt ${cnt[0]} m, Schotter ${cnt[1]} m, Trail ${cnt[2]} m → src/routes/mittwochsrunde.surf.json`);
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main().catch(e => { console.error(e.message); process.exit(1); });
