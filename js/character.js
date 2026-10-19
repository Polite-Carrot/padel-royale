import * as THREE from 'three';

// Procedural padel player: FK legs/spine, 2-bone IK arms, keyframed strokes whose
// contact key is the predicted ball position, so racket and ball meet exactly.

const TAU = Math.PI * 2;
const L_UP = 0.3, L_FORE = 0.28;
const RACKET_HEAD = 0.34;
const THIGH = 0.44, SHIN = 0.44, ANKLE_H = 0.08;
const HIP_H = THIGH + SHIN + ANKLE_H;
const HEAD_Y = 1.73;

export const SERVE_HOLD = new THREE.Vector3(0.04, 1.0, -0.46);
const READY = new THREE.Vector3(0.05, 1.3, -0.4);

export const STROKE_TIMING = {
  drive: { dur: 0.68, tc: 0.48 },
  volley: { dur: 0.46, tc: 0.5 },
  lob: { dur: 0.74, tc: 0.5 },
  drop: { dur: 0.66, tc: 0.55 },
  bandeja: { dur: 0.8, tc: 0.55 },
  smash: { dur: 0.86, tc: 0.6 },
  pop: { dur: 0.94, tc: 0.62 },
  serve: { dur: 0.72, tc: 0.55 },
};
export const strokeLead = (anim) => STROKE_TIMING[anim].dur * STROKE_TIMING[anim].tc;

