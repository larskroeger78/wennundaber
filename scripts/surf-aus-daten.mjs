// Naeherung der Wegoberflaeche ohne Overpass: <name>.surf.json aus (1) Nachbarstrecke im selben Kartengebiet (naechster Punkt <= 8 m)
// und (2) den ALKIS-Strassenflaechen (<dem>.strassen.json = Asphalt), sonst Trail (2). Genauer wird es mit: npm run surfaces -- <name>
// Aufruf: node scripts/surf-aus-daten.mjs iserlohn2 iserlohn
import fs from 'node:fs';
const [, , name, dem, test] = process.argv;
const J = n => JSON.parse(fs.readFileSync(new URL(`../src/routes/${n}.json`, import.meta.url), 'utf8'));
const R = J(name), SOLO = dem === '-', N = SOLO ? { pts: [] } : J(dem), NS = SOLO ? [] : J(dem + '.surf'), ST = SOLO ? { polys: [] } : J(dem + '.strassen');   // dem '-' = keine Nachbarstrecke
const flip = process.env.FLIP === '1';
const cell = 10, grid = new Map(), key = (i, j) => i * 100003 + j;
N.pts.forEach((p, k) => { const kk = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell)); (grid.get(kk) || grid.set(kk, []).get(kk)).push(k); });
const near = (x, z) => { let b = 1e9, bk = -1; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const k of grid.get(key(Math.floor(x / cell) + i, Math.floor(z / cell) + j)) || []) { const d = Math.hypot(N.pts[k][0] - x, N.pts[k][1] - z); if (d < b) { b = d; bk = k; } } return [b, bk]; };
const inPoly = (x, z, q) => { let c = false; for (let i = 0, j = q.length / 2 - 1; i < q.length / 2; j = i++) { const xi = q[i * 2], zi = q[i * 2 + 1], xj = q[j * 2], zj = q[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const bb = ST.polys.map(q => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let i = 0; i < q.length; i += 2) { a = Math.min(a, q[i]); b = Math.max(b, q[i]); c = Math.min(c, q[i + 1]); d = Math.max(d, q[i + 1]); } return [a, b, c, d]; });
const asph = (x, z) => { for (let i = 0; i < ST.polys.length; i++) { const b = bb[i]; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue; if (inPoly(x, z, ST.polys[i])) return true; } return false; };
const src = test ? N : R;
// Heuristik fuer Stellen ohne Nachbarstrecke: kurvig (Richtungswechsel auf 30 m) oder steil = Trail, sonst Schotterweg
const heur = (P, i) => { const a = Math.max(0, i - 8), b = Math.min(P.length - 1, i + 8); let t = 0, h0 = null; for (let k = a + 1; k <= b; k++) { const h = Math.atan2(P[k][1] - P[k - 1][1], P[k][0] - P[k - 1][0]); if (h0 !== null) { let d = Math.abs(h - h0); if (d > Math.PI) d = 2 * Math.PI - d; t += d; } h0 = h; } const gr = Math.abs(P[b][2] - P[a][2]) / (Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1]) || 1); return (t > TH || gr > 0.12) ? 2 : 1; };
const TH = +(process.env.TH || 1.4);
const out = src.pts.map((p, i) => {
  const z = flip ? -p[1] : p[1];
  if (!test) { const [d, k] = near(p[0], p[1]); if (d <= 8) return NS[k] ?? 2; }
  return asph(p[0], z) ? 0 : heur(src.pts, i);
});
if (test) { let ok = 0; out.forEach((v, i) => { if (v === NS[i]) ok++; }); console.log('Test (nur Strassenflaechen) gegen echte Daten:', (100 * ok / out.length).toFixed(1) + ' % gleich', flip ? '(z gespiegelt)' : ''); }
else { fs.writeFileSync(new URL(`../src/routes/${name}.surf.json`, import.meta.url), JSON.stringify(out)); const c = [0, 0, 0]; out.forEach(v => c[v]++); console.log(name, 'Asphalt', c[0], 'Schotter', c[1], 'Trail', c[2], 'von', out.length); }
if (test) { const m = {}; out.forEach((v, i) => { const k = NS[i] + '->' + v; m[k] = (m[k] || 0) + 1; }); console.log(JSON.stringify(m)); }
