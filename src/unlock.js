// Freischaltung der Strecken (alles ausser MIWORU): Token vom Server, lokal gemerkt.
// Die Pruefung geschieht auf dem Server (api/verify); hier liegt nur die Anbindung.
export const LOCKED = ['wuppertal', 'hagen', 'iserlohn', 'hemer', 'buellberg', 'dortmund'];
const K = 'miworu_unlock', KV = 'miworu_unlock_ok', DAYS30 = 30 * 864e5;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

const mark = (t) => ls.set(KV, JSON.stringify({ t: t.slice(-12), ts: Date.now() }));

// schnelle lokale Antwort fuers Menue: Token da und in den letzten 30 Tagen vom Server bestaetigt
export function hasPass() {
  const t = ls.get(K); if (!t) return false;
  try { const v = JSON.parse(ls.get(KV) || 'null'); return !!(v && v.t === t.slice(-12) && Date.now() - v.ts < DAYS30); } catch (e) { return false; }
}

// beim Start: ist das Token noch gueltig? Offline gilt die letzte Bestaetigung weiter.
export async function checkPass() {
  const t = ls.get(K); if (!t) return false;
  if (hasPass()) return true;
  try {
    const { data } = await post('/api/verify', { token: t });
    if (data.ok) { mark(t); return true; }
    ls.del(K); ls.del(KV);
  } catch (e) {}
  return false;
}

export function setToken(t) { ls.set(K, t); mark(t); }

export async function redeem(code) {
  const { data } = await post('/api/redeem', { code });
  if (data && data.ok && data.token) { setToken(data.token); return { ok: true }; }
  return { ok: false, error: (data && data.error) || 'Code nicht gültig.' };
}

export async function payConfig() {
  const r = await fetch('/api/config'); return r.json();
}

export function loadPayPal(clientId) {
  return new Promise((res, rej) => {
    if (window.paypal && window.paypal.Buttons) return res(window.paypal);
    const s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) + '&currency=EUR&intent=capture&locale=de_DE&components=buttons';
    s.onload = () => res(window.paypal); s.onerror = () => rej(new Error('PayPal konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
}

export const payCreate = async () => { const { data } = await post('/api/paypal-create'); if (!data.id) throw new Error(data.error || 'Bestellung fehlgeschlagen'); return data.id; };
export async function payCapture(orderID) {
  const { data } = await post('/api/paypal-capture', { orderID });
  if (data && data.ok && data.token) { setToken(data.token); return true; }
  throw new Error((data && data.error) || 'Zahlung nicht bestätigt');
}