export const LOOKS = [
  { skin: 0xf0c8a0, hair: 0x3b2416, hairStyle: 'short', shirt: 0xff7a1a, shorts: 0x1d2433, shoe: 0xffffff, band: 0x1d2433, headband: true, eyes: 0x3d6b2a },
  { skin: 0xc68a5e, hair: 0x14100e, hairStyle: 'pony', shirt: 0xffa04a, shorts: 0x1d2433, shoe: 0x2ec4b6, band: 0xffffff, headband: false, eyes: 0x2a1a10 },
  { skin: 0x7a4a2c, hair: 0x0d0b0a, hairStyle: 'buzz', shirt: 0x6b5bff, shorts: 0xf2f2f2, shoe: 0x111111, band: 0xffffff, headband: true, eyes: 0x1c120c },
  { skin: 0xe9c4a0, hair: 0xd8b25a, hairStyle: 'bun', shirt: 0x8f84ff, shorts: 0xf2f2f2, shoe: 0xff4d6d, band: 0x6b5bff, headband: false, eyes: 0x2f5d8a },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (u) => u * u * (3 - 2 * u);
const bell = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * k;
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
function K(t, p, o = {}) {
  return { t, p, tw: o.tw ?? 0, cr: o.cr ?? 0.4, lh: o.lh ?? 'R', lean: o.lean ?? 0, up: o.up ?? 1.6 };
}

// Racket-head path in player-local space (x right, y up, -z forward). C = contact point, s = +1 forehand / -1 backhand.
function strokeKeys(anim, C, s) {
  const cy = C.y;
  switch (anim) {
    case 'drive': return { open: 0.05, keys: [
      K(0, READY, { cr: 0.4 }),
      K(0.28, v3(s * 0.8, cy + 0.35, 0.5), { tw: -s * 1.05, cr: 0.45, up: 0.9, lh: s > 0 ? v3(-0.15, 1.25, -0.45) : 'R' }),
      K(0.4, v3(s * 0.85, cy - 0.2, 0.22), { tw: -s * 0.6, cr: 0.5, up: 0.2, lh: s > 0 ? v3(-0.2, 1.2, -0.4) : 'R' }),
      K(0.48, C, { tw: -s * 0.05, cr: 0.45, up: 0.3, lh: s > 0 ? v3(-0.3, 1.15, -0.25) : v3(-0.45, 1.15, 0.3) }),
      K(0.72, v3(-s * 0.45, 1.65, -0.35), { tw: s * 0.75, cr: 0.35, up: 1.3, lh: s > 0 ? v3(-0.25, 1.35, -0.3) : v3(-0.5, 1.15, 0.3) }),
      K(1, v3(-s * 0.15, 1.25, -0.4), { tw: s * 0.2, cr: 0.38, up: 1.4 }),
    ] };
    case 'volley': return { open: 0.35, keys: [
      K(0, READY, { cr: 0.45 }),
      K(0.3, v3(s * 0.6, cy + 0.28, 0.08), { tw: -s * 0.55, cr: 0.55, up: 1.2, lh: s > 0 ? v3(-0.2, 1.25, -0.45) : 'R' }),
      K(0.5, C, { tw: -s * 0.1, cr: 0.55, up: 0.8, lh: s > 0 ? v3(-0.25, 1.2, -0.4) : v3(-0.4, 1.2, 0.2) }),
      K(0.75, v3(C.x * 0.5 + s * 0.1, cy - 0.25, C.z - 0.35), { tw: 0, cr: 0.5, up: 0.6, lh: s > 0 ? v3(-0.25, 1.2, -0.35) : v3(-0.4, 1.2, 0.15) }),
      K(1, READY, { cr: 0.45 }),
    ] };
    case 'lob': return { open: 0.85, keys: [
      K(0, READY, { cr: 0.4 }),
      K(0.28, v3(s * 0.75, cy + 0.15, 0.42), { tw: -s * 0.9, cr: 0.55, up: 0.8, lh: s > 0 ? v3(-0.2, 1.15, -0.45) : 'R' }),
      K(0.42, v3(s * 0.8, cy - 0.3, 0.15), { tw: -s * 0.5, cr: 0.75, up: 0.1, lh: s > 0 ? v3(-0.25, 1.1, -0.4) : 'R' }),
      K(0.5, C, { tw: -s * 0.1, cr: 0.7, up: 0.25, lh: s > 0 ? v3(-0.3, 1.1, -0.3) : v3(-0.45, 1.1, 0.25) }),
      K(0.76, v3(s * 0.15, 2.15, -0.45), { tw: s * 0.35, cr: 0.35, up: 1.5, lh: v3(-0.3, 1.3, -0.2) }),
      K(1, v3(0.05, 1.5, -0.35), { tw: 0.1, cr: 0.35, up: 1.4 }),
    ] };
    case 'drop': return { open: 0.7, keys: [
      K(0, READY, { cr: 0.4 }),
      K(0.35, v3(s * 0.55, cy + 0.5, 0.18), { tw: -s * 0.75, cr: 0.55, up: 1.4, lh: s > 0 ? v3(-0.2, 1.3, -0.45) : 'R' }),
      K(0.55, C, { tw: -s * 0.2, cr: 0.65, up: 0.7, lh: s > 0 ? v3(-0.25, 1.25, -0.35) : v3(-0.4, 1.2, 0.2) }),
      K(0.8, v3(s * 0.25, cy - 0.25, C.z - 0.35), { tw: -s * 0.05, cr: 0.6, up: 0.4, lh: s > 0 ? v3(-0.25, 1.2, -0.3) : v3(-0.4, 1.2, 0.15) }),
      K(1, READY, { cr: 0.45 }),
    ] };
    case 'bandeja': return { open: 0.3, keys: [
      K(0, READY, { cr: 0.35 }),
      K(0.3, v3(0.35, 1.95, 0.42), { tw: -1.15, cr: 0.3, up: 0.6, lh: 'B', lean: 0.08 }),
      K(0.45, v3(0.45, cy + 0.1, 0.3), { tw: -0.95, cr: 0.3, up: 0.4, lh: 'B', lean: 0.05 }),
      K(0.55, C, { tw: -0.25, cr: 0.3, up: 0, lh: v3(-0.35, 1.25, -0.15) }),
      K(0.8, v3(-0.45, 1.0, -0.3), { tw: 0.55, cr: 0.35, up: 0.1, lh: v3(-0.4, 1.1, 0.1), lean: -0.1 }),
      K(1, READY, { tw: 0.15, cr: 0.35 }),
    ] };
    case 'smash': return { open: -0.25, keys: [
      K(0, READY, { cr: 0.35 }),
      K(0.25, v3(0.32, 2.05, 0.18), { tw: -1.25, cr: 0.45, up: 0.7, lh: 'B', lean: 0.15 }),
      K(0.45, v3(0.22, 1.45, 0.48), { tw: -1.05, cr: 0.3, up: -0.6, lh: 'B', lean: 0.25 }),
      K(0.6, C, { tw: 0.1, cr: 0.2, up: 0, lh: v3(-0.3, 1.2, -0.1), lean: -0.15 }),
      K(0.8, v3(-0.4, 0.85, -0.35), { tw: 0.85, cr: 0.45, up: -0.3, lh: v3(-0.35, 1.0, 0.15), lean: -0.35 }),
      K(1, READY, { tw: 0.25, cr: 0.4 }),
    ] };
    case 'pop': return { open: -0.15, keys: [
      K(0, READY, { cr: 0.4 }),
      K(0.25, v3(0.3, 2.1, 0.2), { tw: -1.4, cr: 0.55, up: 0.7, lh: 'B', lean: 0.2 }),
      K(0.47, v3(0.2, 1.35, 0.55), { tw: -1.2, cr: 0.35, up: -0.7, lh: 'B', lean: 0.35 }),
      K(0.62, C, { tw: 0.2, cr: 0.15, up: 0, lh: v3(-0.3, 1.1, -0.05), lean: -0.2 }),
      K(0.82, v3(-0.45, 0.7, -0.4), { tw: 1.0, cr: 0.55, up: -0.4, lh: v3(-0.35, 0.95, 0.2), lean: -0.45 }),
      K(1, READY, { tw: 0.3, cr: 0.45 }),
    ] };
    case 'serve': return { open: 0.15, keys: [
      K(0, v3(0.42, 0.95, 0.12), { tw: -0.35, cr: 0.35, up: 0, lh: 'BALL' }),
      K(0.3, v3(0.6, 0.85, 0.62), { tw: -0.8, cr: 0.45, up: -0.2, lh: v3(-0.25, 1.0, -0.35) }),
      K(0.55, C, { tw: -0.05, cr: 0.45, up: 0.1, lh: v3(-0.35, 1.1, -0.05) }),
      K(0.82, v3(0.0, 1.5, -0.6), { tw: 0.45, cr: 0.35, up: 1.0, lh: v3(-0.35, 1.15, 0.0) }),
      K(1, READY, { tw: 0.1, cr: 0.35 }),
    ] };
  }
  return null;
}

function catmull(p0, p1, p2, p3, u, out) {
  const u2 = u * u, u3 = u2 * u;
  for (const k of ['x', 'y', 'z']) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return out;
}

function evalKeys(keys, t, out) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const u = clamp((t - a.t) / (b.t - a.t), 0, 1);
  catmull(keys[Math.max(0, i - 1)].p, a.p, b.p, keys[Math.min(keys.length - 1, i + 2)].p, u, out);
  const e = smooth(u);
  return { tw: lerp(a.tw, b.tw, e), cr: lerp(a.cr, b.cr, e), lean: lerp(a.lean, b.lean, e), up: lerp(a.up, b.up, e), lhA: a.lh, lhB: b.lh, e };
}

