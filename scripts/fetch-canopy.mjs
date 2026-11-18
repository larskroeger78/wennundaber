// Echte Baeume aus dem Laserscan: DOM1 (Oberflaeche) minus DGM1 (Gelaende) = Kronenhoehe, 1 m Raster (Geobasis NRW, dl-de/zero-2.0).
// Jeder lokale Hoehenpunkt wird ein Baum (Ort, Hoehe, Kronenradius). Gebaeude werden ausgeschlossen.
// Schreibt src/routes/<name>.canopy.json.  Aufruf: npm run canopy -- miworu   (Node 18+, Internet noetig)
import fs from 'node:fs';
import { fromArrayBuffer } from 'geotiff';
import { toUTM, fromUTM } from './fetch-lod2.mjs';

const NAME = process.argv.slice(2).find(a => !a.startsWith('--')) || 'miworu';
const rd = (f, opt) => { try { return JSON.parse(fs.readFileSync(new URL(`../src/routes/${f}`, import.meta.url), 'utf8')); } catch (e) { if (opt) return null; throw e; } };
const ROUTE = rd(`${NAME}.json`), GEL = rd(`${NAME}.gelaende.json`), OSM = rd(`${NAME}.umgebung.json`, 1), L2 = rd(`${NAME}.lod2.json`, 1);
const OUT = new URL(`../src/routes/${NAME}.canopy.json`, import.meta.url);
const [LAT0, LON0] = ROUTE.origin, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
// bei Netzfehlern und 5xx bis zu 8 Mal wiederholen (der NRW-Server bricht Verbindungen gelegentlich ab)
const get = async url => {
  let last;
  for (let t = 0; t < 8; t++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'miworu-canopy/1.0' } }); if (r.ok) return r; const txt = (await r.text()).slice(0, 600); last = new Error(`${r.status} bei ${url}\n${txt}`); if (r.status < 500 && r.status !== 429) throw last; }
    catch (e) { last = e; if (e.message && /^[34]\d\d bei /.test(e.message) && !/^429/.test(e.message)) throw e; }
    await new Promise(r => setTimeout(r, 1500 * (t + 1)));
  }
  throw last;
};

// Gebiet in UTM
const gx0 = GEL.x0, gx1 = GEL.x0 + GEL.nx * GEL.cell, gz0 = GEL.z0, gz1 = GEL.z0 + GEL.nz * GEL.cell;
const cs = [[gx0, gz0], [gx1, gz0], [gx0, gz1], [gx1, gz1]].map(([x, z]) => toUTM(LAT0 - z / KY, LON0 + x / KX));
const E0 = Math.floor(Math.min(...cs.map(c => c[0]))), E1 = Math.ceil(Math.max(...cs.map(c => c[0])));
const N0 = Math.floor(Math.min(...cs.map(c => c[1]))), N1 = Math.ceil(Math.max(...cs.map(c => c[1])));
const W = E1 - E0, H = N1 - N0;
console.log(`Gebiet ${NAME}: ${W} x ${H} m`);

