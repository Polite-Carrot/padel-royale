import * as THREE from '../vendor/three.module.js';
import { BRANDS } from './rackets.js';

// The local club around the show court: paving, a clubhouse with reception and café terrace, a kids'
// five-a-side game, traffic on the roads at both ends, a car park and the town beyond.
// Scenery is baked into a few vertex-coloured meshes; people are instanced and each car is one mesh.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * k;
}

const PAL = {
  asphalt: '#454951', side: '#c4bdb1', curb: '#e6e0d5', line: '#f4f4ef', grass: '#7dba5c', lawn: '#a8c48a',
  trunk: '#7a5236', greens: ['#4f9d3f', '#5fb04a', '#3f8f45', '#6dbb4f', '#7cc35a'], autumn: ['#e8a33a', '#e07a2e', '#d9b53a'],
  walls: ['#f4e3c6', '#f6d6cf', '#d9e8f2', '#e6f1d6', '#fff0b8', '#f2c9a0', '#e2d6f5', '#fbfbf7', '#cfe3e0'],
  roofs: ['#c0533a', '#a9452f', '#5d6470', '#8a4b3a', '#46505e', '#b8664a'],
  win: '#3d5a73', awning: ['#ff7a1a', '#2ec4b6', '#e63946', '#3a86ff', '#ffc23d'],
};
const CAR_COLORS = ['#e63946', '#f4c430', '#f8f8f8', '#3a86ff', '#2ec4b6', '#ff7a1a', '#7b2ff7', '#1f2937', '#a0a8b3', '#ff6ec7', '#57cc99'];

