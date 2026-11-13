import { overpass, WANT_QUERY, elementsOrNull } from './overpass.mjs';
// Lädt Gebäude, Wald, Felder, Siedlungen und Gewässer aus OpenStreetMap (Overpass-API) für das Spielgebiet
// und schreibt src/routes/umgebung.json (Koordinaten im Spielsystem: x = Ost, z = -Nord, in Metern).
// Aufruf: npm run osm   (Node 18+, Internet nötig). Daten © OpenStreetMap-Mitwirkende (ODbL).
import fs from 'node:fs';

const OUT = new URL('../src/routes/umgebung.json', import.meta.url);
const MITT = JSON.parse(fs.readFileSync(new URL('../src/routes/mittwochsrunde.json', import.meta.url), 'utf8'));
const GEL = JSON.parse(fs.readFileSync(new URL('../src/routes/gelaende.json', import.meta.url), 'utf8'));
const [LAT0, LON0] = MITT.origin;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
// Gebiet = Höhenmodell (plus 100 m Rand)
const x0 = GEL.x0 - 100, x1 = GEL.x0 + GEL.nx * GEL.cell + 100, z0 = GEL.z0 - 100, z1 = GEL.z0 + GEL.nz * GEL.cell + 100;
const S = LAT0 - z1 / KY, N = LAT0 - z0 / KY, W = LON0 + x0 / KX, E = LON0 + x1 / KX;
const bb = `${S.toFixed(5)},${W.toFixed(5)},${N.toFixed(5)},${E.toFixed(5)}`;

const LANDUSE_OPEN = 'farmland|meadow|grass|orchard|vineyard|allotments|village_green|recreation_ground|farmyard|brownfield|construction|quarry|cemetery';
const mk = body => `[out:json][timeout:90];(${body});out geom;`;
const QUERIES = [
  ['Gebäude', 20, mk(`way["building"](${bb});`)],
  ['Wald/Flächen', 20, mk(`way["landuse"~"^(forest|residential|industrial|commercial|retail|${LANDUSE_OPEN})$"](${bb});way["natural"~"^(wood|water|scrub|heath|grassland|wetland)$"](${bb});way["leisure"~"^(park|garden|pitch|golf_course)$"](${bb});`)],
  ['Wasser/Relationen', 0, mk(`way["waterway"~"^(river|canal|stream)$"](${bb});relation["landuse"~"^(forest|residential|industrial|farmland|meadow)$"](${bb});relation["natural"~"^(wood|water)$"](${bb});`)],
];

const ALL = '[out:json][timeout:180];(' + QUERIES.map(([, , q]) => q.replace(/^\[out:json\]\[timeout:90\];\(/, '').replace(/\);out geom;$/, '')).join('') + ');out geom;';