async function loadCov(WCS, re, label) {
  const caps = await (await get(`${WCS}?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1`)).text();
  const ids = [...caps.matchAll(/<wcs:CoverageId>([^<]+)<\/wcs:CoverageId>/g)].map(m => m[1]);
  console.log(`${label}: Coverages laut Dienst: ${ids.join(', ') || '(keine)'}`);
  const id = ids.find(s => re.test(s)) || ids[0]; if (!id) throw new Error('Keine Coverage fuer ' + label);
  const formats = [...caps.matchAll(/<wcs:formatSupported>([^<]+)<\/wcs:formatSupported>/g)].map(m => m[1]);
  const desc = await (await get(`${WCS}?SERVICE=WCS&REQUEST=DescribeCoverage&VERSION=2.0.1&COVERAGEID=${id}`)).text();
  const [ax, ay] = ((desc.match(/axisLabels="([^"]+)"/) || [])[1] || 'x y').split(/\s+/);
  const fmt = formats.find(f => /tif/i.test(f)) || 'image/tiff';
  const variants = [
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/25832&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSETTINGCRS=EPSG:25832&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=1.0.0&COVERAGE=${id}&CRS=EPSG:25832&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${Math.round(e1 - e0)}&HEIGHT=${Math.round(n1 - n0)}&FORMAT=GeoTIFF`,
  ];
  let vi = 0;
  const grid = new Float32Array(W * H).fill(NaN), T = 500;
  const cols = Math.ceil(W / T), rows = Math.ceil(H / T); let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const e0 = E0 + c * T, e1 = Math.min(E1, e0 + T), n0 = N0 + r * T, n1 = Math.min(N1, n0 + T);
    let img = null; const errs = [];
    for (let v = vi; v < variants.length && !img; v++) {
      try { img = await (await fromArrayBuffer(await (await get(variants[v](e0, e1, n0, n1))).arrayBuffer())).getImage(); vi = v; } catch (e) { errs.push(`Variante ${v + 1}: ${e.message}`); }
    }
    if (!img) throw new Error(label + ': keine Anfrage-Variante hat funktioniert:\n' + errs.join('\n---\n'));
    const [bx0, by0, bx1, by1] = img.getBoundingBox(), w = img.getWidth(), h = img.getHeight(), px = (bx1 - bx0) / w, py = (by1 - by0) / h, d = (await img.readRasters())[0];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const E = bx0 + (i + 0.5) * px, N = by1 - (j + 0.5) * py, gc = Math.floor(E - E0), gr = Math.floor(N - N0);
      if (gc >= 0 && gc < W && gr >= 0 && gr < H) { const v = d[j * w + i]; if (v > -100 && v < 1500) grid[gr * W + gc] = v; }
    }
    process.stdout.write(`\r  ${label} Kachel ${++k}/${cols * rows} (Variante ${vi + 1}, ${px} m/Pixel)   `);
  }
  console.log(); return grid;
}

const dgm = await loadCov('https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', /dgm/i, 'DGM');
const dom = await loadCov('https://www.wcs.nrw.de/geobasis/wcs_nw_dom', /dom/i, 'DOM');

// Kronenhoehe (Zeile 0 = Sued)
const hc = new Float32Array(W * H);
let valid = 0; for (let i = 0; i < hc.length; i++) { const v = dom[i] - dgm[i]; if (Number.isFinite(v)) { hc[i] = Math.max(0, Math.min(45, v)); valid++; } }
console.log(`Gueltige Zellen: ${(100 * valid / hc.length).toFixed(1)} %`);
if (valid < hc.length * 0.5) { console.log('Zu wenig Daten – Abbruch.'); process.exit(1); }
const S = new Float32Array(W * H);
for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) { let s = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += hc[(r + j) * W + c + i]; S[r * W + c] = s / 9; }

// Gebaeude-Grundrisse (Spielkoordinaten) zum Ausschliessen
const polys = [];
if (OSM) OSM.buildings.forEach(b => { const p = []; for (let i = 0; i < b.p.length; i += 2) p.push([b.p[i], b.p[i + 1]]); if (p.length >= 3) polys.push(p); });
if (L2) L2.b.forEach(poly => poly.forEach(f => { if (f[0] === 'g') { const p = [], q = f[1]; for (let i = 0; i < q.length; i += 3) p.push([q[i], q[i + 2]]); if (p.length >= 3) polys.push(p); } }));
polys.forEach(p => { p.bb = [Math.min(...p.map(a => a[0])) - 3, Math.max(...p.map(a => a[0])) + 3, Math.min(...p.map(a => a[1])) - 3, Math.max(...p.map(a => a[1])) + 3]; });
const inB = (x, z) => polys.some(p => {
  if (x < p.bb[0] || x > p.bb[1] || z < p.bb[2] || z > p.bb[3]) return false;
  let ins = false, md = 1e9;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
    const dx = xj - xi, dz = zj - zi, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / l2));
    md = Math.min(md, Math.hypot(x - xi - t * dx, z - zi - t * dz));
  }
  return ins || md < 2.5;
});

// Nahinfrarot-Luftbild (WMS, Rot-Kanal = NIR) fuer die Baumart: Laub reflektiert deutlich mehr NIR als Nadeln
let NIR = null;
try {
  const { default: jpeg } = await import('jpeg-js');
  const WMS = 'https://www.wms.nrw.de/geobasis/wms_nw_dop';
  const cap = await (await get(`${WMS}?REQUEST=GetCapabilities&SERVICE=WMS&VERSION=1.3.0`)).text();
  const names = [...cap.matchAll(/<Layer[^>]*>\s*<Name>([^<]+)<\/Name>/g)].map(m => m[1]);
  const lay = names.find(n => /nir/i.test(n) && !/cir/i.test(n)) || names.find(n => /cir/i.test(n));
  if (!lay) throw new Error('keine NIR/CIR-Ebene im Dienst (' + names.join(', ') + ')');
  console.log('NIR-Ebene:', lay);
  NIR = new Uint8Array(W * H);
  const T = 1000; let k = 0;
  for (let n1 = N1; n1 > N0; n1 -= T) for (let e0 = E0; e0 < E1; e0 += T) {
    const e1 = Math.min(E1, e0 + T), n0 = Math.max(N0, n1 - T), w = e1 - e0, h = n1 - n0;
    const r = await get(`${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${encodeURIComponent(lay)}&STYLES=&CRS=EPSG:25832&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/jpeg`);
    const img = jpeg.decode(Buffer.from(await r.arrayBuffer()), { useTArray: true });
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const gc = e0 - E0 + i, gr = (n1 - N0) - 1 - j;
      if (gc >= 0 && gc < W && gr >= 0 && gr < H) NIR[gr * W + gc] = img.data[(j * img.width + i) * 4];
    }
    process.stdout.write(`\r  NIR Kachel ${++k}   `);
  }
  console.log();
} catch (e) { console.log('NIR nicht verfuegbar (' + e.message + ') – Baumart nur aus der Kronenform.'); NIR = null; }

// Baumspitzen = lokale Maxima
const out = []; let nB = 0;
for (let r = 3; r < H - 3; r++) for (let c = 3; c < W - 3; c++) {
  const v = S[r * W + c]; if (v < 3.2) continue;
  let top = true;
  for (let j = -2; j <= 2 && top; j++) for (let i = -2; i <= 2; i++) { if (!i && !j) continue; const o = S[(r + j) * W + c + i]; if (o > v || (o === v && (j < 0 || (j === 0 && i < 0)))) { top = false; break; } }
  if (!top) continue;
  const h = hc[r * W + c] * 0.6 + v * 0.4;
  let rad = 1.2;
  for (let q = 1; q <= 6; q++) {
    let s = 0; for (let a = 0; a < 8; a++) { const cc = Math.round(c + q * Math.cos(a * Math.PI / 4)), rr = Math.round(r + q * Math.sin(a * Math.PI / 4)); s += (cc >= 0 && cc < W && rr >= 0 && rr < H) ? hc[rr * W + cc] : 0; }
    if (s / 8 < 0.45 * h) { rad = Math.max(1.2, q - 0.4); break; } rad = q;
  }
  const [lat, lon] = fromUTM(E0 + c + 0.5, N0 + r + 0.5), x = (lon - LON0) * KX, z = -(lat - LAT0) * KY;
  if (x < gx0 || x > gx1 || z < gz0 || z > gz1) continue;
  if (inB(x, z)) { nB++; continue; }
  let nv = 0;
  if (NIR) { let sum = 0, cn = 0; const rr = Math.max(1, Math.floor(rad * 0.6)); for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) { if (i * i + j * j > rr * rr) continue; const cc = c + i, ro = r + j; if (cc >= 0 && cc < W && ro >= 0 && ro < H) { sum += NIR[ro * W + cc]; cn++; } } nv = cn ? Math.round(sum / cn) : 0; }
  out.push(Math.round(x * 10), Math.round(z * 10), Math.round(h * 10), Math.round(rad * 10), nv);
}
const STR = 5, n = out.length / STR;
console.log(`${n} Baeume erkannt (${nB} an Gebaeuden verworfen)`);
if (!n) process.exit(1);
fs.writeFileSync(OUT, JSON.stringify({ name: NAME, origin: ROUTE.origin, n, k: STR, nir: !!NIR, t: Buffer.from(new Int16Array(out).buffer).toString('base64') }));
console.log(`Fertig → src/routes/${NAME}.canopy.json (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