// ---------------------------------------------------------------- baked geometry
// Primitives scaled to a 1 m box centred on the origin, so every part is placed by centre and size.
function unit(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, c = new THREE.Vector3(), s = new THREE.Vector3();
  b.getCenter(c);
  b.getSize(s);
  g.translate(-c.x, -c.y, -c.z);
  g.scale(1 / (s.x || 1), 1 / (s.y || 1), 1 / (s.z || 1));
  return g;
}
const G = {
  box: unit(new THREE.BoxGeometry(1, 1, 1)),
  cyl: unit(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
  cone: unit(new THREE.ConeGeometry(0.5, 1, 8)),
  ico: unit(new THREE.IcosahedronGeometry(0.5, 0)),
  blob: unit(new THREE.IcosahedronGeometry(0.5, 1)),
  sph: unit(new THREE.SphereGeometry(0.5, 12, 8)),
  // Gable roof: ridge along z, apex up.
  prism: unit(new THREE.CylinderGeometry(0.5, 0.5, 1, 3).rotateX(-Math.PI / 2)),
  flat: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  wall: new THREE.PlaneGeometry(1, 1),
};

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _nm = new THREE.Matrix3();

class Builder {
  constructor() {
    this.parts = [];
    this.base = new THREE.Matrix4();
  }

  // Parts added inside fn are placed relative to (x, z), turned by ry (e.g. a whole parked car).
  at(x, z, ry, fn) {
    const prev = this.base.clone();
    this.base.multiply(new THREE.Matrix4().compose(_p.set(x, 0, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1)));
    fn();
    this.base.copy(prev);
  }

  // A unit primitive centred at (x, y, z), sized w x h x d, pitched by rx then turned by ry.
  // uv = [u0, v0, du, dv] remaps its 0..1 UVs (atlas regions, repeating nets).
  put(geo, color, x, y, z, w, h, d, ry = 0, rx = 0, uv = null) {
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0)), _s.set(w, h, d));
    this.parts.push({ geo, color: new THREE.Color(color), m: m.premultiply(this.base), uv });
  }

  box(w, h, d, color, x, y0, z, ry = 0) {
    this.put(G.box, color, x, y0 + h / 2, z, w, h, d, ry);
  }

  quad(x0, z0, x1, z1, y, color) {
    this.put(G.flat, color, (x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, 1, z1 - z0);
  }

  mesh(material) {
    let vc = 0, ic = 0;
    for (const { geo } of this.parts) {
      vc += geo.attributes.position.count;
      ic += geo.index ? geo.index.count : geo.attributes.position.count;
    }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
    const uvs = new Float32Array(vc * 2), idx = new Uint32Array(ic);
    let vo = 0, io = 0;
    for (const { geo, color, m, uv } of this.parts) {
      const p = geo.attributes.position, n = geo.attributes.normal, t = geo.attributes.uv;
      _nm.getNormalMatrix(m);
      for (let i = 0; i < p.count; i++) {
        const o = vo + i;
        _v.fromBufferAttribute(p, i).applyMatrix4(m).toArray(pos, o * 3);
        _v.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize().toArray(nor, o * 3);
        color.toArray(col, o * 3);
        if (t) {
          uvs[o * 2] = uv ? uv[0] + t.getX(i) * uv[2] : t.getX(i);
          uvs[o * 2 + 1] = uv ? uv[1] + t.getY(i) * uv[3] : t.getY(i);
        }
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) idx[io++] = geo.index.getX(i) + vo;
      else for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
      vo += p.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    this.parts = [];
    const mesh = new THREE.Mesh(g, material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Half-metre concrete pavers.
const paveTexture = () => canvasTex(256, 256, (g, w) => {
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g.fillStyle = `hsl(${32 + Math.random() * 8}, ${10 + Math.random() * 6}%, ${71 + Math.random() * 7}%)`;
      g.fillRect(i * s, j * s, s, s);
    }
  }
  for (let k = 0; k < 900; k++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(60,50,40,0.08)' : 'rgba(255,255,255,0.1)';
    g.fillRect(Math.random() * w, Math.random() * w, 2, 2);
  }
  g.fillStyle = 'rgba(80,70,60,0.45)';
  for (let k = 0; k <= n; k++) {
    g.fillRect(k * s - 1.5, 0, 3, w);
    g.fillRect(0, k * s - 1.5, w, 3);
  }
}, [16, 16]);

const PITCH = { cx: 5.5, cz: -22, hl: 8.8, hw: 5.15, gw: 1.5, gh: 1.7 };
const PX = 9.8, PZ = 5.5;

// Striped artificial turf with five-a-side markings (19.6 x 11 m).
const pitchTexture = () => canvasTex(1024, 576, (g, w, h) => {
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#3da64a' : '#4ab657';
    g.fillRect((i * w) / 12, 0, w / 12 + 1, h);
  }
  const px = w / (2 * PX), mx = (PX - PITCH.hl) * px, mz = (PZ - PITCH.hw) * px;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 6;
  g.strokeRect(mx, mz, w - 2 * mx, h - 2 * mz);
  g.beginPath(); g.moveTo(w / 2, mz); g.lineTo(w / 2, h - mz); g.stroke();
  g.beginPath(); g.arc(w / 2, h / 2, 1.5 * px, 0, TAU); g.stroke();
  g.beginPath(); g.arc(mx, h / 2, 3 * px, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.beginPath(); g.arc(w - mx, h / 2, 3 * px, Math.PI / 2, Math.PI * 1.5); g.stroke();
  g.fillStyle = '#ffffff';
  for (const x of [w / 2, mx + 4 * px, w - mx - 4 * px]) { g.beginPath(); g.arc(x, h / 2, 6, 0, TAU); g.fill(); }
});

const netTexture = () => canvasTex(32, 32, (g, w, h) => {
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.strokeRect(0, 0, w, h);
}, [1, 1]);

// One atlas for every sign and sponsor board: a single draw call.
const AW = 1024;
const region = (x, y, w, h) => [x / AW, 1 - (y + h) / AW, w / AW, h / AW];
const UV = {
  logo: region(0, 0, 1024, 248),
  reception: region(0, 256, 504, 120),
  cafe: region(520, 256, 504, 120),
  sponsorA: region(0, 392, 1023, 120),
  sponsorB: region(0, 520, 1023, 120),
};

function fitFont(g, text, font, size, maxW) {
  g.font = font.replace('S', `${size}px`);
  const w = g.measureText(text).width;
  if (w > maxW) g.font = font.replace('S', `${Math.floor((size * maxW) / w)}px`);
}

const signAtlas = () => canvasTex(AW, AW, (g) => {
  // Club board.
  g.fillStyle = '#16202e';
  g.fillRect(0, 0, 1024, 248);
  g.strokeStyle = '#ff7a1a';
  g.lineWidth = 12;
  g.strokeRect(10, 10, 1004, 228);
  g.save();
  g.translate(132, 124);
  g.rotate(-0.45);
  g.fillStyle = '#ff7a1a';
  g.beginPath(); g.ellipse(0, -24, 52, 60, 0, 0, TAU); g.fill();
  g.fillRect(-11, 30, 22, 72);
  g.fillStyle = '#16202e';
  for (let y = -60; y <= 12; y += 17) {
    for (let x = -34; x <= 34; x += 17) {
      if ((x * x) / 2400 + ((y + 24) * (y + 24)) / 3200 < 0.8) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
    }
  }
  g.restore();
  g.fillStyle = '#e8ff3a';
  g.beginPath(); g.arc(198, 62, 22, 0, TAU); g.fill();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#ffffff';
  fitFont(g, 'PADEL ROYALE', '900 S "Arial Black", Impact, system-ui, sans-serif', 112, 740);
  g.fillText('PADEL ROYALE', 245, 106);
  g.fillStyle = '#ff9a3d';
  fitFont(g, 'CLUB · CAFÉ · RECEPTION', '800 S system-ui, sans-serif', 46, 740);
  g.fillText('CLUB · CAFÉ · RECEPTION', 249, 192);

  // Reception sign.
  g.fillStyle = '#f7f7f2';
  g.fillRect(0, 256, 504, 120);
  g.fillStyle = '#ff7a1a';
  g.beginPath(); g.arc(62, 316, 38, 0, TAU); g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = '900 56px Georgia, serif';
  g.fillText('i', 62, 318);
  g.fillStyle = '#16202e';
  g.textAlign = 'left';
  fitFont(g, 'RECEPTION', '900 S system-ui, sans-serif', 64, 380);
  g.fillText('RECEPTION', 114, 318);

  // Café sign.
  g.fillStyle = '#7a4a2c';
  g.fillRect(520, 256, 504, 120);
  g.fillStyle = '#fff2d6';
  g.textAlign = 'center';
  fitFont(g, 'Café · Bar', 'italic 800 S Georgia, serif', 72, 450);
  g.fillText('Café · Bar', 772, 318);

  // Sponsor boards: the shop's racket brands, squashed here because the boards stretch them 1.6x.
  BRANDS.forEach((b, i) => {
    const x = (i % 3) * 341, y = i < 3 ? 392 : 520;
    g.fillStyle = b.frame;
    g.fillRect(x, y, 341, 120);
    g.save();
    g.translate(x + 170, y + 62);
    g.scale(0.62, 1);
    g.fillStyle = b.colors[4][1];
    g.textAlign = 'center';
    fitFont(g, b.logo, b.font, 84, 480);
    g.fillText(b.logo, 0, 0);
    g.restore();
  });
});

// ---------------------------------------------------------------- scenery pieces
function tree(b, x, z, s = 1, color = pick(PAL.greens)) {
  b.put(G.cyl, PAL.trunk, x, 0.8 * s, z, 0.24 * s, 1.6 * s, 0.24 * s);
  b.put(G.blob, color, x, 2.4 * s, z, 2.4 * s, 2.1 * s, 2.4 * s);
  b.put(G.blob, pick(PAL.greens), x + 0.45 * s, 3.2 * s, z - 0.2 * s, 1.5 * s, 1.4 * s, 1.5 * s);
}

function pine(b, x, z, s = 1) {
  b.put(G.cyl, PAL.trunk, x, 0.6 * s, z, 0.22 * s, 1.2 * s, 0.22 * s);
  b.put(G.cone, '#3f7f4a', x, 2.3 * s, z, 2.2 * s, 2.8 * s, 2.2 * s);
  b.put(G.cone, '#4b8f52', x, 3.7 * s, z, 1.5 * s, 2.2 * s, 1.5 * s);
}

// Street lamp; the arm reaches out over the road in direction face (+1 / -1 along z).
function lamp(b, x, z, face) {
  b.put(G.cyl, '#3a3f47', x, 2.9, z, 0.12, 5.8, 0.12);
  b.box(0.08, 0.08, 1.3, '#3a3f47', x, 5.66, z + face * 0.6);
  b.box(0.3, 0.12, 0.55, '#fff2c0', x, 5.55, z + face * 1.2);
}

function bench(b, x, z, ry) {
  b.at(x, z, ry, () => {
    b.box(1.8, 0.07, 0.45, '#c08a5a', 0, 0.42, 0);
    b.box(1.8, 0.38, 0.06, '#c08a5a', 0, 0.55, -0.24);
    for (const lx of [-0.75, 0.75]) b.box(0.07, 0.42, 0.4, '#3a3f47', lx, 0, 0);
  });
}

function chair(b, x, z, ry) {
  b.at(x, z, ry, () => {
    b.box(0.42, 0.05, 0.42, '#ece6da', 0, 0.44, 0);
    b.box(0.42, 0.42, 0.05, '#ece6da', 0, 0.48, -0.2);
    b.box(0.05, 0.44, 0.05, '#3a3f47', 0, 0, 0);
  });
}

// A town house or block; face = +1 if its front faces +z, -1 for -z.
function house(b, x, z, w, d, floors, face, o = {}) {
  const H = floors * 2.9 + 0.4;
  b.box(w, H, d, o.wall || pick(PAL.walls), x, 0, z);
  const fz = z + face * (d / 2 + 0.02);
  const cols = Math.max(1, Math.floor((w - 0.8) / 2.3)), step = w / cols;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const wx = x - w / 2 + step * (c + 0.5), y = 0.4 + f * 2.9;
      if (f === 0 && o.shop) continue;
      if (f === 0 && c === Math.floor(cols / 2)) {
        b.box(1.1, 2.1, 0.08, '#6b4a3a', wx, 0.05, fz);
        continue;
      }
      b.box(1.0, 1.3, 0.06, PAL.win, wx, y + 0.75, fz);
      if (!o.far) b.box(1.15, 0.08, 0.16, '#f3f3f0', wx, y + 0.7, fz);
    }
  }
  if (o.shop) {
    b.box(w - 1.4, 1.9, 0.06, PAL.win, x, 0.45, fz);
    b.box(w - 0.8, 0.14, 1.1, pick(PAL.awning), x, 2.6, fz + face * 0.55);
  }
  if (o.flatRoof) b.box(w + 0.2, 0.4, d + 0.2, '#8e949c', x, H, z);
  else b.put(G.prism, o.roof || pick(PAL.roofs), x, H + 0.9, z, d + 0.6, 1.8, w + 0.5, Math.PI / 2);
}

