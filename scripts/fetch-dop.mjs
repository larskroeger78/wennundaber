// Holt amtliche Luftbilder (Digitale Orthophotos, Geobasis NRW, dl-de/zero-2.0) per WMS fuer das Spielgebiet.
// Schreibt src/routes/<name>.dop-<i>.jpg (je 1000x1000 m, 1 m/Pixel) und src/routes/<name>.dop.json (Lage der Kacheln).
// Aufruf: npm run dop -- miworu   (Node 18+, Internet noetig). Optional: --layer=<Ebenenname>  --res=1
import fs from 'node:fs';
import { toUTM } from './fetch-lod2.mjs';

const args = process.argv.slice(2);
const NAME = args.find(a => !a.startsWith('--')) || 'miworu';
const opt = k => (args.find(a => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
const RES = +(opt('res') || 1);            // Meter pro Pixel
const rd = f => JSON.parse(fs.readFileSync(new URL(`../src/routes/${f}`, import.meta.url), 'utf8'));
const ROUTE = rd(`${NAME}.json`), GEL = rd(`${NAME}.gelaende.json`);
const [LAT0, LON0] = ROUTE.origin;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
// Niedersachsen: --ni (LGLN, DOP20 als WMS) oder eigener Dienst mit --wms=URL. Standard: Geobasis NRW.
const WMS = opt('wms') || (args.includes('--ni') ? 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms' : 'https://www.wms.nrw.de/geobasis/wms_nw_dop');
const UA = { 'User-Agent': 'miworu-dop/1.0' };

// Spielkoordinaten (x Ost, z = -Nord, Meter) -> UTM, linear um den Ursprung (auf 2 km weit unter 0,1 m genau)
const o = toUTM(LAT0, LON0), ux = toUTM(LAT0, LON0 + 1 / KX), uz = toUTM(LAT0 - 1 / KY, LON0);
const aff = { E0: o[0], N0: o[1], ex: ux[0] - o[0], nx: ux[1] - o[1], ez: uz[0] - o[0], nz: uz[1] - o[1] };
const gx0 = GEL.x0, gx1 = GEL.x0 + GEL.nx * GEL.cell, gz0 = GEL.z0, gz1 = GEL.z0 + GEL.nz * GEL.cell;
const cs = [[gx0, gz0], [gx1, gz0], [gx0, gz1], [gx1, gz1]].map(([x, z]) => [aff.E0 + aff.ex * x + aff.ez * z, aff.N0 + aff.nx * x + aff.nz * z]);
const E0 = Math.floor(Math.min(...cs.map(c => c[0])) - 20), E1 = Math.ceil(Math.max(...cs.map(c => c[0])) + 20);
const N0 = Math.floor(Math.min(...cs.map(c => c[1])) - 20), N1 = Math.ceil(Math.max(...cs.map(c => c[1])) + 20);
console.log(`Gebiet ${NAME}: E ${E0}-${E1}, N ${N0}-${N1} (${E1 - E0} x ${N1 - N0} m)`);

// Ebene ermitteln
let layer = opt('layer');
if (!layer) {
  try {
    const cap = await (await fetch(`${WMS}?REQUEST=GetCapabilities&SERVICE=WMS&VERSION=1.3.0`, { headers: UA })).text();
    const names = [...cap.matchAll(/<Layer[^>]*>\s*<Name>([^<]+)<\/Name>/g)].map(m => m[1]);
    console.log('Ebenen laut Dienst:', names.join(', ') || '(keine gefunden)');
    layer = names.find(n => /^ni_dop20$/.test(n)) || names.find(n => /rgb/i.test(n) && !/ir|cir/i.test(n)) || names.find(n => /dop/i.test(n) && !/ir|cir|dop_info|meta/i.test(n)) || names.find(n => !/info|meta/i.test(n)) || 'nw_dop_rgb';
  } catch (e) { console.log('Capabilities nicht lesbar (' + e.message + '), nehme nw_dop_rgb'); layer = 'nw_dop_rgb'; }
}
console.log('Verwende Ebene:', layer);

const T = 1000, tiles = []; let idx = 0;
for (let n1 = N1; n1 > N0; n1 -= T) for (let e0 = E0; e0 < E1; e0 += T) {
  const e1 = Math.min(E1, e0 + T), n0 = Math.max(N0, n1 - T), w = Math.round((e1 - e0) / RES), h = Math.round((n1 - n0) / RES);
  const url = `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${encodeURIComponent(layer)}&STYLES=&CRS=EPSG:25832&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/jpeg`;
  const file = `${NAME}.dop-${idx}.jpg`;
  process.stdout.write(`  Kachel ${idx} (${e0}/${n0}) … `);
  let ok = false;
  for (let t = 1; t <= 3 && !ok; t++) {
    try {
      const r = await fetch(url, { headers: UA }), buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !(r.headers.get('content-type') || '').includes('image')) { console.log(`Fehler HTTP ${r.status}: ${buf.toString('utf8').slice(0, 300)}`); await new Promise(r => setTimeout(r, 2000 * t)); continue; }
      fs.writeFileSync(new URL(`../src/routes/${file}`, import.meta.url), buf);
      console.log(`${(buf.length / 1e3).toFixed(0)} kB`); ok = true;
    } catch (e) { console.log(`Fehler (${e.message}), Versuch ${t}`); await new Promise(r => setTimeout(r, 2000 * t)); }
  }
  if (!ok) { console.log('\nAbbruch: Kachel nicht geladen. Schick mir diese Ausgabe.'); process.exit(1); }
  tiles.push({ f: file, e0, n1, w, h }); idx++;
}
fs.writeFileSync(new URL(`../src/routes/${NAME}.dop.json`, import.meta.url), JSON.stringify({ name: NAME, res: RES, aff, tiles }));
console.log(`\nFertig: ${tiles.length} Luftbild-Kacheln → src/routes/${NAME}.dop-*.jpg`);
