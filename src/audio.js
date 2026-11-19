// Prozeduraler Fahrsound (WebAudio, keine Dateien): Reifen je Untergrund, Freilauf, Wind, Voegel, Stoesse, Sprung, Bremse, Regen.
// Alles wird aus Rauschen und kurzen Impulsen erzeugt; AUDIO.init() muss aus einer Nutzergeste kommen (Start-Knopf).
export const AUDIO = (() => {
  let ctx = null, master = null, noise = null, on = true, vol = 0.8, ok = false;
  const N = {};              // Dauer-Klaenge: Name -> {g: GainNode, f: BiquadFilter}
  let rough = 0, tyreBuf = null, hubBuf = null, splashBuf = null, deerBuf = null, boarBuf = null, wildT = 50 + Math.random() * 60, uhuT = 20 + Math.random() * 40, kitzT = 40 + Math.random() * 80, specT = 25 + Math.random() * 50, birdT = 3, clickAcc = 0, stoneAcc = 0, rainAcc = 0, lastSurf = 0, brakeG = null;
  let hubN = 72; const HUBS = [0, 16, 32, 56, 72];   // Freilauf: aus oder Zaehnezahl der Sperrklinken-Zahnscheibe (weniger Zaehne = gröber, klickernder)
  try { const v = localStorage.getItem('miworu_snd'); if (v === '0') on = false; const h = +localStorage.getItem('miworu_hub'); if (HUBS.indexOf(h) >= 0 && localStorage.getItem('miworu_hub') !== null) hubN = h; } catch (e) {}

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

  function pan(t, p, g0, dur) {   // Ausgabe-Kette fuer Tierlaute: Position links/rechts, leicht gedaempft (weit weg)
    const g = ctx.createGain(); g.gain.value = g0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 4500; f.Q.value = 0.5;
    let node = g; if (ctx.createStereoPanner) { const sp = ctx.createStereoPanner(); sp.pan.value = p; g.connect(sp); sp.connect(f); } else g.connect(f);
    f.connect(master); return g;
  }
  function voice(t, dst, f0, f1, dur, shape, form, q, gain) {   // Saegezahn-Stimme durch Formantfilter mit Huellkurve
    const o = ctx.createOscillator(); o.type = shape; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = form; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp); bp.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.03);
  }
  function uhu(t) {   // Uhu in der Ferne: tiefes, weiches "huu - huuu", manchmal zweimal
    const p = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5), d = pan(t, p, 0.55), f = 300 + Math.random() * 50, n = Math.random() < 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) { const tt = t + i * 5.5;
      chirp0(tt, d, f * 1.04, f * 0.97, 0.3, 0.2); chirp0(tt + 0.62, d, f * 1.02, f * 0.9, 0.85, 0.24);
      chirp0(tt, d, f * 2.08, f * 1.9, 0.3, 0.04); chirp0(tt + 0.62, d, f * 2.04, f * 1.8, 0.85, 0.05); }
  }
  function chirp0(t, dst, f0, f1, dur, gain) {   // weicher Sinuston mit langsamem Ein- und Ausklingen, auf beliebigen Ausgang
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.03);
  }
  function specht(t) {   // Buntspecht trommelt weit entfernt: 1 bis 2 Wirbel aus schnellen, trockenen Schlaegen
    const p = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5), d = pan(t, p, 0.4), n = Math.random() < 0.4 ? 2 : 1;
    for (let r = 0; r < n; r++) { const t0 = t + r * (2 + Math.random() * 1.5), hits = 14 + (Math.random() * 6 | 0), dt = 0.034 + Math.random() * 0.006;
      for (let i = 0; i < hits; i++) { const tt = t0 + i * dt, a = 0.9 - 0.25 * (i / hits);
        burst(tt, 0.03, 'bandpass', 1300 + Math.random() * 300, 2.2, 0.16 * a, d);
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(620, tt); o.frequency.exponentialRampToValueAtTime(380, tt + 0.03);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.1 * a, tt); g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.035); o.connect(g); g.connect(d); o.start(tt); o.stop(tt + 0.05); } }
  }
  function kitz(t) {   // Rehkitz ruft nach der Mutter: duenne, klagende Fieptoene (steigend-fallend), drei bis fuenf Rufe, werden leiser
    const p = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.55), d = pan(t, p, 0.5), n = 3 + (Math.random() * 3 | 0), f = 4800 + Math.random() * 900;
    for (let i = 0; i < n; i++) { const tt = t + i * (0.95 + Math.random() * 0.35), a = 0.12 * (1 - i * 0.14), fi = f * (1 + (Math.random() - 0.5) * 0.06);
      voice(tt, d, fi * 0.9, fi * 1.12, 0.2, 'sine', 5200, 3, a); voice(tt + 0.19, d, fi * 1.12, fi * 0.8, 0.3, 'sine', 5000, 3, a * 0.9);
      voice(tt, d, fi * 1.8, fi * 2.1, 0.2, 'sine', 9000, 3, a * 0.12); }
  }
  function wildlife(t) {
    const k = Math.random(), p = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5);
    if (k < 0.45) {   // Wildschwein: zwei bis vier kurze, tiefe Grunzer
      const d = pan(t, p, 0.9), n = 2 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) { const tt = t + i * (0.32 + Math.random() * 0.12), f = 85 + Math.random() * 30;
        voice(tt, d, f * 1.25, f * 0.8, 0.26, 'sawtooth', 260 + Math.random() * 80, 2.2, 0.35);
        voice(tt, d, f * 2.5, f * 1.6, 0.2, 'sawtooth', 520, 1.8, 0.1); }
    } else if (k < 0.8) {   // Reh: heiseres, rauhes Bellen (Schrecken), drei bis fuenf Rufe
      const d = pan(t, p, 0.8), n = 3 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) { const tt = t + i * 0.55, f = 300 + Math.random() * 40;
        voice(tt, d, f, f * 0.85, 0.22, 'sawtooth', 900, 1.6, 0.22); burst(tt, 0.2, 'bandpass', 1100, 1.2, 0.05, d); }
    } else {   // Rehkitz: hohes, duennes Fiepen
      const d = pan(t, p, 0.6), f = 6200 + Math.random() * 900;
      for (let i = 0; i < 2; i++) { const tt = t + i * 0.55;
        voice(tt, d, f, f * 0.78, 0.38, 'sine', 5600, 4, 0.1); }
    }
  }
  function call(kind, vg, p) {   // Ruf eines Nachtwild-Tieres kurz vor dem Weggehen (vg 0..1 = Entfernung, p = -1..1 links/rechts)
    if (!ok || !on || vg <= 0.02) return; const t = ctx.currentTime + 0.02, d = pan(t, p || 0, vg);
    const rb = (kind === 'boar' || kind === 'piglet') ? boarBuf : deerBuf;
    if (rb) {   // echte Aufnahme, leise, jedes Tier ruft nur einmal (Rufe duerfen sich ueberlagern)
      const src = ctx.createBufferSource(); src.buffer = rb;
      src.playbackRate.value = (kind === 'piglet' ? 1.55 : kind === 'doe' ? 1.18 : kind === 'stag' ? 0.86 : 0.95 + Math.random() * 0.12) * (0.96 + Math.random() * 0.08);
      const gg = ctx.createGain(); gg.gain.value = (rb === boarBuf ? 0.5 : 0.16) * (kind === 'piglet' ? 0.7 : 1); src.connect(gg); gg.connect(d); src.start(t); return;
    }
    if (kind === 'boar') {   // Wildschwein: zwei, drei tiefe Grunzer, am Ende ein kurzes Quieken
      const n = 2 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++) { const tt = t + i * 0.34, f = 80 + Math.random() * 25;
        voice(tt, d, f * 1.3, f * 0.75, 0.3, 'sawtooth', 240 + Math.random() * 70, 2.2, 0.6); voice(tt, d, f * 2.6, f * 1.5, 0.22, 'sawtooth', 520, 1.8, 0.16); burst(tt, 0.18, 'lowpass', 500, 0.8, 0.1, d); }
      voice(t + n * 0.34, d, 1300, 1700, 0.18, 'sawtooth', 1500, 3, 0.07);
    } else if (kind === 'stag') {   // Hirsch: tiefes Roehren mit Vibrato, 2 s, am Ende grunzig auslaufend
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(118, t + 0.45); o.frequency.linearRampToValueAtTime(84, t + 1.9);
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 7; lg.gain.value = 5; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 2.1);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 420; f1.Q.value = 2.5; const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 900; f2.Q.value = 2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.1, t + 0.3); g.gain.setValueAtTime(1.0, t + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(d); o.start(t); o.stop(t + 2.1);
      for (let i = 0; i < 3; i++) burst(t + 1.6 + i * 0.16, 0.12, 'lowpass', 400, 0.8, 0.22, d);
    } else {   // Reh: rauhes Bellen, drei, vier Rufe
      const n = 3 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++) { const tt = t + i * 0.5, f = 300 + Math.random() * 40;
        voice(tt, d, f, f * 0.85, 0.24, 'sawtooth', 900, 1.6, 0.5); burst(tt, 0.2, 'bandpass', 1100, 1.2, 0.1, d); }
    }
  }
  function splash(v) {   // Platschen beim Einfahren in eine Pfuetze, Wucht nach Tempo
    if (!ok || !on) return; const t = ctx.currentTime, k = Math.min(1, v / 9);
    if (splashBuf) {   // Aufnahme: Lautstaerke und Tonhoehe leicht nach Tempo, kleine Zufallsvariation
      const s = ctx.createBufferSource(); s.buffer = splashBuf; s.playbackRate.value = (0.94 + Math.random() * 0.12) * (0.95 + 0.1 * k);
      const g = ctx.createGain(), lp = ctx.createBiquadFilter(), pk = 0.055 * (0.45 + 0.55 * k);   // weicher: hohe Anteile gedaempft, kurzes Einblenden statt hartem Anschlag
      lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.4; s.playbackRate.value *= 0.88;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.08); s.connect(lp); lp.connect(g); g.connect(master); s.start(t); return;
    }
    burst(t, 0.28, 'bandpass', 1800, 0.7, 0.2 * k + 0.05); burst(t + 0.02, 0.4, 'lowpass', 650, 0.7, 0.24 * k + 0.05); thump(t, 160, 70, 0.12, 0.12 * k);
    for (let i = 0; i < 4; i++) burst(t + 0.06 + i * 0.07 + Math.random() * 0.04, 0.09, 'highpass', 2600, 0.6, (0.07 * k + 0.02) * (1 - i * 0.2));
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = on ? vol : 0;
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
      noise = mkNoise();
      N.wind = loop('lowpass', 500, 0.5);       // Fahrtwind
      N.pud = loop('bandpass', 2200, 0.7);      // Spritzen beim Durchfahren einer Pfuetze
      N.asph = loop('bandpass', 420, 0.9);      // MTB-Stollenreifen auf Asphalt: tiefes, brummendes Abrollen
      N.road = loop('lowpass', 140, 0.7);       // Rollgeraeusch (Tiefe)
      N.trail = loop('bandpass', 900, 0.5);     // Waldboden: weiches Rascheln
      N.rain = loop('highpass', 3500, 0.4);     // Regen auf Laub
      N.rain2 = loop('bandpass', 1400, 0.4);
      brakeG = loop('bandpass', 3400, 7);
      // Stollenreifen auf Asphalt: tiefes, raues Brummen. Zwei leicht verstimmte Saegezaehne (Schwebung = Rauheit), Tonhoehe folgt dem Tempo (Stollenreihen pro Sekunde),
      // dazu eine langsame Pulsation im Takt der Radumdrehung (die Stollenbloecke schlagen nacheinander auf)
      { const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'triangle'; o2.type = 'triangle'; o1.frequency.value = o2.frequency.value = 90;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 1.2;
        const am = ctx.createGain(); am.gain.value = 0.72; const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 3; lg.gain.value = 0.28; lfo.connect(lg); lg.connect(am.gain);
        const g = ctx.createGain(); g.gain.value = 0; o1.connect(lp); o2.connect(lp); lp.connect(am); am.connect(g); g.connect(master); o1.start(); o2.start(); lfo.start();
        N.tyre = { o1, o2, lfo, lp, g }; }
      // Freilaufnabe (Hope Pro 4: 44 Einrastpunkte): Saegezahn-Pulszug mit Frequenz = Radumdrehungen x 44, hell gefiltert -> schnarrendes Surren
      { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3600; hp.Q.value = 0.9;
        const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 5200; bp.Q.value = 2.2; bp.gain.value = 9;
        const g = ctx.createGain(); g.gain.value = 0;
        o.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master); o.start();
        N.hub = { o, g, hp, bp }; }
      ok = true;
      fetch('/assets/audio/hirsch.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { deerBuf = buf; }).catch(() => {});
      fetch('/assets/audio/wildschwein.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { boarBuf = buf; }).catch(() => {});
      fetch('/assets/audio/reifen.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => {   // echte Aufnahme: Reifen auf Asphalt, Loop, nur unterschwellig
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0.04; src.loopEnd = buf.duration - 0.04;
        const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(master); src.start(); N.tyreS = { src, g }; tyreBuf = buf; }).catch(() => {});
      fetch('/assets/audio/freilauf.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => {   // echte Freilauf-Aufnahme (16 Zaehne), als Loop; mehr Zaehne = schneller abgespielt
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0.04; src.loopEnd = buf.duration - 0.04;
        const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(master); src.start(); N.hubS = { src, g }; hubBuf = buf; }).catch(() => {});
      fetch('/assets/audio/pfuetze.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { splashBuf = buf; }).catch(() => {});   // echte Pfuetzen-Aufnahme
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
    // kein Grundrauschen: weder Wind in Baeumen noch Wasser; nur Fahrtwind, erst bei Tempo hoerbar
    set(N.wind, 0.09 * sp * sp * sp * (s.running ? 1 : 0), dt, 4); N.wind.f.frequency.value = 350 + 1500 * sp;
    // Reifen je Untergrund (weiche Ueberblendung)
    // Abrollen: nur auf Asphalt, hoerbar ab 15 km/h, dann weich einblenden und mit Tempo etwas lauter, aber nie aufdringlich
    const rk = Math.max(0, Math.min(1, (v - 4.0) / 1.2)) * Math.min(1, 0.7 + 0.3 * (v - 4.0) / 9);   // ab ca. 15 km/h hoerbar, ab 19 km/h voll
    rough = Math.max(0, rough - dt * 1.1); const duck = 1 - 0.9 * Math.min(1, rough);   // Poltern/Hubbel hat Vorrang: Abrollen tritt dann zurueck
    set(N.asph, surf === 0 ? 0.013 * rk * duck : 0, dt, 5); N.asph.f.frequency.value = 240 + 120 * Math.min(1, v / 14);   // nur noch ein Hauch Rauschen darunter (klang sonst wie Wind)
    set(N.road, surf === 0 ? 0.03 * rk * duck : 0, dt, 5);
    if (tyreBuf && N.tyreS) {   // Aufnahme statt Synthese: leise, Tonlage und Pegel folgen nur leicht dem Tempo
      N.tyreS.src.playbackRate.setTargetAtTime(0.9 + 0.2 * Math.min(1, v / 14), t, 0.1);
      set(N.tyreS, surf === 0 ? 0.13 * rk * duck * (0.6 + 0.4 * Math.min(1, v / 14)) : 0, dt, 4); set(N.tyre, 0, dt, 30); set(N.asph, 0, dt, 30); set(N.road, 0, dt, 30);
    } else
    { const T = N.tyre; T.j1 = (T.j1 || 0) + ((Math.random() - 0.5) * 9 * dt) - (T.j1 || 0) * 0.9 * dt; T.j2 = (T.j2 || 0) + ((Math.random() - 0.5) * 12 * dt) - (T.j2 || 0) * 1.3 * dt; T.j3 = (T.j3 || 0) + ((Math.random() - 0.5) * 7 * dt) - (T.j3 || 0) * 0.6 * dt;
      // unregelmaessig: Tonhoehe, Pulsation und Pegel driften leicht (Belagwechsel, Poren, Rillen), damit es nicht wie eine Maschine im Loop klingt
      const f = Math.max(55, Math.min(240, 20 + 11 * v)) * (1 + 0.035 * T.j1); T.o1.frequency.value = f; T.o2.frequency.value = f * (1.5 + 0.02 * T.j3); T.lfo.frequency.value = Math.max(1, v / 2.3 * 3 * (1 + 0.45 * T.j2)); T.lp.frequency.value = (350 + 30 * v) * (1 + 0.3 * T.j3);
      set(T, surf === 0 ? 0.055 * rk * duck * Math.max(0.55, 1 + 0.45 * T.j2) : 0, dt, 5); }
    set(N.trail, 0, dt, 5);
    // Abfahrten auf Schotter/Trail: nur leises, dumpfes Knistern (Steinchen, Laub) - tief gefiltert
    if (v > 0.6 && (surf === 1 || surf === 2)) {
      stoneAcc += dt * v * (surf === 1 ? 9 : 4);
      let n = stoneAcc | 0; stoneAcc -= n; n = Math.min(n, 6);
      while (n--) burst(t + Math.random() * dt, 0.03 + Math.random() * 0.04, 'lowpass', 380 + Math.random() * 520, 0.8, (surf === 1 ? 0.05 : 0.035) * (0.4 + Math.random()));
    }
    // Freilauf (0 Watt): Hope-Pro-Surren, Tonhoehe folgt dem Tempo (44 Einrastpunkte x Radumdrehungen pro Sekunde, Radumfang ca. 2,3 m)
    {const coast = v > 0.4 && s.pedal < 0.15 && hubN > 0 ? 1 : 0, f = Math.min(1700, hubN * 2.08 * v / 2.3);
      const k = hubN / 72;   // weniger Zaehne: tieferes, rauheres Schnarren, einzelne Klicks bei langsamer Fahrt
      N.hub.o.frequency.setTargetAtTime(Math.max(12, f), t, 0.03);
      N.hub.hp.frequency.setTargetAtTime(1500 + 2100 * k, t, 0.05); N.hub.bp.frequency.setTargetAtTime(2600 + 2600 * k, t, 0.05);
      const lvl = N.wind.g.gain.value + N.asph.g.gain.value + N.road.g.gain.value + N.tyre.g.gain.value + (N.tyreS ? N.tyreS.g.gain.value * 0.9 : 0) + (surf !== 0 ? 0.06 * Math.min(1, v / 10) : 0), mask = 1 - 0.62 * Math.min(1, lvl / 0.28);   // je mehr Wind und Abrollgeraeusch, desto staerker wird der Freilauf ueberdeckt (nie ganz weg)
      if (hubBuf && N.hubS) {   // Aufnahme: 16 Zaehne bei ca. 8 m/s; Abspielgeschwindigkeit = Zaehne/16 x Tempo/8
        N.hubS.src.playbackRate.setTargetAtTime(Math.max(0.12, Math.min(6, (hubN / 16) * (v / 8))), t, 0.04);
        set(N.hubS, 0.7 * mask * coast * (0.5 + 0.5 * Math.min(1, v / 9)), dt, coast ? 14 : 22); set(N.hub, 0, dt, 30);
      } else {
      set(N.hub, 0.32 * mask * coast * (0.05 + 0.07 * Math.min(1, v / 9)) * (1 + 0.5 * (1 - k)), dt, coast ? 14 : 22);
      if (coast && f < 75) { clickAcc += dt * f; let n = clickAcc | 0; clickAcc -= n; n = Math.min(n, 4); while (n--) burst(t + Math.random() * dt, 0.012, 'bandpass', 2400 + 1600 * k, 4, (0.03 + 0.03 * (1 - k)) * 0.6 * mask); } }}
    // Bremse: hohes Quietschen bei Tempo
    set(brakeG, s.brake && v > 1.5 ? 0.025 * Math.min(1, v / 8) : 0, dt, 10);
    // Pfuetze: Spritzen, solange man drin ist
    set(N.pud, !splashBuf && s.pud && v > 1.2 ? 0.1 * Math.min(1, v / 7) : 0, dt, 12);   // synthetisches Spritzen nur als Ersatz, solange die Aufnahme fehlt
    // Regen
    set(N.rain, 0.021 * s.rain, dt, 1.5); set(N.rain2, 0.0189 * s.rain, dt, 1.5);   // Regen: nochmal halbiert
    // Voegel: nur im Wald und nur am Tag
    birdT -= dt * (s.forest > 0.35 ? 0.4 + 0.6 * s.forest : 0) * s.day * (1 - 0.8 * s.rain);
    // Wild: ab und zu Wildschwein-Grunzen, Rehbock-Schrecken oder Kitz-Fiepen (selten, nur im Wald, am Tag und Abend)
    wildT -= dt * (s.forest > 0.35 && s.day > 0.25 && s.rain < 0.6 ? 1 : 0);
    if (wildT <= 0) { wildT = 70 + Math.random() * 110; wildlife(t + 0.1); }
    // Nachts (Nightride, Daemmerung): ab und zu Uhu, ferner Specht und rufendes Rehkitz
    uhuT -= dt * ((s.night || s.day < 0.35) && s.forest > 0.2 ? 1 : 0);
    if (uhuT <= 0) { uhuT = 60 + Math.random() * 100; uhu(t + 0.1); }
    specT -= dt * ((s.night || s.day < 0.35) && s.forest > 0.2 && s.rain < 0.5 ? 1 : 0);
    if (specT <= 0) { specT = 70 + Math.random() * 110; specht(t + 0.1); }
    kitzT -= dt * ((s.night || s.day < 0.35) && s.forest > 0.2 && s.rain < 0.6 ? 1 : 0);
    if (kitzT <= 0) { kitzT = 90 + Math.random() * 130; kitz(t + 0.1); }
    if (birdT <= 0) { birdT = 5 + Math.random() * 10; if (s.forest > 0.35) bird(t + Math.random() * 0.3); }
  }
  // Einmalige Ereignisse
  function bump(a, surf) { rough = Math.min(1.4, rough + 0.9); if (!ok || !on) return; const t = ctx.currentTime, k = Math.min(1, a / 0.3); thump(t, 85, 45, 0.1, 0.14 * k); burst(t, 0.06, 'lowpass', 320, 0.7, 0.16 * k); }
  function takeoff() { if (!ok) return; const t = ctx.currentTime; burst(t, 0.12, 'lowpass', 320, 0.7, 0.14); thump(t, 80, 48, 0.14, 0.14); }
  function land(h) { if (!ok) return; const t = ctx.currentTime, k = Math.min(1, h / 0.4); thump(t, 85, 36, 0.24, 0.4 * k + 0.1); burst(t, 0.18, 'lowpass', 360, 0.7, 0.22 * k + 0.05); }
  function edge(a) { if (!ok) return; const t = ctx.currentTime, k = Math.min(1, a / 1.5); thump(t, 80, 40, 0.18, 0.22 * k + 0.05); burst(t, 0.1, 'lowpass', 300, 0.7, 0.14 * k); }
  function gear() { if (!ok) return; const t = ctx.currentTime; burst(t, 0.012, 'bandpass', 4200, 5, 0.1); burst(t + 0.06, 0.012, 'bandpass', 3000, 5, 0.08); }
  function cycleHub() { hubN = HUBS[(HUBS.indexOf(hubN) + 1) % HUBS.length]; try { localStorage.setItem('miworu_hub', hubN); } catch (e) {} init(); return hubN; }
  function toggle() { on = !on; try { localStorage.setItem('miworu_snd', on ? '1' : '0'); } catch (e) {} init(); return on; }
  // Browser starten Audio erst nach einer Nutzergeste (Klick, Taste, Touch): beim ersten Mal Kontext anlegen bzw. fortsetzen
  const wake = () => { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); };
  ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(ev => window.addEventListener(ev, wake, { passive: true }));
  return { call, cycleHub, get hub() { return hubN; }, splash, init, get suspended() { return !ctx || ctx.state !== 'running'; }, update, bump, takeoff, land, edge, gear, toggle, get on() { return on; } };
})();
