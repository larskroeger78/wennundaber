// Alle Realismus-Daten fuer eine oder mehrere Strecken holen: Gebaeude (LoD2), Luftbild, Laserbaeume, Objekte/Strassen, 1-m-Gelaende.
// Aufruf: npm run real -- hagen            (eine Strecke)
//         npm run real -- hagen hemer      (mehrere)    |   npm run real -- alle
// Ein fehlgeschlagener Schritt bricht nicht ab, am Ende steht eine Uebersicht.
import { spawnSync } from 'node:child_process';
const ALLE = ['wuppertal', 'hagen', 'iserlohn', 'hemer', 'buellberg', 'dortmund'];
let names = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (names.includes('alle')) names = ALLE;
if (!names.length) { console.log('Aufruf: npm run real -- <strecke> [...]  (' + ['miworu', ...ALLE].join(', ') + ' oder alle)'); process.exit(1); }
const STEPS = [['lod2', 'Gebaeude (LoD2)'], ['dop', 'Luftbild'], ['canopy', 'Baeume aus Laserscan'], ['objekte', 'Objekte & Strassen'], ['dgm1', '1-m-Gelaende']];
const report = [];
for (const n of names) for (const [s, label] of STEPS) {
  console.log(`\n===== ${n}: ${label} =====`);
  const r = spawnSync('npm', ['run', s, '--', n], { stdio: 'inherit', shell: process.platform === 'win32' });
  report.push(`${r.status === 0 ? 'OK     ' : 'FEHLER '} ${n} – ${label}`);
}
console.log('\n===== Uebersicht =====\n' + report.join('\n'));
console.log('\nDanach:  git add src/routes && git commit -m "Realismus-Daten" && git push');
