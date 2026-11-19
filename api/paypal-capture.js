import { sign, makeCode, json } from './_lib/token.js';
import { captureOrder, paidOk } from './_lib/paypal.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  const id = String((req.body && req.body.orderID) || '');
  if (!/^[A-Z0-9]{10,30}$/i.test(id)) return json(res, 400, { ok: false });
  try {
    const d = await captureOrder(id);
    if (!paidOk(d)) return json(res, 402, { ok: false, error: 'Zahlung nicht abgeschlossen' });
    json(res, 200, { ok: true, token: sign({ k: 'paid', o: id }), code: makeCode(id) });
  } catch (e) { json(res, 500, { ok: false, error: String(e.message || e) }); }
}
