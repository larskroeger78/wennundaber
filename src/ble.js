// Bluetooth-Anbindung (Web Bluetooth, nur Chrome/Edge, nicht Safari/Firefox)
//  - Trainer: FTMS (0x1826) mit Widerstandssteuerung (Indoor Bike Simulation), Fallback Cycling Power (0x1818) nur Leistung
//  - Zwift Click: experimentell (proprietäres, teils verschlüsseltes Protokoll), siehe ClickPad
const U16 = n => '0000' + n.toString(16).padStart(4, '0') + '-0000-1000-8000-00805f9b34fb';
export const BLE_OK = typeof navigator !== 'undefined' && !!navigator.bluetooth;

// ---------- Parser (rein, testbar) ----------
// FTMS Indoor Bike Data (0x2AD2): Flags uint16, danach Felder in fester Reihenfolge, je nach Flag-Bit
export function parseIndoorBikeData(dv) {
  const f = dv.getUint16(0, true); let o = 2; const r = {};
  if (!(f & 1)) { r.speed = dv.getUint16(o, true) / 100 / 3.6; o += 2; }   // Bit0 = 0: Momentangeschwindigkeit (0,01 km/h) -> m/s
  if (f & 2) o += 2;                                                       // Durchschnittsgeschwindigkeit
  if (f & 4) { r.cadence = dv.getUint16(o, true) / 2; o += 2; }            // 0,5 U/min
  if (f & 8) o += 2;                                                       // Durchschnitts-Trittfrequenz
  if (f & 16) o += 3;                                                      // Gesamtstrecke (uint24)
  if (f & 32) o += 2;                                                      // Widerstandsstufe
  if (f & 64) { r.power = dv.getInt16(o, true); o += 2; }                  // Momentanleistung W
  return r;
}
// Cycling Power Measurement (0x2A63): Flags uint16, Leistung sint16, optional Rad-/Kurbeldaten
export function parsePower(dv, prev) {
  const f = dv.getUint16(0, true); let o = 2; const r = { power: dv.getInt16(o, true) }; o += 2;
  if (f & 1) o += 1;            // Pedal power balance
  if (f & 4) o += 2;            // Accumulated torque
  if (f & 16) o += 6;           // Wheel revolution data
  if (f & 32) {                 // Crank revolution data -> Trittfrequenz
    const rev = dv.getUint16(o, true), t = dv.getUint16(o + 2, true);
    if (prev) {
      const dr = (rev - prev.rev + 65536) % 65536, dt = ((t - prev.t + 65536) % 65536) / 1024;
      if (dt > 0 && dt < 3) r.cadence = dr / dt * 60;
    }
    r.crank = { rev, t };
  }
  return r;
}

