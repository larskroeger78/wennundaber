// Tirol: Geländemodell (DGM, Land Tirol, CC BY 4.0 – "Datenquelle: Land Tirol - data.tirol.gv.at")
// per WCS "Gelände Tirol" -> src/routes/<name>.gelaende.json (gleiches Format wie fetch-terrain.mjs).
// Aufruf: npm run terrain-tirol -- alpen            (Node 18+, Internet nötig)
// Optionen: --wcs=<URL> --cov=<Name> --cell=8 --margin=1200 --pix=2 --crs=25832|3857 --fern=9000 (Rand Fernmodell) --ohne-fern --nur-fern --force
// Das Skript sucht den Dienst, die Ebene und das Koordinatensystem selbst, zeigt alles an und prüft am Ende
// das Ergebnis gegen die Höhen der GPX-Strecke (fängt falsche Ebenen/Koordinatensysteme ab).
import fs from 'node:fs';
import { fromArrayBuffer } from 'geotiff';

const args = process.argv.slice(2);
const NAME = args.find(a => !a.startsWith('--')) || 'alpen';
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const FORCE = args.includes('--force');
const ROUTE = JSON.parse(fs.readFileSync(new URL(`../src/routes/${NAME}.json`, import.meta.url), 'utf8'));
const [LAT0, LON0] = ROUTE.origin;
const NHN0 = ROUTE.nhn0 !== undefined ? ROUTE.nhn0 : 0;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
const UA = { 'User-Agent': 'miworu-terrain-tirol/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Koordinatensysteme -------------------------------------------------------------------------------------------
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
function merc(lat, lon) {
  const R = 6378137;
  return [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
}
const PROJ = { 25832: utm32, 3857: merc };
const toLL = (x, z) => [LAT0 - z / KY, LON0 + x / KX];     // Spiel (x Ost, z = -Nord) -> lat/lon

async function get(url, tries = 6) {
  let last;
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (r.ok) return r;
      const body = (await r.text()).slice(0, 600);
      last = new Error(`${r.status} bei ${url}\n${body}`);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) throw last;
    } catch (e) { last = e; if (/^4\d\d /.test(e.message)) throw e; }
    await sleep(1500 * (t + 1));
  }
  throw last;
}

// ---- Dienst finden ----------------------------------------------------------------------------------------------
const CANDIDATES = [
  opt('wcs', null),
  'https://gis.tirol.gv.at/arcgis/services/Service_Public/gelaende/MapServer/WCSServer',
  'https://gis.tirol.gv.at/arcgis/services/Service_Public/gelaende/ImageServer/WCSServer',
  'https://gis.tirol.gv.at/arcgis/services/Service_Public/terrain/MapServer/WCSServer',
].filter(Boolean);
let WCS = null, caps = '';
for (const u of CANDIDATES) {
  try {
    const t = await (await get(`${u}?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=1.0.0`, 2)).text();
    if (/CoverageOffering|<name>/i.test(t)) { WCS = u; caps = t; break; }
  } catch (e) { console.log('  nicht erreichbar:', u, '–', e.message.split('\n')[0]); }
}
if (!WCS) { console.error('\nKein WCS-Dienst gefunden. Öffne https://www.tirol.gv.at/sicherheit/geoinformation/geodaten-tiris/laserscandaten im Browser,\nkopiere dort den Link zum Dienst "Gelände Tirol" (WCS) und starte erneut mit --wcs=<Link ohne ?...>.'); process.exit(1); }
console.log('Dienst:', WCS);

// Coverages (WCS 1.0.0: <CoverageOfferingBrief><name>..</name><label>..</label>)
const covs = [...caps.matchAll(/<CoverageOfferingBrief>([\s\S]*?)<\/CoverageOfferingBrief>/g)].map(m => ({
  name: (m[1].match(/<name>([^<]*)<\/name>/) || [])[1], label: (m[1].match(/<label>([^<]*)<\/label>/) || [])[1] || '',
})).filter(c => c.name);
console.log('Coverages:\n' + covs.map(c => `  ${c.name}  ${c.label}`).join('\n'));
const crsList = [...new Set([...caps.matchAll(/EPSG:(\d{4,5})/g)].map(m => +m[1]))];
console.log('Koordinatensysteme laut Dienst:', crsList.join(', ') || '(keine Angabe)');
let cov = opt('cov', null);
if (!cov) {
  const dgm = covs.filter(c => /dgm|gel(ä|ae)nde|terrain|dtm|h(ö|oe)he/i.test(c.label + ' ' + c.name) && !/dom|oberfl|schumm|hill|slope|expo|neigung|surface/i.test(c.label + ' ' + c.name));
  const score = c => (/\b[12]\s?m\b/i.test(c.label) ? 3 : /50\s?cm|0[.,]5/i.test(c.label) ? 2 : 1);
  dgm.sort((a, b) => score(b) - score(a));
  cov = (dgm[0] || covs[0] || {}).name;
}
if (!cov) { console.error('Keine Coverage erkannt – mit --cov=<Name> angeben (Liste oben).'); process.exit(1); }
console.log('Verwende Coverage:', cov, '(mit --cov=<Name> änderbar)');
const crsWanted = +opt('crs', 0) || [25832, 3857].find(c => crsList.includes(c)) || 25832;
const proj = PROJ[crsWanted];
if (!proj) { console.error('CRS', crsWanted, 'nicht unterstützt (nur 25832, 3857).'); process.exit(1); }
console.log('Abruf in EPSG:' + crsWanted);


