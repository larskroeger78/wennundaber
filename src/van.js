// Lars' Van: Ford Transit L2H3 (Hochdach, lang) als 3D-Modell nach seinen Fotos.
// Lokale Achsen: +z = vorne, +x = rechts (in Fahrtrichtung), y = oben, Ursprung am Boden in der Fahrzeugmitte.
import * as THREE from 'three';

let SH = null;
const col = h => new THREE.Color(h);

function shared() {
  if (SH) return SH;
  const std = (c, r, m, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m }, extra || {}));
  SH = {
    paint: std(0xffffff, 0.42, 0.28, { vertexColors: true }),
    dark: std(0x1d2024, 0.7, 0.1),
    black: std(0x0f1012, 0.8, 0.05),
    glass: std(0x151c22, 0.12, 0.55, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    chrome: std(0xc4c8cc, 0.25, 0.85),
    trim: std(0xa9aeb3, 0.35, 0.6),
    tire: std(0x141414, 0.95, 0),
    rim: std(0x25272b, 0.5, 0.5),
    lampW: new THREE.MeshStandardMaterial({ color: 0xf4f7f8, roughness: 0.2, metalness: 0.1, emissive: 0x1a1c1c }),
    lampR: new THREE.MeshStandardMaterial({ color: 0xb3262a, roughness: 0.3, metalness: 0.1, emissive: 0x3a0a0c }),
    awn: std(0x33373b, 0.7, 0.15),
    board: std(0x1b1c1e, 0.85, 0.1),
    strap: std(0xb52a2a, 0.8, 0),
    bike: std(0x1a1b1d, 0.55, 0.4),
    shade: null,
  };
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.65, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  SH.shade = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

  // Karosserie: Querschnitte (abgerundetes Rechteck) entlang der Laenge
  const SILVER = col(0x9ea4aa), DARK = col(0x24272b), BONNET = col(0x202225), SPLIT = 0.96, YB = 0.43;
  const ST = [   // z, Oberkante, halbe Breite, Eckradius oben
    [-2.99, 2.68, 0.97, 0.16], [-2.95, 2.78, 1.01, 0.2], [-2.82, 2.82, 1.035, 0.22], [1.0, 2.82, 1.035, 0.22], [1.35, 2.77, 1.03, 0.22],
    [1.7, 2.55, 1.03, 0.2], [1.95, 2.3, 1.02, 0.18], [2.2, 1.86, 1.01, 0.15], [2.5, 1.4, 1.0, 0.12], [2.65, 1.32, 0.99, 0.11],
    [2.9, 1.2, 0.96, 0.1], [2.99, 1.1, 0.93, 0.09],
  ];
  const ring = (yt, hw, rt, rb) => {
    const R = [];
    for (let k = 0; k <= 3; k++) { const a = -Math.PI / 2 + k * Math.PI / 6; R.push([hw - rb + rb * Math.cos(a), YB + rb + rb * Math.sin(a)]); }
    R.push([hw, SPLIT]); R.push([hw, Math.max(SPLIT + 0.01, Math.min(1.55, yt - rt - 0.01))]);
    for (let k = 0; k <= 4; k++) { const a = k * Math.PI / 8; R.push([hw - rt + rt * Math.cos(a), yt - rt + rt * Math.sin(a)]); }
    const L = R.slice().reverse().map(p => [-p[0], p[1]]);
    return R.concat(L);
  };
  const pos = [], cl = [], idx = [];
  let M = 0;
  ST.forEach(s => {
    const rg = ring(s[1], s[2], s[3], 0.08); M = rg.length;
    rg.forEach(p => {
      pos.push(p[0], p[1], s[0]);
      const top = p[1] > s[1] - s[3] - 0.001 && s[0] > 2.4;
      const c = p[1] < SPLIT + 0.002 ? DARK : top ? BONNET : SILVER;
      cl.push(c.r, c.g, c.b);
    });
  });
  for (let i = 0; i < ST.length - 1; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + (j + 1) % M, c = (i + 1) * M + j, d = (i + 1) * M + (j + 1) % M;
    idx.push(a, c, b, b, c, d);
  }
  const mk = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  let tmp = mk();   // Wicklung pruefen: Normale der Dachmitte muss nach oben zeigen, sonst Dreiecke drehen
  const ti = 4 * M + Math.floor(M / 2) - 1; if (tmp.attributes.normal.getY(ti) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const cap = (si, nz) => {   // Stirnflaechen, Wicklung nach Normale ausrichten
    const s = ST[si], rg = ring(s[1], s[2], s[3], 0.08), base = pos.length / 3;
    rg.forEach(p => { pos.push(p[0], p[1], s[0]); const c = p[1] < SPLIT + 0.002 ? DARK : SILVER; cl.push(c.r, c.g, c.b); });
    pos.push(0, (YB + s[1]) / 2, s[0]); cl.push(SILVER.r, SILVER.g, SILVER.b);
    const cc = base + rg.length, cy = (YB + s[1]) / 2;
    for (let j = 0; j < rg.length; j++) {
      const a = base + j, b = base + (j + 1) % rg.length;
      const cross = (rg[j][0]) * (rg[(j + 1) % rg.length][1] - cy) - (rg[j][1] - cy) * (rg[(j + 1) % rg.length][0]);   // z-Komponente von (a-c)x(b-c)
      if (cross * nz > 0) idx.push(cc, a, b); else idx.push(cc, b, a);
    }
  };
  cap(0, -1); cap(ST.length - 1, 1);
  const body = mk();
  SH.body = body;

  // Reifen (Drehkoerper), Felge, Radhaus
  const prof = [[0.26, -0.115], [0.33, -0.122], [0.385, -0.1], [0.406, -0.06], [0.409, 0], [0.406, 0.06], [0.385, 0.1], [0.33, 0.122], [0.26, 0.115]].map(p => new THREE.Vector2(p[0], p[1]));
  const tire = new THREE.LatheGeometry(prof, 20); tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.255, 0.255, 0.23, 14); rim.rotateZ(Math.PI / 2);
  SH.tireG = tire; SH.rimG = rim;
  SH.hubG = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10); SH.hubG.rotateZ(Math.PI / 2);
  SH.lugG = new THREE.CylinderGeometry(0.016, 0.016, 0.04, 6); SH.lugG.rotateZ(Math.PI / 2);
  SH.arcG = new THREE.TorusGeometry(0.47, 0.04, 6, 18, Math.PI); SH.arcG.rotateY(Math.PI / 2);
  SH.discG = new THREE.CircleGeometry(0.5, 18, 0, Math.PI); SH.discG.rotateY(Math.PI / 2);
  SH.box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  SH.cyl = (r, l, n, ax) => { const g = new THREE.CylinderGeometry(r, r, l, n || 10); if (ax === 'x') g.rotateZ(Math.PI / 2); if (ax === 'z') g.rotateX(Math.PI / 2); return g; };
  SH.ringG = new THREE.TorusGeometry(0.34, 0.03, 5, 16);
  return SH;
}