// ---------- Trainer ----------
export class Trainer {
  constructor() { this.connected = false; this.name = ''; this.power = 0; this.cadence = 0; this.speed = 0; this.ctrl = null; this.canControl = false; this.status = ''; this.onChange = () => {}; this._q = Promise.resolve(); this._lastSent = null; this._lastT = 0; this._crank = null; }
  async connect() {
    if (!BLE_OK) throw new Error('Dieser Browser unterstützt kein Web Bluetooth. Bitte Chrome oder Edge am Mac/PC benutzen (nicht Safari).');
    const dev = await navigator.bluetooth.requestDevice({
      filters: [{ services: [U16(0x1826)] }, { services: [U16(0x1818)] }],
      optionalServices: [U16(0x1826), U16(0x1818)]
    });
    this.name = dev.name || 'Trainer';
    dev.addEventListener('gattserverdisconnected', () => { this.connected = false; this.canControl = false; this.power = 0; this.cadence = 0; this.status = 'Verbindung verloren'; this.onChange(); });
    const srv = await dev.gatt.connect();
    this.dev = dev; this.srv = srv;
    let ok = false;
    try {
      const s = await srv.getPrimaryService(U16(0x1826));
      const bd = await s.getCharacteristic(U16(0x2ad2));
      bd.addEventListener('characteristicvaluechanged', e => {
        const r = parseIndoorBikeData(e.target.value);
        if (r.power !== undefined) this.power = Math.max(0, r.power);
        if (r.cadence !== undefined) this.cadence = r.cadence;
        if (r.speed !== undefined) this.speed = r.speed;
      });
      await bd.startNotifications();
      try {
        this.ctrl = await s.getCharacteristic(U16(0x2ad9));
        await this.ctrl.startNotifications().catch(() => {});
        await this._write([0x00]);          // Request Control
        await this._write([0x07]);          // Start/Resume
        this.canControl = true;
      } catch (e) { this.canControl = false; }
      ok = true;
    } catch (e) { /* kein FTMS -> Fallback */ }
    if (!ok) {
      const s = await srv.getPrimaryService(U16(0x1818));
      const pm = await s.getCharacteristic(U16(0x2a63));
      pm.addEventListener('characteristicvaluechanged', e => {
        const r = parsePower(e.target.value, this._crank);
        this.power = Math.max(0, r.power); if (r.cadence !== undefined) this.cadence = r.cadence; if (r.crank) this._crank = r.crank;
      });
      await pm.startNotifications();
      this.canControl = false;
    }
    this.connected = true; this.status = this.canControl ? 'Leistung + Widerstand' : 'nur Leistung (Widerstand nicht steuerbar)';
    this.onChange();
  }
  _write(bytes) {
    const buf = new Uint8Array(bytes);
    this._q = this._q.then(() => this.ctrl.writeValueWithResponse(buf)).catch(() => {});
    return this._q;
  }
  // Steigung in % (Gelände) + Rollwiderstand-Beiwert; wird gedrosselt gesendet
  setGrade(gradePct, crr = 0.005, force = false) {
    if (!this.connected || !this.canControl) return;
    const g = Math.max(-10, Math.min(20, gradePct)), now = performance.now();
    if (!force && this._lastSent !== null && Math.abs(g - this._lastSent) < 0.2 && now - this._lastT < 3000) return;
    if (!force && now - this._lastT < 700) return;
    this._lastSent = g; this._lastT = now;
    const b = new Uint8Array(7), dv = new DataView(b.buffer);
    b[0] = 0x11; dv.setInt16(1, 0, true); dv.setInt16(3, Math.round(g * 100), true); b[5] = Math.round(crr / 0.0001); b[6] = Math.round(0.38 / 0.01 * 0.84);   // Wind 0, Steigung 0,01 %, Crr 0,0001, Cw 0,01 kg/m
    this._q = this._q.then(() => this.ctrl.writeValueWithResponse(b)).catch(() => {});
  }
  stop() { if (this.connected && this.canControl) this._write([0x08, 0x01]); }
}