async function build(CELL, MARGIN, PIX, TM, OUT, COV = cov) {
  // ---- Gebiet ------------------------------------------------------------------------------------------------------
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of ROUTE.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, -p[1]); z1 = Math.max(z1, -p[1]); }
  x0 = Math.floor((x0 - MARGIN) / CELL) * CELL; x1 = Math.ceil((x1 + MARGIN) / CELL) * CELL; z0 = Math.floor((z0 - MARGIN) / CELL) * CELL; z1 = Math.ceil((z1 + MARGIN) / CELL) * CELL;
  const nx = (x1 - x0) / CELL + 1, nz = (z1 - z0) / CELL + 1;
  const o = proj(LAT0, LON0), k = Math.hypot(...[proj(LAT0, LON0 + 1 / KX)].map(p => [p[0] - o[0], p[1] - o[1]])[0]);   // Meter im CRS je Spiel-Meter
  let eMin = 1e12, eMax = -1e12, nMin = 1e12, nMax = -1e12;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { const [E, N] = proj(...toLL(x, z)); eMin = Math.min(eMin, E); eMax = Math.max(eMax, E); nMin = Math.min(nMin, N); nMax = Math.max(nMax, N); }
  eMin = Math.floor(eMin / 10) * 10 - 20; eMax = Math.ceil(eMax / 10) * 10 + 20; nMin = Math.floor(nMin / 10) * 10 - 20; nMax = Math.ceil(nMax / 10) * 10 + 20;
  console.log(`Gebiet: ${((x1 - x0) / 1000).toFixed(1)} x ${((z1 - z0) / 1000).toFixed(1)} km, Raster ${nx} x ${nz} (${(nx * nz / 1e6).toFixed(2)} Mio. Zellen à ${CELL} m)`);

  // ---- Kacheln -------------------------------------------------------------------------------------------------------
  const T = TM * k;                                 // Kachelgröße im CRS (≈ TM Spiel-Meter)
  const PXW = Math.round(TM / PIX);
  const variants = [
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${encodeURIComponent(COV)}&CRS=EPSG:${crsWanted}&RESPONSE_CRS=EPSG:${crsWanted}&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${PXW}&HEIGHT=${PXW}&FORMAT=GeoTIFF`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${encodeURIComponent(COV)}&CRS=EPSG:${crsWanted}&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${PXW}&HEIGHT=${PXW}&FORMAT=TIFF`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${encodeURIComponent(COV)}&CRS=EPSG:${crsWanted}&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${PXW}&HEIGHT=${PXW}&FORMAT=image/tiff`,
    (e0, e1, n0, n1) => `${WCS}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${encodeURIComponent(COV)}&FORMAT=image/tiff&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/${crsWanted}&SUBSET=x(${e0},${e1})&SUBSET=y(${n0},${n1})&SCALESIZE=x(${PXW}),y(${PXW})`,
  ];
  const tryTile = async (e0, e1, n0, n1) => {
    const errs = [];
    for (let v = (tryTile.v || 0); v < variants.length; v++) {
      try {
        let last;
        for (let t = 0; t < 3; t++) {            // abgeschnittene/defekte Antworten: gleiche Anfrage bis zu 3x wiederholen
          try {
            const buf = await (await get(variants[v](e0, e1, n0, n1))).arrayBuffer();
            const img = await (await fromArrayBuffer(buf)).getImage();
            const data = (await img.readRasters())[0];
            tryTile.v = v; return { img, data };
          } catch (e) { last = e; if (/^4\d\d /.test(e.message) && !/^429/.test(e.message)) break; await sleep(1000 * (t + 1)); }
        }
        throw last;
      } catch (e) { errs.push(`Variante ${v + 1}: ${e.message.split('\n').slice(0, 3).join(' | ')}`); }
    }
    throw new Error('Keine Anfrage-Variante hat funktioniert:\n' + errs.join('\n---\n'));
  };
  const cols = Math.ceil((eMax - eMin) / T), rows = Math.ceil((nMax - nMin) / T), tiles = []; let missing = 0;
  console.log(`Lade ${cols * rows} Kacheln …`);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const e0 = eMin + c * T, n0 = nMin + r * T, e1 = e0 + T, n1 = n0 + T, ov = 4 * k;
    try {
      const { img, data } = await tryTile(e0 - ov, e1 + ov, n0 - ov, n1 + ov);
      const [bx0, by0, bx1, by1] = img.getBoundingBox(), w = img.getWidth(), h = img.getHeight();
      tiles.push({ bx0, by1, w, h, px: (bx1 - bx0) / w, py: (by1 - by0) / h, data });
    } catch (e) {            // z. B. ausserhalb von Tirol (Italien/Bayern): keine Daten, wird spaeter aus der Umgebung aufgefuellt
      tiles.push(null); missing++; if (missing <= 3) console.log('\n  Kachel ' + (tiles.length) + ' ohne Daten (vermutlich ausserhalb Tirols): ' + e.message.split('\n').slice(0, 2).join(' ').slice(0, 160));
    }
    process.stdout.write(`\r  Kachel ${tiles.length}/${cols * rows}  (Variante ${(tryTile.v || 0) + 1}, ohne Daten: ${missing})`);
  }
  if (missing === cols * rows) throw new Error('Keine einzige Kachel geladen – Dienst/Coverage prüfen.');
  console.log('\nGelände erhalten.');
  const at = (E, N) => {
    const c = Math.max(0, Math.min(cols - 1, Math.floor((E - eMin) / T))), r = Math.max(0, Math.min(rows - 1, Math.floor((N - nMin) / T)));
    const t = tiles[r * cols + c];
    if (!t) return NaN;
    const u = (E - t.bx0) / t.px - 0.5, v = (t.by1 - N) / t.py - 0.5, i = Math.floor(u), j = Math.floor(v);
    const g = (ii, jj) => t.data[Math.max(0, Math.min(t.h - 1, jj)) * t.w + Math.max(0, Math.min(t.w - 1, ii))];
    const fu = u - i, fv = v - j;
    return (g(i, j) * (1 - fu) + g(i + 1, j) * fu) * (1 - fv) + (g(i, j + 1) * (1 - fu) + g(i + 1, j + 1) * fu) * fv;
  };
  const q = new Int16Array(nx * nz), F = new Float32Array(nx * nz);
  let mn = 1e9, mx = -1e9, bad = 0;
  const heightAt = (x, z) => { const [E, N] = proj(...toLL(x, z)); return at(E, N); };
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const e = heightAt(x0 + ix * CELL, z0 + iz * CELL);
    if (e > 300 && e < 4000) F[iz * nx + ix] = e; else { F[iz * nx + ix] = NaN; bad++; }
  }
  // Luecken (ausserhalb des Datengebiets) schrittweise aus den Nachbarn auffuellen (weiche Fortsetzung des Gelaendes)
  let todo = [];
  for (let k2 = 0; k2 < F.length; k2++) if (Number.isNaN(F[k2])) todo.push(k2);
  while (todo.length) {
    const add = [], rest = [];
    for (const k2 of todo) {
      const ix = k2 % nx, iz = (k2 - ix) / nx; let sm = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const X = ix + dx, Z = iz + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue; const v = F[Z * nx + X]; if (!Number.isNaN(v)) { sm += v; n++; } }
      if (n) add.push([k2, sm / n]); else rest.push(k2);
    }
    if (!add.length) break;
    for (const [k2, v] of add) F[k2] = v;
    todo = rest;
  }
  for (let k2 = 0; k2 < F.length; k2++) { const e = Number.isNaN(F[k2]) ? NHN0 : F[k2]; mn = Math.min(mn, e); mx = Math.max(mx, e); q[k2] = Math.round((e - NHN0) * 10); }
  // Prüfung gegen die GPX-Höhen
  let sum = 0, cnt = 0;
  for (let i = 0; i < ROUTE.pts.length; i += 10) { const p = ROUTE.pts[i], e = heightAt(p[0], -p[1]); if (e > 300 && e < 4000) { sum += Math.abs(e - p[2]); cnt++; } }
  const dev = cnt ? sum / cnt : 999;
  console.log(`Höhen ${mn.toFixed(0)} bis ${mx.toFixed(0)} m, ungültige Zellen: ${bad}, mittlere Abweichung zur GPX-Höhe: ${dev.toFixed(1)} m`);
  if (dev > (CELL > 20 ? 80 : 40) && !FORCE) { console.error('\nAbweichung zu groß – vermutlich falsche Ebene oder Koordinatensystem. Schick mir diese Ausgabe (oder mit --force trotzdem schreiben).'); process.exit(1); }
  fs.writeFileSync(OUT, JSON.stringify({ origin: ROUTE.origin, cell: CELL, x0, z0, nx, nz, nhn0: NHN0, dm: Buffer.from(q.buffer).toString('base64') }));
  console.log(`Fertig → ${OUT.pathname.split('/').pop()} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
}
const FERN = args.includes('--ohne-fern') ? null : +opt('fern', 9000);
if (!args.includes('--nur-fern')) await build(+opt('cell', 8), +opt('margin', 1200), +opt('pix', 2), 1000, new URL(`../src/routes/${NAME}.gelaende.json`, import.meta.url));
if (FERN) {
  console.log('\n--- Fernmodell für das Bergpanorama (grob, ' + FERN + ' m Rand) ---');
  const cov5 = (covs.find(c => /gel(ä|ae)ndemodell_5m/i.test(c.name) && /M28/.test(c.name)) || covs.find(c => /gel(ä|ae)ndemodell_5m/i.test(c.name)) || { name: cov }).name;
  console.log('Fernmodell aus Coverage', cov5);
  await build(40, FERN, 16, 4000, new URL(`../src/routes/${NAME}.fern.json`, import.meta.url), cov5);
}