// ---------------------------------------------------------------- racket model
let holeTex = null;
function racketFaceTexture() {
  if (holeTex) return holeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(20,20,24,0.85)';
  for (let y = 18; y < 112; y += 11) {
    for (let x = 18 + ((y / 11) % 2) * 5; x < 112; x += 11) {
      if ((x - 64) ** 2 + (y - 64) ** 2 < 44 ** 2) { g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); }
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 52, 0.4, 1.4); g.stroke();
  holeTex = new THREE.CanvasTexture(c);
  holeTex.colorSpace = THREE.SRGBColorSpace;
  return holeTex;
}

function createRacket(color) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.55, metalness: 0.3 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.15, 10), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 }));
  grip.position.y = 0.075;
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.09, 8), dark);
  throat.position.y = 0.19;
  const faceMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, map: racketFaceTexture() });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.034, 32), faceMat);
  face.rotation.x = Math.PI / 2;
  face.scale.set(0.92, 1, 1.07);
  face.position.y = RACKET_HEAD;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.011, 8, 36), dark);
  rim.scale.set(0.92, 1.07, 1);
  rim.position.y = RACKET_HEAD;
  for (const m of [grip, throat, face, rim]) m.castShadow = true;
  group.add(grip, throat, face, rim);
  return { group, faceMat };
}

// ---------------------------------------------------------------- IK helpers
const _S = new THREE.Vector3(), _D = new THREE.Vector3(), _P = new THREE.Vector3(), _U = new THREE.Vector3();
const _E = new THREE.Vector3(), _F = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _m = new THREE.Matrix4(), _qU = new THREE.Quaternion(), _qF = new THREE.Quaternion(), _qS = new THREE.Quaternion(), _q = new THREE.Quaternion();

function boneQuat(dir, hint, out) {
  _by.copy(dir).negate();
  _bz.copy(hint).addScaledVector(_by, -hint.dot(_by));
  if (_bz.lengthSq() < 1e-8) _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  _m.makeBasis(_bx, _by, _bz);
  return out.setFromRotationMatrix(_m);
}

