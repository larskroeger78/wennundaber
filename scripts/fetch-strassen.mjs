// Holt die amtlichen Fahrbahnflaechen (ALKIS "Tatsaechliche Nutzung", vereinfachtes Schema, Geobasis NRW) per WFS
// und schreibt src/routes/<name>.strassen.json (Polygone in Spielkoordinaten: x = Ost, z = -Nord, Meter).
// Daraus misst das Spiel die echte Strassenbreite entlang der Strecke. Aufruf: npm run strassen -- miworu
// Daten © Geobasis NRW (Datenlizenz Deutschland – Zero).
import fs from 'node:fs';

const NAME = process.argv.slice(2).find(a => !a.startsWith('--')) || 'miworu';
const rd = f => JSON.parse(fs.readFileSync(new URL(`../src/routes/${f}`, import.meta.url), 'utf8'));
const ROUTEFILE = process.argv.find(a => a.startsWith('--route='))?.slice(8) || NAME;   // z. B. wuppertal --route=wuppertal2 (andere Strecke, gleiches Kartengebiet)
const ROUTE = rd(`${ROUTEFILE}.json`), DOP = rd(`${NAME}.dop.json`), a = DOP.aff;   // aff: UTM32 <-> Spielkoordinaten (E = E0 + ex*x + ez*z, N = N0 + nx*x + nz*z)
const BASE = 'https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht';
const det = a.ex * a.nz - a.ez * a.nx;
const toEN = (x, z) => [a.E0 + a.ex * x + a.ez * z, a.N0 + a.nx * x + a.nz * z];
const toXZ = (E, N) => { const e = E - a.E0, n = N - a.N0; return [(e * a.nz - a.ez * n) / det, (a.ex * n - a.nx * e) / det]; };

let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
for (const p of ROUTE.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
const M = 60, corners = [[x0 - M, z0 - M], [x1 + M, z0 - M], [x0 - M, z1 + M], [x1 + M, z1 + M]].map(c => toEN(c[0], c[1]));
const bb = [Math.min(...corners.map(c => c[0])), Math.min(...corners.map(c => c[1])), Math.max(...corners.map(c => c[0])), Math.max(...corners.map(c => c[1]))].map(v => v.toFixed(1));
console.log('Gebiet (UTM32):', bb.join(', '));

const get = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'miworu-wennundaber/0.5 (+https://github.com/larskroeger78/wennundaber)' }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' bei ' + url.slice(0, 120));
  return r.text();
};
// 1) Welche Objektarten gibt es?
const cap = await get(`${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`);
const names = [...cap.matchAll(/<(?:\w+:)?FeatureType[^>]*>\s*<(?:\w+:)?Name[^>]*>([^<]+)</g)].map(m => m[1].trim());
if (!names.length) console.log('Antwort des Dienstes (Anfang):\n' + cap.slice(0, 2500));
console.log('Objektarten im Dienst:', names.join(' | '));
const tn = process.argv.find(x => x.startsWith('--typ='))?.slice(6) || names.find(n => /nutzung/i.test(n) && !/gebaeude|gebäude/i.test(n)) || names.find(n => /nutzung/i.test(n));
if (!tn) { console.log('FEHLER: keine Nutzungs-Objektart gefunden. Schick mir die Liste oben, dann stelle ich den Namen ein (oder: npm run strassen -- miworu --typ=NAME).'); process.exit(1); }
console.log('Verwende:', tn);

// 2) Features im Gebiet (in Kacheln, damit die Antwort nicht zu gross wird)
let polys = []; const polysNeu = []; let members = 0, withFah = 0, sample = null; const tally = {};
const TILE = 1500, E0 = +bb[0], N0 = +bb[1], E1 = +bb[2], N1 = +bb[3];
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
for (let e = E0; e < E1; e += TILE) for (let n = N0; n < N1; n += TILE) {
  const box = [e, n, Math.min(e + TILE, E1), Math.min(n + TILE, N1)].map(v => v.toFixed(1)).join(',');
  const url = `${BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${encodeURIComponent(tn)}&SRSNAME=urn:ogc:def:crs:EPSG::25832&BBOX=${box},urn:ogc:def:crs:EPSG::25832&COUNT=20000`;
  let xml;
  try { xml = await get(url); } catch (err) { console.log('  Kachel fehlgeschlagen:', err.message); continue; }
  const mem = xml.split(/<(?:\w+:)?member>/).slice(1);
  for (const m of mem) {
    members++;
    const txt = strip(m.replace(/<(?:\w+:)?posList[^>]*>[^<]*<\/(?:\w+:)?posList>/g, ''));
    if (!sample) sample = txt.slice(0, 400);
    { const cat = txt.replace(/^urn:\S+\s+\S+\s+\S+\s+/, '').slice(0, 70); tally[cat] = (tally[cat] || 0) + 1; }
    const isFahrbahn = /fahrbahn/i.test(txt);
    if (isFahrbahn) withFah++;
    // Neues ALKIS-Schema (seit 2024): kein 'Fahrbahn' mehr, Flaechen heissen 'Strassenverkehr <Name>' bzw. 'Weg <Name>' (Begleitflaechen = Boeschung/Seitenstreifen werden ausgelassen)
    const catN = txt.replace(/^urn:\S+\s+\S+\s+\S+\s+/, '');
    const isNeu = /^(Stra(ß|ss)enverkehr|Weg)(\s|$)/i.test(catN) && !/begleitfl/i.test(catN);
    if (!(isFahrbahn || isNeu || (process.argv.includes('--alle-strassen') && /stra(ß|ss)e|verkehr/i.test(txt)))) continue;
    const pl = [...m.matchAll(/<(?:\w+:)?posList[^>]*>([^<]*)<\/(?:\w+:)?posList>/g)];
    if (!pl.length) continue;
    const dimM = /srsDimension="(\d)"/.exec(m), dim = dimM ? +dimM[1] : 2;
    const v = pl[0][1].trim().split(/\s+/).map(Number), P = [];
    for (let i = 0; i + 1 < v.length; i += dim) { const [x, z] = toXZ(v[i], v[i + 1]); P.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10); }
    if (P.length >= 6) { if (isFahrbahn || process.argv.includes('--alle-strassen')) polys.push(P); if (isNeu) polysNeu.push(P); }
  }
  console.log(`  Kachel ${box}: ${mem.length} Objekte`);
}
if (!polys.length && polysNeu.length) { polys = polysNeu; console.log('Hinweis: kein "Fahrbahn" im Dienst, nehme neues Schema (Strassenverkehr/Weg ohne Begleitflaechen)'); }
console.log('Objekte gesamt:', members, '· davon Fahrbahn:', withFah, '· Polygone:', polys.length);
if (!polys.length) {
  console.log('Objektarten im Gebiet (Anzahl · Text):'); Object.entries(tally).sort((x, y) => y[1] - x[1]).slice(0, 40).forEach(([k, v]) => console.log('  ' + v + ' · ' + k));
  console.log('FEHLER: keine Fahrbahnflaechen gefunden. Beispiel-Objekt (bitte an Claude schicken):\n', sample);
  console.log('Versuch mit allen Strassenverkehrsflaechen: npm run strassen -- ' + NAME + ' --alle-strassen');
  process.exit(1);
}
fs.writeFileSync(new URL(`../src/routes/${NAME}.strassen.json`, import.meta.url), JSON.stringify({ name: NAME, polys }));
console.log('OK: src/routes/' + NAME + '.strassen.json geschrieben (' + polys.length + ' Flaechen)');
