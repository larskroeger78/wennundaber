// Gemeinsamer Overpass-Client: User-Agent (sonst 406), mehrere Server, Wartezeit + Wiederholung bei 429/504.
const SERVERS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const HEAD = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Accept': 'application/json',
  'User-Agent': 'miworu-wennundaber/0.5 (+https://github.com/larskroeger78/wennundaber)',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function overpass(query, rounds = 3, minElements = 0) {
  for (let round = 0; round < rounds; round++) {
    for (const url of SERVERS) {
      try {
        console.log('  →', new URL(url).host, '…');
        const r = await fetch(url, { method: 'POST', headers: HEAD, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(45000) });
        if (r.ok) {
          const j = await r.json(), n = (j.elements || []).length, rem = j.remark || '';
          if (/error|timed out|out of memory|too many/i.test(rem)) { console.log('   ', new URL(url).host, 'Meldung:', rem.slice(0, 90)); continue; }
          if (n < minElements) { console.log('   ', new URL(url).host, 'lieferte nur', n, 'Elemente (zu wenig, gibt es hier mehr) – nächster Server'); continue; }
          console.log('OK von', new URL(url).host, '·', n, 'Elemente'); return j;
        }
        console.log('   ', new URL(url).host, 'antwortet mit', r.status);
      } catch (e) { console.log('   ', new URL(url).host, 'Fehler:', e.name === 'TimeoutError' ? 'keine Antwort nach 45 s' : (e.cause && e.cause.code) || e.message); }
    }
    if (round < rounds - 1) { const w = 20 * (round + 1); console.log(`Alle Server belegt – warte ${w} s und versuche es erneut …`); await sleep(w * 1000); }
  }
  throw new Error('Overpass nicht erreichbar – in ein paar Minuten noch einmal versuchen.');
}

// Offline-Modus: --query gibt die Abfrage zum Einfügen in overpass-turbo.eu aus,
// --datei=pfad.json (mehrfach möglich) liest dort exportierte Rohdaten (JSON) statt die API zu fragen.
export const ARGS = process.argv.slice(2).filter(a => !a.startsWith('--'));
export const WANT_QUERY = process.argv.includes('--query');
export async function elementsOrNull() {
  const files = process.argv.filter(a => a.startsWith('--datei=')).map(a => a.slice(8));
  if (!files.length) return null;
  const fs = await import('node:fs');
  const els = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(j.elements)) throw new Error(f + ': keine Overpass-JSON-Datei (Feld "elements" fehlt)');
    console.log(f + ':', j.elements.length, 'Elemente'); els.push(...j.elements);
  }
  return els;
}
