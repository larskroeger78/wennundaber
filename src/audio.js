    // Abfahrten auf Schotter/Trail: nur leises, dumpfes Knistern (Steinchen, Laub) - tief gefiltert
    if (v > 0.6 && (surf === 1 || surf === 2)) {
      stoneAcc += dt * v * (surf === 1 ? 9 : 4);
      let n = stoneAcc | 0; stoneAcc -= n; n = Math.min(n, 6);
      while (n--) burst(t + Math.random() * dt, 0.03 + Math.random() * 0.04, 'lowpass', 380 + Math.random() * 520, 0.8, (surf === 1 ? 0.05 : 0.035) * (0.4 + Math.random()));
    }
// Prozeduraler Fahrsound (WebAudio, keine Dateien): Reifen je Untergrund, Freilauf, Wind, Voegel, Stoesse, Sprung, Bremse, Regen.
// Alles wird aus Rauschen und kurzen Impulsen erzeugt; AUDIO.init() muss aus einer Nutzergeste kommen (Start-Knopf).
export const AUDIO = (() => {
  let ctx = null, master = null, noise = null, on = true, vol = 0.8, ok = false;
  const N = {};              // Dauer-Klaenge: Name -> {g: GainNode, f: BiquadFilter}
  let birdT = 3, clickAcc = 0, stoneAcc = 0, rainAcc = 0, lastSurf = 0, brakeG = null;
  try { const v = localStorage.getItem('miworu_snd'); if (v === '0') on = false; } catch (e) {}

  function mkNoise() {
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function loop(type, freq, q) {   // Rauschen -> Filter -> Gain (Dauerklang)
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    s.loopStart = Math.random(); s.start(0, Math.random() * 1.5);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master);
    return { g, f };
  }
  function burst(t, dur, type, freq, q, gain, dest) {   // kurzer Rauschimpuls
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || master); s.start(t, Math.random() * 1.8, dur + 0.02);
  }
  function thump(t, f0, f1, dur, gain) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function chirp(t, f0, f1, dur, gain, vib) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.05; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function bird(t) {   // zwei, drei Arten: Meise (zwei Toene), Amsel-Triller, Taube
    const k = Math.random(), base = 2200 + Math.random() * 1600;
    if (k < 0.4) { for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) { chirp(t + i * 0.19, base, base * 1.25, 0.1, 0.05); chirp(t + i * 0.19 + 0.09, base * 1.25, base * 0.95, 0.08, 0.04); } }
    else if (k < 0.8) { let f = 1700 + Math.random() * 500; for (let i = 0; i < 7 + (Math.random() * 6 | 0); i++) { const f2 = f * (0.8 + Math.random() * 0.5); chirp(t + i * 0.11, f, f2, 0.1, 0.045, 28); f = f2; } }
    else { chirp(t, 480, 400, 0.28, 0.07); chirp(t + 0.34, 460, 380, 0.3, 0.07); chirp(t + 0.75, 470, 390, 0.4, 0.06); }
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = on ? vol : 0;
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
      noise = mkNoise();
      N.wind = loop('lowpass', 500, 0.5);       // Fahrtwind
      N.amb = loop('bandpass', 700, 0.4);       // Hintergrund: Blaetter, leises Rauschen
      N.asph = loop('bandpass', 420, 0.9);      // MTB-Stollenreifen auf Asphalt: tiefes, brummendes Abrollen
      N.road = loop('lowpass', 140, 0.7);       // Rollgeraeusch (Tiefe)
      N.trail = loop('bandpass', 900, 0.5);     // Waldboden: weiches Rascheln
      N.rain = loop('highpass', 3500, 0.4);     // Regen auf Laub
      N.rain2 = loop('bandpass', 1400, 0.4);
      brakeG = loop('bandpass', 3400, 7);
      // Freilaufnabe (Hope Pro 4: 44 Einrastpunkte): Saegezahn-Pulszug mit Frequenz = Radumdrehungen x 44, hell gefiltert -> schnarrendes Surren
      { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200; hp.Q.value = 0.9;
        const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 3600; bp.Q.value = 2.5; bp.gain.value = 9;
        const g = ctx.createGain(); g.gain.value = 0;
        o.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master); o.start();
        N.hub = { o, g, hp }; }
      ok = true;
    } catch (e) { ok = false; }
  }
  function set(n, v, dt, k) { const g = n.g.gain; g.value += (v - g.value) * Math.min(1, dt * (k || 6)); }

  // s: {v m/s, surf 0..2, pedal 0..1 (Treten), brake bool, running, forest 0..1, rain 0..1, day 0..1, dn (Gefaelle %)}
  function update(dt, s) {
    if (!ok || !ctx) return;
    const t = ctx.currentTime, v = s.running ? s.v : 0, sp = Math.min(1, v / 14);
    master.gain.value += ((on ? vol : 0) - master.gain.value) * Math.min(1, dt * 5);
    const surf = s.surf;
    // Wind: quadratisch mit Tempo, heller bei hoher Geschwindigkeit
    set(N.wind, (0.02 + 0.5 * sp * sp) * (s.running ? 1 : 0.3), dt, 4); N.wind.f.frequency.value = 350 + 1500 * sp;
    set(N.amb, (0.035 + 0.035 * s.forest) * (0.4 + 0.6 * s.day), dt, 1); N.amb.f.frequency.value = 600 + 600 * (1 - s.forest);
    // Reifen je Untergrund (weiche Ueberblendung)
    const rv = Math.min(1, v / 9);
    set(N.asph, surf === 0 ? 0.075 * rv : 0, dt, 5); N.asph.f.frequency.value = 330 + 220 * rv;   // nur auf Asphalt, tief
    set(N.road, surf === 0 ? 0.06 * rv : 0, dt, 5);
    set(N.trail, 0, dt, 5);
    // Schotter: knirschende Einzelimpulse (Steinchen), Trail: knackende Zweige/Blaetter
    if (v > 0.6 && (surf === 1 || surf === 2)) {
      stoneAcc += dt * v * (surf === 1 ? 20 : 7);
      let n = stoneAcc | 0; stoneAcc -= n; n = Math.min(n, 10);
      while (n--) burst(t + Math.random() * dt, 0.02 + Math.random() * 0.03, 'bandpass', (surf === 1 ? 1800 : 700) + Math.random() * 2400, 2 + Math.random() * 3, (surf === 1 ? 0.08 : 0.05) * (0.4 + Math.random()));
    }
    // Freilauf (0 Watt): Hope-Pro-Surren, Tonhoehe folgt dem Tempo (44 Einrastpunkte x Radumdrehungen pro Sekunde, Radumfang ca. 2,3 m)
    {const coast = v > 0.4 && s.pedal < 0.15 ? 1 : 0, f = Math.min(520, 44 * v / 2.3);
      N.hub.o.frequency.setTargetAtTime(Math.max(12, f), t, 0.03);
      set(N.hub, coast * (0.05 + 0.07 * Math.min(1, v / 9)), dt, coast ? 14 : 22);}
    // Bremse: hohes Quietschen bei Tempo
    set(brakeG, s.brake && v > 1.5 ? 0.025 * Math.min(1, v / 8) : 0, dt, 10);
    // Regen
    set(N.rain, 0.1 * s.rain, dt, 1.5); set(N.rain2, 0.09 * s.rain, dt, 1.5);
    // Voegel: tagsueber im Wald, selten auf offenem Feld
    birdT -= dt * (0.3 + 0.7 * s.forest) * s.day * (1 - 0.8 * s.rain);
    if (birdT <= 0) { birdT = 5 + Math.random() * 10; if (Math.random() < 0.3 + 0.7 * s.forest) bird(t + Math.random() * 0.3); }
  }
  // Einmalige Ereignisse
  function bump(a, surf) { if (!ok || !on) return; const t = ctx.currentTime, k = Math.min(1, a / 0.3); thump(t, 85, 45, 0.1, 0.14 * k); burst(t, 0.06, 'lowpass', 320, 0.7, 0.16 * k); }
  function takeoff() { if (!ok) return; const t = ctx.currentTime; burst(t, 0.12, 'lowpass', 320, 0.7, 0.14); thump(t, 80, 48, 0.14, 0.14); }
  function land(h) { if (!ok) return; const t = ctx.currentTime, k = Math.min(1, h / 0.4); thump(t, 85, 36, 0.24, 0.4 * k + 0.1); burst(t, 0.18, 'lowpass', 360, 0.7, 0.22 * k + 0.05); }
  function edge(a) { if (!ok) return; const t = ctx.currentTime, k = Math.min(1, a / 1.5); thump(t, 80, 40, 0.18, 0.22 * k + 0.05); burst(t, 0.1, 'lowpass', 300, 0.7, 0.14 * k); }
  function gear() { if (!ok) return; const t = ctx.currentTime; burst(t, 0.012, 'bandpass', 4200, 5, 0.1); burst(t + 0.06, 0.012, 'bandpass', 3000, 5, 0.08); }
  function toggle() { on = !on; try { localStorage.setItem('miworu_snd', on ? '1' : '0'); } catch (e) {} init(); return on; }
  // Browser starten Audio erst nach einer Nutzergeste (Klick, Taste, Touch): beim ersten Mal Kontext anlegen bzw. fortsetzen
  const wake = () => { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); };
  ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(ev => window.addEventListener(ev, wake, { passive: true }));
  return { init, get suspended() { return !ctx || ctx.state !== 'running'; }, update, bump, takeoff, land, edge, gear, toggle, get on() { return on; } };
})();
