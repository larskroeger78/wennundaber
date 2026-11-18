import { json } from './_lib/token.js';
import { createOrder } from './_lib/paypal.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  try { const o = await createOrder(); json(res, 200, { id: o.id }); } catch (e) { json(res, 500, { error: String(e.message || e) }); }
}
