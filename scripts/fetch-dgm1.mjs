// Feines Gelaende (DGM1, 1 m, Geobasis NRW, dl-de/zero-2.0) in Streckennaehe (60 m beidseits).
// Schreibt src/routes/<name>.dgm1.json: Abweichung des 1-m-Modells vom groben 4-m-Raster in 2-m-Zellen (Wurzelkanten, Rinnen, Boeschungen).
// Aufruf: npm run dgm1 -- miworu   (Node 18+, Internet noetig)
import fs from 'node:fs';
import { fromArrayBuffer } from 'geotiff';
import { toUTM } from './fetch-lod2.mjs';

const NAME = process.argv.slice(2).find(a => !a.startsWith('--')) || 'miworu';
const rd = f => JSON.parse(fs.readFileSync(new URL(`../src/routes/${f}`, import.meta.url), 'utf8'));
const ROUTE = rd(`${NAME}.json`), GEL = rd(`${NAME}.gelaende.json`);
const OUT = new URL(`../src/routes/${NAME}.dgm1.json`, import.meta.url);
const [LAT0, LON0] = ROUTE.origin, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
const WCS = 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', CELL = 2, BAND = 60;
// bei Netzfehlern und 5xx bis zu 8 Mal wiederholen (der NRW-Server bricht Verbindungen gelegentlich ab)
const get = async url => {
  let last;
  for (let t = 0; t < 8; t++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'miworu-dgm1/1.0' } }); if (r.ok) return r; const txt = (await r.text()).slice(0, 600); last = new Error(`${r.status} bei ${url}\n${txt}`); if (r.status < 500 && r.status !== 429) throw last; }
    catch (e) { last = e; if (e.message && /^[34]\d\d bei /.test(e.message) && !/^429/.test(e.message)) throw e; }
    await new Promise(r => setTimeout(r, 1500 * (t + 1)));
  }
  throw last;
};
const toUtm = (x, z) => toUTM(LAT0 - z / KY, LON0 + x / KX);

// Grobes Raster (wie im Spiel)
const dm = new Int16Array(Uint8Array.from(Buffer.from(GEL.dm, 'base64')).buffer);
const coarse = (x, z) => {
  const u = Math.max(0, Math.min(GEL.nx - 1.001, (x - GEL.x0) / GEL.cell)), v = Math.max(0, Math.min(GEL.nz - 1.001, (z - GEL.z0) / GEL.cell));
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, o = j * GEL.nx + i;
  return ((dm[o] * (1 - fu) + dm[o + 1] * fu) * (1 - fv) + (dm[o + GEL.nx] * (1 - fu) + dm[o + GEL.nx + 1] * fu) * fv) / 10 + GEL.nhn0;
};

// Zellen in Streckennaehe markieren
const W2 = Math.floor((GEL.nx - 1) * GEL.cell / CELL) + 1, H2 = Math.floor((GEL.nz - 1) * GEL.cell / CELL) + 1;
const wgt = new Float32Array(W2 * H2);
const P = ROUTE.pts.map(p => [p[0], -p[1]]);
const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let k = 0; k + 1 < P.length; k++) {
  const [ax, az] = P[k], [bx, bz] = P[k + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - BAND - GEL.x0) / CELL)), i1 = Math.min(W2 - 1, Math.ceil((Math.max(ax, bx) + BAND - GEL.x0) / CELL));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - BAND - GEL.z0) / CELL)), j1 = Math.min(H2 - 1, Math.ceil((Math.max(az, bz) + BAND - GEL.z0) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = GEL.x0 + i * CELL, z = GEL.z0 + j * CELL, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - t * dx, z - az - t * dz);
    const w = 1 - sst(BAND * 0.6, BAND, d); if (w > wgt[j * W2 + i]) wgt[j * W2 + i] = w;
  }
}
let used = 0; for (const w of wgt) if (w > 0) used++;
console.log(`Zellen in Streckennaehe: ${used} von ${W2 * H2}`);

