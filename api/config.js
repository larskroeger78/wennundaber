// Oeffentliche Angaben fuer den PayPal-Button (die Client-ID ist nicht geheim)
import { json } from './_lib/token.js';
export default function handler(req, res) {
  json(res, 200, { clientId: process.env.PAYPAL_CLIENT_ID || '', env: process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox', price: '5,00 €' });
}
