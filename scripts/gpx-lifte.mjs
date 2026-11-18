// Erkennt Liftfahrten in einer GPX-Datei (schnell + stetig bergauf) und schreibt src/routes/<name>.lifte.json
// mit Index-Bereichen im 2-m-Raster der Spielstrecke (<name>.json). Aufruf: node scripts/gpx-lifte.mjs datei.gpx alpen
import fs from 'node:fs';
const [, , gpx, name] = process.argv;
if (!gpx || !name) { console.log('Aufruf: node scripts/gpx-lifte.mjs datei.gpx name'); process.exit(1); }
const t = fs.readFileSync(gpx, 'utf8');
const P = [...t.matchAll(/<trkpt lat="([\d.\-]+)" lon="([\d.\-]+)">\s*<ele>([\d.\-]+)<\/ele>(?:\s*<time>([^<]+)<\/time>)?/g)].map(m => ({ la: +m[1], lo: +m[2], e: +m[3], t: m[4] ? Date.parse(m[4]) / 1000 : null }));
const R = JSON.parse(fs.readFileSync(new URL(`../src/routes/${name}.json`, import.meta.url), 'utf8'));
const KX = 111320 * Math.cos(R.origin[0] * Math.PI / 180), KY = 111320;
// Rohpunkte wie in gpx-to-route (Dopplungen < 0.5 m entfernen), damit die Entfernung zum 2-m-Raster passt
const pts = [P[0]], cum = [0];
for (let i = 1; i < P.length; i++) { const a = pts.at(-1), d = Math.hypot((P[i].lo - a.lo) * KX, (P[i].la - a.la) * KY); if (d >= 0.5) { cum.push(cum.at(-1) + d); pts.push(P[i]); } }
const W = 15, flag = new Array(pts.length).fill(0);
for (let i = 0; i + W < pts.length; i++) {
  const d = cum[i + W] - cum[i], dz = pts[i + W].e - pts[i].e, dt = pts[i + W].t && pts[i].t ? pts[i + W].t - pts[i].t : 0;
  const v = dt > 0 ? d / dt : 0, g = dz / d;      // Gondel/Sessel schnell (>3,6 m/s) oder Schlepplift/Sessel langsam, aber so steil, dass man es nicht fahren kann
  if ((v > 3.6 && g > 0.12) || (v > 2.3 && g > 0.25)) for (let j = i; j <= i + W; j++) flag[j] = 1;
}
let runs = [], s = -1;
for (let i = 0; i <= pts.length; i++) { if (flag[i] && s < 0) s = i; if (!flag[i] && s >= 0) { runs.push([s, i - 1]); s = -1; } }
const m = [];                                                        // Lücken < 150 m verschmelzen
for (const r of runs) { const l = m.at(-1); if (l && cum[r[0]] - cum[l[1]] < 150) l[1] = r[1]; else m.push([...r]); }
const L = m.filter(r => cum[r[1]] - cum[r[0]] > 150).map(r => ({
  a: cum[r[0]] < 50 ? 0 : Math.floor(cum[r[0]] / 2), b: Math.ceil(cum[r[1]] / 2),           // Index im 2-m-Raster
  hm: Math.round(pts[r[1]].e - pts[r[0]].e), sek: Math.round(pts[r[1]].t - pts[r[0]].t), m: Math.round(cum[r[1]] - cum[r[0]]),
}));
fs.writeFileSync(new URL(`../src/routes/${name}.lifte.json`, import.meta.url), JSON.stringify(L));
console.log(`${L.length} Liftfahrten:`); L.forEach(l => console.log(`  Index ${l.a}–${l.b}: ${l.m} m, +${l.hm} Hm, ${Math.floor(l.sek / 60)}:${String(l.sek % 60).padStart(2, '0')} min`));
let dh = 0, tot = R.pts.length; const inL = i => L.some(l => i >= l.a && i <= l.b);
for (let i = 1; i < tot; i++) if (!inL(i) && R.pts[i][2] < R.pts[i - 1][2]) dh += R.pts[i - 1][2] - R.pts[i][2];
console.log(`Abfahrt ohne Lifte: ca. ${Math.round(dh)} Hm bergab, Gesamt ${((tot * 2) / 1000).toFixed(1)} km, davon Lift ${(L.reduce((s, l) => s + l.m, 0) / 1000).toFixed(1)} km`);
