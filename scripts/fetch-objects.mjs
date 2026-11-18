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
 node["amenity"~"^(shelter|waste_basket|drinking_water)$"](${bb});
 node["highway"~"^(traffic_signals|crossing|bus_stop)$"](${bb});node["natural"="tree"](${bb});way["natural"="tree_row"](${bb});node["leisure"="picnic_table"](${bb});
 way["barrier"~"^(fence|wall|hedge|guard_rail|retaining_wall|city_wall)$"](${bb});way["power"~"^(line|minor_line)$"](${bb});
 way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|footway|cycleway|path|track)$"](${bb});
 way["amenity"="parking"](${bb});rel["amenity"="parking"](${bb});way["area:highway"](${bb});
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
    else if (t.highway === 'traffic_signals') k = 'signal';
    else if (t.highway === 'crossing') k = 'xing';
    else if (t.highway === 'bus_stop') k = 'busstop';
    else if (t.natural === 'tree') k = 'tree';
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
    nodes.push([k, ...p, k === 'xing' ? (/zebra|marked|traffic_signals/.test(t.crossing || '') || t.crossing_ref === 'zebra' ? 1 : 0) : t.height ? +parseFloat(t.height) || 0 : 0]);
  } else if (e.type === 'relation' && e.members) {   // Parkplaetze als Multipolygon: aeussere Ringe
    if (t.amenity !== 'parking') continue;
    for (const m of e.members) { if (m.type !== 'way' || m.role === 'inner' || !m.geometry) continue;
      const pts = m.geometry.map(g => L(g.lat, g.lon)); if (pts.length < 4 || !pts.some(inside)) continue;
      cnt.park = (cnt.park || 0) + 1; lines.push(['park', pts.flat(), { m: 1 }]); }
  } else if (e.type === 'way' && e.geometry) {
    if (t.amenity === 'parking' || t['area:highway']) {   // Parkplatz- und Platzflaechen (Polygone)
      const pts = e.geometry.map(g => L(g.lat, g.lon)); if (pts.length < 4 || !pts.some(inside)) continue;
      if (t.amenity === 'parking' && /^(multi-storey|underground|rooftop)$/.test(t.parking || '')) continue;
      cnt.park = (cnt.park || 0) + 1; lines.push(['park', pts.flat(), { u: /unpaved|gravel|dirt|ground|compacted|fine_gravel|grass/.test(t.surface || '') ? 1 : 0, c: t.capacity ? +t.capacity || 0 : 0 }]); continue;
    }
    if (t.natural === 'tree_row') {   // Baumreihen: Einzelbaeume alle ~9 m entlang der Linie
      const pts = e.geometry.map(g => L(g.lat, g.lon)); let acc = 0;
      for (let i = 0; i + 1 < pts.length; i++) { const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz) || 1;
        for (let d = acc; d < l; d += 9) { const p = [Math.round((pts[i][0] + dx * d / l) * 10) / 10, Math.round((pts[i][1] + dz * d / l) * 10) / 10]; if (inside(p)) { nodes.push(['tree', ...p, 0]); cnt.tree = (cnt.tree || 0) + 1; } }
        acc = ((acc - l) % 9 + 9) % 9; }
      continue;
    }
    let k = null;
    if (t.barrier === 'fence') k = 'fence'; else if (/^(wall|retaining_wall|city_wall)$/.test(t.barrier)) k = 'wall'; else if (t.barrier === 'hedge') k = 'hedge';
    else if (t.barrier === 'guard_rail') k = 'rail'; else if (t.power) k = 'line'; else if (t.highway) k = 'road';
    if (!k) continue;
    const pts = e.geometry.map(g => L(g.lat, g.lon)); if (!pts.some(inside)) continue;
    cnt[k] = (cnt[k] || 0) + 1;
    if (k === 'road') {
      const W0 = { trunk: 8, primary: 7.5, secondary: 7, tertiary: 6.2, unclassified: 5.2, residential: 5, living_street: 4.2, service: 3.2, pedestrian: 4, footway: 1.8, cycleway: 2.2, path: 1.2, track: 3 };
      const lanes = parseInt(t.lanes) || 0, w = parseFloat(t.width) || (lanes > 2 && /^(trunk|primary|secondary|tertiary)$/.test(t.highway) ? lanes * 3.1 : 0) || W0[t.highway] || 5;
      const sw = /^(both|yes)$/.test(t.sidewalk || '') ? 3 : t.sidewalk === 'left' ? 1 : t.sidewalk === 'right' ? 2 : 0;   // Buergersteige: 3 = beidseitig, 1 links, 2 rechts
      if (t.tunnel === 'yes' || t.tunnel === 'building_passage') continue;
      lines.push([k, pts.flat(), { w, h: t.highway, br: t.bridge ? 1 : 0, u: /unpaved|gravel|dirt|ground|compacted|fine_gravel|grass/.test(t.surface || '') || (/^(track|path)$/.test(t.highway) && !/asphalt|paved|concrete|paving/.test(t.surface || '')) ? 1 : 0, sw, rb: t.junction === 'roundabout' ? 1 : 0, ow: t.oneway === 'yes' ? 1 : 0, l: lanes, pk: /parallel|diagonal|perpendicular|yes/.test([t['parking:lane:both'], t['parking:lane:left'], t['parking:lane:right'], t['parking:both'], t['parking:left'], t['parking:right']].join(' ')) ? 1 : 0, cy: /lane|track|yes|share_busway/.test([t.cycleway, t['cycleway:both'], t['cycleway:left'], t['cycleway:right']].join(' ')) ? 1 : 0, ms: parseInt(t.maxspeed) || 0 }]);
    } else lines.push([k, pts.flat()]);
  }
}
console.log('Gefunden:', JSON.stringify(cnt));
fs.writeFileSync(new URL(`../src/routes/${NAME}.objekte.json`, import.meta.url), JSON.stringify({ name: NAME, origin: ROUTE.origin, nodes, lines }));
console.log(`Fertig: ${nodes.length} Punkte, ${lines.length} Linien → src/routes/${NAME}.objekte.json`);