function solveArm(arm, target, pole, outWrist) {
  arm.shoulder.getWorldPosition(_S);
  _D.subVectors(target, _S);
  let dist = _D.length();
  _D.divideScalar(dist || 1);
  dist = clamp(dist, 0.06, L_UP + L_FORE - 0.002);
  const cosA = clamp((L_UP * L_UP + dist * dist - L_FORE * L_FORE) / (2 * L_UP * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _P.subVectors(pole, _S);
  _P.addScaledVector(_D, -_P.dot(_D));
  if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0).addScaledVector(_D, _D.y);
  _P.normalize();
  _U.copy(_D).multiplyScalar(cosA).addScaledVector(_P, sinA);
  _E.copy(_S).addScaledVector(_U, L_UP);
  outWrist.copy(_S).addScaledVector(_D, dist);
  _F.subVectors(outWrist, _E).normalize();
  boneQuat(_U, _P, _qU);
  boneQuat(_F, _P, _qF);
  arm.shoulder.getWorldQuaternion(_qS);
  arm.upper.quaternion.copy(_qS.invert()).multiply(_qU);
  arm.elbow.quaternion.copy(_qU.invert()).multiply(_qF);
  return outWrist;
}

// ---------------------------------------------------------------- character
const _head = new THREE.Vector3(), _headW = new THREE.Vector3(), _wrist = new THREE.Vector3(), _wristT = new THREE.Vector3();
const _rd = new THREE.Vector3(), _rn = new THREE.Vector3(), _rx = new THREE.Vector3(), _fw = new THREE.Vector3(), _upW = new THREE.Vector3(0, 1, 0);
const _pole = new THREE.Vector3(), _lhA = new THREE.Vector3(), _lhB = new THREE.Vector3(), _lhW = new THREE.Vector3(), _lw = new THREE.Vector3();
const _C = new THREE.Vector3(), _look = new THREE.Vector3(), _SL = new THREE.Vector3(), _tmp = new THREE.Vector3();

export class Character {
  constructor(look) {
    this.look = look;
    const M = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const skin = M(look.skin, 0.6), shirt = M(look.shirt, 0.85), shorts = M(look.shorts, 0.85), hair = M(look.hair, 0.95);
    const shoe = M(look.shoe, 0.5), white = M(0xf5f5f5, 0.7), band = M(look.band, 0.7);
    const eyeWhite = M(0xffffff, 0.25), iris = M(look.eyes, 0.2), mouthMat = M(0x3a1414, 0.6), lipMat = M(0x8a3f36, 0.6);
    const cap = (r, len, m, seg = 12) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, seg), m);
    const sph = (r, m, ws = 16, hs = 12) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m);
    const add = (parent, mesh, x, y, z, shadow = true) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      parent.add(mesh);
      return mesh;
    };

    const root = this.root = new THREE.Group();
    const pelvis = this.pelvis = new THREE.Group();
    pelvis.position.y = HIP_H;
    root.add(pelvis);
    add(pelvis, sph(0.16, shorts), 0, 0, 0).scale.set(1.12, 0.72, 0.82);

    this.legs = [];
    for (const sx of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(sx * 0.095, -0.03, 0);
      pelvis.add(thigh);
      add(thigh, cap(0.088, 0.12, shorts), 0, -0.1, 0);
      add(thigh, cap(0.07, 0.26, skin), 0, -0.24, 0);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      thigh.add(knee);
      add(knee, cap(0.054, 0.3, skin), 0, -0.2, 0);
      add(knee, sph(0.06, skin, 10, 8), 0, -0.15, 0.022).scale.set(0.9, 1.7, 0.85);
      add(knee, new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.05, 0.12, 10), white), 0, -0.37, 0);
      const ankle = new THREE.Group();
      ankle.position.y = -SHIN;
      knee.add(ankle);
      const foot = add(ankle, cap(0.052, 0.13, shoe, 10), 0, -0.035, -0.05);
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1.08, 1, 0.72);
      add(ankle, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.25), white), 0, -0.07, -0.05);
      this.legs.push({ thigh, knee, ankle });
    }

    const lathe = (pts) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 22), shirt);
    const spine = this.spine = new THREE.Group();
    spine.position.y = 0.06;
    pelvis.add(spine);
    add(spine, lathe([[0.001, -0.06], [0.14, -0.05], [0.142, 0.06], [0.134, 0.18], [0.14, 0.3], [0.001, 0.31]]), 0, 0, 0).scale.set(1.05, 1, 0.74);
    const chest = this.chest = new THREE.Group();
    chest.position.y = 0.26;
    spine.add(chest);
    add(chest, lathe([[0.001, -0.06], [0.142, -0.05], [0.162, 0.07], [0.172, 0.15], [0.155, 0.21], [0.1, 0.26], [0.055, 0.285], [0.001, 0.29]]), 0, 0, 0).scale.set(1.1, 1, 0.7);

    this.arms = [];
    for (const sx of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.19, 0.17, 0);
      chest.add(shoulder);
      add(shoulder, sph(0.058, shirt, 12, 10), 0, 0, 0);
      const upper = new THREE.Group();
      shoulder.add(upper);
      add(upper, cap(0.056, 0.05, shirt), 0, -0.06, 0);
      add(upper, cap(0.047, 0.2, skin), 0, -0.16, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -L_UP;
      upper.add(elbow);
      add(elbow, cap(0.041, 0.19, skin), 0, -0.13, 0);
      add(elbow, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 10), band), 0, -0.235, 0);
      add(elbow, sph(0.043, skin, 10, 8), 0, -0.3, 0).scale.set(0.85, 1.15, 0.65);
      this.arms.push({ shoulder, upper, elbow });
    }

    const neck = new THREE.Group();
    neck.position.y = 0.27;
    chest.add(neck);
    add(neck, new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.12, 10), skin), 0, 0.03, 0);
    const head = this.head = new THREE.Group();
    head.position.y = 0.08;
    head.rotation.order = 'YXZ';
    neck.add(head);
    add(head, sph(0.11, skin, 24, 18), 0, 0.1, 0).scale.set(0.88, 1.1, 0.97);
    for (const sx of [1, -1]) add(head, sph(0.026, skin, 8, 6), sx * 0.096, 0.1, 0.005).scale.set(0.45, 1, 0.8);
    add(head, sph(0.019, skin, 8, 6), 0, 0.085, -0.104, false).scale.set(0.8, 1.05, 1.25);

    this.eyes = [];
    for (const sx of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.037, 0.115, -0.092);
      head.add(eye);
      add(eye, sph(0.019, eyeWhite, 12, 10), 0, 0, 0, false).scale.set(1, 1, 0.6);
      const pupil = add(eye, sph(0.0105, iris, 10, 8), 0, 0, -0.0095, false);
      pupil.scale.set(1, 1, 0.5);
      const brow = add(head, new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.009, 0.012), hair), sx * 0.038, 0.147, -0.097, false);
      this.eyes.push({ eye, pupil, brow, side: sx });
    }
    const mouth = new THREE.Group();
    mouth.position.set(0, 0.05, -0.099);
    head.add(mouth);
    this.mouthOpen = add(mouth, sph(0.02, mouthMat, 12, 8), 0, 0, 0, false);
    this.smileArc = add(mouth, new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0042, 6, 14, Math.PI), lipMat), 0, 0.008, -0.002, false);

    const hs = look.hairStyle;
    const top = add(head, new THREE.Mesh(new THREE.SphereGeometry(hs === 'buzz' ? 0.114 : 0.118, 22, 12, 0, TAU, 0, Math.PI * (hs === 'buzz' ? 0.4 : 0.47)), hair), 0, 0.112, 0.01);
    top.rotation.x = 0.62;
    top.scale.set(0.91, 1.1, 1.0);
    if (hs !== 'buzz') add(head, sph(0.104, hair, 16, 12), 0, 0.09, 0.03).scale.set(0.9, 1.0, 0.92);
    if (hs === 'pony') add(head, cap(0.032, 0.13, hair, 8), 0, 0.06, 0.125).rotation.x = 0.45;
    if (hs === 'bun') add(head, sph(0.048, hair, 12, 10), 0, 0.2, 0.075);
    if (hs === 'short') add(head, sph(0.05, hair, 10, 8), 0.02, 0.19, -0.065).scale.set(1.6, 0.5, 0.8);
    if (look.headband) {
      const hb = add(head, new THREE.Mesh(new THREE.TorusGeometry(0.107, 0.013, 6, 28), band), 0, 0.15, 0.005);
      hb.rotation.x = Math.PI / 2 - 0.3;
      hb.scale.set(0.92, 1, 1);
    }

    this.racket = createRacket(0x9aa5b1);
    root.add(this.racket.group);

    this.swing = null;
    this.yaw = 0;
    this.time = Math.random() * 10;
    this.gait = 0;
    this.splitT = 0;
    this.blinkT = 1 + Math.random() * 3;
    this.blinkP = -1;
    this.gruntT = 0;
    this.gruntAmt = 0;
    this.expr = { smile: 0.2, open: 0, tilt: 0, up: 0 };
    this.headYaw = 0;
    this.headPitch = 0;
  }

  setRacketColor(hex) {
    this.racket.faceMat.color.setHex(hex);
  }

  get swinging() {
    return this.swing !== null;
  }

  startSwing(anim, side, contactWorld, simNow, contactTime, opts = {}) {
    const T = STROKE_TIMING[anim];
    const overhead = anim === 'smash' || anim === 'pop' || anim === 'bandeja';
    const dx = contactWorld.x - opts.pos.x, dz = contactWorld.z - opts.pos.z;
    const dh = Math.hypot(dx, dz) || 1;
    const l = clamp(dh - (overhead ? 0.35 : 0.72), 0, 0.7);
    this.swing = {
      anim, side, contact: contactWorld.clone(),
      start: contactTime - T.tc * T.dur, dur: T.dur, tc: T.tc,
      yaw: this.yaw, jump: opts.jump || 0,
      lunge: new THREE.Vector3((dx / dh) * l, 0, (dz / dh) * l),
    };
  }

  cancelSwing() {
    this.swing = null;
  }

  splitStep() {
    if (!this.swing) this.splitT = 0.28;
  }

  grunt(amount) {
    this.gruntT = 0.32;
    this.gruntAmt = amount;
  }

  // Racket-local position of the ball held for the serve, in world space.
  static serveHoldWorld(x, z, yaw, out) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return out.set(x + c * SERVE_HOLD.x + s * SERVE_HOLD.z, SERVE_HOLD.y, z - s * SERVE_HOLD.x + c * SERVE_HOLD.z);
  }

  toLocal(w, out) {
    const p = this.root.position, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const dx = w.x - p.x, dz = w.z - p.z;
    return out.set(c * dx - s * dz, w.y - p.y, s * dx + c * dz);
  }

  update(dt, st) {
    this.time += dt;
    let sw = this.swing;
    let tn = 0;
    if (sw) {
      tn = (st.simTime - sw.start) / sw.dur;
      if (tn >= 1) { this.swing = sw = null; } else tn = Math.max(0, tn);
    }

    this.yaw = sw ? sw.yaw : angleLerp(this.yaw, st.yaw, Math.min(1, dt * 8));
    const root = this.root;
    let ox = 0, oy = 0, oz = 0;
    if (sw) {
      const bl = bell(tn, sw.tc - 0.32, sw.tc + 0.3);
      ox = sw.lunge.x * bl;
      oz = sw.lunge.z * bl;
      if (sw.jump > 0) oy = sw.jump * bell(tn, sw.tc - 0.24, sw.tc + 0.2);
    }
    if (this.splitT > 0) {
      this.splitT -= dt;
      oy += Math.sin(Math.PI * (1 - Math.max(0, this.splitT) / 0.28)) * 0.07;
    }
    root.position.set(st.x + ox, oy, st.z + oz);
    root.rotation.y = this.yaw;

    const speed = Math.hypot(st.vx, st.vz);
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const f = speed > 0.1 ? (st.vx * fwdX + st.vz * fwdZ) / speed : 0;
    const r = speed > 0.1 ? (st.vx * Math.cos(this.yaw) - st.vz * Math.sin(this.yaw)) / speed : 0;
    const amp = clamp(speed / 3, 0, 1) * (sw ? 0.35 : 1);
    this.gait += dt * TAU * (0.7 + speed * 0.19);

    // Pose targets
    let tw = 0, cr = st.alert ? 0.45 : 0.28, lean = -0.18, open = 0.1, up = 1.6;
    let lhA = 'R', lhB = 'R', lhE = 0;
    let stance = 0;
    const pump = Math.max(0, Math.sin(this.time * 9));
    if (sw) {
      this.toLocal(sw.contact, _C);
      const def = strokeKeys(sw.anim, _C, sw.side);
      const ev = evalKeys(def.keys, tn, _head);
      tw = ev.tw; lean = -0.12 + ev.lean; open = def.open; up = ev.up;
      lhA = ev.lhA; lhB = ev.lhB; lhE = ev.e;
      stance = bell(tn, 0.15, 0.95);
      cr = ev.cr + clamp((0.75 - _C.y) / 0.6, 0, 1) * 0.45 * bell(tn, sw.tc - 0.35, sw.tc + 0.3);
    } else if (st.holdBall) {
      _head.set(0.42, 0.95, 0.12);
      lhA = lhB = 'BALL';
      tw = -0.3; cr = 0.3; up = 0;
    } else if (st.mood === 'happy') {
      _head.set(0.3, 2.05 + 0.08 * pump, -0.05);
      lhA = lhB = _lhA.set(-0.22, 1.45 + 0.35 * pump, -0.22).clone();
      cr = 0.2; lean = 0.05; up = 0.6;
    } else if (st.mood === 'sad') {
      _head.set(0.28, 0.42, -0.12);
      lhA = lhB = _lhA.set(-0.04, 1.74, -0.15).clone();
      cr = 0.15; lean = -0.32; up = -0.2;
    } else {
      const bob = Math.sin(this.gait * 2) * 0.03 * amp;
      _head.set(READY.x + Math.sin(this.time * 1.3) * 0.02, READY.y + bob + (st.alert ? 0 : -0.1), READY.z);
      lean = -0.2 - 0.22 * amp * f;
    }
    if (this.splitT > 0) cr += 0.15;

    // Legs
    const hipH = HIP_H - cr * 0.32 + Math.abs(Math.sin(this.gait)) * 0.035 * amp;
    this.pelvis.position.y = hipH;
    const a = Math.acos(clamp((hipH - ANKLE_H) / (THIGH + SHIN), 0.2, 1));
    const sg = Math.sin(this.gait), cg = Math.cos(this.gait);
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const ph = i === 0 ? sg : -sg;
      const lift = Math.max(0, i === 0 ? cg : -cg) * 0.9 * amp;
      const swingA = ph * 0.75 * amp * f;
      // Forehand step: the leg opposite the hitting side goes forward.
      const step = stance * (i === 1 ? 0.35 : -0.22) * (sw ? sw.side : 0);
      L.thigh.rotation.x = a + swingA + lift * 0.35 + step;
      L.knee.rotation.x = -2 * a - lift;
      L.ankle.rotation.x = a - swingA * 0.3 + lift * 0.4 - step * 0.5;
      const side = i === 0 ? 1 : -1;
      L.thigh.rotation.z = side * (0.06 + stance * 0.12 + Math.abs(r) * amp * 0.25 * Math.max(0, ph * Math.sign(r || 1)));
    }

    this.spine.rotation.set(lean, tw * 0.45, -r * amp * 0.08);
    this.chest.rotation.set(lean * 0.4, tw * 0.55, 0);
    root.updateMatrixWorld(true);

    // Racket arm
    _fw.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _headW.copy(_head);
    root.localToWorld(_headW);
    this.arms[0].shoulder.getWorldPosition(_tmp);
    _rd.subVectors(_headW, _tmp).normalize();
    _rd.y += up;
    _rd.normalize();
    _wristT.copy(_headW).addScaledVector(_rd, -RACKET_HEAD);
    const over = smooth(clamp((_head.y - 1.35) / 0.6, 0, 1));
    const back = smooth(clamp((-_head.x - 0.05) / 0.3, 0, 1));
    _pole.set(lerp(lerp(0.75, 0.2, back), 0.75, over), lerp(lerp(0.9, 0.95, back), 1.6, over), lerp(lerp(0.4, -0.35, back), 0.15, over));
    root.localToWorld(_pole);
    solveArm(this.arms[0], _wristT, _pole, _wrist);

    _rd.subVectors(_headW, _wrist).normalize();
    _rn.copy(_fw).multiplyScalar(1 - Math.abs(open)).addScaledVector(_upW, open);
    _rn.addScaledVector(_rd, -_rn.dot(_rd));
    if (_rn.lengthSq() < 1e-6) _rn.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _rn.normalize();
    _rx.crossVectors(_rd, _rn);
    _m.makeBasis(_rx, _rd, _rn);
    _q.setFromRotationMatrix(_m);
    const rk = this.racket.group;
    rk.quaternion.copy(root.quaternion).invert().multiply(_q);
    rk.position.copy(_wrist);
    root.worldToLocal(rk.position);

    // Free arm
    this.arms[1].shoulder.getWorldPosition(_SL);
    const resolveLH = (lh, out) => {
      if (lh === 'R') return out.copy(_wrist).addScaledVector(_rd, 0.19).addScaledVector(_rn, -0.03);
      if (lh === 'B') return out.subVectors(st.look, _SL).normalize().multiplyScalar(0.6).add(_SL);
      if (lh === 'BALL') return root.localToWorld(out.copy(SERVE_HOLD).setY(SERVE_HOLD.y - 0.045));
      return root.localToWorld(out.copy(lh));
    };
    resolveLH(lhA, _lhA);
    resolveLH(lhB, _lhB);
    _lhW.lerpVectors(_lhA, _lhB, lhE);
    this.toLocal(_lhW, _lw);
    _pole.set(-0.75, _lw.y > 1.5 ? 1.5 : 0.9, _lw.y > 1.5 ? 0.1 : 0.3);
    root.localToWorld(_pole);
    solveArm(this.arms[1], _lhW, _pole, _tmp);

    this.updateFace(dt, st, tw, lean, sw, tn, pump);
  }

  updateFace(dt, st, tw, lean, sw, tn, pump) {
    this.toLocal(st.look, _look);
    const leanTotal = lean * 1.4;
    let yaw = Math.atan2(-_look.x, -_look.z) - tw;
    let pitch = Math.atan2(_look.y - HEAD_Y, Math.hypot(_look.x, _look.z));
    if (st.mood === 'sad') { yaw = 0; pitch = -0.5; }
    const cy = clamp(yaw, -1.1, 1.1), cp = clamp(pitch, -0.7, 0.55);
    const k = Math.min(1, dt * 10);
    this.headYaw = angleLerp(this.headYaw, cy, k);
    this.headPitch = lerp(this.headPitch, cp, k);
    this.head.rotation.set(this.headPitch - leanTotal, this.headYaw, 0);

    // Blink
    this.blinkT -= dt;
    if (this.blinkT <= 0 && this.blinkP < 0) this.blinkP = 0;
    let lid = 1;
    if (this.blinkP >= 0) {
      this.blinkP += dt / 0.13;
      lid = 1 - Math.sin(Math.PI * Math.min(1, this.blinkP)) * 0.92;
      if (this.blinkP >= 1) { this.blinkP = -1; this.blinkT = 1.5 + Math.random() * 3.5; }
    }

    // Expression targets
    let smile = 0.25, open = 0, tilt = 0, up = 0;
    if (st.mood === 'happy') { smile = 1; open = 0.3 + 0.25 * pump; up = 0.8; tilt = -0.1; }
    else if (st.mood === 'sad') { smile = -0.8; tilt = -0.8; up = 0.2; }
    else if ((sw && tn < sw.tc) || st.alert) { smile = 0; open = 0.05; tilt = 0.6; up = -0.3; }
    if (this.gruntT > 0) {
      this.gruntT -= dt;
      open = Math.max(open, this.gruntAmt * Math.sin(Math.PI * clamp(this.gruntT / 0.32, 0, 1)));
      tilt = 1; up = -0.5; smile = 0;
    }
    const e = this.expr, ke = Math.min(1, dt * 12);
    e.smile = lerp(e.smile, smile, ke);
    e.open = lerp(e.open, open, ke * 1.5);
    e.tilt = lerp(e.tilt, tilt, ke);
    e.up = lerp(e.up, up, ke);

    const resYaw = yaw - cy, resPitch = pitch - cp;
    for (const eye of this.eyes) {
      eye.eye.scale.y = lid;
      eye.pupil.position.x = clamp(-resYaw * 0.012, -0.006, 0.006);
      eye.pupil.position.y = clamp(resPitch * 0.012, -0.005, 0.005);
      eye.brow.rotation.z = eye.side * e.tilt * 0.4;
      eye.brow.position.y = 0.147 + e.up * 0.008;
    }
    const sm = e.smile;
    this.smileArc.visible = Math.abs(sm) > 0.12;
    this.smileArc.rotation.z = sm > 0 ? Math.PI : 0;
    this.smileArc.scale.set(1, 0.25 + Math.abs(sm) * 0.75, 1);
    this.smileArc.position.y = sm > 0 ? 0.008 : -0.008;
    this.mouthOpen.scale.set(1.15 - e.open * 0.25, 0.12 + e.open * 0.95, 0.4);
    this.mouthOpen.visible = e.open > 0.05 || Math.abs(sm) <= 0.12;
  }
}
