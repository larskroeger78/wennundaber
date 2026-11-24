// Holt die amtlichen 3D-Gebaeudemodelle LoD2 (Geobasis NRW, CityGML, dl-de/zero-2.0) fuer das Spielgebiet
// und schreibt src/routes/<name>.lod2.json: pro Gebaeude Wand-/Dach-/Grundflaechen als Dreiecks-Polygone.
// Aufruf: npm run lod2 -- miworu   (Node 18+, Internet noetig)
// Koordinaten im Spielsystem: x = Ost, z = -Nord (Meter, Ursprung wie die Strecke), y = Hoehe m ue. NHN (das Spiel zieht nhn0 ab).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const NAME = process.argv.slice(2).find(a => !a.startsWith('--')) || 'miworu';
const rd = f => { try { return JSON.parse(fs.readFileSync(new URL(`../src/routes/${f}`, import.meta.url), 'utf8')); } catch (e) { return null; } };
const ROUTE = rd(`${NAME}.json`) || { origin: [51.6, 7.6] }, GEL = rd(`${NAME}.gelaende.json`) || { x0: 0, z0: 0, nx: 1, nz: 1, cell: 4 };
const OUT = new URL(`../src/routes/${NAME}.lod2.json`, import.meta.url);
const PROBE = new URL(`./lod2-probe-${NAME}.txt`, import.meta.url);
const BASE = 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/';
const [LAT0, LON0] = ROUTE.origin;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;

// ---- ETRS89 / UTM 32N (Krueger-Reihen), GRS80 ----
const A_ = 6378137, F_ = 1 / 298.257222101, K0 = 0.9996, L0 = 9 * Math.PI / 180, E0 = 500000;
const n_ = F_ / (2 - F_), AA = A_ / (1 + n_) * (1 + n_ * n_ / 4 + n_ ** 4 / 64);
const al = [n_ / 2 - 2 * n_ ** 2 / 3 + 5 * n_ ** 3 / 16, 13 * n_ ** 2 / 48 - 3 * n_ ** 3 / 5, 61 * n_ ** 3 / 240];
const be = [n_ / 2 - 2 * n_ ** 2 / 3 + 37 * n_ ** 3 / 96, n_ ** 2 / 48 + n_ ** 3 / 15, 17 * n_ ** 3 / 480];
const de = [2 * n_ - 2 * n_ ** 2 / 3 - 2 * n_ ** 3, 7 * n_ ** 2 / 3 - 8 * n_ ** 3 / 5, 56 * n_ ** 3 / 15];
export function toUTM(lat, lon) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180 - L0, q = 2 * Math.sqrt(n_) / (1 + n_);
  const t = Math.sinh(Math.atanh(Math.sin(p)) - q * Math.atanh(q * Math.sin(p)));
  const xi = Math.atan2(t, Math.cos(l)), eta = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 3; j++) { E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [E0 + K0 * AA * E, K0 * AA * N];
}
export function fromUTM(E, N) {
  const xi = N / (K0 * AA), eta = (E - E0) / (K0 * AA);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) { xp -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let p = chi; for (let j = 1; j <= 3; j++) p += de[j - 1] * Math.sin(2 * j * chi);
  return [p * 180 / Math.PI, (L0 + Math.atan2(Math.sinh(ep), Math.cos(xp))) * 180 / Math.PI];
}

