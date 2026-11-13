// Gemeinsamer Overpass-Client: User-Agent (sonst 406), mehrere Server, Wartezeit + Wiederholung bei 429/504.
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const HEAD = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Accept': 'application/json',
  'User-Agent': 'miworu-wennundaber/0.5 (+https://github.com/larskroeger78/wennundaber)',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function overpass(query, rounds = 3) {
  for (let round = 0; round < rounds; round++) {
    for (const url of SERVERS) {
      try {
        const r = await fetch(url, { method: 'POST', headers: HEAD, body: 'data=' + encodeURIComponent(query) });
        if (r.ok) { console.log('OK von', new URL(url).host); return await r.json(); }
        console.log(new URL(url).host, '→', r.status);
      } catch (e) { console.log(new URL(url).host, '→', e.message); }
    }
    if (round < rounds - 1) { const w = 20 * (round + 1); console.log(`Alle Server belegt – warte ${w} s und versuche es erneut …`); await sleep(w * 1000); }
  }
  throw new Error('Overpass nicht erreichbar – in ein paar Minuten noch einmal versuchen.');
}
