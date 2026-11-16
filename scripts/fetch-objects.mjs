// Holt Kleinobjekte aus OpenStreetMap: Zaeune, Mauern, Hecken, Leitplanken, Masten, Strommasten/-leitungen, Laternen, Baenke, Wegweiser, Poller, Tore.
// Schreibt src/routes/<name>.objekte.json (Spielsystem: x = Ost, z = -Nord, Meter). Aufruf: npm run objekte -- miworu
// Daten © OpenStreetMap-Mitwirkende (ODbL).
import fs from 'node:fs';
import { overpass } from './overpass.mjs';

const NAME = process.argv.slice(2).find(a => !a.startsWith('--')) || 'miworu';
const rd = f => JSON.parse(fs.readFileSync(new URL(`../src/routes/${f}`, import.meta.url), 'utf8'));
const ROUTE = rd(`${NAME}.json`), GEL = rd(`${NAME}.gelaende.json`);
const [LAT0, LON0] = ROUTE.origin, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
const x0 = GEL.x0, x1 = GEL.x0 + GEL.nx * GEL.cell, z0 = GEL.z0, z1 = GEL.z0 + GEL.nz * GEL.cell;
const bb = `${(LAT0 - z1 / KY).toFixed(5)},${(LON0 + x0 / KX).toFixed(5)},${(LAT0 - z0 / KY).toFixed(5)},${(LON0 + x1 / KX).toFixed(5)}`;
const q = `[out:json][timeout:120];(
 node["highway"="street_lamp"](${bb});node["amenity"="bench"](${bb});node["tourism"="information"](${bb});node["information"~"guidepost|board|map"](${bb});
 node["power"~"^(pole|tower)$"](${bb});node["man_made"~"^(mast|tower|chimney|water_tower|flagpole)$"](${bb});node["barrier"~"^(bollard|gate|stile|lift_gate)$"](${bb});
 node["amenity"~"^(shelter|waste_basket|drinking_water)$"](${bb});node["leisure"="picnic_table"](${bb});
 way["barrier"~"^(fence|wall|hedge|guard_rail|retaining_wall|city_wall)$"](${bb});way["power"~"^(line|minor_line)$"](${bb});
);out geom;`;
const j = await overpass(q, 3, 1);
const L = (lat, lon) => [Math.round((lon - LON0) * KX * 10) / 10, Math.round(-(lat - LAT0) * KY * 10) / 10];
const inside = ([x, z]) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const nodes = [], lines = [], cnt = {};
for (const e of j.elements || []) {
  const t = e.tags || {};
  if (e.type === 'node') {
    const p = L(e.lat, e.lon); if (!inside(p)) continue;
    let k = null;
    if (t.highway === 'street_lamp') k = 'lamp';
    else if (t.amenity === 'bench') k = 'bench';
    else if (t.leisure === 'picnic_table') k = 'table';
    else if (t.tourism === 'information' || t.information) k = 'sign';
    else if (t.power === 'tower') k = 'pylon';
    else if (t.power === 'pole') k = 'pole';
    else if (t.man_made) k = /chimney|water_tower/.test(t.man_made) ? 'chimney' : 'mast';
    else if (t.barrier === 'bollard') k = 'bollard';
    else if (t.barrier) k = 'gate';
    else if (t.amenity === 'shelter') k = 'shelter';
    else if (t.amenity) k = 'bin';
    if (!k) continue; cnt[k] = (cnt[k] || 0) + 1;
    nodes.push([k, ...p, t.height ? +parseFloat(t.height) || 0 : 0]);
  } else if (e.type === 'way' && e.geometry) {
    let k = null;
    if (t.barrier === 'fence') k = 'fence'; else if (/^(wall|retaining_wall|city_wall)$/.test(t.barrier)) k = 'wall'; else if (t.barrier === 'hedge') k = 'hedge';
    else if (t.barrier === 'guard_rail') k = 'rail'; else if (t.power) k = 'line';
    if (!k) continue;
    const pts = e.geometry.map(g => L(g.lat, g.lon)); if (!pts.some(inside)) continue;
    cnt[k] = (cnt[k] || 0) + 1;
    lines.push([k, pts.flat()]);
  }
}
console.log('Gefunden:', JSON.stringify(cnt));
fs.writeFileSync(new URL(`../src/routes/${NAME}.objekte.json`, import.meta.url), JSON.stringify({ name: NAME, origin: ROUTE.origin, nodes, lines }));
console.log(`Fertig: ${nodes.length} Punkte, ${lines.length} Linien → src/routes/${NAME}.objekte.json`);