// A street of houses along x with fronts at zf, facing the club.
function street(b, zf, face, o = {}) {
  let x = -96;
  while (x < 96) {
    const w = rand(8, 13), d = rand(8, 10);
    const tall = Math.random();
    const floors = o.far ? 3 + Math.floor(Math.random() * 3) : tall < 0.55 ? 2 : tall < 0.85 ? 3 : tall < 0.95 ? 4 : 5;
    house(b, x + w / 2, zf - face * (d / 2), w, d, floors, face, {
      flatRoof: o.far || floors >= 4, shop: !o.far && Math.abs(x) < 40 && Math.random() < 0.45, far: o.far,
    });
    x += w + rand(0.4, 3);
  }
}

// Two-lane road along x centred on zc, kerbed pavements both sides.
function road(b, zc) {
  const hw = 3.5;
  b.quad(-130, zc - hw, 130, zc + hw, -0.04, PAL.asphalt);
  for (const s of [-1, 1]) {
    b.box(260, 0.14, 2.2, PAL.side, 0, -0.04, zc + s * (hw + 1.1));
    b.box(260, 0.15, 0.18, PAL.curb, 0, -0.04, zc + s * (hw + 0.09));
    b.quad(-130, zc + s * (hw - 0.45) - 0.06, 130, zc + s * (hw - 0.45) + 0.06, -0.025, PAL.line);
  }
  for (let x = -130; x < 130; x += 6) b.quad(x, zc - 0.07, x + 3, zc + 0.07, -0.025, PAL.line);
}

function zebra(b, zc, x) {
  for (let k = 0; k < 7; k++) b.quad(x - 3.2 + k * 1.0, zc - 3.0, x - 2.7 + k * 1.0, zc + 3.0, -0.022, PAL.line);
}

// Cars are built along +x around the origin with the wheels on the ground.
const CAR_LEN = { hatch: 3.9, van: 4.8, bus: 10.6 };
function carParts(b, type, color) {
  const glass = '#25303c', tyre = '#1a1a1a', rim = '#b9bec6';
  const wheel = (x, z, r) => {
    b.put(G.cyl, tyre, x, r, z, 2 * r, 0.26, 2 * r, 0, Math.PI / 2);
    b.put(G.cyl, rim, x, r, z + Math.sign(z) * 0.12, r, 0.04, r, 0, Math.PI / 2);
  };
  if (type === 'bus') {
    b.quad(-5.5, -1.4, 5.5, 1.4, 0.03, '#262a30');
    b.box(10.6, 2.55, 2.5, color, 0, 0.38, 0);
    b.box(9.8, 0.95, 2.54, glass, -0.25, 1.45, 0);
    b.box(0.06, 1.5, 2.2, glass, 5.3, 1.05, 0);
    b.box(10.3, 0.16, 2.3, '#f2f2f2', 0, 2.93, 0);
    b.box(0.08, 0.3, 1.6, '#ffe9a8', 5.3, 2.62, 0);
    for (const z of [-1.14, 1.14]) for (const x of [-3.4, 3.6]) wheel(x, z, 0.5);
    return;
  }
  const van = type === 'van';
  const L = CAR_LEN[type], W = van ? 1.95 : 1.75;
  b.quad(-L / 2 - 0.05, -W / 2 - 0.05, L / 2 + 0.05, W / 2 + 0.05, 0.03, '#262a30');
  b.box(L, van ? 1.2 : 0.62, W, color, 0, 0.3, 0);
  if (van) {
    b.box(3.3, 0.55, W + 0.04, glass, -0.55, 0.92, 0);
    b.box(0.06, 0.55, W - 0.25, glass, L / 2, 0.92, 0);
  } else {
    b.box(2.15, 0.56, W - 0.2, glass, -0.3, 0.92, 0);
    b.box(2.0, 0.07, W - 0.25, color, -0.3, 1.48, 0);
  }
  for (const s of [-1, 1]) {
    b.box(0.1, 0.24, W, '#2b2b2b', (s * L) / 2, 0.26, 0);
    for (const z of [-0.55, 0.55]) b.box(0.05, 0.12, 0.3, s > 0 ? '#fff3c4' : '#e0262b', s * (L / 2 + 0.02), 0.62, (z * W) / 1.75);
  }
  for (const z of [-W / 2 + 0.08, W / 2 - 0.08]) for (const x of [-(L / 2 - 0.75), L / 2 - 0.75]) wheel(x, z, 0.32);
}

// ---------------------------------------------------------------- the club layout
function groundAndPaths(b) {
  b.quad(-220, -220, 220, 220, -0.09, PAL.lawn);
  b.quad(-60, -28.8, 60, -16.4, -0.06, PAL.grass);
  b.quad(-60, -11.95, -16, 32.3, -0.06, PAL.grass);
  b.quad(16, -11.95, 60, 32.3, -0.06, PAL.grass);
  // Path between the clubhouse and the pitch.
  b.quad(-5.4, -28.8, -4.3, -16.4, -0.05, '#d3ccbf');
}

// A quiet one-way street right behind the show court, near enough to see from the portrait camera.
function sideStreet(b) {
  b.quad(-130, -15.6, 130, -12.2, -0.04, PAL.asphalt);
  b.quad(-130, -16.4, 130, -15.6, -0.035, PAL.side);
  b.quad(-130, -12.2, 130, -11.9, -0.035, PAL.side);
  b.quad(-17, -18, -5.4, -16.4, -0.035, PAL.side);
  for (const z of [-12.1, -15.7]) b.box(260, 0.15, 0.2, PAL.curb, 0, -0.04, z);
  for (const z of [-12.55, -15.25]) b.quad(-130, z - 0.06, 130, z + 0.06, -0.025, PAL.line);
  for (let k = 0; k < 6; k++) b.quad(-7.1 + k * 0.9, -15.2, -6.65 + k * 0.9, -12.6, -0.022, PAL.line);
  // The club's low front wall, with a gate opposite the crossing.
  for (const [x0, x1] of [[-16, -6], [-3.6, 16]]) {
    b.box(x1 - x0, 0.5, 0.22, '#f1ede4', (x0 + x1) / 2, 0, -11.85);
    b.box(x1 - x0, 0.05, 0.3, '#d9d2c4', (x0 + x1) / 2, 0.5, -11.85);
  }
  for (const x of [-6.15, -3.45]) b.box(0.32, 1.1, 0.32, '#b4553f', x, 0, -11.85);
}

