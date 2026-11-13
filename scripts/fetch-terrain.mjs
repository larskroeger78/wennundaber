// Lädt das echte Geländemodell (DGM1, 1 m, Geobasis NRW, Datenlizenz Deutschland Zero) für die Halde
// und schreibt ein Höhenraster nach src/routes/gelaende.json.
// Aufruf: npm install && npm run terrain   (Node 18+, Internet nötig)
import fs from 'node:fs';
import { fromArrayBuffer } from 'geotiff';

const MITT = JSON.parse(fs.readFileSync(new URL('../src/routes/mittwochsrunde.json', import.meta.url), 'utf8'));
const OUT = new URL('../src/routes/gelaende.json', import.meta.url);
const WCS = 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm';
const [LAT0, LON0] = MITT.origin;
const CELL = 4;                         // Rastergröße im Spiel in Metern
const NHN0 = 55.8;                      // gleicher Höhen-Nullpunkt wie im Spiel
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;

// WGS84/ETRS89 → UTM Zone 32 (EPSG:25832)
function utm32(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, n = f / (2 - f), k0 = 0.9996;
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
  const p = lat * Math.PI / 180, dl = (lon - 9) * Math.PI / 180;
  const c = 2 * Math.sqrt(n) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(p)) - c * Math.atanh(c * Math.sin(p)));
  const xi = Math.atan(t / Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 3; j++) { E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [500000 + k0 * A * E, k0 * A * N];
}
const toLL = (x, z) => [LAT0 - z / KY, LON0 + x / KX];       // Spiel (x Ost, z = -Nord) → lat/lon

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} bei ${url.slice(0, 120)}\n${(await r.text()).slice(0, 300)}`);
  return r;
}

async function main() {
  // Ausdehnung: Strecke plus 350 m Rand
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of MITT.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, -p[1]); z1 = Math.max(z1, -p[1]); }
  const M = 350; x0 = Math.floor((x0 - M) / CELL) * CELL; x1 = Math.ceil((x1 + M) / CELL) * CELL; z0 = Math.floor((z0 - M) / CELL) * CELL; z1 = Math.ceil((z1 + M) / CELL) * CELL;
  const nx = (x1 - x0) / CELL + 1, nz = (z1 - z0) / CELL + 1;
  let eMin = 1e12, eMax = -1e12, nMin = 1e12, nMax = -1e12;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { const [E, N] = utm32(...toLL(x, z)); eMin = Math.min(eMin, E); eMax = Math.max(eMax, E); nMin = Math.min(nMin, N); nMax = Math.max(nMax, N); }
  eMin = Math.floor(eMin) - 5; eMax = Math.ceil(eMax) + 5; nMin = Math.floor(nMin) - 5; nMax = Math.ceil(nMax) + 5;

  console.log('Suche Höhenmodell beim Land NRW …');
  const caps = await (await get(`${WCS}?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1`)).text();
  const ids = [...caps.matchAll(/<wcs:CoverageId>([^<]+)<\/wcs:CoverageId>/g)].map(m => m[1]);
  console.log('Gefundene Coverages:', ids.join(', ') || '(keine)');
  const id = ids.find(s => /dgm/i.test(s)) || ids[0];
  if (!id) throw new Error('Keine Coverage im Dienst gefunden – bitte die Ausgabe an Claude schicken.');
  const desc = await (await get(`${WCS}?SERVICE=WCS&REQUEST=DescribeCoverage&VERSION=2.0.1&COVERAGEID=${id}`)).text();
  const labels = (desc.match(/axisLabels="([^"]+)"/) || [])[1] || 'x y';
  const [ax, ay] = labels.split(/\s+/);
  console.log(`Coverage ${id}, Achsen ${ax}/${ay}. Lade ${eMax - eMin} x ${nMax - nMin} m …`);
  const url = `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=image/tiff` +
    `&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/25832&SUBSET=${ax}(${eMin},${eMax})&SUBSET=${ay}(${nMin},${nMax})`;
  const buf = await (await get(url)).arrayBuffer();
  const tiff = await fromArrayBuffer(buf), img = await tiff.getImage();
  const [bx0, by0, bx1, by1] = img.getBoundingBox(), w = img.getWidth(), h = img.getHeight();
  const px = (bx1 - bx0) / w, py = (by1 - by0) / h;
  const data = (await img.readRasters())[0];
  console.log(`DGM erhalten: ${w} x ${h} Pixel (${px.toFixed(2)} m)`);
  const at = (E, N) => {                    // bilinear
    const u = (E - bx0) / px - 0.5, v = (by1 - N) / py - 0.5, i = Math.floor(u), j = Math.floor(v);
    const c = (ii, jj) => data[Math.max(0, Math.min(h - 1, jj)) * w + Math.max(0, Math.min(w - 1, ii))];
    const fu = u - i, fv = v - j;
    return (c(i, j) * (1 - fu) + c(i + 1, j) * fu) * (1 - fv) + (c(i, j + 1) * (1 - fu) + c(i + 1, j + 1) * fu) * fv;
  };
  const q = new Int16Array(nx * nz);        // Dezimeter über Spiel-Nullpunkt
  let mn = 1e9, mx = -1e9;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const [E, N] = utm32(...toLL(x0 + ix * CELL, z0 + iz * CELL));
    let e = at(E, N); if (!(e > -100 && e < 1000)) e = NHN0;
    mn = Math.min(mn, e); mx = Math.max(mx, e);
    q[iz * nx + ix] = Math.round((e - NHN0) * 10);
  }
  fs.writeFileSync(OUT, JSON.stringify({ origin: MITT.origin, cell: CELL, x0, z0, nx, nz, nhn0: NHN0, dm: Buffer.from(q.buffer).toString('base64') }));
  console.log(`Fertig: Höhen ${mn.toFixed(1)} bis ${mx.toFixed(1)} m ü. NHN → src/routes/gelaende.json (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
}
main().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