// ---------- Zwift Click (experimentell) ----------
// Das Click nutzt Zwifts proprietäres Protokoll (Service FC82, Handshake "RideOn", Protobuf, bei neueren Geräten verschlüsselt).
// Ohne offizielle Spezifikation: wir koppeln, senden den RideOn-Handshake und protokollieren die Rohdaten.
// Erkannte Tastendrücke rufen onShift(+1/-1) auf. Zusätzlich funktionieren die Tasten + / - (oder Bild hoch/runter) im Spiel.
export class ClickPad {
  // Click v1 = ein Gerät mit + und −. Click v2 = zwei getrennte Geräte (links −, rechts +): beide koppeln, der erste Druck auf den LINKEN legt die Rollen fest.
  constructor() { this.devs = []; this.log = []; this.dlog = []; this.t0 = Date.now(); this.kaOk = 0; this.rxN = 0; this.rxT = 0; this.onShift = () => {}; this.onChange = () => {}; this.onNote = () => {}; this.onUnknown = () => {}; this.err = ''; this.calib = false; this.lastBit = -1; this._solo = { down: 0, role: 0 }; }
  dbg(m) { this.dlog.push(((Date.now() - this.t0) / 1000).toFixed(1).padStart(6) + ' s  ' + m); if (this.dlog.length > 80) this.dlog.shift(); }
  get connected() { return this.devs.some(x => !x.lost); }
  get name() { return this.devs.length > 1 ? this.devs.length + ' Click' : (this.devs[0] ? this.devs[0].name : ''); }
  async connect() {
    this.dbg('Koppeln gestartet');
    if (!BLE_OK) throw new Error('Kein Web Bluetooth in diesem Browser (Chrome/Edge verwenden).');
    if (this.devs.some(x => !x.lost)) throw new Error('Der Click ist schon verbunden.');
    for (const x of this.devs) x.gone = true;
    this.devs = [];
    const ADV = '0000fc82-0000-1000-8000-00805f9b34fb';          // Werbe-Kennung der Zwift-Controller
    const ZSV = '00000001-19ca-4651-86e5-fa29dcdd09d1';          // eigentlicher GATT-Dienst (Click / Play / Ride)
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [ADV] }, { services: [ZSV] }, { namePrefix: 'Zwift' }], optionalServices: [ADV, ZSV] });
    if (this.devs.some(x => x.id === dev.id)) throw new Error('Dieser Click ist schon verbunden – bitte den anderen wählen.');
    const d = { id: dev.id, name: dev.name || 'Zwift Click', down: 0, role: 0, dev, lost: false };
    dev.addEventListener('gattserverdisconnected', () => { this.dbg('GETRENNT (gattserverdisconnected) · KA ok ' + this.kaOk + ' · letztes Paket vor ' + ((Date.now() - this.rxT) / 1000).toFixed(0) + ' s'); clearTimeout(d.ht); d.down = 0; this._lost(d); });
    this.dbg('Geraet gewaehlt: ' + d.name);
    await this._setup(d);
    this.dbg('verbunden, Dienste/Benachrichtigungen aktiv');
    this.devs.push(d); this._reset(); this.onChange();
  }
  async _setup(d) {
    const ADV = '0000fc82-0000-1000-8000-00805f9b34fb', ZSV = '00000001-19ca-4651-86e5-fa29dcdd09d1';
    const srv = await d.dev.gatt.connect();
    let s = null;
    for (const u of [ZSV, ADV]) { try { s = await srv.getPrimaryService(u); if (s) break; } catch (e) { this.err = e.message; } }
    if (!s) throw new Error('Zwift-Dienst am Gerät nicht gefunden (Click im blauen Koppelmodus?).');
    const chars = await s.getCharacteristics();
    for (const c of chars) {
      if (c.properties.notify || c.properties.indicate) {
        try {
          if (!c._h) { c._h = e => this._rx(c.uuid, new Uint8Array(e.target.value.buffer), d); }
          c.removeEventListener('characteristicvaluechanged', c._h);
          c.addEventListener('characteristicvaluechanged', c._h);
          await c.startNotifications();
        } catch (e) { this.err = e.message; }
      }
    }
    const rx = chars.find(c => c.uuid.startsWith('00000003'));
    d.rx = rx;
    if (rx) { try { await rx.writeValueWithoutResponse(new Uint8Array([0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 0x01, 0x02])); } catch (e) { this.err = e.message; } }   // "RideOn" + Version
    d.lost = false;
  }
  // Verbindung weg (Click schlaeft ein / Funkabbruch): automatisch neu verbinden, ohne neues Koppeln
  async _lost(d) {
    if (!this.devs.includes(d) || d.reconnecting) return;
    this.dbg('Verbindung weg -> versuche neu zu verbinden'); d.lost = true; d.reconnecting = true; this.onChange();
    // Sobald der Click wieder funkt (Taste druecken), sofort verbinden
    try { if (d.dev.watchAdvertisements) { d.dev.addEventListener('advertisementreceived', () => { d.adv = true; }, { once: true }); d.dev.watchAdvertisements().catch(() => {}); } } catch (e) {}
    while (d.lost && !d.gone && this.devs.includes(d)) {
      for (let t = 0; t < 30 && !d.adv; t++) await new Promise(r => setTimeout(r, 100));
      d.adv = false;
      try { await this._setup(d); this.dbg('wieder verbunden'); this.onNote && this.onNote('Click wieder verbunden'); break; } catch (e) { this.err = e.message; this.dbg('Neuverbinden fehlgeschlagen: ' + e.message); }
      await new Promise(r => setTimeout(r, 1500));
    }
    d.reconnecting = false; this.onChange();
  }
  // Abbruch erkennen, auch wenn der Browser das Ereignis nicht liefert
  // Zusaetzlich alle 3 s RideOn als Lebenszeichen (Click schaltet sonst nach ca. 1 Minute in den Ruhezustand und trennt)
  watch() { setInterval(() => { for (const d of this.devs) if (!d.lost && d.rx && d.dev.gatt && d.dev.gatt.connected) d.rx.writeValueWithoutResponse(new Uint8Array([0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, 0x01, 0x02])).then(() => { this.kaOk++; if (this.kaOk % 20 === 1) this.dbg('Lebenszeichen #' + this.kaOk + ' ok · Pakete ' + this.rxN); }).catch(e => this.dbg('Lebenszeichen FEHLER: ' + (e && e.message || e))); }, 3000);
  setInterval(() => { for (const d of this.devs) if (!d.lost && d.dev.gatt && !d.dev.gatt.connected) this._lost(d); }, 2000); }
  _reset() { for (const x of this.devs) x.role = 0; this.calib = false; }
  // Behelf fuer den linken (verschluesselten) Click: Plus-Taste kurz = +1 (beim Loslassen), lang halten (>= LONG_MS) = −1
  _press(d, n) {
    this.lastBit = n;
    if (n !== 12) { this.onShift(-1); return; }   // andere Taste (z. B. Bit 8) = sofort −1
    clearTimeout(d.ht); d.fired = false;
    d.ht = setTimeout(() => { d.fired = true; this.onShift(-1); }, ClickPad.LONG_MS);
  }
  _release(d, n) {
    if (n !== 12) return;
    clearTimeout(d.ht);
    if (!d.fired) this.onShift(1);
  }
  _rx(uuid, b, d) {
    d = d || this._solo;
    this.rxN++; this.rxT = Date.now(); if (this.rxN <= 6 || this.rxN % 50 === 0) this.dbg('Paket #' + this.rxN + ' 0x' + b[0].toString(16) + ' len ' + b.length);
    // Button-Meldung (Typ 0x23, Protobuf): Feld 1 = 32-Bit-Maske, alle Bits 1 = nichts gedrückt, gedrückte Taste = Bit 0 (0x19 = Keepalive)
    if (b[0] === 0x23 && b.length >= 3) {
      const f = parsePb(b.slice(1));
      if (f[1] !== undefined) {
        const down = (~f[1]) >>> 0, fresh = down & ~d.down, rel = d.down & ~down;
        d.down = down;
        for (let n = 0; n < 32; n++) { if (fresh & (1 << n)) this._press(d, n); if (rel & (1 << n)) this._release(d, n); }
      }
    }
  }
}
ClickPad.LONG_MS = 450;
function parsePb(b) {   // minimale Protobuf-Auswertung: nur Varint-Felder (Wire-Typ 0), Rest wird übersprungen
  const out = {};
  let i = 0;
  const varint = () => { let v = 0, sh = 0; while (i < b.length) { const x = b[i++]; v += (x & 0x7f) * Math.pow(2, sh); sh += 7; if (!(x & 0x80)) break; } return v; };
  while (i < b.length) {
    const tag = varint(), wt = tag & 7, fn = tag >> 3;
    if (wt === 0) out[fn] = varint();
    else if (wt === 2) { const n = varint(); i += n; }
    else if (wt === 1) i += 8;
    else if (wt === 5) i += 4;
    else break;
  }
  return out;
}
