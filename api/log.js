// Fahrtenprotokoll: Nickname, Strecke, Zeitpunkt -> Google-Sheet (gleicher Apps-Script-Webhook wie die Meldungen). Umgebungsvariablen: REPORT_WEBHOOK_URL, REPORT_SECRET
import { json } from './_lib/token.js';
import { createHash } from 'node:crypto';

const hits = new Map();   // Ratenbegrenzung pro Geraet (nur Hash, nicht gespeichert; best effort je Serverinstanz)
const clean = (v, n) => String(v == null ? '' : v).replace(/[^\p{L}\p{N} ._\-äöüÄÖÜß]/gu, '').replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  try {
    const b = req.body || {};
    const name = clean(b.name, 16), route = clean(b.route, 40);
    if (!name || !route) return json(res, 400, { ok: false });
    const url = process.env.REPORT_WEBHOOK_URL, secret = process.env.REPORT_SECRET;
    if (!url || !secret) return json(res, 200, { ok: false });   // nicht eingerichtet: Spiel laeuft trotzdem
    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket && req.socket.remoteAddress || '');
    const key = createHash('sha256').update(ip + '|' + (req.headers['user-agent'] || '')).digest('hex').slice(0, 16);
    const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < 3600e3);
    if (arr.length >= 20) return json(res, 200, { ok: false });
    arr.push(now); hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret, typ: 'fahrt', name, route }), redirect: 'follow' });
    if (!r.ok) throw new Error('Webhook ' + r.status);
    json(res, 200, { ok: true });
  } catch (e) {
    console.error('log', e && e.message);
    json(res, 200, { ok: false });
  }
}