// DGM1 laden (500-m-Kacheln, wie fetch-terrain)
const cs = [[GEL.x0, GEL.z0], [GEL.x0 + (GEL.nx - 1) * GEL.cell, GEL.z0], [GEL.x0, GEL.z0 + (GEL.nz - 1) * GEL.cell], [GEL.x0 + (GEL.nx - 1) * GEL.cell, GEL.z0 + (GEL.nz - 1) * GEL.cell]].map(([x, z]) => toUtm(x, z));
const E0 = Math.floor(Math.min(...cs.map(c => c[0]))) - 10, E1 = Math.ceil(Math.max(...cs.map(c => c[0]))) + 10, N0 = Math.floor(Math.min(...cs.map(c => c[1]))) - 10, N1 = Math.ceil(Math.max(...cs.map(c => c[1]))) + 10;
const W = E1 - E0, H = N1 - N0;
const caps = await (await get(`${WCS}?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1`)).text();
const id = [...caps.matchAll(/<wcs:CoverageId>([^<]+)<\/wcs:CoverageId>/g)].map(m => m[1]).find(s => /dgm/i.test(s));
const formats = [...caps.matchAll(/<wcs:formatSupported>([^<]+)<\/wcs:formatSupported>/g)].map(m => m[1]), fmt = formats.find(f => /tif/i.test(f)) || 'image/tiff';
const desc = await (await get(`${WCS}?SERVICE=WCS&REQUEST=DescribeCoverage&VERSION=2.0.1&COVERAGEID=${id}`)).text();
const [ax, ay] = ((desc.match(/axisLabels="([^"]+)"/) || [])[1] || 'x y').split(/\s+/);
const variants = [
  (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
  (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/25832&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
  (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSETTINGCRS=EPSG:25832&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
  (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=1.0.0&COVERAGE=${id}&CRS=EPSG:25832&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${Math.round(e1 - e0)}&HEIGHT=${Math.round(n1 - n0)}&FORMAT=GeoTIFF`,
];
const dgm = new Float32Array(W * H).fill(NaN); let vi = 0, k = 0;
const T = 500, cols = Math.ceil(W / T), rows = Math.ceil(H / T);
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const e0 = E0 + c * T, e1 = Math.min(E1, e0 + T), n0 = N0 + r * T, n1 = Math.min(N1, n0 + T);
  let img = null; const errs = [];
  for (let v = vi; v < variants.length && !img; v++) { try { img = await (await fromArrayBuffer(await (await get(variants[v](e0, e1, n0, n1))).arrayBuffer())).getImage(); vi = v; } catch (e) { errs.push(`Variante ${v + 1}: ${e.message}`); } }
  if (!img) throw new Error('Keine Anfrage-Variante hat funktioniert:\n' + errs.join('\n---\n'));
  const [bx0, by0, bx1, by1] = img.getBoundingBox(), w = img.getWidth(), h = img.getHeight(), px = (bx1 - bx0) / w, py = (by1 - by0) / h, d = (await img.readRasters())[0];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const E = bx0 + (i + 0.5) * px, N = by1 - (j + 0.5) * py, gc = Math.floor(E - E0), gr = Math.floor(N - N0);
    if (gc >= 0 && gc < W && gr >= 0 && gr < H) { const v = d[j * w + i]; if (v > -100 && v < 1500) dgm[gr * W + gc] = v; }
  }
  process.stdout.write(`\r  DGM Kachel ${++k}/${cols * rows}   `);
}
console.log();
const at = (E, N) => { const c = E - E0 - 0.5, r = N - N0 - 0.5, i = Math.floor(c), j = Math.floor(r), fu = c - i, fv = r - j, g = (a, b) => { const v = dgm[Math.max(0, Math.min(H - 1, b)) * W + Math.max(0, Math.min(W - 1, a))]; return v; };
  const v = (g(i, j) * (1 - fu) + g(i + 1, j) * fu) * (1 - fv) + (g(i, j + 1) * (1 - fu) + g(i + 1, j + 1) * fu) * fv; return v; };

const res = new Int8Array(W2 * H2); let mx = 0, nz = 0;
for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
  const w = wgt[j * W2 + i]; if (w <= 0) continue;
  const x = GEL.x0 + i * CELL, z = GEL.z0 + j * CELL, [E, N] = toUtm(x, z), f = at(E, N);
  if (!Number.isFinite(f)) continue;
  const r = (f - coarse(x, z)) * w; mx = Math.max(mx, Math.abs(r));
  const q = Math.max(-127, Math.min(127, Math.round(r / 0.02))); res[j * W2 + i] = q; if (q) nz++;
}
console.log(`Abweichungen: groesste ${mx.toFixed(2)} m, ${nz} Zellen mit Wert`);
fs.writeFileSync(OUT, JSON.stringify({ name: NAME, cell: CELL, x0: GEL.x0, z0: GEL.z0, w: W2, h: H2, q: 0.02, d: Buffer.from(res.buffer).toString('base64') }));
console.log(`Fertig → src/routes/${NAME}.dgm1.json (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