function clubhouse(b, signs) {
  const x0 = -15.6, x1 = -5.4, zf = -18, zb = -26, cx = (x0 + x1) / 2, cz = (zf + zb) / 2, W = x1 - x0, D = zf - zb;
  b.box(W + 0.4, 0.3, D + 0.4, '#5c626c', cx, 0, cz);
  b.box(W, 3.6, D, '#f5f1e8', cx, 0.3, cz);
  b.box(W + 0.8, 0.35, D + 0.8, '#2f333b', cx, 3.9, cz);
  // Café glazing with mullions and a sky reflection.
  const g0 = -15.2, g1 = -10.0, gc = (g0 + g1) / 2;
  b.box(g1 - g0, 2.7, 0.06, '#2b5c72', gc, 0.45, zf + 0.03);
  b.box(g1 - g0, 0.5, 0.06, '#6fa3bb', gc, 2.5, zf + 0.05);
  for (let i = 0; i <= 4; i++) b.box(0.08, 2.7, 0.1, '#f8f8f8', g0 + (i * (g1 - g0)) / 4, 0.45, zf + 0.05);
  b.box(g1 - g0 + 0.08, 0.08, 0.1, '#f8f8f8', gc, 3.12, zf + 0.05);
  signs.put(G.wall, '#fff', gc, 3.5, zf + 0.06, 2.1, 0.5, 1, 0, 0, UV.cafe);
  // Timber cladding, then the reception door and sign.
  b.box(2.0, 3.6, 0.08, '#b9784a', -8.6, 0.3, zf + 0.04);
  for (let i = 0; i < 7; i++) b.box(0.05, 3.6, 0.1, '#8f5a34', -9.44 + i * 0.28, 0.3, zf + 0.06);
  b.box(1.5, 2.55, 0.08, '#f8f8f8', -6.7, 0.3, zf + 0.03);
  b.box(1.3, 2.4, 0.06, '#2b5c72', -6.7, 0.3, zf + 0.06);
  b.box(0.06, 0.5, 0.08, '#c9ced6', -6.4, 1.2, zf + 0.1);
  signs.put(G.wall, '#fff', -6.7, 3.28, zf + 0.06, 1.9, 0.45, 1, 0, 0, UV.reception);
  // Rooftop club board on legs, plus a couple of AC units.
  b.box(8.6, 2.2, 0.25, '#16202e', cx, 4.45, zf - 2.6);
  for (const x of [cx - 3, cx + 3]) b.box(0.15, 0.3, 0.15, '#2f333b', x, 4.25, zf - 2.6);
  signs.put(G.wall, '#fff', cx, 5.55, zf - 2.6 + 0.13, 8.4, 2.05, 1, 0, 0, UV.logo);
  b.box(1.2, 0.8, 0.9, '#c9ced6', x0 + 2, 4.25, zb + 2);
  b.box(1.2, 0.8, 0.9, '#c9ced6', x1 - 2, 4.25, zb + 1.6);
}

