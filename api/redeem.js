// Community-Code einloesen; der Code steht nur hier auf dem Server
import crypto from 'node:crypto';
import { sign, checkCode, json } from './_lib/token.js';

const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export default function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  const code = String((req.body && req.body.code) || '').trim().toLowerCase();
  let paid = false; try { paid = checkCode(req.body && req.body.code); } catch (e) {}
  if (paid) return json(res, 200, { ok: true, token: sign({ k: 'paid-code' }) });
  const ok = same(code, String(process.env.CREW_CODE || 'crewonly').toLowerCase());
  if (!ok) return json(res, 200, { ok: false });
  try { json(res, 200, { ok: true, token: sign({ k: 'crew' }) }); } catch (e) { json(res, 500, { ok: false, error: 'Server nicht eingerichtet' }); }
}
