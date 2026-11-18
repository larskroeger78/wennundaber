// Freischalt-Token: base64url(Nutzdaten).HMAC-SHA256 — nur der Server kennt UNLOCK_SECRET
import crypto from 'node:crypto';

const b64 = (b) => Buffer.from(b).toString('base64url');

function secret() {
  const s = process.env.UNLOCK_SECRET;
  if (!s || s.length < 16) throw new Error('UNLOCK_SECRET fehlt oder ist zu kurz');
  return s;
}

export function sign(data) {
  const p = b64(JSON.stringify({ ...data, iat: Date.now() }));
  const h = crypto.createHmac('sha256', secret()).update(p).digest('base64url');
  return p + '.' + h;
}

export function verify(token) {
  try {
    const [p, h] = String(token || '').split('.');
    if (!p || !h) return null;
    const e = crypto.createHmac('sha256', secret()).update(p).digest('base64url');
    const a = Buffer.from(h), b = Buffer.from(e);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch (e) { return null; }
}

export function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