// Pavement café in front of the clubhouse.
function terrace(b) {
  const z = -16.85;
  for (const [x, c] of [[-14.2, '#ff7a1a'], [-11.3, '#2ec4b6']]) {
    b.put(G.cyl, '#3a3f47', x, 0.02, z, 0.5, 0.04, 0.5);
    b.put(G.cyl, '#3a3f47', x, 0.37, z, 0.08, 0.74, 0.08);
    b.put(G.cyl, '#f3f3f3', x, 0.75, z, 0.95, 0.05, 0.95);
    b.put(G.cyl, '#d9d9d9', x, 1.7, z, 0.05, 1.9, 0.05);
    b.put(G.cone, c, x, 2.55, z, 2.2, 0.5, 2.2);
    b.put(G.sph, '#d9d9d9', x, 2.86, z, 0.1, 0.1, 0.1);
    for (const s of [-1, 1]) chair(b, x + s * 0.75, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  for (const x of [-16.4, -9.2]) {
    b.put(G.cyl, '#e2d7c5', x, 0.3, -16.9, 0.6, 0.6, 0.6);
    b.put(G.blob, pick(PAL.greens), x, 1.05, -16.9, 0.9, 1.1, 0.9);
  }
}

function walkways(b) {
  // Planters behind both back walls.
  for (const [x, z] of [[-6.6, -11.15], [6.6, -11.15], [-6.6, 12.4], [6.6, 12.4]]) {
    b.box(2.6, 0.55, 0.6, '#8b5e3c', x, 0, z);
    b.box(2.5, 0.06, 0.5, '#5a3d2b', x, 0.5, z);
    for (const dx of [-0.85, 0, 0.85]) b.put(G.blob, pick(PAL.greens), x + dx, 0.82, z, 0.75, 0.6, 0.55);
    for (let k = 0; k < 6; k++) {
      b.put(G.sph, pick(['#ff6ec7', '#ffd23d', '#ffffff', '#ff7a1a']), x + rand(-1.1, 1.1), rand(0.95, 1.1), z + rand(-0.2, 0.2), 0.16, 0.16, 0.16);
    }
  }
  for (const x of [-3.6, 3.6]) bench(b, x, -11.25, 0);
  // Low wall between the club and the car park.
  for (const [x0, x1] of [[-16, -4.5], [4.5, 16]]) b.box(x1 - x0, 0.6, 0.3, '#f1ede4', (x0 + x1) / 2, 0, 16.2);
}

function pitch(b, nets, signs) {
  const { cx, cz, hl, gw } = PITCH;
  const board = '#f4f4f0', green = '#2f5a3a';
  b.box(2 * PX + 0.16, 0.9, 0.08, board, cx, 0, cz + PZ);
  b.box(2 * PX + 0.16, 0.9, 0.08, board, cx, 0, cz - PZ);
  for (const s of [-1, 1]) b.box(0.08, 0.9, 2 * PZ, board, cx + s * PX, 0, cz);
  // Tall ball-stop netting behind the goals and along the far side (the near side stays open to watch).
  const post = (x, z) => b.put(G.cyl, green, x, 2.25, z, 0.1, 4.5, 0.1);
  for (let i = 0; i <= 7; i++) post(cx - PX + (i * 2 * PX) / 7, cz - PZ);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) post(cx + s * PX, cz + PZ - (i * 2 * PZ) / 4);
  b.box(2 * PX, 0.08, 0.08, green, cx, 4.42, cz - PZ);
  for (const s of [-1, 1]) b.box(0.08, 0.08, 2 * PZ, green, cx + s * PX, 4.42, cz);
  nets.put(G.wall, green, cx, 2.68, cz - PZ, 2 * PX, 3.56, 1, 0, 0, [0, 0, (2 * PX) / 0.3, 3.56 / 0.3]);
  for (const s of [-1, 1]) nets.put(G.wall, green, cx + s * PX, 2.68, cz, 2 * PZ, 3.56, 1, Math.PI / 2, 0, [0, 0, (2 * PZ) / 0.3, 3.56 / 0.3]);
  // Goals.
  for (const s of [-1, 1]) {
    const gx = cx + s * hl, bx = gx + s * 0.9, w = '#ffffff';
    for (const zs of [-1, 1]) {
      b.put(G.cyl, w, gx, PITCH.gh / 2, cz + zs * gw, 0.08, PITCH.gh, 0.08);
      b.put(G.cyl, w, bx, PITCH.gh / 2, cz + zs * gw, 0.05, PITCH.gh, 0.05);
      b.put(G.cyl, w, (gx + bx) / 2, PITCH.gh, cz + zs * gw, 0.05, 0.9, 0.05, Math.PI / 2, Math.PI / 2);
    }
    b.put(G.cyl, w, gx, PITCH.gh, cz, 0.08, 2 * gw + 0.08, 0.08, 0, Math.PI / 2);
    b.put(G.cyl, w, bx, PITCH.gh, cz, 0.05, 2 * gw, 0.05, 0, Math.PI / 2);
    const cell = 0.15;
    nets.put(G.wall, w, bx, PITCH.gh / 2, cz, 2 * gw, PITCH.gh, 1, Math.PI / 2, 0, [0, 0, (2 * gw) / cell, PITCH.gh / cell]);
    nets.put(G.flat, w, (gx + bx) / 2, PITCH.gh, cz, 0.9, 1, 2 * gw, 0, 0, [0, 0, 0.9 / cell, (2 * gw) / cell]);
    for (const zs of [-1, 1]) nets.put(G.wall, w, (gx + bx) / 2, PITCH.gh / 2, cz + zs * gw, 0.9, PITCH.gh, 1, 0, 0, [0, 0, 0.9 / cell, PITCH.gh / cell]);
  }
  // Sponsor boards facing the show court: the shop's racket brands.
  for (const [z, a, c] of [[cz + PZ + 0.045, UV.sponsorA, UV.sponsorB], [cz - PZ + 0.045, UV.sponsorB, UV.sponsorA]]) {
    signs.put(G.wall, '#fff', cx - PX / 2, 0.45, z, PX - 0.1, 0.78, 1, 0, 0, a);
    signs.put(G.wall, '#fff', cx + PX / 2, 0.45, z, PX - 0.1, 0.78, 1, 0, 0, c);
  }
}

function carPark(b, signs) {
  b.quad(-19, 16.4, 19, 32.2, -0.04, PAL.asphalt);
  for (let k = 0; k <= 14; k++) {
    const x = -18.2 + k * 2.6;
    b.quad(x - 0.06, 16.7, x + 0.06, 21.7, -0.03, PAL.line);
    b.quad(x - 0.06, 26.9, x + 0.06, 31.9, -0.03, PAL.line);
  }
  for (let k = 0; k < 14; k++) {
    const x = -16.9 + k * 2.6;
    const car = () => carParts(b, Math.random() < 0.25 ? 'van' : 'hatch', pick(CAR_COLORS));
    if (Math.random() < 0.6) b.at(x, 19.2, Math.PI / 2, car);
    if (Math.abs(x) > 3 && Math.random() < 0.55) b.at(x, 29.4, -Math.PI / 2, car);
  }
  // Entrance arch on the road side; the board reads from the court.
  for (const s of [-1, 1]) b.box(0.6, 4.6, 0.6, '#b4553f', s * 4.6, 0, 32.4);
  b.box(9.8, 1.05, 0.4, '#16202e', 0, 3.6, 32.4);
  signs.put(G.wall, '#fff', 0, 4.12, 32.19, 3.9, 0.96, 1, Math.PI, 0, UV.logo);
  signs.put(G.wall, '#fff', 0, 4.12, 32.61, 3.9, 0.96, 1, 0, 0, UV.logo);
}

function townAndCountry(b) {
  street(b, -42.2, 1);
  street(b, -60, 1, { far: true });
  street(b, 46, -1);
  street(b, 64, -1, { far: true });
  // Street trees on the far pavements and in the lawns around the club.
  for (let x = -90; x <= 90; x += 11) {
    tree(b, x + rand(-1, 1), -39.1, rand(0.85, 1.05));
    tree(b, x + rand(-1, 1), 42.6, rand(0.85, 1.05));
  }
  for (let x = -90; x <= 90; x += 20) {
    lamp(b, x, -29.6, -1);
    lamp(b, x + 10, 33.4, 1);
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const x = s * rand(19, 52), z = rand(-26, 28);
      if (Math.random() < 0.25) pine(b, x, z, rand(0.9, 1.3));
      else tree(b, x, z, rand(0.9, 1.35), Math.random() < 0.2 ? pick(PAL.autumn) : pick(PAL.greens));
    }
  }
  for (const x of [-15.5, -11, -7]) tree(b, x, -27.9, rand(0.85, 1), pick(PAL.greens));
  tree(b, 18.5, -20, 1.1, pick(PAL.autumn));
  tree(b, 18, -25.5, 1, pick(PAL.greens));
  // Rolling hills on the horizon (the fog softens them).
  for (const s of [-1, 1]) {
    for (const [x, w, h, c] of [[-120, 80, 20, '#86ad7c'], [-50, 90, 26, '#7aa38a'], [25, 80, 18, '#93b67f'], [100, 90, 24, '#80a986']]) {
      b.put(G.blob, c, x * s, 0, s * -92, w, 2 * h, 40);
    }
  }
}

// ---------------------------------------------------------------- people (Mii-style, like the crowd)
const SKIN = [0xf3d2b3, 0xe0b48f, 0xc68a5e, 0x8d5a3b, 0x5e3a24, 0xf6dcc4];
const HAIR = [0x2b1a10, 0x111111, 0x6b4423, 0xd8b25a, 0xa0522d, 0x3a3a3a];
const SHIRTS = [0xff5a5a, 0xffc23d, 0x2ec4b6, 0x6b5bff, 0x3fa9f5, 0xff6ec7, 0x7bd35a, 0xffffff, 0xf4a261];
const PANTS = [0x1d2433, 0x2b3a55, 0x3a3a3a, 0xe9e4d8, 0x56607a];