// ---- CityGML lesen ----
const r1 = v => Math.round(v * 10) / 10;
export function parseGML(xml, toLocal, inside) {
  const out = [];
  const bRe = /<(?:\w+:)?Building(?:\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?Building>/g;
  let bm;
  while ((bm = bRe.exec(xml))) {
    const b = bm[0], polys = [];
    const sRe = /<(?:\w+:)?(WallSurface|RoofSurface|GroundSurface)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/g;
    let sm;
    while ((sm = sRe.exec(b))) {
      const kind = sm[1] === 'WallSurface' ? 'w' : sm[1] === 'RoofSurface' ? 'r' : 'g';
      // nur aussere Ringe: Polygone ohne <interior>
      const body = sm[2].replace(/<(?:\w+:)?interior>[\s\S]*?<\/(?:\w+:)?interior>/g, '');
      const pRe = /<(?:\w+:)?posList([^>]*)>([^<]+)<\/(?:\w+:)?posList>/g;
      let pm;
      while ((pm = pRe.exec(body))) {
        const dim = /srsDimension="(\d)"/.exec(pm[1]); const d = dim ? +dim[1] : 3;
        const v = pm[2].trim().split(/\s+/).map(Number);
        if (d !== 3 || v.length < 12 || v.some(Number.isNaN)) continue;
        const pts = [];
        for (let i = 0; i + 2 < v.length; i += 3) { let E = v[i]; if (E > 1e7) E -= 32e6; pts.push(toLocal(E, v[i + 1], v[i + 2])); }
        if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] && pts[0][2] === pts[pts.length - 1][2]) pts.pop();
        if (pts.length >= 3) polys.push([kind, pts.flat().map(r1)]);
      }
    }
    if (!polys.length) continue;
    let cx = 0, cz = 0, c = 0; polys.forEach(([k, p]) => { if (k === 'g') for (let i = 0; i < p.length; i += 3) { cx += p[i]; cz += p[i + 2]; c++; } });
    if (!c) polys.forEach(([, p]) => { for (let i = 0; i < p.length; i += 3) { cx += p[i]; cz += p[i + 2]; c++; } });
    if (!inside(cx / c, cz / c)) continue;
    out.push(polys);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const x0 = GEL.x0, x1 = GEL.x0 + GEL.nx * GEL.cell, z0 = GEL.z0, z1 = GEL.z0 + GEL.nz * GEL.cell;
  const toLocal = (E, N, H) => { const [lat, lon] = fromUTM(E, N); return [(lon - LON0) * KX, H, -(lat - LAT0) * KY]; };
  const inside = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const cs = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => toUTM(LAT0 - z / KY, LON0 + x / KX));
  const Ek = [Math.floor(Math.min(...cs.map(c => c[0])) / 1000), Math.floor(Math.max(...cs.map(c => c[0])) / 1000)];
  const Nk = [Math.floor(Math.min(...cs.map(c => c[1])) / 1000), Math.floor(Math.max(...cs.map(c => c[1])) / 1000)];
  if (process.argv.includes('--ni')) {   // Niedersachsen: Kacheln ueber den STAC-Katalog des LGLN suchen (CityGML, UTM 32, 1 x 1 km)
    const STAC = 'https://lod.stac.lgln.niedersachsen.de';
    const ll = [[x0, z0], [x1, z1]].map(([x, z]) => [LAT0 - z / KY, LON0 + x / KX]);
    const bbox = [Math.min(ll[0][1], ll[1][1]), Math.min(ll[0][0], ll[1][0]), Math.max(ll[0][1], ll[1][1]), Math.max(ll[0][0], ll[1][0])].map(v => v.toFixed(5)).join(',');
    console.log('Suche Kacheln im STAC-Katalog …', STAC);
    let items = [], url = `${STAC}/search?bbox=${bbox}&limit=100`;
    for (let page = 0; url && page < 20; page++) {
      const r = await fetch(url, { headers: { 'User-Agent': 'miworu-lod2/1.0', Accept: 'application/geo+json, application/json' } });
      if (!r.ok) { console.log('STAC-Fehler HTTP ' + r.status + ': ' + (await r.text()).slice(0, 400)); process.exit(1); }
      const j = await r.json(); items.push(...(j.features || []));
      const nx = (j.links || []).find(l => l.rel === 'next'); url = nx ? nx.href : null;
    }
    console.log(items.length + ' Eintraege gefunden.');
    if (!items.length) { console.log('Keine Kacheln im Katalog. Schick mir diese Ausgabe.'); process.exit(1); }
    const { execSync } = await import('node:child_process');
    const all = []; let probed = false;
    for (const it of items) {
      const assets = Object.entries(it.assets || {});
      const pick = assets.find(([, a]) => /\.(gml|xml)(\?|$)/i.test(a.href)) || assets.find(([, a]) => /\.zip(\?|$)/i.test(a.href)) || assets.find(([, a]) => /\.gz(\?|$)/i.test(a.href));
      if (!pick) { console.log('  ' + it.id + ': kein passendes Asset: ' + assets.map(([k, a]) => k + '=' + a.href).join(' ')); continue; }
      const href = pick[1].href; process.stdout.write('  ' + it.id + ' … ');
      let xml = null;
      for (let t = 1; t <= 3 && xml === null; t++) {
        try {
          const r = await fetch(href, { headers: { 'User-Agent': 'miworu-lod2/1.0' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
          const buf = Buffer.from(await r.arrayBuffer());
          if (/\.zip(\?|$)/i.test(href)) { const tmp = new URL('./lod2-tmp.zip', import.meta.url); fs.writeFileSync(tmp, buf); xml = execSync('unzip -p "' + tmp.pathname + '"', { maxBuffer: 1e9 }).toString('utf8'); fs.unlinkSync(tmp); }
          else if (/\.gz(\?|$)/i.test(href)) xml = (await import('node:zlib')).gunzipSync(buf).toString('utf8');
          else xml = buf.toString('utf8');
        } catch (err) { console.log(`Fehler (${err.message}), Versuch ${t}`); await new Promise(r => setTimeout(r, 2000 * t)); }
      }
      if (!xml) { console.log('uebersprungen'); continue; }
      if (!probed) { fs.writeFileSync(PROBE, xml.slice(0, 6000) + '\n…\n' + (/<(?:\w+:)?Building[\s\S]{0,3500}/.exec(xml) || [''])[0]); probed = true; }
      const b = parseGML(xml, toLocal, inside); console.log(`${(xml.length / 1e6).toFixed(1)} MB, ${b.length} Gebaeude im Gebiet`); all.push(...b);
    }
    if (!all.length) { console.log('\nKeine Gebaeude gelesen. Schick mir scripts/lod2-probe-' + NAME + '.txt und diese Ausgabe.'); process.exit(1); }
    fs.writeFileSync(OUT, JSON.stringify({ name: NAME, origin: ROUTE.origin, b: all }));
    console.log(`\nFertig: ${all.length} Gebaeude → src/routes/${NAME}.lod2.json (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
    process.exit(0);
  }
  const tiles = []; for (let e = Ek[0]; e <= Ek[1]; e++) for (let n = Nk[0]; n <= Nk[1]; n++) tiles.push([e, n]);
  console.log(`Gebiet ${NAME}: ${tiles.length} Kachel(n) a 1 km`);
  const all = []; let probed = false;
  for (const [e, n] of tiles) {
    const url = `${BASE}LoD2_32_${e}_${n}_1_NW.gml`;
    process.stdout.write(`  ${e}/${n} … `);
    let xml = null;
    for (let t = 1; t <= 3 && xml === null; t++) {
      try { const r = await fetch(url, { headers: { 'User-Agent': 'miworu-lod2/1.0' } }); if (r.status === 404) { xml = ''; break; } if (!r.ok) throw new Error('HTTP ' + r.status); xml = await r.text(); }
      catch (err) { console.log(`Fehler (${err.message}), Versuch ${t}`); await new Promise(r => setTimeout(r, 2000 * t)); }
    }
    if (xml === null) { console.log('uebersprungen'); continue; }
    if (!xml) { console.log('keine Daten (404)'); continue; }
    if (!probed) { fs.writeFileSync(PROBE, xml.slice(0, 6000) + '\n…\n' + (/<(?:\w+:)?Building[\s\S]{0,3500}/.exec(xml) || [''])[0]); probed = true; }
    const b = parseGML(xml, toLocal, inside); console.log(`${(xml.length / 1e6).toFixed(1)} MB, ${b.length} Gebaeude im Gebiet`);
    all.push(...b);
  }
  if (!all.length) { console.log('\nKeine Gebaeude gelesen. Schick mir die Datei scripts/lod2-probe-' + NAME + '.txt (falls vorhanden) und diese Ausgabe.'); process.exit(1); }
  fs.writeFileSync(OUT, JSON.stringify({ name: NAME, origin: ROUTE.origin, b: all }));
  const np = all.reduce((s, b) => s + b.length, 0);
  console.log(`\nFertig: ${all.length} Gebaeude, ${np} Flaechen → src/routes/${NAME}.lod2.json (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
}
