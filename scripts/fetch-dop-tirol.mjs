// Tirol: Luftbilder (Orthofoto Tirol, 20 cm, Land Tirol, CC BY 4.0 – "Datenquelle: Land Tirol - data.tirol.gv.at") per WMS
// -> src/routes/<name>.dop-<i>.jpg + <name>.dop.json (gleiches Format wie fetch-dop.mjs).
// Aufruf: npm run dop-tirol -- alpen      Optionen: --wms=<URL> --layer=<Name> --pix=2 --crs=25832|3857
// Braucht vorher <name>.json und <name>.gelaende.json (npm run terrain-tirol).
import fs from 'node:fs';
import jpeg from 'jpeg-js';

const args = process.argv.slice(2);
const NAME = args.find(a => !a.startsWith('--')) || 'alpen';
const opt = k => (args.find(a => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
const PIX = +(opt('pix') || 2);                 // Meter pro Pixel (Boden)
const rd = f => JSON.parse(fs.readFileSync(new URL(`../src/routes/${f}`, import.meta.url), 'utf8'));
const ROUTE = rd(`${NAME}.json`), GEL = rd(`${NAME}.gelaende.json`);
const [LAT0, LON0] = ROUTE.origin;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
const WMS = opt('wms') || 'https://gis.tirol.gv.at/arcgis/services/Service_Public/orthofoto/MapServer/WmsServer';
const UA = { 'User-Agent': 'miworu-dop-tirol/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function utm32(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, n = f / (2 - f), k0 = 0.9996;
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
  const p = lat * Math.PI / 180, dl = (lon - 9) * Math.PI / 180, c = 2 * Math.sqrt(n) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(p)) - c * Math.atanh(c * Math.sin(p)));
  const xi = Math.atan(t / Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 3; j++) { E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [500000 + k0 * A * E, k0 * A * N];
}
const merc = (lat, lon) => [6378137 * lon * Math.PI / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
const PROJ = { 25832: utm32, 3857: merc };

// Dienst lesen
let cap = '';
try { cap = await (await fetch(`${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`, { headers: UA })).text(); }
catch (e) { console.error('Dienst nicht erreichbar:', e.message, '\nMit --wms=<Link> den Orthofoto-WMS von https://tirol.gv.at/sicherheit/geoinformation/geodaten-tiris/orthofotos angeben.'); process.exit(1); }
const allNames = [...cap.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]);
const yr = n => Math.max(0, ...(n.match(/\d{4}/g) || []).map(Number));
let LAYERS = opt('layer') ? [opt('layer')] : [...new Set(allNames.filter(n => /^Image_/i.test(n)))].sort((a, b) => yr(b) - yr(a));
if (!LAYERS.length) LAYERS = [...new Set(allNames.filter(n => n !== 'default'))].slice(0, 3);
console.log('Bildebenen (neueste zuerst):', LAYERS.join(', '));
const crsAll = [...new Set([...cap.matchAll(/<(?:CRS|SRS)>EPSG:(\d+)<\/(?:CRS|SRS)>/g)].map(m => +m[1]))];
console.log('Koordinatensysteme (Auszug):', crsAll.slice(0, 8).join(', '));
const crs = +(opt('crs') || 0) || [25832, 3857].find(c => crsAll.includes(c)) || 25832;
const proj = PROJ[crs];
console.log('Verwende EPSG:' + crs, '(mit --layer=… / --crs=… änderbar)');

// Affine Abbildung Spielkoordinaten (x Ost, z = -Nord) -> CRS (linear um den Ursprung)
const o = proj(LAT0, LON0), ux = proj(LAT0, LON0 + 1 / KX), uz = proj(LAT0 - 1 / KY, LON0);
const aff = { E0: o[0], N0: o[1], ex: ux[0] - o[0], nx: ux[1] - o[1], ez: uz[0] - o[0], nz: uz[1] - o[1] };
const k = Math.hypot(aff.ex, aff.nx);
const RES = PIX * k;                                        // CRS-Meter je Pixel
const gx0 = GEL.x0, gx1 = GEL.x0 + GEL.nx * GEL.cell, gz0 = GEL.z0, gz1 = GEL.z0 + GEL.nz * GEL.cell;
const cs = [[gx0, gz0], [gx1, gz0], [gx0, gz1], [gx1, gz1]].map(([x, z]) => [aff.E0 + aff.ex * x + aff.ez * z, aff.N0 + aff.nx * x + aff.nz * z]);
const E0 = Math.floor(Math.min(...cs.map(c => c[0])) - 20), E1 = Math.ceil(Math.max(...cs.map(c => c[0])) + 20);
const N0 = Math.floor(Math.min(...cs.map(c => c[1])) - 20), N1 = Math.ceil(Math.max(...cs.map(c => c[1])) + 20);
console.log(`Gebiet ${NAME}: ${((E1 - E0) / k / 1000).toFixed(1)} x ${((N1 - N0) / k / 1000).toFixed(1)} km`);

const T = Math.round(1000 * k), PX = Math.round(T / RES), tiles = []; let idx = 0, good = 0;
const blank = buf => {                       // leere Kachel (weiss/schwarz/gleichfarbig)?
  try {
    const d = jpeg.decode(buf, { useTArray: true }).data; let w = 0, b = 0, n = 0, sum = 0, sq = 0;
    for (let q = 0; q < d.length; q += 16) { const l = (d[q] + d[q + 1] + d[q + 2]) / 3; n++; sum += l; sq += l * l; if (l > 248) w++; if (l < 4) b++; }
    const sd = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
    return (w + b) / n > 0.5 || sd < 6;
  } catch (e) { return true; }
};
for (let n1 = N1; n1 > N0; n1 -= T) for (let e0 = E0; e0 < E1; e0 += T) {
  const e1 = e0 + T, n0 = n1 - T, file = `${NAME}.dop-${idx}.jpg`;
  process.stdout.write(`  Kachel ${idx} … `);
  let done = false;
  const order = [LAYERS[good], ...LAYERS.filter((_, q) => q !== good)];
  for (const layer of order) {
    const url = `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${encodeURIComponent(layer)}&STYLES=&CRS=EPSG:${crs}&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${PX}&HEIGHT=${PX}&FORMAT=image/jpeg`;
    let buf = null;
    for (let t = 1; t <= 3 && !buf; t++) {
      try {
        const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) }), b = Buffer.from(await r.arrayBuffer());
        if (r.ok && (r.headers.get('content-type') || '').includes('image')) buf = b;
        else { const m = b.toString('utf8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); if (t === 3 || /unacceptable|not defined|LayerNotDefined/i.test(m)) { process.stdout.write(`[${layer}: ${m}] `); break; } await sleep(2000 * t); }
      } catch (e) { await sleep(2000 * t); }
    }
    if (!buf || blank(buf)) continue;
    fs.writeFileSync(new URL(`../src/routes/${file}`, import.meta.url), buf);
    good = LAYERS.indexOf(layer); console.log(`${(buf.length / 1e3).toFixed(0)} kB (${layer})`); done = true; break;
  }
  if (!done) { console.log('\nAbbruch: keine Ebene liefert hier ein Bild. Schick mir diese Ausgabe.'); process.exit(1); }
  tiles.push({ f: file, e0, n1, w: PX, h: PX }); idx++;
}
fs.writeFileSync(new URL(`../src/routes/${NAME}.dop.json`, import.meta.url), JSON.stringify({ name: NAME, res: RES, aff, tiles }));
console.log(`\nFertig: ${tiles.length} Luftbild-Kacheln → src/routes/${NAME}.dop-*.jpg`);
