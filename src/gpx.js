// GPX-Import im Browser: liest Track-/Routenpunkte, rechnet in Meter um (Ost/Nord/Höhe), glättet und resampelt auf 2 m.
// Ergebnis hat dasselbe Format wie src/routes/*.json und wird lokal im Browser (localStorage) gespeichert – nichts geht an einen Server.
const IDX = 'miworu_gpx_idx', PRE = 'miworu_gpx_', MAX_KM = 60;
// Gespeicherte Strecken: Index (Name, Länge) + je Strecke ein eigener Eintrag im Browser-Speicher
export function listRoutes() { try { return JSON.parse(localStorage.getItem(IDX) || '[]'); } catch (e) { return []; } }
export function loadRoute(id) { try { const s = localStorage.getItem(PRE + id); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
export function saveRoute(route, name) {
  const id = Date.now().toString(36);
  route.name = (name || route.name || 'Eigene Strecke').trim().slice(0, 40);
  try {
    localStorage.setItem(PRE + id, JSON.stringify(route));
    const idx = listRoutes(); idx.push({ id, name: route.name, km: Math.round(route.km * 10) / 10 });
    localStorage.setItem(IDX, JSON.stringify(idx));
  } catch (e) {
    try { localStorage.removeItem(PRE + id); } catch (_) {}
    throw new Error('Kein Platz mehr im Browser-Speicher (oder Speicher gesperrt, z. B. privates Fenster). Bitte eine alte Strecke löschen.');
  }
  return id;
}
export function renameRoute(id, name) {
  name = (name || '').trim().slice(0, 40); if (!name) return;
  const idx = listRoutes(), e = idx.find(x => x.id === id), r = loadRoute(id);
  if (e) e.name = name; if (r) r.name = name;
  try { localStorage.setItem(IDX, JSON.stringify(idx)); if (r) localStorage.setItem(PRE + id, JSON.stringify(r)); } catch (_) {}
}
export function deleteRoute(id) {
  try { localStorage.removeItem(PRE + id); localStorage.setItem(IDX, JSON.stringify(listRoutes().filter(x => x.id !== id))); } catch (_) {}
}
export function parseGpx(text, fallbackName) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Das ist keine gültige GPX-Datei.');
  let nodes = Array.from(doc.getElementsByTagName('trkpt'));
  if (nodes.length < 2) nodes = Array.from(doc.getElementsByTagName('rtept'));
  const P = [];
  for (const n of nodes) {
    const lat = parseFloat(n.getAttribute('lat')), lon = parseFloat(n.getAttribute('lon'));
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const el = n.getElementsByTagName('ele')[0], ele = el ? parseFloat(el.textContent) : NaN;
    P.push({ lat, lon, ele: isFinite(ele) ? ele : NaN });
  }
  if (P.length < 2) throw new Error('Keine Streckenpunkte gefunden (erwartet: Track- oder Routenpunkte).');
  const lat0 = P[0].lat, lon0 = P[0].lon, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 111132;
  const A = [];
  for (const p of P) {
    const x = (p.lon - lon0) * kx, y = (p.lat - lat0) * ky, l = A[A.length - 1];
    if (l && Math.hypot(x - l.x, y - l.y) < 0.5) { if (isNaN(l.e) && !isNaN(p.ele)) l.e = p.ele; continue; }
    A.push({ x, y, e: p.ele });
  }
  if (A.length < 2) throw new Error('Die Strecke besteht nur aus einem Punkt.');
  // Höhen: fehlende Werte auffüllen; ganz ohne Höhe wird die Strecke flach
  const have = A.map((a, i) => isNaN(a.e) ? -1 : i).filter(i => i >= 0);
  if (!have.length) A.forEach(a => a.e = 0);
  else {
    for (let i = 0; i < A.length; i++) if (isNaN(A[i].e)) {
      let a = i - 1; while (a >= 0 && isNaN(A[a].e)) a--;
      let b = i + 1; while (b < A.length && isNaN(A[b].e)) b++;
      A[i].e = a < 0 ? A[b].e : b >= A.length ? A[a].e : A[a].e + (A[b].e - A[a].e) * (i - a) / (b - a);
    }
  }
  const cum = [0];
  for (let i = 1; i < A.length; i++) cum.push(cum[i - 1] + Math.hypot(A[i].x - A[i - 1].x, A[i].y - A[i - 1].y));
  const L = cum[cum.length - 1];
  if (L < 300) throw new Error('Die Strecke ist kürzer als 300 m.');
  if (L > MAX_KM * 1000) throw new Error('Die Strecke ist ' + (L / 1000).toFixed(0) + ' km lang. Mehr als ' + MAX_KM + ' km sind zu schwer für den Browser – bitte kürzen.');
  const n = Math.floor(L / 2) + 1, X = new Float32Array(n), Y = new Float32Array(n), E = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    const s = i * 2; while (j < A.length - 2 && cum[j + 1] < s) j++;
    const f = Math.min(1, Math.max(0, (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1)));
    X[i] = A[j].x + (A[j + 1].x - A[j].x) * f; Y[i] = A[j].y + (A[j + 1].y - A[j].y) * f; E[i] = A[j].e + (A[j + 1].e - A[j].e) * f;
  }
  for (let pass = 0; pass < 3; pass++) {    // GPS-Höhenrauschen glätten (±16 m)
    const o = E.slice();
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -8; k <= 8; k++) { const q = i + k; if (q >= 0 && q < n) { s += o[q]; c++; } } E[i] = s / c; }
  }
  let mn = 1e9; for (let i = 0; i < n; i++) mn = Math.min(mn, E[i]);
  const tn = doc.getElementsByTagName('trk')[0], nm = tn && tn.getElementsByTagName('name')[0];
  const name = ((nm && nm.textContent.trim()) || fallbackName || 'Eigene Strecke').slice(0, 60);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([Math.round(X[i] * 10) / 10, Math.round(Y[i] * 10) / 10, Math.round(E[i] * 10) / 10]);
  return { name, origin: [lat0, lon0], step: 2, nhn0: Math.floor(mn), hasEle: have.length > 0, km: L / 1000, pts };
}
