// PayPal Orders v2 (Server-seitig). Zugangsdaten nur aus Umgebungsvariablen.
export const MIN = 1, MAX = 500;   // Support: frei waehlbar von 1 bis 500 Euro
export const cleanAmount = (a) => { const n = Math.round(parseFloat(String(a).replace(',', '.')) * 100) / 100; if (!isFinite(n) || n < MIN || n > MAX) throw new Error('Betrag muss zwischen 1 und 500 Euro liegen'); return n.toFixed(2); };
export const CURRENCY = 'EUR';

const base = () => (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

export async function accessToken() {
  const id = process.env.PAYPAL_CLIENT_ID, sec = process.env.PAYPAL_SECRET;
  if (!id || !sec) throw new Error('PayPal-Zugangsdaten fehlen');
  const r = await fetch(base() + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + sec).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); console.error('PayPal token', r.status, e.error, e.error_description); throw new Error('PayPal-Anmeldung fehlgeschlagen (' + r.status + (e.error ? ', ' + e.error : '') + ') - Client-ID/Secret/Modus pruefen'); }
  return (await r.json()).access_token;
}

export async function createOrder(amount) {
  const val = cleanAmount(amount), t = await accessToken();
  const r = await fetch(base() + '/v2/checkout/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ description: 'MIWORU - Support', amount: { currency_code: CURRENCY, value: val } }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const iss = (d.details && d.details[0] && d.details[0].issue) || d.name || ''; console.error('PayPal order', r.status, JSON.stringify(d).slice(0, 600)); throw new Error('Bestellung konnte nicht angelegt werden (' + r.status + (iss ? ', ' + iss : '') + ')'); }
  return d;
}

export async function captureOrder(orderID) {
  const t = await accessToken();
  const r = await fetch(base() + '/v2/checkout/orders/' + encodeURIComponent(orderID) + '/capture', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Zahlung nicht bestaetigt (' + r.status + ')');
  return d;
}

// Nur echte, abgeschlossene Zahlung ueber den richtigen Betrag zaehlt
export function paidOk(d) {
  const c = d && d.purchase_units && d.purchase_units[0] && d.purchase_units[0].payments && d.purchase_units[0].payments.captures && d.purchase_units[0].payments.captures[0];
  return !!(d && d.status === 'COMPLETED' && c && c.status === 'COMPLETED' && c.amount && c.amount.currency_code === CURRENCY && parseFloat(c.amount.value) >= MIN);
}