const LIMB = unit(new THREE.CapsuleGeometry(0.5, 1, 3, 8)).translate(0, -0.5, 0);
const TORSO = unit(new THREE.CapsuleGeometry(0.5, 0.9, 4, 10));
const HEAD = new THREE.SphereGeometry(0.5, 12, 10);
const HAIRCAP = new THREE.SphereGeometry(0.52, 12, 6, 0, TAU, 0, Math.PI * 0.5);
const DISC = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);

const _B = new THREE.Matrix4(), _L = new THREE.Matrix4(), _M = new THREE.Matrix4();
const _fq = new THREE.Quaternion(), _fe = new THREE.Euler(0, 0, 0, 'YXZ'), _fe2 = new THREE.Euler();

function person(o) {
  const pants = pick(PANTS);
  return {
    x: 0, y: 0, z: 0, yaw: 0, lean: 0, s: 0.9, headS: 1, pose: 'stand', shadow: true,
    leg: [0, 0], arm: [0.1, -0.05], rest: [0.1, -0.05], cheer: 0, phase: Math.random() * TAU,
    skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRTS), pants, legs: pants, ...o,
  };
}

class Folk {
  constructor(scene, list) {
    this.list = list;
    const n = list.length;
    const mk = (geo, count, mat = new THREE.MeshLambertMaterial()) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.matrixAutoUpdate = false;
      scene.add(m);
      return m;
    };
    this.torso = mk(TORSO, n);
    this.hips = mk(G.sph, n);
    this.head = mk(HEAD, n);
    this.hair = mk(HAIRCAP, n);
    this.limbs = mk(LIMB, n * 4);
    this.blobs = mk(DISC, n, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    const c = new THREE.Color();
    list.forEach((f, i) => {
      this.torso.setColorAt(i, c.set(f.shirt));
      this.hips.setColorAt(i, c.set(f.pants));
      this.head.setColorAt(i, c.set(f.skin));
      this.hair.setColorAt(i, c.set(f.hair));
      for (let k = 0; k < 4; k++) this.limbs.setColorAt(i * 4 + k, c.set(k < 2 ? f.legs : f.skin));
    });
    for (const m of [this.torso, this.hips, this.head, this.hair, this.limbs]) m.instanceColor.needsUpdate = true;
  }

  part(mesh, i, x, y, z, rx, w, h, d) {
    _L.compose(_p.set(x, y, z), _fq.setFromEuler(_fe2.set(rx, 0, 0)), _s.set(w, h, d));
    mesh.setMatrixAt(i, _M.multiplyMatrices(_B, _L));
  }

