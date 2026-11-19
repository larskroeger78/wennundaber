// Fehlermeldungen aus dem Spiel -> Google-Sheet (Apps-Script-Webhook). Umgebungsvariablen: REPORT_WEBHOOK_URL, REPORT_SECRET
import { json } from './_lib/token.js';
import { createHash } from 'node:crypto';

const hits = new Map();   // Ratenbegrenzung pro Gerät (nur Hash, nicht gespeichert; best effort je Serverinstanz)
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const CATS = ['Trainer/Bluetooth', 'Grafik/Ruckeln', 'Strecke/Gelände', 'Sound', 'Sonstiges'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  try {
    const b = req.body || {};
    if (b.hp) return json(res, 200, { ok: true });   // Honeypot: Bots füllen das versteckte Feld
    const msg = clean(b.msg, 2000);
    if (msg.length < 10) return json(res, 400, { error: 'Bitte beschreibe das Problem etwas genauer (mindestens 10 Zeichen).' });
    const url = process.env.REPORT_WEBHOOK_URL, secret = process.env.REPORT_SECRET;
    if (!url || !secret) return json(res, 503, { error: 'Meldungen sind gerade nicht eingerichtet.' });

    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket && req.socket.remoteAddress || '');
    const key = createHash('sha256').update(ip + '|' + (req.headers['user-agent'] || '')).digest('hex').slice(0, 16);
    const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < 3600e3);
    if (arr.length >= 5) return json(res, 429, { error: 'Zu viele Meldungen. Bitte versuche es später noch einmal.' });
    arr.push(now); hits.set(key, arr);
    if (hits.size > 5000) hits.clear();

    const m = b.meta || {};
    const row = {
      secret,
      cat: CATS.indexOf(b.cat) >= 0 ? b.cat : 'Sonstiges',
      route: clean(m.route, 40), pos: clean(m.pos, 20), msg,
      device: clean(m.device, 160), gfx: clean(m.gfx, 20), trainer: clean(m.trainer, 60),
      ver: clean(process.env.VERCEL_GIT_COMMIT_SHA, 7) || 'lokal',
      contact: clean(b.contact, 120),
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(row), redirect: 'follow' });
    if (!r.ok) throw new Error('Webhook ' + r.status);
    json(res, 200, { ok: true });
  } catch (e) {
    console.error('report', e && e.message);
    json(res, 500, { error: 'Senden fehlgeschlagen. Bitte später noch einmal versuchen.' });
  }
}