export function makeVan(withBikes) {
  const S = shared(), g = new THREE.Group(), wheels = [];
  const add = (geo, mat, x, y, z, parent) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); (parent || g).add(o); return o; };
  add(S.body, S.paint, 0, 0, 0);

  // Scheiben
  const ws = add(new THREE.PlaneGeometry(1.8, 1.07), S.glass, 0, 1.872, 2.237); ws.rotation.x = -Math.atan2(0.55, 0.92);
  const drv = new THREE.Shape(); [[0.98, 1.62], [2.2, 1.62], [2.13, 1.98], [1.62, 2.32], [0.98, 2.32]].forEach((p, i) => i ? drv.lineTo(p[0], p[1]) : drv.moveTo(p[0], p[1]));
  const dg = new THREE.ShapeGeometry(drv); dg.rotateY(-Math.PI / 2);
  add(dg, S.glass, -1.04, 0, 0); add(dg, S.glass, 1.04, 0, 0).scale.x = -1;
  const sw = new THREE.Shape(); [[-0.05, 1.5], [0.85, 1.5], [0.85, 2.08], [-0.05, 2.08]].forEach((p, i) => i ? sw.lineTo(p[0], p[1]) : sw.moveTo(p[0], p[1]));
  const sg = new THREE.ShapeGeometry(sw); sg.rotateY(-Math.PI / 2);
  add(sg, S.glass, -1.04, 0, 0); add(sg, S.glass, 1.04, 0, 0).scale.x = -1;

  [-1, 1].forEach(sx => {
    const X = sx * 1.038;
    add(S.box(0.01, 1.4, 0.012), S.dark, X, 1.62, 0.96);                                   // Tuerfugen
    add(S.box(0.01, 1.4, 0.012), S.dark, X, 1.62, 2.28);
    add(S.box(0.01, 0.012, 3.1), S.dark, X, 1.0, -1.35); add(S.box(0.01, 0.012, 3.1), S.dark, X, 2.42, -1.35);   // Feld der Schiebetuer
    add(S.box(0.01, 1.42, 0.012), S.dark, X, 1.71, -2.9);
    add(S.box(0.025, 0.025, 1.7), S.chrome, X, 1.28, -0.72);                               // Zierleiste
    add(S.box(0.04, 0.02, 0.15), S.dark, X, 1.52, 1.1);                                     // Griffe
    add(S.box(0.04, 0.02, 0.15), S.dark, X, 1.5, -0.05);
    add(S.box(0.07, 0.07, 3.0), S.trim, sx * 1.0, 0.5, -0.1);                               // Schweller
    add(S.box(0.08, 0.24, 0.11), S.black, sx * 1.16, 1.56, 2.22);                           // Spiegel
    add(S.box(0.2, 0.03, 0.03), S.black, sx * 1.07, 1.52, 2.2);
    add(S.box(0.1, 0.65, 0.09), S.lampR, sx * 0.985, 1.2, -3.0);                            // Heckleuchten
    add(S.box(0.1, 0.22, 0.09), S.lampW, sx * 0.985, 0.78, -3.0);
    add(S.box(0.3, 0.1, 0.06), S.lampW, sx * 0.72, 0.99, 3.0).rotation.y = sx * 0.12;      // Scheinwerfer
    [1.25, 1.82, 2.3].forEach(y => add(S.box(0.03, 0.09, 0.11), S.chrome, sx * 0.98, y, -3.0));   // Scharniere
    add(S.box(0.05, 0.05, 3.9), S.trim, sx * 0.9, 2.86, -0.75);                              // Dachreling
    [-1.75, 2.0].forEach(az => {                                                            // Radhaus, Reifen, Felge
      add(S.arcG, S.dark, sx * 1.04, 0.41, az);
      add(S.discG, S.black, sx * 1.034, 0.41, az).rotation.y = sx > 0 ? 0 : Math.PI;
      const w = new THREE.Group(); w.position.set(sx * 0.94, 0.41, az); g.add(w);
      add(S.tireG, S.tire, 0, 0, 0, w);
      add(S.rimG, S.rim, 0, 0, 0, w); add(S.hubG, S.chrome, sx * 0.13, 0, 0, w);
      for (let k = 0; k < 5; k++) { const ang = k * Math.PI * 2 / 5; add(S.lugG, S.chrome, sx * 0.12, Math.cos(ang) * 0.12, Math.sin(ang) * 0.12, w); }
      wheels.push(w);
    });
  });

  // Front: Grill, Zusatzscheinwerfer, Rammschutz
  add(S.box(1.18, 0.34, 0.05), S.black, 0, 1.0, 3.0);
  for (let k = 0; k < 3; k++) add(S.box(1.12, 0.018, 0.03), S.dark, 0, 0.9 + k * 0.1, 3.03);
  add(S.box(0.34, 0.07, 0.02), S.chrome, 0, 1.0, 3.04);
  add(S.box(1.5, 0.03, 0.05), S.black, 0, 0.44, 3.03);
  [-0.4, 0.4].forEach(x => { add(S.cyl(0.14, 0.09, 14, 'z'), S.black, x, 0.62, 3.08); add(S.cyl(0.115, 0.03, 14, 'z'), S.lampW, x, 0.62, 3.13); });
  add(S.box(1.1, 0.05, 0.05), S.black, 0, 0.8, 3.05);
  [-0.5, 0.5].forEach(x => add(S.box(0.34, 0.015, 0.1), S.black, x, 1.283, 2.55));          // Haubenluftung

  // Heck: Fuge, Griff, Logo, Bergungsboard mit Gurt, Stossfaenger, Kupplung
  add(S.box(0.012, 1.45, 0.012), S.dark, 0, 1.71, -3.0);
  add(S.box(0.1, 0.03, 0.03), S.dark, 0.08, 1.35, -3.01);
  add(S.box(0.16, 0.07, 0.015), S.chrome, 0, 1.0, -3.0);
  add(S.box(0.38, 1.12, 0.06), S.board, 0.62, 1.8, -3.04);
  for (let k = 0; k < 5; k++) add(S.box(0.3, 0.05, 0.065), S.black, 0.62, 1.4 + k * 0.2, -3.06);
  add(S.box(0.4, 0.04, 0.07), S.strap, 0.62, 1.55, -3.07);
  add(S.box(1.9, 0.18, 0.12), S.dark, 0, 0.52, -3.04);
  add(S.cyl(0.03, 0.2, 8, 'z'), S.chrome, 0, 0.52, -3.18);
  add(S.box(0.15, 0.16, 3.3), S.awn, 1.0, 2.74, -0.8);                                       // Markise
  add(S.cyl(0.008, 0.6, 5), S.black, -0.6, 3.1, 0.6);                                       // Antenne

  if (withBikes) {   // Heckfahrradtraeger mit zwei Fahrraedern
    add(S.box(1.4, 0.06, 0.5), S.dark, 0, 0.62, -3.5);
    add(S.box(0.08, 0.5, 0.08), S.dark, 0, 0.8, -3.25);
    [[-0.22, -3.62, 1], [0.24, -3.38, -1]].forEach(b => {
      const bk = new THREE.Group(); bk.position.set(b[0], 1.02, b[1]); bk.rotation.y = Math.PI / 2 * b[2]; g.add(bk);
      [-0.55, 0.55].forEach(zz => { add(S.ringG, S.tire, 0, 0, zz, bk).rotation.y = Math.PI / 2; });
      add(S.box(0.04, 0.04, 1.05), S.bike, 0, 0.18, 0, bk);
      add(S.box(0.04, 0.5, 0.04), S.bike, 0, 0.42, -0.2, bk).rotation.x = -0.25;
      add(S.box(0.04, 0.32, 0.04), S.bike, 0, 0.25, 0.4, bk).rotation.x = 0.3;
      add(S.box(0.5, 0.035, 0.035), S.bike, 0, 0.62, 0.45, bk);
      add(S.box(0.12, 0.04, 0.2), S.bike, 0, 0.7, -0.35, bk);
    });
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.0), S.shade);
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.castShadow = false; g.add(sh);
  g.userData.wheels = wheels;
  return g;
}
