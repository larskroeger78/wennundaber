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
  if (!r.ok) throw new Error(`${r.status} bei ${url}\n${(await r.text()).slice(0, 1500)}`);
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
  eMin = Math.floor(eMin / 10) * 10 - 10; eMax = Math.ceil(eMax / 10) * 10 + 10; nMin = Math.floor(nMin / 10) * 10 - 10; nMax = Math.ceil(nMax / 10) * 10 + 10;

  console.log('Suche Höhenmodell beim Land NRW …');
  const caps = await (await get(`${WCS}?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1`)).text();
  const ids = [...caps.matchAll(/<wcs:CoverageId>([^<]+)<\/wcs:CoverageId>/g)].map(m => m[1]);
  const id = ids.find(s => /dgm/i.test(s)) || ids[0];
  if (!id) throw new Error('Keine Coverage im Dienst gefunden.');
  const formats = [...caps.matchAll(/<wcs:formatSupported>([^<]+)<\/wcs:formatSupported>/g)].map(m => m[1]);
  console.log('Coverage', id, '· Formate:', formats.join(', ') || '(keine Angabe)');
  const desc = await (await get(`${WCS}?SERVICE=WCS&REQUEST=DescribeCoverage&VERSION=2.0.1&COVERAGEID=${id}`)).text();
  const labels = (desc.match(/axisLabels="([^"]+)"/) || [])[1] || 'x y';
  const [ax, ay] = labels.split(/\s+/);
  console.log('Achsen:', ax, ay, '· Auszug:', desc.replace(/\s+/g, ' ').slice(0, 400));

  const fmt = formats.find(f => /tif/i.test(f)) || 'image/tiff';
  const variants = [
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/25832&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${id}&FORMAT=${fmt}&SUBSETTINGCRS=EPSG:25832&SUBSET=${ax}(${e0},${e1})&SUBSET=${ay}(${n0},${n1})`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=1.0.0&COVERAGE=${id}&CRS=EPSG:25832&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${Math.round(e1 - e0)}&HEIGHT=${Math.round(n1 - n0)}&FORMAT=GeoTIFF`,
  ];
  // Kacheln à 500 m (der Dienst begrenzt die Größe einer Anfrage)
  const T = 500, tiles = [];
  const tryTile = async (e0, e1, n0, n1) => {
    const errs = [];
    for (let v = (tryTile.v || 0); v < variants.length; v++) {
      try {
        const buf = await (await get(variants[v](e0, e1, n0, n1))).arrayBuffer();
        const img = await (await fromArrayBuffer(buf)).getImage();
        tryTile.v = v; return img;
      } catch (e) { errs.push(`Variante ${v + 1}: ${e.message}`); }
    }
    throw new Error('Keine Anfrage-Variante hat funktioniert:\n' + errs.join('\n---\n'));
  };
  const cols = Math.ceil((eMax - eMin) / T), rows = Math.ceil((nMax - nMin) / T);
  console.log(`Lade ${cols * rows} Kacheln …`);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const e0 = eMin + c * T, n0 = nMin + r * T;
    const img = await tryTile(e0 - 4, Math.min(eMax, e0 + T) + 4, n0 - 4, Math.min(nMax, n0 + T) + 4);
    const [bx0, by0, bx1, by1] = img.getBoundingBox(), w = img.getWidth(), h = img.getHeight();
    tiles.push({ c, r, bx0, by1, w, h, px: (bx1 - bx0) / w, py: (by1 - by0) / h, data: (await img.readRasters())[0] });
    process.stdout.write(`\r  Kachel ${tiles.length}/${cols * rows}  (Variante ${tryTile.v + 1})`);
  }
  console.log('\nDGM erhalten.');
  const at = (E, N) => {
    const c = Math.max(0, Math.min(cols - 1, Math.floor((E - eMin) / T))), r = Math.max(0, Math.min(rows - 1, Math.floor((N - nMin) / T)));
    const t = tiles[r * cols + c];
    const u = (E - t.bx0) / t.px - 0.5, v = (t.by1 - N) / t.py - 0.5, i = Math.floor(u), j = Math.floor(v);
    const g = (ii, jj) => t.data[Math.max(0, Math.min(t.h - 1, jj)) * t.w + Math.max(0, Math.min(t.w - 1, ii))];
    const fu = u - i, fv = v - j;
    return (g(i, j) * (1 - fu) + g(i + 1, j) * fu) * (1 - fv) + (g(i, j + 1) * (1 - fu) + g(i + 1, j + 1) * fu) * fv;
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