// Flächenklassen: 1 Wald, 2 offen (Feld/Wiese), 3 Siedlung/Gewerbe, 4 Wasser, 5 Gebüsch, 7 Park/Garten
function areaClass(t) {
  if (t.landuse === 'forest' || t.natural === 'wood') return 1;
  if (t.natural === 'water' || t.natural === 'wetland') return 4;
  if (t.natural === 'scrub') return 5;
  if (t.natural === 'heath' || t.natural === 'grassland') return 2;
  if (t.leisure === 'park' || t.leisure === 'garden') return 7;
  if (t.leisure === 'pitch' || t.leisure === 'golf_course') return 2;
  if (/^(residential|industrial|commercial|retail)$/.test(t.landuse)) return 3;
  if (t.landuse) return 2;
  return 0;
}
function buildingHeight(t) {
  const h = parseFloat(t.height); if (h > 0) return h;
  const lv = parseFloat(t['building:levels']); if (lv > 0) return lv * 3.1 + 1.5;
  const b = t.building;
  if (/^(garage|garages|shed|carport|roof|hut|cabin|greenhouse)$/.test(b)) return 3;
  if (/^(industrial|warehouse|retail|commercial)$/.test(b)) return 8;
  if (/^(church|cathedral)$/.test(b)) return 14;
  return 7.5;
}
const toXZ = g => g.map(p => [(p.lon - LON0) * KX, -(p.lat - LAT0) * KY]);
function simplify(pts, tol) {                         // Douglas-Peucker
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let dm = 0, im = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / l; if (d > dm) { dm = d; im = i; } }
    if (dm > tol && im > 0) { keep[im] = 1; st.push([a, im], [im, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const flat = pts => pts.flatMap(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
// Ringe aus Teilwegen zusammensetzen (Multipolygon-Relationen)
function joinRings(segs) {
  const rings = [], pool = segs.map(s => s.slice());
  const key = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  while (pool.length) {
    let ring = pool.pop(), guard = 0;
    while (key(ring[0]) !== key(ring.at(-1)) && guard++ < 5000) {
      const e = key(ring.at(-1)); let k = pool.findIndex(s => key(s[0]) === e), rev = false;
      if (k < 0) { k = pool.findIndex(s => key(s.at(-1)) === e); rev = true; }
      if (k < 0) break;
      const s = pool.splice(k, 1)[0]; if (rev) s.reverse(); ring = ring.concat(s.slice(1));
    }
    if (ring.length > 3 && key(ring[0]) === key(ring.at(-1))) rings.push(ring);
  }
  return rings;
}

async function main() {
  console.log('Frage Overpass ab …', bb);
  if (WANT_QUERY) { console.log('\nIn https://overpass-turbo.eu einfügen → „Ausführen“ → Export → „Rohdaten direkt aus Overpass API“ (JSON) speichern, dann:\n  npm run osm -- --datei=PFAD/export.json\n\n' + ALL + '\n'); return; }
  const data = { elements: [] };
  const off = await elementsOrNull();
  if (off) data.elements.push(...off); else for (const [name, minN, qq] of QUERIES) { console.log('Teil:', name); const d = await overpass(qq, 5, minN); data.elements.push(...d.elements); await new Promise(r => setTimeout(r, 3000)); }
  const buildings = [], areas = [], lines = [];
  for (const el of data.elements) {
    const t = el.tags || {};
    if (el.type === 'way' && el.geometry) {
      const pts = toXZ(el.geometry);
      if (t.building) { const p = simplify(pts, 0.4); if (p.length >= 4) buildings.push({ p: flat(p.slice(0, -1)), h: Math.round(buildingHeight(t) * 10) / 10, r: /^(church|cathedral|chapel)$/.test(t.building) ? 1 : 0 }); continue; }
      if (t.waterway) { lines.push({ k: 4, w: t.waterway === 'stream' ? 2.5 : t.waterway === 'canal' ? 14 : 12, p: flat(simplify(pts, 1)) }); continue; }
      const k = areaClass(t); if (k && pts.length >= 4) areas.push({ k, p: flat(simplify(pts, 1.2)) });
    } else if (el.type === 'relation' && el.members) {
      const k = areaClass(t); if (!k) continue;
      const outer = el.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry).map(m => toXZ(m.geometry));
      for (const ring of joinRings(outer)) if (ring.length >= 4) areas.push({ k, p: flat(simplify(ring, 1.2)) });
    }
  }
  if (!buildings.length) console.log('WARNUNG: 0 Gebäude gefunden – das ist für dieses Gebiet unwahrscheinlich. Bitte noch einmal starten.');
  fs.writeFileSync(OUT, JSON.stringify({ origin: MITT.origin, buildings, areas, lines }));
  const cnt = k => areas.filter(a => a.k === k).length;
  console.log(`Gebäude ${buildings.length}, Wald ${cnt(1)}, offen ${cnt(2)}, Siedlung ${cnt(3)}, Wasser ${cnt(4)} + ${lines.length} Wasserläufe, Park ${cnt(7)}`);
  console.log('→ src/routes/umgebung.json (', (fs.statSync(OUT).size / 1024).toFixed(0), 'kB ). Danach: git add -A && git commit && git push');
}
main().catch(e => { console.error(e.message); process.exit(1); });
