// Lädt die in assets.json gelisteten freien Texturen und das Himmelspanorama von Poly Haven
// nach public/assets/. Aufruf:  npm run assets
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await readFile(join(root, 'assets.json'), 'utf8'));
const res = cfg.aufloesung || '2k';
const headers = { 'User-Agent': 'wennundaber-game/0.5 (asset fetch)' };

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function files(id) {
  const r = await fetch('https://api.polyhaven.com/files/' + id, { headers });
  if (!r.ok) throw new Error('Poly Haven kennt "' + id + '" nicht (HTTP ' + r.status + ')');
  return r.json();
}

async function download(url, target) {
  if (await exists(target)) { console.log('  vorhanden  ' + target.replace(root, '.')); return; }
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error('Download fehlgeschlagen (HTTP ' + r.status + '): ' + url);
  await mkdir(dirname(target), { recursive: true });
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(target, buf);
  console.log('  geladen    ' + target.replace(root, '.') + '  (' + (buf.length / 1048576).toFixed(1) + ' MB)');
}

let fehler = 0;
for (const t of cfg.texturen || []) {
  console.log('Textur ' + t.id + ' – ' + t.zweck);
  try {
    const f = await files(t.id);
    for (const karte of cfg.karten) {
      const url = f?.[karte]?.[res]?.jpg?.url;
      if (!url) { console.log('  FEHLT      Karte "' + karte + '" in ' + res + ' nicht gefunden'); fehler++; continue; }
      await download(url, join(root, 'public/assets/textures', t.id, karte + '.jpg'));
    }
  } catch (e) { console.log('  FEHLER     ' + e.message); fehler++; }
}
for (const h of cfg.hdri || []) {
  console.log('Himmel ' + h.id + ' – ' + h.zweck);
  try {
    const f = await files(h.id);
    const url = f?.hdri?.[res]?.hdr?.url;
    if (!url) { console.log('  FEHLT      HDR in ' + res + ' nicht gefunden'); fehler++; continue; }
    await download(url, join(root, 'public/assets/hdri', h.id + '.hdr'));
  } catch (e) { console.log('  FEHLER     ' + e.message); fehler++; }
}
console.log(fehler ? '\nFertig mit ' + fehler + ' Problem(en) – bitte die Ausgabe oben an Claude schicken.' : '\nAlle Dateien liegen in public/assets/.');
process.exitCode = fehler ? 1 : 0;