  update() {
    this.list.forEach((f, i) => {
      _B.compose(_p.set(f.x, f.y, f.z), _fq.setFromEuler(_fe.set(f.lean, f.yaw, 0)), _s.set(f.s, f.s, f.s));
      const sit = f.pose === 'sit', hip = sit ? 0.5 : 0.86, hs = f.headS;
      this.part(this.hips, i, 0, hip + 0.03, 0, 0, 0.36, 0.26, 0.3);
      this.part(this.torso, i, 0, hip + 0.36, 0, 0, 0.36, 0.7, 0.27);
      this.part(this.head, i, 0, hip + 0.76 + 0.18 * hs, 0, 0, 0.34 * hs, 0.36 * hs, 0.34 * hs);
      this.part(this.hair, i, 0, hip + 0.78 + 0.18 * hs, -0.015, 0, 0.35 * hs, 0.37 * hs, 0.35 * hs);
      for (let k = 0; k < 2; k++) {
        const sx = k ? 1 : -1;
        this.part(this.limbs, i * 4 + k, sx * 0.09, hip, 0, sit ? -1.0 : -f.leg[k], 0.13, sit ? 0.62 : 0.84, 0.13);
        this.part(this.limbs, i * 4 + 2 + k, sx * 0.22, hip + 0.62, 0, -f.arm[k], 0.1, 0.58, 0.1);
      }
      if (f.shadow) _M.compose(_p.set(f.x, 0.03, f.z), _fq.identity(), _s.set(0.7 * f.s, 1, 0.7 * f.s));
      else _M.makeScale(0, 0, 0);
      this.blobs.setMatrixAt(i, _M);
    });
    for (const m of [this.torso, this.hips, this.head, this.hair, this.limbs, this.blobs]) m.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- traffic
const SPAN = 180;
const LANES = [
  { z: -13.9, dir: 1, n: 2, slow: true },
  { z: -32.75, dir: 1, n: 3, bus: true }, { z: -36.25, dir: -1, n: 3 },
  { z: 39.75, dir: 1, n: 2 }, { z: 36.25, dir: -1, n: 2, bus: true },
];

class Traffic {
  constructor(scene, material) {
    this.cars = [];
    const byType = { hatch: [], van: [], bus: [] };
    for (const lane of LANES) {
      let x = rand(-SPAN / 2, SPAN / 2);
      for (let i = 0; i < lane.n; i++) {
        const type = lane.bus && i === 0 ? 'bus' : Math.random() < 0.25 ? 'van' : 'hatch';
        const color = type === 'bus' ? pick(['#f2b632', '#e94b3c', '#2a9d8f']) : pick(CAR_COLORS);
        const want = lane.slow ? rand(6.5, 8.5) : type === 'bus' ? rand(8, 9.5) : rand(9.5, 13);
        const car = { lane, x, v: want, want, len: CAR_LEN[type], color };
        this.cars.push(car);
        byType[type].push(car);
        x -= lane.dir * rand(28, 60);
        if (x * lane.dir < -SPAN / 2) x += lane.dir * SPAN;
      }
    }
    // One instanced mesh per vehicle type; white paintwork in the geometry takes each car's colour.
    const c = new THREE.Color();
    this.meshes = [];
    for (const [type, cars] of Object.entries(byType)) {
      if (!cars.length) continue;
      const b = new Builder();
      carParts(b, type, '#ffffff');
      const mesh = new THREE.InstancedMesh(b.mesh(material).geometry, material, cars.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      cars.forEach((car, i) => {
        car.mesh = mesh;
        car.i = i;
        mesh.setColorAt(i, c.set(car.color));
      });
      scene.add(mesh);
      this.meshes.push(mesh);
    }
    this._m = new THREE.Matrix4();
    this._r = new THREE.Matrix4().makeRotationY(Math.PI);
  }

  update(dt) {
    for (const c of this.cars) {
      // Keep a safe gap to the car in front (lanes wrap round).
      let gap = Infinity, lead = null;
      for (const o of this.cars) {
        if (o === c || o.lane !== c.lane) continue;
        let g = (o.x - c.x) * c.lane.dir;
        if (g < 0) g += SPAN;
        g -= (o.len + c.len) / 2;
        if (g < gap) { gap = g; lead = o; }
      }
      let target = c.want;
      if (lead && gap < 18) target = Math.min(target, lead.v * clamp((gap - 4) / 10, 0, 1.2));
      c.v = Math.max(0, c.v + clamp(target - c.v, -7 * dt, 2.2 * dt));
      c.x += c.lane.dir * c.v * dt;
      if (c.x * c.lane.dir > SPAN / 2) c.x -= c.lane.dir * SPAN;
      if (c.lane.dir > 0) this._m.makeTranslation(c.x, 0, c.lane.z);
      else this._m.copy(this._r).setPosition(c.x, 0, c.lane.z);
      c.mesh.setMatrixAt(c.i, this._m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the club
const KID_ROLES = [{ r: 'gk', x: -8.2, z: 0 }, { r: 'd', x: -4.6, z: 0.6 }, { r: 'l', x: -1.2, z: -2.7 }, { r: 'r', x: -0.6, z: 2.6 }];
const KIT = [{ shirt: 0xff7a1a, keeper: 0xffd23d, shorts: 0x1d2433 }, { shirt: 0x3fa9f5, keeper: 0x7bd35a, shorts: 0xffffff }];
const BALL_R = 0.11;

export class Club {
  constructor(scene, { shadows = false } = {}) {
    this.t = 0;
    const flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const b = new Builder(), signs = new Builder(), nets = new Builder();
    groundAndPaths(b);
    sideStreet(b);
    clubhouse(b, signs);
    terrace(b);
    walkways(b);
    pitch(b, nets, signs);
    road(b, -34.5);
    road(b, 38);
    zebra(b, -34.5, -5);
    carPark(b, signs);
    townAndCountry(b);
    scene.add(b.mesh(flat));
    scene.add(signs.mesh(new THREE.MeshBasicMaterial({ map: signAtlas() })));
    scene.add(nets.mesh(new THREE.MeshLambertMaterial({ map: netTexture(), vertexColors: true, alphaTest: 0.35, side: THREE.DoubleSide })));

    const pave = new THREE.Mesh(new THREE.PlaneGeometry(32, 27.95).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: paveTexture() }));
    pave.material.map.repeat.set(16, 13.975);
    pave.position.set(0, -0.012, 2.025);
    pave.receiveShadow = shadows;
    pave.matrixAutoUpdate = false;
    pave.updateMatrix();
    scene.add(pave);
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(2 * PX, 2 * PZ).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: pitchTexture() }));
    turf.position.set(PITCH.cx, -0.02, PITCH.cz);
    turf.matrixAutoUpdate = false;
    turf.updateMatrix();
    scene.add(turf);

    // Kids' five-a-side: four a side, team 0 attacks +x.
    this.kids = [];
    for (const team of [0, 1]) {
      const s = team === 0 ? 1 : -1;
      for (const role of KID_ROLES) {
        const f = person({
          s: rand(0.66, 0.74), headS: 1.22, shirt: role.r === 'gk' ? KIT[team].keeper : KIT[team].shirt, pants: KIT[team].shorts,
        });
        f.legs = f.skin;
        const k = { team, role: role.r, hx: role.x, hz: role.z, top: rand(3.6, 4.6), vx: 0, vz: 0, cd: 0, kick: 0, f };
        k.x = PITCH.cx + s * role.x;
        k.z = PITCH.cz + s * role.z;
        k.yaw = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.kids.push(k);
      }
    }
    this.ball = { x: PITCH.cx, y: BALL_R, z: PITCH.cz, vx: 0, vy: 0, vz: 0, inGoal: false, save: false };
    this.goalT = 0;
    this.scorer = 0;
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    scene.add(this.ballMesh);

    // Onlookers: parents at the pitch, people watching the padel, and the café terrace.
    this.parents = [
      person({ x: 1.2, z: -16.05, yaw: Math.PI }),
      person({ x: 10.5, z: -16.1, yaw: Math.PI + 0.2 }),
    ];
    this.watchers = [
      person({ x: -7.9, z: -10.65, yaw: 0.35 }),
      person({ x: 8.2, z: -10.7, yaw: -0.3 }),
      person({ x: -3.9, z: -11.3, pose: 'sit', shadow: false, arm: [0.5, 0.4], rest: [0.5, 0.4] }),
      person({ x: 3.3, z: -11.3, pose: 'sit', shadow: false, arm: [0.5, 0.4], rest: [0.5, 0.4] }),
    ];
    for (const [x, ry] of [[-14.95, Math.PI / 2], [-13.45, -Math.PI / 2], [-10.55, -Math.PI / 2]]) {
      this.watchers.push(person({ x, z: -16.85, yaw: ry, pose: 'sit', shadow: false, arm: [0.9, 0.7], rest: [0.9, 0.7] }));
    }
    this.idlers = [...this.parents, ...this.watchers];
    this.folk = new Folk(scene, [...this.kids.map((k) => k.f), ...this.idlers]);
    // Instanced meshes need their own material: sharing one with plain meshes re-selects its shader every frame.
    this.traffic = new Traffic(scene, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.update(0);
  }

  // Onlookers react to big moments on the show court.
  celebrate(level) {
    for (const f of this.watchers) if (Math.random() < 0.3 + level * 0.6) f.cheer = 1 + level * 1.4;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.updateGame(dt);
    for (const f of this.idlers) this.idle(f, dt);
    this.traffic.update(dt);
    this.folk.update();
  }

  idle(f, dt) {
    f.cheer = Math.max(0, f.cheer - dt);
    const c = Math.min(1, f.cheer), t = this.t;
    const wave = Math.sin(t * 12 + f.phase) * 0.3;
    f.arm[0] = f.rest[0] + c * (2.5 + wave - f.rest[0]);
    f.arm[1] = f.rest[1] + c * (2.5 - wave - f.rest[1]);
    f.lean = Math.sin(t * 1.1 + f.phase) * 0.03;
    if (f.pose !== 'sit') f.y = c * Math.abs(Math.sin(t * 9 + f.phase)) * 0.16;
  }

  goal(team) {
    this.goalT = 3.2;
    this.scorer = team;
    for (const f of this.parents) f.cheer = 2.4;
  }

  kick(k) {
    const P = PITCH, b = this.ball, s = k.team === 0 ? 1 : -1;
    const gx = P.cx + s * P.hl;
    const r = Math.random();
    let tx, tz, sp, up;
    b.save = false;
    if (k.role === 'gk') {
      tx = P.cx + s * rand(0, 6);
      tz = P.cz + rand(-4, 4);
      sp = rand(8, 11);
      up = rand(2, 4);
    } else if (Math.abs(gx - b.x) < 9 && r < 0.7) {
      tx = gx + s;
      tz = P.cz + rand(-1.6, 1.6);
      sp = rand(9, 13);
      up = rand(0, 2);
      b.save = Math.random() < 0.4;
    } else if (r < 0.88) {
      const mates = this.kids.filter((m) => m.team === k.team && m !== k && m.role !== 'gk');
      const m = pick(mates);
      tx = m.x + s * 1.2 + m.vx * 0.4;
      tz = m.z + m.vz * 0.4;
      sp = clamp(Math.hypot(tx - b.x, tz - b.z) * 1.3 + 2, 4, 10);
      up = rand(0, 1.2);
    } else {
      tx = b.x + s * rand(2.5, 4);
      tz = b.z + rand(-1.5, 1.5);
      sp = rand(3.5, 5);
      up = 0;
    }
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1;
    b.vx = (dx / d) * sp;
    b.vz = (dz / d) * sp;
    b.vy = up;
    k.cd = 0.7;
    k.kick = 0.22;
  }

  updateGame(dt) {
    const P = PITCH, b = this.ball;
    // Ball: gravity, bounces, rolling friction, the kickboards, and the goal nets.
    b.vy -= 9.8 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.y < BALL_R) {
      b.y = BALL_R;
      b.vy = b.vy < -1.2 ? -b.vy * 0.45 : 0;
    }
    if (b.y <= BALL_R + 1e-3) {
      const f = Math.exp(-1.0 * dt);
      b.vx *= f;
      b.vz *= f;
    }
    const dz = b.z - P.cz;
    if (Math.abs(dz) > P.hw) {
      b.z = P.cz + Math.sign(dz) * P.hw;
      b.vz *= -0.6;
    }
    const ex = b.x - P.cx;
    if (Math.abs(ex) > P.hl) {
      if (b.inGoal || (Math.abs(b.z - P.cz) < P.gw - BALL_R && b.y < P.gh)) {
        if (!b.inGoal) {
          b.inGoal = true;
          this.goal(ex > 0 ? 0 : 1);
        }
        b.z = clamp(b.z, P.cz - P.gw + BALL_R, P.cz + P.gw - BALL_R);
        if (Math.abs(ex) > P.hl + 0.75) {
          b.x = P.cx + Math.sign(ex) * (P.hl + 0.75);
          b.vx *= -0.15;
          b.vz *= 0.3;
        }
      } else {
        b.x = P.cx + Math.sign(ex) * P.hl;
        b.vx *= -0.6;
      }
    }
    if (this.goalT > 0) {
      this.goalT -= dt;
      if (this.goalT <= 0) Object.assign(b, { x: P.cx, y: BALL_R, z: P.cz, vx: 0, vy: 0, vz: 0, inGoal: false, save: false });
    }

    // Each team sends its nearest outfield kid after the ball; the rest hold a loose shape that follows play.
    const px = b.x + b.vx * 0.3, pz = b.z + b.vz * 0.3;
    const chaser = [null, null], best = [Infinity, Infinity];
    for (const k of this.kids) {
      if (k.role === 'gk') continue;
      const d = Math.hypot(k.x - px, k.z - pz) + (k.cd > 0 ? 1.5 : 0);
      if (d < best[k.team]) { best[k.team] = d; chaser[k.team] = k; }
    }
    for (const k of this.kids) {
      const s = k.team === 0 ? 1 : -1, f = k.f;
      const party = this.goalT > 0 && k.team === this.scorer;
      let tx, tz, top = k.top;
      if (this.goalT > 0) {
        if (party) { tx = P.cx + s * 5.5; tz = P.cz + k.hz * 0.5; }
        else { tx = P.cx + s * k.hx; tz = P.cz + s * k.hz; top = 1.8; }
      } else if (k.role === 'gk') {
        tx = P.cx - s * (P.hl - 0.45);
        tz = P.cz + clamp((b.z - P.cz) * 0.6, -P.gw + 0.4, P.gw - 0.4);
        if (Math.hypot(b.x - tx, b.z - P.cz) < 3.2 && Math.hypot(b.vx, b.vz) < 4) { tx = b.x - s * 0.25; tz = b.z; }
        // Shots straight at the keeper are sometimes saved.
        if (b.save && b.vx * s < -2 && Math.hypot(b.x - k.x, b.z - k.z) < 0.8 && b.y < 1.4) {
          b.vx *= -0.4;
          b.vz += rand(-3, 3);
          b.vy = rand(1, 3);
          b.save = false;
          k.kick = 0.22;
        }
      } else if (k === chaser[k.team]) {
        tx = b.x - s * 0.32;
        tz = b.z;
      } else {
        tx = P.cx + s * k.hx + (b.x - P.cx) * 0.55;
        tz = P.cz + s * k.hz + (b.z - P.cz) * 0.3;
      }
      tx = clamp(tx, P.cx - P.hl - 0.3, P.cx + P.hl + 0.3);
      tz = clamp(tz, P.cz - P.hw + 0.2, P.cz + P.hw - 0.2);
      const dx = tx - k.x, dzz = tz - k.z, d = Math.hypot(dx, dzz);
      const want = Math.min(top, d * 2.4), acc = 10 * dt;
      k.vx += clamp((d > 1e-4 ? (dx / d) * want : 0) - k.vx, -acc, acc);
      k.vz += clamp((d > 1e-4 ? (dzz / d) * want : 0) - k.vz, -acc, acc);
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      k.cd -= dt;
      if (this.goalT <= 0 && k.cd <= 0 && b.y < 0.7 && Math.hypot(b.x - k.x, b.z - k.z) < 0.5) this.kick(k);

      // Run cycle, kick and goal celebrations.
      const sp = Math.hypot(k.vx, k.vz), amp = Math.min(1, sp / 3.5);
      f.phase += sp * dt * 3.2;
      const sw = Math.sin(f.phase) * 0.85 * amp;
      f.leg[0] = sw;
      f.leg[1] = -sw;
      f.arm[0] = -sw * 0.8;
      f.arm[1] = sw * 0.8;
      if (k.kick > 0) {
        k.kick -= dt;
        f.leg[0] = 1.2 * Math.sin((1 - Math.max(0, k.kick) / 0.22) * Math.PI);
      }
      f.y = Math.abs(Math.sin(f.phase)) * 0.06 * amp;
      f.lean = 0.16 * amp;
      if (party) {
        f.y += Math.abs(Math.sin(this.t * 8 + f.phase)) * 0.28;
        f.arm[0] = f.arm[1] = 2.7;
      }
      const face = sp > 0.6 ? Math.atan2(k.vx, k.vz) : Math.atan2(b.x - k.x, b.z - k.z);
      k.yaw = angleLerp(k.yaw, face, Math.min(1, dt * 10));
      f.x = k.x;
      f.z = k.z;
      f.yaw = k.yaw;
    }
    // Keep the kids from running through each other.
    for (let i = 0; i < this.kids.length; i++) {
      for (let j = i + 1; j < this.kids.length; j++) {
        const a = this.kids[i], c = this.kids[j];
        const dx = a.x - c.x, dzz = a.z - c.z, d = Math.hypot(dx, dzz);
        if (d < 0.5 && d > 1e-4) {
          const push = (0.5 - d) / 2;
          a.x += (dx / d) * push; a.z += (dzz / d) * push;
          c.x -= (dx / d) * push; c.z -= (dzz / d) * push;
        }
      }
    }
    this.ballMesh.position.set(b.x, b.y, b.z);
  }
}
