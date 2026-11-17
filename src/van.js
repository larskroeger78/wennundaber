// Lars' Van (Ford Transit L2H3) aus seinen Fotos: freigestellte Ansichten, die sich je nach Blickwinkel drehen.
// Ansichten (Winkel = Kamera relativ zur Fahrtrichtung; + = Kamera auf der linken Fahrzeugseite):
import * as THREE from 'three';
import uSide from './assets/van/side34.png';
import uF34 from './assets/van/front34.png';
import uFront from './assets/van/front.png';
import uRA from './assets/van/rear34a.png';
import uRB from './assets/van/rear34b.png';

const VIEWS = [   // [Winkel, Textur, gespiegelt, Breite in m]  (Hoehe ergibt sich aus dem Foto)
  [0, uFront, false, 2.45], [42, uF34, false, 3.3], [-42, uF34, true, 3.3],
  [78, uSide, false, 4.7], [-78, uSide, true, 4.7],
  [128, uRA, false, 5.0], [-128, uRA, true, 5.0],
  [-142, uRB, false, 2.95], [142, uRB, true, 2.95], [180, uRB, false, 2.95],
];
let SET = null, SHADOW = null;
function setup() {
  if (SET) return;
  const L = new THREE.TextureLoader(), cache = {};
  SET = VIEWS.map(v => {
    let t = cache[v[1]];
    if (!t) { t = cache[v[1]] = L.load(v[1]); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; }
    return { a: v[0], t, m: v[2], w: v[3] };
  });
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.65, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  SHADOW = new THREE.CanvasTexture(c);
}

export function makeVan() {
  setup();
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.04, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  const sp = new THREE.Mesh(geo, mat); sp.frustumCulled = false; g.add(sp);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.9), new THREE.MeshBasicMaterial({ map: SHADOW, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.04; g.add(sh);
  g.userData.sp = sp; g.userData.sh = sh; g.userData.hd = 0; g.userData.cur = -1; g.userData.wheels = [];
  return g;
}

// Ansicht passend zur Kamera waehlen (zylindrisches Billboard) und Beleuchtung anpassen
export function vanFace(g, cam, light) {
  const u = g.userData, p = g.position;
  const cx = cam.position.x - p.x, cz = cam.position.z - p.z, hd = u.hd;
  const th = Math.atan2(cx * Math.cos(hd) - cz * Math.sin(hd), cx * Math.sin(hd) + cz * Math.cos(hd)) * 180 / Math.PI;
  let bi = 0, bd = 1e9;
  for (let i = 0; i < SET.length; i++) { let d = Math.abs(th - SET[i].a); if (d > 180) d = 360 - d; if (d < bd) { bd = d; bi = i; } }
  const v = SET[bi], sp = u.sp;
  if (u.cur !== bi) {
    u.cur = bi; sp.material.map = v.t; sp.material.needsUpdate = true;
    const im = v.t.image, asp = im && im.width ? im.height / im.width : 0.6;
    u.asp = asp;
  }
  const im = v.t.image; if (im && im.width) u.asp = im.height / im.width;
  sp.scale.set(v.w * (v.m ? -1 : 1), v.w * (u.asp || 0.6), 1);
  sp.rotation.y = Math.atan2(cx, cz);
  sp.material.color.setScalar(light);
  u.sh.rotation.z = -hd;
}
