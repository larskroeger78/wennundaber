import { verify, json } from './_lib/token.js';
export default function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  let d = null;
  try { d = verify(req.body && req.body.token); } catch (e) { return json(res, 500, { ok: false }); }
  json(res, 200, { ok: !!d });
}
