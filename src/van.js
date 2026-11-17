// Ford Transit L2H3 (Lars' Van) als einfaches Low-Poly-Modell im Stil des Spiels (flache Lambert-Flaechen).
// Lokale Achsen: +z = vorne, +x = rechts (Fahrtrichtung), y = oben, Ursprung am Boden in der Fahrzeugmitte.
import * as THREE from 'three';

let SH = null;
function shared() {
  if (SH) return SH;
  const m = c => new THREE.MeshLambertMaterial({ color: c });
  // Seitenprofil (z vorwaerts, y hoch), ueber die Breite extrudiert
  const sh = new THREE.Shape();
  [[-2.99, 0.5], [2.99, 0.5], [2.99, 0.95], [2.93, 1.1], [2.35, 1.38], [1.75, 2.38], [1.25, 2.78], [-2.85, 2.78], [-2.99, 2.62]]
    .forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
  const body = new THREE.ExtrudeGeometry(sh, { depth: 1.9, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  body.rotateY(-Math.PI / 2); body.translate(0.95, 0, 0);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, w, n) => { const g = new THREE.CylinderGeometry(r, r, w, n); g.rotateZ(Math.PI / 2); return g; };
  SH = {
    body, box, cyl,
    silver: m(0x7a8690), dark: m(0x20252a), glass: m(0x1c242b), bonnet: m(0x22262a), tire: m(0x151515), rim: m(0x2a2c2f),
    lamp: m(0xe9eef0), tail: m(0xb02a2e), rail: m(0x6e7378), board: m(0x1d1e20), awn: m(0x3f4246), frame: m(0x1a1b1d),
    wheelG: cyl(0.41, 0.27, 12), rimG: cyl(0.25, 0.29, 8), arch: cyl(0.52, 0.2, 12),
    ring: new THREE.TorusGeometry(0.33, 0.028, 4, 12),
  };
  return SH;
}

export function makeVan(withBikes) {
  const S = shared(), g = new THREE.Group(), wheels = [];
  const add = (geo, mat, x, y, z, ry) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (ry) o.rotation.y = ry; o.castShadow = true; g.add(o); return o; };
  add(S.body, S.silver, 0, 0, 0);
  // dunkle Beplankung unten, Stossfaenger
  [[-2.62, 0.75], [0.15, 2.75], [2.76, 0.5]].forEach(a => { [-1, 1].forEach(sx => add(S.box(0.06, 0.52, a[1]), S.dark, sx * 1.035, 0.74, a[0])); });
  add(S.box(2.0, 0.42, 0.22), S.dark, 0, 0.62, 3.0);      // Front-Stossfaenger
  add(S.box(2.0, 0.4, 0.2), S.dark, 0, 0.66, -3.04);      // Heck-Stossfaenger
  add(S.box(1.2, 0.34, 0.06), S.dark, 0, 1.0, 2.98);      // Grill
  // Haube (dunkle Folie), Scheibe, Seitenfenster
  const hood = add(S.box(1.86, 0.05, 0.75), S.bonnet, 0, 1.2, 2.62); hood.rotation.x = 0.35;
  const ws = add(S.box(1.8, 1.3, 0.05), S.glass, 0, 1.95, 2.0); ws.rotation.x = -0.9;
  [-1, 1].forEach(sx => {
    add(S.box(0.05, 0.75, 1.15), S.glass, sx * 1.0, 1.85, 1.85);   // Tuerfenster
    add(S.box(0.05, 0.5, 0.85), S.glass, sx * 1.0, 1.75, 0.45);    // Seitenfenster
    add(S.box(0.2, 0.2, 0.12), S.dark, sx * 1.12, 1.55, 2.2);      // Spiegel
    add(S.box(0.12, 0.12, 0.06), S.lamp, sx * 0.7, 0.98, 3.04);    // Scheinwerfer
    add(S.box(0.16, 0.5, 0.06), S.tail, sx * 0.95, 1.1, -3.08);    // Ruecklicht
    add(S.box(0.05, 0.05, 5.0), S.rail, sx * 0.9, 2.82, -0.3);     // Dachreling
  });
  [-0.38, 0.38].forEach(x => add(S.cyl(0.14, 0.1, 10), S.lamp, x, 0.62, 3.1).rotation.x = Math.PI / 2);   // Zusatzscheinwerfer
  add(S.box(0.45, 1.1, 0.05), S.board, 0.55, 1.75, -3.07);   // Bergungsboard an der Hecktuer
  add(S.box(0.2, 0.2, 3.1), S.awn, 1.08, 2.62, -0.2);         // Markise (Beifahrerseite)
  // Raeder
  [[-1.75], [2.0]].forEach(a => [-1, 1].forEach(sx => {
    add(S.arch, S.dark, sx * 0.9, 0.55, a[0]);
    const w = add(S.wheelG, S.tire, sx * 0.88, 0.41, a[0]); const r = add(S.rimG, S.rim, sx * 0.9, 0.41, a[0]);
    wheels.push(w, r);
  }));
  if (withBikes) {   // Fahrradtraeger mit zwei Raedern
    add(S.box(1.5, 0.08, 0.5), S.frame, 0, 0.55, -3.35);
    [[-0.38, 0.2], [0.38, -0.2]].forEach(b => {
      const bk = new THREE.Group(); bk.position.set(b[0], 0.95, -3.4 + b[1]);
      [-0.45, 0.45].forEach(z => { const r = new THREE.Mesh(S.ring, S.frame); r.rotation.y = Math.PI / 2; r.position.z = z; bk.add(r); });
      const fr = new THREE.Mesh(S.box(0.05, 0.05, 1.0), S.frame); fr.position.set(0, 0.2, 0); bk.add(fr);
      const hb = new THREE.Mesh(S.box(0.5, 0.04, 0.04), S.frame); hb.position.set(0, 0.42, 0.42); bk.add(hb);
      bk.traverse(o => { o.castShadow = true; }); g.add(bk);
    });
  }
  g.userData.wheels = wheels;
  return g;
}
