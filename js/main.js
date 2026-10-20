import * as THREE from 'three';
import { BALL_R, COURT, DOOR, makeBall, cloneBall, stepBall, solveShot } from './physics.js';
import { Character, LOOKS, STROKE_TIMING, strokeLead } from './character.js';
import { Sfx } from './audio.js';
import * as Store from './store.js';
import { Link, CODE_LEN, normalizeCode } from './net.js';
import { Crowd } from './crowd.js';

// Real padel physics, played back slightly slower than real time.
const GAME_SPEED = 0.8;
const DT = 1 / 240;
const PLAYER_SPEED = 5.2;
const IDEAL_D = 0.62;
const MAX_HIT_Y = 3.1;
const CONTACT_HORIZON = 0.62;
const KIND_ERR = { drive: 1, volley: 0.85, lob: 0.9, drop: 1.15, bandeja: 0.9, smash: 1.2, pop: 1.5 };

const DIFF = {
  easy: { label: 'Easy', reaction: 0.38, speed: 0.74, err: 1.7, reach: 1.0, miss: 0.12, netRate: 0.2, smart: 0.3, power: 0.85, reward: 120 },
  medium: { label: 'Medium', reaction: 0.24, speed: 0.88, err: 1.1, reach: 1.1, miss: 0.05, netRate: 0.45, smart: 0.65, power: 0.95, reward: 250 },
  hard: { label: 'Hard', reaction: 0.13, speed: 1.0, err: 0.7, reach: 1.2, miss: 0.02, netRate: 0.7, smart: 0.95, power: 1.05, reward: 500 },
};

const FORMATS = {
  quick: { label: 'Quick', desc: '1 set · 4 games · golden pt', setsToWin: 1, games: 4, golden: true, mult: 0.6 },
  standard: { label: 'Set', desc: '1 set · 6 games', setsToWin: 1, games: 6, golden: false, mult: 1 },
  full: { label: 'Match', desc: 'Best of 3 sets', setsToWin: 2, games: 6, golden: false, mult: 1.8 },
};

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sideZ = (t) => (t === 0 ? 1 : -1);
const rightX = (t) => (t === 0 ? 1 : -1);
const sideOf = (z) => (z > 0 ? 0 : 1);
const baseYaw = (t) => (t === 0 ? 0 : Math.PI);
const pan = (x) => x / 6;
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
// Dev aid: ?autopilot lets the AI play your team too.
const AUTOPILOT = new URLSearchParams(location.search).has('autopilot');

// Online play: the host runs the whole simulation; the guest drives team 1 and renders snapshots.
const net = {
  role: null, link: null, code: '',
  remoteAxis: { x: 0, y: 0 }, remoteAuto: false, guestColor: null,
  snaps: [], queue: [], renderT: null, lastSnap: 0, lastIn: { x: 0, y: 0, t: 0 },
  lastRecv: 0, lastSent: 0, marks: { b: null, i: null }, rematch: { me: false, them: false },
};
const NET_INTERP = 0.07;
const NET_TIMEOUT = 15000;
const myTeam = () => (net.role === 'guest' ? 1 : 0);
// Teams with a human-style controller (control ring, manual switching) vs. the CPU side.
const humanSide = (t) => t === 0 || net.role === 'host';
const isHuman = (t) => humanSide(t) && !(t === 0 && AUTOPILOT);
const aiTeam = (t) => !humanSide(t);

function netSend(msg) {
  if (!net.link) return;
  net.link.send(msg);
  net.lastSent = performance.now();
}
function hostSend(msg) {
  if (net.role !== 'host') return;
  msg.st = simTime;
  netSend(msg);
}

const save = Store.load();
let diffKey = DIFF[save.lastDifficulty] ? save.lastDifficulty : 'medium';
let fmtKey = FORMATS[save.lastFormat] ? save.lastFormat : 'quick';
let D = DIFF[diffKey];
let F = FORMATS[fmtKey];

// ---------------------------------------------------------------- renderer
// Phones skip the shadow-map pass (blob shadows instead) and start at a lower resolution that adapts to frame rate.
const SHADOWS = !isTouch;
const MAX_DPR = Math.min(window.devicePixelRatio, isTouch ? 2 : 2);
let dpr = Math.min(MAX_DPR, isTouch ? 1.5 : 2);
const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = (() => {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f8cff');
  grad.addColorStop(0.6, '#8cc8ff');
  grad.addColorStop(1, '#dff1ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
scene.fog = new THREE.Fog(0xcfe8ff, 60, 140);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
const camLook = new THREE.Vector3();
let camBase = { y: 8.2, z: 18.5, lookZ: -1.5 };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (camera.aspect < 1) {
    // Portrait lens and framing are chosen in fitPortrait().
  } else if (isTouch) {
    camera.fov = 44;
    camBase = { y: 7.6, z: 14.4, lookZ: -1.2 };
  } else {
    camera.fov = camera.aspect < 1.6 ? 54 : 50;
    camBase = { y: 7.4, z: 15.2, lookZ: -2.2 };
  }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight(0xffffff, 0x6f9a62, 1.7));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
sun.position.set(-6, 20, 10);
sun.castShadow = SHADOWS;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------------------------------------------------------------- court
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const turfTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#1f7ae8';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(18,90,200,0.55)' : 'rgba(110,175,255,0.35)';
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}, 4, 8);

const fenceTex = canvasTex(64, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#15181d';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath();
  g.stroke();
});

// Fine dark netting: mipmapping turns it into a see-through dark band at a distance, like a real net.
const netTex = canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = 'rgba(10,12,16,0.18)';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(10,12,16,0.95)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, w, h);
}, 222, 19);

function plane(w, h, mat, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  scene.add(m);
  return m;
}

function buildCourt() {
  const W = COURT.halfW, L = COURT.halfL;
  const before = new Set(scene.children);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x66b85a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const apron = new THREE.Mesh(new THREE.PlaneGeometry(19, 26), new THREE.MeshStandardMaterial({ color: 0x2fa866, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.01;
  apron.receiveShadow = true;
  scene.add(apron);

  const turf = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * L), new THREE.MeshStandardMaterial({ map: turfTex, roughness: 0.95 }));
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  scene.add(turf);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const line = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.004, z);
    scene.add(m);
  };
  line(0, COURT.serviceZ, 2 * W, 0.05);
  line(0, -COURT.serviceZ, 2 * W, 0.05);
  line(0, 0, 0.05, 2 * (COURT.serviceZ + 0.2));

  // Tempered glass: a light tint plus bright edges so each 2 m panel reads clearly.
  const glassMat = (faint) => new THREE.MeshStandardMaterial({
    color: 0xd9f1ff, transparent: true, opacity: faint ? 0.06 : 0.2, roughness: 0.05, metalness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const edgeMat = (faint) => new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: faint ? 0.15 : 0.75, depthWrite: false });
  const glassSolid = glassMat(false), glassFaint = glassMat(true);
  const edgeSolid = edgeMat(false), edgeFaint = edgeMat(true);
  const swap = (m, z, solid, faint) => {
    m.userData.swap = { solid, faint, shadow: false, side: Math.sign(z) };
    scene.add(m);
  };
  const edgeBar = (x, y, z, lx, ly, lz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, ly, lz), edgeSolid);
    m.position.set(x, y, z);
    swap(m, z, edgeSolid, edgeFaint);
  };
  // One glass panel, centred at (x, z), facing along z (back wall) or x (side wall).
  const glassPanel = (x, z, w, h, side) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, h), glassSolid);
    m.position.set(x, h / 2, z);
    if (side) m.rotation.y = Math.PI / 2;
    swap(m, z, glassSolid, glassFaint);
    const t = 0.035;
    if (side) {
      edgeBar(x, h - t / 2, z, t, t, w - 0.03);
      for (const e of [-1, 1]) edgeBar(x, h / 2, z + e * (w / 2 - 0.03), t, h, t);
    } else {
      edgeBar(x, h - t / 2, z, w - 0.03, t, t);
      for (const e of [-1, 1]) edgeBar(x + e * (w / 2 - 0.03), h / 2, z, t, h, t);
    }
  };
  // Camera-side panels are faint so they don't block the view of your own half.
  // One shared material; each panel scales its UVs so the diamond mesh stays 35 cm.
  const fenceMk = (faint) => new THREE.MeshBasicMaterial({
    map: fenceTex, transparent: true, opacity: faint ? 0.18 : 1, alphaTest: faint ? 0.05 : 0.4,
    side: THREE.DoubleSide, depthWrite: !faint,
  });
  const fenceSolid = fenceMk(false), fenceFaint = fenceMk(true);
  const fenceMesh = (w, h, x, y, z, rotY = 0) => {
    const m = plane(w, h, fenceSolid, x, y, z, rotY);
    const uv = m.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.35, uv.getY(i) * h / 0.35);
    return m;
  };

  const fencePlane = (w, h, x, y, z, rotY = 0) => {
    const m = fenceMesh(w, h, x, y, z, rotY);
    m.userData.swap = { solid: fenceSolid, faint: fenceFaint, shadow: false, side: Math.sign(z) };
  };
  // Padel cage: back walls are 3 m of glass with 1 m of mesh on top. Each side wall has two 2 m panels
  // of 3 m glass at each end (only the corner one has mesh above, to 4 m), and 3 m mesh along the middle.
  for (const s of [-1, 1]) {
    for (let x = -W + 1; x < W; x += 2) glassPanel(x, s * L, 2, 3, false);
    fencePlane(2 * W, 1, 0, 3.5, s * L);
    for (const sx of [-1, 1]) {
      glassPanel(sx * W, s * 9, 2, 3, true);
      fencePlane(2, 1, sx * W, 3.5, s * 9, Math.PI / 2);
      glassPanel(sx * W, s * 7, 2, 3, true);
    }
  }
  for (const sx of [-1, 1]) {
    const z1 = DOOR.z1;
    for (const [a, b] of [[-6, -z1], [z1, 6]]) fenceMesh(b - a, 3, sx * W, 1.5, (a + b) / 2, Math.PI / 2);
    fenceMesh(2 * z1, 3 - DOOR.h, sx * W, (3 + DOOR.h) / 2, 0, Math.PI / 2);
  }

  const solidFrame = new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.5, metalness: 0.5 });
  const faintFrame = new THREE.MeshStandardMaterial({ color: 0x1b1f26, transparent: true, opacity: 0.25, depthWrite: false });
  const frameMat = solidFrame;
  const frame = (m, z, shadow) => {
    m.castShadow = shadow && SHADOWS;
    if (Math.abs(z) > 5) m.userData.swap = { solid: solidFrame, faint: faintFrame, shadow, side: Math.sign(z) };
    scene.add(m);
  };
  const post = (x, z, h, t = 0.08) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), solidFrame);
    m.position.set(x, h / 2, z);
    frame(m, z, true);
  };
  const rail = (x, y, z, lx, lz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx || 0.05, 0.05, lz || 0.05), solidFrame);
    m.position.set(x, y, z);
    frame(m, z, false);
  };
  for (let z = -L; z <= L; z += 2) for (const sx of [-1, 1]) if (z !== 0) post(sx * W, z, Math.abs(z) >= 8 ? 4 : 3);
  for (let x = -W; x <= W; x += 2) for (const s of [-1, 1]) post(x, s * L, 4);
  for (const s of [-1, 1]) {
    rail(0, 4, s * L, 2 * W);
    rail(0, 3, s * L, 2 * W);
    for (const sx of [-1, 1]) {
      rail(sx * W, 4, s * 9, 0, 2);
      rail(sx * W, 3, s * 9, 0, 2);
    }
  }
  for (const sx of [-1, 1]) {
    rail(sx * W, 3, 0, 0, 12);
    for (const s of [-1, 1]) {
      post(sx * W, s * DOOR.z1, 3, 0.1);
      rail(sx * W, DOOR.h, s * (DOOR.z0 + DOOR.z1) / 2, 0, DOOR.z1 - DOOR.z0);
    }
  }

  // Net: dark netting, white tape on top, white band at the bottom, posts at each side.
  const netMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * W, COURT.netH - 0.02),
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  netMesh.position.set(0, (COURT.netH + 0.02) / 2, 0);
  scene.add(netMesh);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const tape = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.07, 0.025), white);
  tape.position.set(0, COURT.netH - 0.015, 0);
  tape.castShadow = true;
  scene.add(tape);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.04, 0.015), white);
  band.position.set(0, 0.04, 0);
  scene.add(band);
  // Slim posts flush with the wall line hold the net; low enough to leave the doorway clear.
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.4, metalness: 0.6 });
  for (const sx of [-1, 1]) {
    const ph = COURT.netHPost + 0.02;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, ph, 12), postMat);
    p.position.set(sx * (W + 0.02), ph / 2, 0);
    p.castShadow = true;
    scene.add(p);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), white);
    capTop.position.set(sx * (W + 0.02), ph, 0);
    scene.add(capTop);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, COURT.netH, 0.02), white);
    edge.position.set(sx * (W - 0.03), COURT.netH / 2, 0);
    scene.add(edge);
  }

  // Surroundings: light towers and stands
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 9, 8), frameMat);
    pole.position.set(sx * 9.8, 4.5, sz * 11);
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.2), lampMat);
    lamp.position.set(sx * 9.6, 9, sz * 11);
    lamp.lookAt(0, 0, 0);
    scene.add(lamp);
  }
  const standColors = [0xff7a1a, 0xffc23d, 0x2ec4b6, 0x6b5bff];
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5 + i * 0.5, 22), new THREE.MeshStandardMaterial({ color: standColors[i], roughness: 0.8 }));
    s.position.set(sx * (10.5 + i * 1.2), (0.5 + i * 0.5) / 2, 0);
    s.receiveShadow = true;
    scene.add(s);
  }

  const built = scene.children.filter((o) => o.isMesh && !before.has(o));
  for (const m of mergeStatic(built)) {
    const sw = m.userData.swap;
    if (sw) viewSwap.push({ mesh: m, z: sw.side * 10, solid: sw.solid, faint: sw.faint, shadow: sw.shadow });
  }
}

// Bakes static meshes that share a material (and view-swap group) into one draw call each.
function mergeStatic(meshes) {
  const groups = new Map();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const sw = m.userData.swap;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${sw ? `${sw.side}|${sw.faint.uuid}` : ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const out = [];
  const nm = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const list of groups.values()) {
    if (list.length < 2) { out.push(list[0]); continue; }
    let vc = 0, ic = 0;
    for (const m of list) {
      const g = m.geometry;
      vc += g.attributes.position.count;
      ic += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uvs = new Float32Array(vc * 2), idx = new Uint32Array(ic);
    let vo = 0, io = 0;
    for (const m of list) {
      const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
      nm.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).toArray(pos, (vo + i) * 3);
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize().toArray(nor, (vo + i) * 3);
        if (t) { uvs[(vo + i) * 2] = t.getX(i); uvs[(vo + i) * 2 + 1] = t.getY(i); }
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
      else for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
      vo += p.count;
      m.removeFromParent();
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const merged = new THREE.Mesh(geo, list[0].material);
    merged.castShadow = list[0].castShadow;
    merged.receiveShadow = list[0].receiveShadow;
    merged.userData.swap = list[0].userData.swap;
    scene.add(merged);
    out.push(merged);
  }
  return out;
}
const viewSwap = [];
buildCourt();

// The guest watches from the far end: spin the world and fade the fences nearest their camera.
function setViewSide(team) {
  const s = sideZ(team);
  scene.rotation.y = team === 0 ? 0 : Math.PI;
  for (const e of viewSwap) {
    const near = e.z * s > 5;
    e.mesh.material = near ? e.faint : e.solid;
    e.mesh.castShadow = e.shadow && !near;
  }
}
setViewSide(0);

// ---------------------------------------------------------------- ball & markers
const ball = makeBall();
const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.065, 20, 14),
  new THREE.MeshStandardMaterial({ color: 0xe8ff3a, emissive: 0x3d4a00, roughness: 0.5 }),
);
ballMesh.castShadow = true;
scene.add(ballMesh);

function flatMesh(geo, color, opacity) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  scene.add(m);
  return m;
}
const ballShadow = flatMesh(new THREE.CircleGeometry(0.085, 20), 0x000000, 0.35);
const bounceMarker = flatMesh(new THREE.RingGeometry(0.12, 0.18, 28), 0xffffff, 0.75);
const interceptMarker = flatMesh(new THREE.RingGeometry(0.32, 0.4, 32), 0xffb020, 0.55);
const ctrlRing = flatMesh(new THREE.RingGeometry(0.44, 0.54, 32), 0xff7a1a, 0.9);
bounceMarker.visible = interceptMarker.visible = false;
const ctrlArrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 12), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
ctrlArrow.rotation.x = Math.PI;
scene.add(ctrlArrow);
const moveMarker = flatMesh(new THREE.RingGeometry(0.16, 0.26, 28), 0xffffff, 0.9);
moveMarker.visible = false;

// ---------------------------------------------------------------- crowd
const crowdRows = [];
for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) crowdRows.push({ x: sx * (10.5 + i * 1.2), y: 0.5 + i * 0.5, face: sx > 0 ? -Math.PI / 2 : Math.PI / 2 });
const crowd = new Crowd(scene, crowdRows);

// ---------------------------------------------------------------- players
function makePlayer(team, idx) {
  const ch = new Character(LOOKS[team * 2 + idx]);
  if (team === 1) ch.setRacketColor(idx === 0 ? 0x2b2b33 : 0xd03050);
  ch.yaw = baseYaw(team);
  scene.add(ch.root);
  return {
    team, idx, ch,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, prev: { x: 0, z: 0 },
    plan: null, pending: null, cooldown: 0, reactT: 0, rolls: null, rollsFor: -1,
    lane: idx === 0 ? rightX(team) : -rightX(team), crossT: 0,
    stats: null, reach: 1.1, speedMax: PLAYER_SPEED,
    blob: SHADOWS ? null : flatMesh(new THREE.CircleGeometry(0.34, 20), 0x0a1a10, 0.28),
  };
}

const players = [makePlayer(0, 0), makePlayer(0, 1), makePlayer(1, 0), makePlayer(1, 1)];
const teamPlayers = (t) => [players[t * 2], players[t * 2 + 1]];

// Host forwards every animation cue so the guest's characters move identically.
players.forEach((p, i) => {
  const ch = p.ch;
  const { startSwing, cancelSwing, splitStep, grunt } = ch;
  ch.startSwing = (anim, side, c, now, ct, opts = {}) => {
    startSwing.call(ch, anim, side, c, now, ct, opts);
    hostSend({ t: 'sw', i, anim, side, c: [c.x, c.y, c.z], ct, j: opts.jump || 0, sp: opts.spin || 0 });
  };
  ch.cancelSwing = () => { cancelSwing.call(ch); hostSend({ t: 'cs', i }); };
  ch.splitStep = () => { splitStep.call(ch); hostSend({ t: 'ss', i }); };
  ch.grunt = (v) => { grunt.call(ch, v); hostSend({ t: 'gr', i, v }); };
});

const myRacketColor = () => Store.racketTier(save.upgrades).color;
function setRackets(c0, c1 = null) {
  for (const p of teamPlayers(0)) p.ch.setRacketColor(c0);
  for (const p of teamPlayers(1)) p.ch.setRacketColor(c1 ?? (p.idx === 0 ? 0x2b2b33 : 0xd03050));
}
function applyRacketLook() {
  setRackets(myRacketColor());
}

// ---------------------------------------------------------------- audio
const sfx = new Sfx();
window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());

function haptic(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ---------------------------------------------------------------- input
const keys = new Set();
const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
const hitBuffer = [null, null];
const manualSwitchT = [0, 0];
const ctrl = [0, 0];
// Tap-to-move target per team, swipe-chosen serve aim, and which teams use touch (swipe) controls.
const moveTarget = [null, null];
const serveIntent = [null, null];
const touchTeam = [isTouch, false];
let netPaused = false;

function inputAxis() {
  let x = 0, y = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) y += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) y -= 1;
  x += stick.x; y += stick.y;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  return { x, y };
}

// Stick input in world terms: x across the court, y towards the net.
function axisFor(team) {
  const a = team === 0 ? inputAxis() : net.remoteAxis;
  return { x: a.x * rightX(team), y: a.y };
}

function pressAction(act) {
  if (mode !== 'playing' || netPaused) return;
  if (net.role === 'guest') {
    if (act === 'switch') haptic(8);
    netSend({ t: 'act', a: act });
    return;
  }
  actionFor(0, act);
}

function actionFor(team, act, intent = null) {
  if (mode !== 'playing' || !isHuman(team)) return;
  if (act === 'switch') {
    ctrl[team] = 1 - ctrl[team];
    manualSwitchT[team] = 1.2;
    if (team === 0) haptic(8);
    return;
  }
  if (phase === 'preServe' && serve.team === team) {
    serveIntent[team] = intent;
    startToss();
    return;
  }
  hitBuffer[team] = { type: act, t: 0.6, intent };
}

// Tap-to-move: the nearer of your two players takes over and runs to the spot.
function moveFor(team, x, z) {
  if (mode !== 'playing' || !isHuman(team)) return;
  x = clamp(x, -8.9, 8.9);
  z = clamp(z, -10.6, 10.6);
  // Inside the court you can only use your own half; outside you can go anywhere.
  if (!isOut(x)) z = clampZ(team, z);
  const [a, b] = teamPlayers(team);
  const near = Math.hypot(a.pos.x - x, a.pos.z - z) <= Math.hypot(b.pos.x - x, b.pos.z - z) ? a : b;
  if (!near.pending) ctrl[team] = near.idx;
  manualSwitchT[team] = 1.2;
  moveTarget[team] = { x, z };
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'playing' && !netPaused) pauseGame();
    else if (mode === 'paused' || netPaused) resumeGame();
    return;
  }
  if (mode !== 'playing' || netPaused) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'KeyJ') pressAction('drive');
  else if (e.code === 'KeyK') pressAction('lob');
  else if (e.code === 'KeyL') pressAction('smash');
  else if (e.code === 'KeyQ' || e.code === 'Tab') pressAction('switch');
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------- touch: tap to move, swipe to shoot
// Swipes are measured in screen-heights so they feel the same on every phone.
const gestureZone = $('gesture');
const swipeFx = $('swipe-fx');
const swipeCtx = swipeFx.getContext('2d');
const SWIPE = { tap: 0.025, drop: 0.075, smashV: 2.6, popV: 4.2 };
let gesture = null;
let trail = null;
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hitP = new THREE.Vector3();
let moveMarkT = 0;

function screenToCourt(cx, cy) {
  _ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  if (!_ray.ray.intersectPlane(_groundPlane, _hitP)) return null;
  // Back into game coordinates (the guest's world is rotated 180°).
  const v = myTeam() === 0 ? 1 : -1;
  return { x: _hitP.x * v, z: _hitP.z * v };
}

function classifySwipe(g, x, y, t) {
  const H = window.innerHeight;
  const dx = (x - g.x0) / H, dy = (y - g.y0) / H;
  const len = Math.hypot(dx, dy);
  const dur = Math.max(0.03, (t - g.t0) / 1000);
  // Flick speed from the last ~90 ms, so a slow start with a fast finish still counts as fast.
  let k = g.pts.length - 1;
  while (k > 0 && t - g.pts[k][2] < 90) k--;
  const [px, py, pt] = g.pts[k];
  const flick = Math.hypot(x - px, y - py) / H / Math.max(0.016, (t - pt) / 1000);
  const speed = Math.max(len / dur, flick * 0.8);
  if (len < SWIPE.tap && dur < 0.35) return { tap: true };
  if (len < SWIPE.drop) return { k: 'drop', ax: clamp(dx / 0.05, -1, 1), len, speed };
  if (dy > 0 && dy > Math.abs(dx) * 0.7) return { k: 'lob', ax: clamp(Math.atan2(dx, dy) / 0.7, -1, 1), len, speed };
  return { k: 'hit', ax: clamp(Math.atan2(dx, -dy) / 0.7, -1, 1), len, speed };
}

function validIntent(it) {
  if (!it || typeof it !== 'object' || !['drop', 'lob', 'hit'].includes(it.k)) return null;
  return { k: it.k, ax: clamp(Number(it.ax) || 0, -1, 1), len: clamp(Number(it.len) || 0, 0, 2), speed: clamp(Number(it.speed) || 0, 0, 20) };
}

function localSwipe(intent) {
  if (net.role === 'guest') netSend({ t: 'act', a: 'swipe', i: intent });
  else actionFor(0, 'swipe', intent);
}

function localTap(cx, cy) {
  const c = screenToCourt(cx, cy);
  if (!c) return;
  if (net.role === 'guest') netSend({ t: 'mv', x: c.x, z: c.z });
  else moveFor(0, c.x, c.z);
  const v = myTeam() === 0 ? 1 : -1;
  moveMarker.position.set(clamp(c.x, -8.9, 8.9) * v, 0.012, clamp(c.z, -10.6, 10.6) * v);
  moveMarkT = 0.9;
  haptic(6);
}

gestureZone.addEventListener('pointerdown', (e) => {
  if (mode !== 'playing' || netPaused || gesture) return;
  e.preventDefault();
  gestureZone.setPointerCapture(e.pointerId);
  const t = performance.now();
  gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: t, pts: [[e.clientX, e.clientY, t]] };
  trail = { pts: gesture.pts, fade: 1, kind: null };
});
gestureZone.addEventListener('pointermove', (e) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  gesture.pts.push([e.clientX, e.clientY, performance.now()]);
  if (gesture.pts.length > 40) gesture.pts.splice(1, 1);
});
const endGesture = (e) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  const g = gesture;
  gesture = null;
  if (e.type === 'pointercancel' || mode !== 'playing' || netPaused) { trail = null; return; }
  const t = performance.now();
  g.pts.push([e.clientX, e.clientY, t]);
  const it = classifySwipe(g, e.clientX, e.clientY, t);
  if (it.tap) {
    trail = null;
    localTap(e.clientX, e.clientY);
    return;
  }
  trail.kind = it.k === 'lob' ? 'lob' : it.k === 'drop' ? 'drop' : it.speed >= SWIPE.smashV ? 'fast' : 'hit';
  localSwipe(it);
  haptic(10);
};
gestureZone.addEventListener('pointerup', endGesture);
gestureZone.addEventListener('pointercancel', endGesture);

const TRAIL_COLORS = { lob: '120,220,255', drop: '200,255,120', fast: '255,90,60', hit: '255,200,80' };
function drawSwipeTrail(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  if (swipeFx.width !== w || swipeFx.height !== h) { swipeFx.width = w; swipeFx.height = h; }
  swipeCtx.clearRect(0, 0, w, h);
  if (!trail) return;
  if (!gesture) trail.fade -= dt * 3.5;
  if (trail.fade <= 0) { trail = null; return; }
  const p = trail.pts;
  if (p.length < 2) return;
  swipeCtx.lineCap = swipeCtx.lineJoin = 'round';
  const col = TRAIL_COLORS[trail.kind] || '255,255,255';
  for (let i = 1; i < p.length; i++) {
    const u = i / (p.length - 1);
    swipeCtx.strokeStyle = `rgba(${col},${(0.25 + 0.6 * u) * trail.fade})`;
    swipeCtx.lineWidth = 4 + 10 * u;
    swipeCtx.beginPath();
    swipeCtx.moveTo(p[i - 1][0], p[i - 1][1]);
    swipeCtx.lineTo(p[i][0], p[i][1]);
    swipeCtx.stroke();
  }
}

document.addEventListener('contextmenu', (e) => e.preventDefault());
// No zooming of any kind: pinch, double-tap, ctrl+wheel/trackpad pinch or ctrl +/-.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = performance.now();
  if (e.cancelable && now - lastTouchEnd < 350 && !e.target.closest('button, input')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0'].includes(e.code)) e.preventDefault();
});
// Copying and selecting are blocked everywhere; pasting (e.g. a join code) still works.
for (const ev of ['copy', 'cut', 'dragstart']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });

// ---------------------------------------------------------------- game state
let mode = 'menu';
let phase = 'idle';
let phaseT = 0;
let rally = null;
let score = null;
let serve = null;
let serveFaults = 0;
let serveContactT = 0;
let lastPointWinner = null;
let hitCounter = 0;
let matchWinner = null;
let simTime = 0;
const form = ['back', 'back'];
const events = [];

function newScore() {
  return {
    points: [0, 0], games: [0, 0], sets: [0, 0], history: [], totalGames: [0, 0],
    tiebreak: false, gameIndex: 0, firstServer: Math.random() < 0.5 ? 0 : 1,
  };
}

function currentServer() {
  const played = score.points[0] + score.points[1];
  let idx = score.gameIndex;
  if (score.tiebreak) idx += Math.floor((played + 1) / 2);
  const team = (score.firstServer + idx) % 2;
  const pl = Math.floor(idx / 2) % 2;
  return { team, player: teamPlayers(team)[pl], evenSide: played % 2 === 0 };
}

function setPlayerPos(p, x, z) {
  p.pos.x = x; p.pos.z = z;
  p.vel.x = p.vel.z = 0;
  p.plan = null; p.pending = null; p.cooldown = 0;
  p.ch.cancelSwing();
  p.ch.yaw = baseYaw(p.team);
}

function setupServe() {
  const sv = currentServer();
  const T = sv.team, R = 1 - T;
  const sx = rightX(T) * (sv.evenSide ? 1 : -1) * 2.4;
  const boxSign = -Math.sign(sx);
  const partner = teamPlayers(T).find((p) => p !== sv.player);
  const rcv = rightX(R) === boxSign ? teamPlayers(R)[0] : teamPlayers(R)[1];
  const rcvPartner = teamPlayers(R).find((p) => p !== rcv);
  serve = { team: T, server: sv.player, x: sx, boxSign, receiver: rcv };

  setPlayerPos(sv.player, sx, sideZ(T) * 8.3);
  setPlayerPos(partner, -sx, sideZ(T) * 3.4);
  setPlayerPos(rcv, boxSign * 2.6, sideZ(R) * 8.7);
  setPlayerPos(rcvPartner, -boxSign * 2.5, sideZ(R) * 6.2);
  // Each player keeps the half they start the point in; they only cross when forced to.
  for (const p of players) p.lane = Math.sign(p.pos.x);

  Object.assign(ball, { vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, outside: false, onGround: false });
  holdBallAtServer();
  form[T] = 'net';
  form[R] = 'back';
  rally = null;
  lastPointWinner = null;
  hitBuffer[0] = hitBuffer[1] = null;
  moveTarget[0] = moveTarget[1] = null;
  serveIntent[0] = serveIntent[1] = null;
  clearMarkers();
  ctrl[T] = sv.player.idx;
  ctrl[R] = rcv.idx;
  manualSwitchT[0] = manualSwitchT[1] = 0;
  phase = 'preServe';
  phaseT = 0;
  updateHud();
  serveHint({ team: T, second: serveFaults > 0 });
}

const _hold = new THREE.Vector3();
function holdBallAtServer() {
  const p = serve.server;
  Character.serveHoldWorld(p.pos.x, p.pos.z, baseYaw(p.team), _hold);
  ball.x = _hold.x; ball.y = _hold.y; ball.z = _hold.z;
}

// Drop the ball, predict its apex after the bounce, and time the underhand swing to meet it there.
function startToss() {
  if (phase !== 'preServe') return;
  phase = 'toss';
  phaseT = 0;
  serveHint(null);
  holdBallAtServer();
  Object.assign(ball, { vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, onGround: false });
  const b = cloneBall(ball);
  const ev = [];
  let t = 0, bounced = false;
  while (t < 2) {
    ev.length = 0;
    stepBall(b, DT, ev);
    t += DT;
    if (ev.some((e) => e.type === 'ground')) bounced = true;
    if (bounced && b.vy <= 0) break;
  }
  serveContactT = simTime + t;
  serve.whooshed = false;
  serve.server.ch.startSwing('serve', 1, new THREE.Vector3(b.x, b.y, b.z), simTime, serveContactT, { pos: serve.server.pos });
}

function doServe() {
  const T = serve.team, p = serve.server, box = serve.boxSign;
  let tx, depth;
  if (isHuman(T)) {
    const it = serveIntent[T];
    // Swipe serve: direction aims across the box, swipe length sets the depth.
    const a = it ? { x: it.ax * rightX(T), y: clamp((it.len - 0.08) / 0.15, 0, 2) - 1 } : axisFor(T);
    tx = box * 2.5 + a.x * 1.9;
    depth = 5.3 + a.y * 1.1;
  } else {
    tx = Math.random() < D.smart * 0.6 ? box * (Math.random() < 0.5 ? 0.9 : 4.0) : box * (1.2 + Math.random() * 2.6);
    depth = 4.6 + Math.random() * 1.8;
  }
  tx = box * clamp(tx * box, 0.4, 4.6);
  depth = clamp(depth, 2.5, 6.6);
  const tz = -sideZ(T) * depth;
  const from = { x: ball.x, y: ball.y, z: ball.z };
  const dist = Math.hypot(tx - from.x, tz - from.z);
  const ux = (tx - from.x) / dist, uz = (tz - from.z) / dist;
  const s = -60 * p.stats.spin;
  const spin = { x: s * uz, y: 0, z: -s * ux };
  const v = solveShot(from, { x: tx, z: tz }, dist / (15 * p.stats.power), spin, 0.25);
  applyError(v, p.stats.err * 0.7);
  launch(v, spin);
  rally = { lastHit: T, lastKind: 'serve', serve: true, valid: false, netTouch: false, cpuIgnore: false, outPlay: false, stillT: 0, hitId: ++hitCounter };
  p.cooldown = 0.35;
  p.ch.grunt(0.35);
  phase = 'play';
  phaseT = 0;
  play('hit', 'drive', 0.7, pan(p.pos.x));
  afterHit(T, 'serve');
}

function launch(v, spin) {
  ball.vx = v.x; ball.vy = v.y; ball.vz = v.z;
  ball.wx = spin.x; ball.wy = spin.y; ball.wz = spin.z;
  ball.onGround = false;
}

function applyError(v, sigma) {
  const yaw = gauss() * 0.04 * sigma;
  const pitch = gauss() * 0.03 * sigma;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const vx = v.x * c - v.z * s, vz = v.x * s + v.z * c;
  const h = Math.hypot(vx, vz);
  const sp = Math.hypot(h, v.y);
  const ang = Math.atan2(v.y, h) + pitch;
  const nh = sp * Math.cos(ang);
  v.x = h > 0 ? (vx * nh) / h : 0;
  v.z = h > 0 ? (vz * nh) / h : 0;
  v.y = sp * Math.sin(ang);
}

// ---------------------------------------------------------------- shots
const sideExit = (e) => Math.abs(e.x) >= COURT.halfW - 0.1 && Math.abs(e.z) < COURT.halfL - 0.1;
const reachableOutside = (b) => Math.abs(b.x) < 8.9 && Math.abs(b.z) < 10.8;
// Only the designated receiver may play the serve.
const mayPlay = (p) => !(rally.serve && !rally.valid && p !== serve.receiver);

// Simulates the ball ahead to find where this player would meet it. Contact is
// deterministic, so a swing started now lands its racket exactly on the ball.
function findContact(p, horizon) {
  if (!rally || (ball.outside && !rally.outPlay) || !mayPlay(p)) return null;
  const b = cloneBall(ball);
  let valid = rally.valid, outPlay = rally.outPlay;
  const ev = [];
  let t = 0, prevD = Infinity;
  while (t < horizon) {
    ev.length = 0;
    stepBall(b, DT, ev);
    t += DT;
    for (const e of ev) {
      if (e.type === 'ground') {
        if (valid || sideOf(e.z) === rally.lastHit) return null;
        valid = true;
      } else if (e.type === 'groundOut') {
        return null;
      } else if (e.type === 'out') {
        if (!valid || !sideExit(e)) return null;
        outPlay = true;
      } else if (e.type === 'wall' && !valid && sideOf(e.z) !== rally.lastHit) {
        return null;
      }
    }
    // Out-of-court play: once the ball has gone out over a side wall it can be chased anywhere outside.
    const chase = b.outside && outPlay;
    if ((sideOf(b.z) !== p.team && !chase) || (b.outside && !(outPlay && reachableOutside(b)))) { prevD = Infinity; continue; }
    if (rally.serve && !valid) continue;
    if (b.y < 0.12 || b.y > MAX_HIT_Y) continue;
    if (!valid && Math.abs(p.pos.z) > 5.5 && b.y < 1.9) continue;
    const k = Math.min(t, 0.2);
    const d = Math.hypot(b.x - (p.pos.x + p.vel.x * k), b.z - (p.pos.z + p.vel.z * k));
    if (d > p.reach || (b.y < 0.3 && b.vy > 0) || (b.y > 1.7 && b.vy > 3.5)) { prevD = d; continue; }
    if (d <= IDEAL_D + 0.08 || d > prevD || (b.y > 1.9 && d < p.reach * 0.85)) {
      return { t, x: b.x, y: b.y, z: b.z, bounced: valid, d };
    }
    prevD = d;
  }
  return null;
}

function strokeFor(kind, p, c) {
  const rel = (c.x - p.pos.x) * rightX(p.team);
  let side = rel >= -0.05 ? 1 : -1;
  // From outside: low balls near the access go back through it, everything else is lobbed over the fence.
  if (Math.abs(c.x) > COURT.halfW || Math.abs(p.pos.x) > COURT.halfW) kind = Math.abs(c.z) < 2.2 && c.y < 1.4 ? 'drive' : 'lob';
  if (kind === 'pop' && c.y < 2.1) kind = 'smash';
  if (kind === 'smash' && c.y < 1.6) kind = 'drop';
  if (kind === 'drive' && c.y > 1.85) kind = 'bandeja';
  if (kind === 'drive' && !c.bounced && Math.abs(p.pos.z) < 5) kind = 'volley';
  const anim = kind === 'lob' && c.y > 1.7 ? 'bandeja' : kind;
  if (anim === 'smash' || anim === 'pop' || anim === 'bandeja') side = 1;
  return { kind, anim, side };
}

function rollsFor(p) {
  if (p.rollsFor !== rally.hitId) {
    p.rollsFor = rally.hitId;
    p.rolls = [Math.random(), Math.random(), Math.random(), Math.random()];
  }
  return p.rolls;
}

function aiChooseKind(p, c) {
  const r = rollsFor(p);
  const opp = teamPlayers(1 - p.team);
  const oppNet = opp.every((h) => Math.abs(h.pos.z) < 4.8);
  const oppBack = opp.every((h) => Math.abs(h.pos.z) > 6.5);
  if (c.y > 1.9) {
    if (c.y > 2.2 && Math.abs(p.pos.z) < 5 && r[0] < 0.1 + D.smart * 0.55) return 'pop';
    return r[1] < 0.3 + D.smart * 0.4 ? 'smash' : 'drive';
  }
  if (oppNet && r[0] < 0.25 + D.smart * 0.45) return 'lob';
  if (Math.abs(p.pos.z) < 4.5 && oppBack && r[1] < 0.3 * D.smart) return 'drop';
  if (r[2] < 0.1) return 'lob';
  return 'drive';
}

// Swipe intent -> stroke. Smashes need a high ball and a very fast swipe; por tres needs an even faster one.
function swipeKind(it, p, c) {
  if (it.k === 'lob') return 'lob';
  if (it.k === 'drop') return 'drop';
  if (c.y >= 1.9 && it.speed >= SWIPE.smashV) {
    return c.y >= 2.25 && Math.abs(p.pos.z) < 5 && it.speed >= SWIPE.popV ? 'pop' : 'smash';
  }
  return 'drive';
}

const _contact = new THREE.Vector3();
function tryCommit(p, type, intent = null) {
  if (p.cooldown > 0 || p.pending) return false;
  const c = findContact(p, CONTACT_HORIZON);
  if (!c) return false;
  let kind = type;
  if (type === 'ai') kind = aiChooseKind(p, c);
  else if (type === 'swipe') kind = swipeKind(intent, p, c);
  else if (type === 'smash') kind = c.y >= 2.25 && Math.abs(p.pos.z) < 5 ? 'pop' : 'smash';
  const s = strokeFor(kind, p, c);
  const lead = strokeLead(s.anim);
  if (c.t > lead + DT * 0.5) return false;
  const incoming = Math.hypot(ball.vx, ball.vy, ball.vz);
  // Fresh roll per attempt; a second chance at the same ball (e.g. off the glass) is rarely fluffed.
  const retry = p.missFor === rally.hitId;
  const whiff = type === 'ai' && Math.random() < D.miss * (1 + incoming / 25) * (retry ? 0.25 : 1);
  if (whiff) p.missFor = rally.hitId;
  p.pending = { time: simTime + c.t, kind: s.kind, anim: s.anim, rushed: clamp((lead - c.t) / lead, 0, 1), whiff, whooshed: false, intent };
  let jump = 0, spin = 0;
  if (s.anim === 'smash' || s.anim === 'pop') {
    // Anime leap: smashes always get airborne, por tres adds a full spin.
    jump = Math.max(clamp(c.y - 2.3, 0, 0.8), s.anim === 'pop' ? 0.55 : 0.35);
    spin = s.anim === 'pop' ? 1 : 0;
  } else if (s.anim === 'bandeja') jump = clamp(c.y - 2.5, 0, 0.2);
  p.ch.startSwing(s.anim, s.side, _contact.set(c.x, c.y, c.z), simTime, p.pending.time, { pos: p.pos, jump, spin });
  return true;
}

function resolveContact(p, pd) {
  const mySide = sideOf(ball.z) === p.team || (ball.outside && rally?.outPlay);
  const legal = phase === 'play' && rally && p.team !== rally.lastHit && mySide &&
    !(rally.serve && !rally.valid) && (!ball.outside || rally.outPlay);
  const d = Math.hypot(ball.x - p.pos.x, ball.z - p.pos.z);
  if (!legal || d > p.reach * 1.2 || pd.whiff) {
    p.cooldown = 0.25;
    return;
  }
  if (!isHuman(p.team)) aiShot(p, pd);
  else humanShot(p, pd);
}

function updateSwings() {
  for (const p of players) {
    const pd = p.pending;
    if (!pd) continue;
    if (!pd.whooshed && simTime >= pd.time - 0.1) {
      pd.whooshed = true;
      play('whoosh', pd.anim === 'pop' || pd.anim === 'smash' ? 1.3 : pd.anim === 'drop' ? 0.4 : 0.8, pan(p.pos.x));
    }
    if (simTime >= pd.time - DT * 0.5) {
      p.pending = null;
      resolveContact(p, pd);
      if (phase !== 'play') return;
    }
  }
  if (phase !== 'play' || !rally) return;
  const R = 1 - rally.lastHit;
  const team = teamPlayers(R);
  if (team.some((p) => p.pending)) return;

  if (!isHuman(R)) {
    if (rally.cpuIgnore) return;
    for (const p of team) {
      if (!p.plan && team[1 - p.idx].plan) continue;
      if (tryCommit(p, 'ai')) return;
    }
    return;
  }
  const ci = ctrl[R];
  const buf = hitBuffer[R];
  const auto = R === 0 ? save.settings.autoSwing : net.remoteAuto;
  for (const p of [team[ci], team[1 - ci]]) {
    let type;
    if (buf) type = buf.type;
    else if (p === team[ci] && auto) type = 'drive';
    else continue;
    if (tryCommit(p, type, buf ? buf.intent : null)) {
      hitBuffer[R] = null;
      ctrl[R] = p.idx;
      return;
    }
  }
}

function shotQuality(p, kind, pd) {
  const overhead = kind === 'smash' || kind === 'pop' || kind === 'bandeja';
  const d = Math.hypot(ball.x - p.pos.x, ball.z - p.pos.z);
  const incoming = Math.hypot(ball.vx, ball.vy, ball.vz);
  let q = 1;
  q -= clamp(Math.abs(d - (overhead ? 0.4 : IDEAL_D)) / Math.max(0.35, p.reach - 0.25), 0, 1) * 0.45;
  q -= pd.rushed * 0.45;
  q -= clamp(Math.hypot(p.vel.x, p.vel.z) / p.speedMax, 0, 1) * 0.18;
  if (ball.y < 0.3) q -= 0.15;
  if (ball.y > 1.9 && !overhead) q -= 0.2;
  q -= clamp((incoming - 16) / 24, 0, 0.25);
  return clamp(q, 0.05, 1);
}

function performShot(p, kind, tx, depthAdj, pd, mods = {}) {
  const team = p.team, dir = -sideZ(team), st = p.stats;
  const q = shotQuality(p, kind, pd);
  const fromOutside = Math.abs(ball.x) > COURT.halfW;

  const from = { x: ball.x, y: ball.y, z: ball.z };
  let depth = 7.2, vh = 17, T = 0, top = 150, clear = 0.4;
  switch (kind) {
    case 'drive':
      if (fromOutside) { depth = 6.5; vh = 13; top = 60; clear = 0.3; tx = clamp(tx, -3, 3); }
      break;
    case 'volley': depth = 6.8; vh = 14; top = -40; clear = 0.22; break;
    case 'bandeja': depth = 7.6; vh = 14; top = -90; clear = 0.45; break;
    case 'smash': depth = 6.0; vh = 25; top = 40; clear = 0.12; break;
    case 'pop':
      // Por tres: steep and flat into the side of the box so it kicks off the back glass and out.
      depth = 4.6; vh = 34; top = 0; clear = 0.1;
      tx = (Math.sign(tx) || (Math.random() < 0.5 ? -1 : 1)) * clamp(Math.abs(tx), 2.4, 3.0);
      depthAdj = clamp(depthAdj, -0.8, 0.8);
      break;
    case 'lob': {
      // A mistimed lob lands short and low: a gift for the net player to smash.
      const bad = 1 - q;
      depth = 8.5 - bad * (1.5 + Math.random() * 3.5);
      T = (2.0 + (Math.abs(from.z) > 7 ? 0.25 : 0)) * (1 - bad * 0.35);
      top = 70;
      clear = 0.8 + q * 1.2;
      if (fromOutside) {
        depth = 7.2 - bad * 2.5;
        T = 2.4 * (1 - bad * 0.2);
        tx = clamp(tx, -2.5, 2.5);
      }
      break;
    }
    case 'drop': depth = 2.4; vh = 8.5; top = -130; clear = 0.15; break;
  }
  // Swipe shots: length/speed choose depth, pace and lob height (a mistimed lob still drops short).
  if (kind === 'lob' && mods.lobT) {
    const bad = 1 - q;
    T = mods.lobT * (1 - bad * 0.3);
    clear = mods.lobClear * (0.6 + 0.4 * q);
    depth = mods.depth - bad * (1 + Math.random() * 2.5);
  } else if (mods.depth != null && kind !== 'pop') depth = mods.depth;
  if (mods.vhMul) vh *= mods.vhMul;
  depth = clamp(depth + depthAdj, 2.0, 9.2);
  tx = clamp(tx, -4.5, 4.5);
  vh *= st.power * (0.75 + 0.25 * q);
  const tz = dir * depth;
  const dist = Math.hypot(tx - from.x, tz - from.z);
  const ux = (tx - from.x) / dist, uz = (tz - from.z) / dist;
  const s = top * (top > 0 ? st.spin : Math.sqrt(st.spin));
  const spin = { x: s * uz, y: 0, z: -s * ux };
  const v = solveShot(from, { x: tx, z: tz }, T || dist / vh, spin, clear);
  applyError(v, st.err * (0.35 + 2.4 * Math.pow(1 - q, 1.3)) * (KIND_ERR[kind] || 1) * (0.7 + vh / 40));
  launch(v, spin);
  finishHit(p, kind, Math.hypot(v.x, v.y, v.z));
}

function finishHit(p, kind, speed) {
  const team = p.team;
  rally.lastHit = team;
  rally.lastKind = kind;
  rally.valid = false;
  rally.serve = false;
  rally.netTouch = false;
  rally.cpuIgnore = false;
  rally.outPlay = false;
  rally.stillT = 0;
  rally.hitId = ++hitCounter;
  phaseT = 0;
  p.cooldown = 0.35;
  play('hit', kind, speed / 25, pan(p.pos.x));
  p.ch.grunt(kind === 'pop' || kind === 'smash' ? 1 : kind === 'drive' || kind === 'bandeja' ? 0.55 : 0.3);
  const buzz = kind === 'pop' ? 35 : kind === 'smash' ? 25 : 12;
  if (team === 0) haptic(buzz);
  else hostSend({ t: 'hap', ms: buzz });
  moveTarget[team] = null;
  if (kind === 'smash' || kind === 'pop') smashFx(kind, ball.x, ball.y, ball.z, isHuman(team) || kind === 'pop');
  afterHit(team, kind);
}

const ramp = (lo, hi, v) => clamp((v - lo) / (hi - lo), 0, 1);
function humanShot(p, pd) {
  const it = pd.intent;
  if (it) {
    const vs = rightX(p.team);
    let tx = it.ax * 4.2 * vs;
    let mods;
    if (pd.kind === 'lob' && it.k === 'lob') {
      // Longer swipe = higher lob; faster swipe = deeper lob.
      const hgt = ramp(0.07, 0.42, it.len);
      mods = { lobT: 1.5 + 1.3 * hgt, lobClear: 0.6 + 2.2 * hgt, depth: 5.6 + 3.4 * ramp(0.4, 2.6, it.speed) };
    } else if (pd.kind === 'drop') {
      tx = it.ax * 2.8 * vs;
      mods = { depth: 1.8 + 1.4 * ramp(SWIPE.tap, SWIPE.drop, it.len) };
    } else {
      // Faster swipe = faster ball; longer swipe = deeper ball.
      mods = { vhMul: 0.7 + 0.6 * ramp(0.6, 3.6, it.speed), depth: 4.2 + 4.8 * ramp(0.08, 0.42, it.len) };
    }
    performShot(p, pd.kind, tx, 0, pd, mods);
    return;
  }
  const a = axisFor(p.team);
  const tx = Math.abs(a.x) > 0.2 ? a.x * 3.6 : -ball.x * 0.6;
  const depthAdj = a.y > 0.2 ? a.y * 1.3 : a.y < -0.2 ? a.y * 2.8 : 0;
  performShot(p, pd.kind, tx, depthAdj, pd);
}

function aiShot(p, pd) {
  const opp = teamPlayers(1 - p.team);
  let tx;
  if (Math.random() < D.smart) {
    let best = -1;
    for (const c of [-3.9, -2.2, 0, 2.2, 3.9]) {
      const gap = Math.min(...opp.map((h) => Math.abs(h.pos.x - c)));
      if (gap > best) { best = gap; tx = c; }
    }
  } else {
    tx = (Math.random() * 2 - 1) * 3.2;
  }
  performShot(p, pd.kind, tx, (Math.random() - 0.5) * 1.6, pd);
}

function afterHit(team, kind) {
  const R = 1 - team;
  for (const p of teamPlayers(team)) p.plan = null;
  for (const p of teamPlayers(R)) p.ch.splitStep();
  if (aiTeam(team)) {
    if (kind === 'lob' || Math.random() < D.netRate) form[1] = 'net';
    else form[1] = 'back';
  }
  if (kind === 'lob') form[R] = 'back';
  planTeam(R, true);
}

// ---------------------------------------------------------------- prediction & AI
function inServiceBox(x, z) {
  return Math.abs(z) <= COURT.serviceZ && x * serve.boxSign >= -0.02;
}

function predictFor(team) {
  const b = cloneBall(ball);
  const r = { ...rally };
  const samples = [];
  const ev = [];
  let firstBounce = null, endFault = false, t = 0;
  while (t < 4) {
    ev.length = 0;
    stepBall(b, DT, ev);
    t += DT;
    let stop = false;
    for (const e of ev) {
      if (e.type === 'ground') {
        const s = sideOf(e.z);
        if (!r.valid) {
          if (s === r.lastHit || (r.serve && !inServiceBox(e.x, e.z))) { endFault = true; stop = true; }
          else { r.valid = true; firstBounce = { x: e.x, z: e.z }; }
        } else stop = true;
      } else if (e.type === 'wall') {
        if (!r.valid && (r.serve || sideOf(e.z) !== r.lastHit)) { endFault = true; stop = true; }
        else if (r.valid && r.serve && e.surf === 'mesh') { endFault = true; stop = true; }
      } else if (e.type === 'out') {
        if (r.valid && sideExit(e)) r.outPlay = true;
        else {
          if (!r.valid) endFault = true;
          stop = true;
        }
      } else if (e.type === 'groundOut') {
        stop = true;
      }
    }
    if (stop) break;
    if ((sideOf(b.z) === team || (b.outside && r.outPlay)) && b.y > 0.08 && b.y < MAX_HIT_Y && (!r.serve || r.valid) &&
      (!b.outside || (r.outPlay && reachableOutside(b)))) {
      samples.push({ t, x: b.x, y: b.y, z: b.z, bounced: r.valid });
    }
  }
  return { samples, firstBounce, endFault };
}

function clampZ(team, z, outside = false) {
  // Outside the cage players may run the full length, past the net line, to chase a ball.
  if (outside) return clamp(z, -10.6, 10.6);
  return team === 0 ? clamp(z, 0.4, 9.75) : clamp(z, -9.75, -0.4);
}

const doorZ = (team) => sideZ(team) * (DOOR.z0 + DOOR.z1) / 2;
const isOut = (x) => Math.abs(x) > COURT.halfW;
function needsDoor(p, tx) {
  return isOut(p.pos.x) !== isOut(tx) || (isOut(p.pos.x) && Math.sign(p.pos.x) !== Math.sign(tx));
}

function routeDist(p, tx, tz) {
  if (!needsDoor(p, tx)) return Math.hypot(tx - p.pos.x, tz - p.pos.z);
  const out = isOut(p.pos.x);
  const sx = out ? Math.sign(p.pos.x) : Math.sign(tx), dz = doorZ(p.team);
  const ax = sx * (out ? 5.55 : 4.45), bx = sx * (out ? 4.45 : 5.55);
  return Math.hypot(ax - p.pos.x, dz - p.pos.z) + Math.abs(bx - ax) + Math.hypot(tx - bx, tz - dz);
}

// Next point to walk to: straight there, or line up with the door and go through it.
function waypoint(p, tx, tz) {
  if (!needsDoor(p, tx)) return null;
  const out = isOut(p.pos.x);
  const sx = out ? Math.sign(p.pos.x) : Math.sign(tx);
  const dz = doorZ(p.team);
  if (Math.abs(p.pos.z - dz) > 0.15) return { x: sx * (out ? 5.55 : 4.45), z: dz };
  return { x: sx * (out ? 4.3 : 5.7), z: dz };
}

function bestIntercept(p, samples, reaction, allowOut) {
  let best = null;
  for (let i = 0; i < samples.length; i += 2) {
    const s = samples[i];
    if (s.t < 0.08) continue;
    // Back-court players let low balls bounce (and come off the glass) instead of volleying.
    if (!s.bounced && Math.abs(s.z) > 5.5 && s.y < 1.9) continue;
    const out = isOut(s.x);
    if (out && !allowOut) continue;
    const x = out ? Math.sign(s.x) * clamp(Math.abs(s.x) - 0.5, 5.35, 8.9) : clamp(s.x - rightX(p.team) * 0.5, -4.75, 4.75);
    const z = clampZ(p.team, s.z + sideZ(p.team) * 0.1, out);
    const need = reaction + routeDist(p, x, z) / (p.speedMax * 0.92);
    if (need > s.t) continue;
    const comfy = (s.y > 0.35 && s.y < 1.5) || (s.y > 1.9 && s.y < 2.8);
    const score = s.t + (comfy ? 0 : 0.8);
    if (!best || score < best.score) best = { p, x, z, y: s.y, t: simTime + s.t, score };
    if (comfy) break;
  }
  return best;
}

function planTeam(team, fresh) {
  if (!rally || phase !== 'play') return;
  const pred = predictFor(team);
  const tps = teamPlayers(team);
  if (team === 0) {
    bounceMarker.visible = save.settings.guides && !!pred.firstBounce;
    if (pred.firstBounce) bounceMarker.position.set(pred.firstBounce.x, 0.008, pred.firstBounce.z);
  } else if (net.role === 'host') {
    net.marks.b = pred.firstBounce ? [pred.firstBounce.x, pred.firstBounce.z] : null;
  }
  if (aiTeam(team) && fresh) {
    rally.cpuIgnore = pred.endFault && Math.random() < D.smart;
    for (const p of tps) p.reactT = D.reaction;
  }
  for (const p of tps) p.plan = null;
  if (aiTeam(team) && rally.cpuIgnore) return;
  const allowOut = !aiTeam(team) || rollsFor(tps[0])[2] < 0.3 + D.smart * 0.6;
  const reaction = aiTeam(team) && fresh ? D.reaction : 0;
  const plans = tps.map((p) => (mayPlay(p) ? bestIntercept(p, pred.samples, reaction, allowOut) : null));
  let chosen = null;
  for (const pl of plans) {
    if (!pl) continue;
    // Stay in your own half unless your partner can't get there.
    if (pl.x * pl.p.lane < -0.8) pl.score += 1.5;
    else if (Math.abs(pl.x) < 0.8 && pl.p.lane === -rightX(team)) pl.score -= 0.05;
    if (!chosen || pl.score < chosen.score) chosen = pl;
  }
  if (chosen) {
    chosen.p.plan = chosen;
    if (!rally.serve && chosen.x * chosen.p.lane < -0.8) for (const p of tps) p.lane = -p.lane;
  }
  if (humanSide(team)) {
    if (fresh && manualSwitchT[team] <= 0 && chosen) ctrl[team] = chosen.p.idx;
    const mine = plans[ctrl[team]];
    if (team === 0) {
      interceptMarker.visible = save.settings.guides && !!mine;
      if (mine) interceptMarker.position.set(mine.x, 0.007, mine.z);
    } else {
      net.marks.i = mine ? [mine.x, mine.z] : null;
    }
  }
}

function clearMarkers() {
  bounceMarker.visible = interceptMarker.visible = false;
  net.marks.b = net.marks.i = null;
}

function formationTarget(p) {
  const team = p.team;
  const partner = teamPlayers(team)[1 - p.idx];
  let z;
  if (humanSide(team) && partner === teamPlayers(team)[ctrl[team]]) z = sideZ(team) * clamp(Math.abs(partner.pos.z), 3.2, 8.2);
  else z = sideZ(team) * (form[team] === 'net' ? 3.4 : 7.8);
  return { x: p.lane * Math.max(0.9, 2.3 + p.lane * ball.x * 0.2), z };
}

// ---------------------------------------------------------------- rules
function pointLabel(s, t) {
  if (s.tiebreak) return String(s.points[t]);
  const p = s.points[t], o = s.points[1 - t];
  if (p >= 3 && o >= 3) return !F.golden && p > o ? 'AD' : '40';
  return ['0', '15', '30', '40'][Math.min(p, 3)];
}

function awardPoint(team, reason, hitter = null) {
  if (phase !== 'play') return;
  const s = score, o = 1 - team;
  s.points[team]++;
  let lvl = 'Point';
  let gameWon = false;
  if (s.tiebreak) gameWon = s.points[team] >= 7 && s.points[team] - s.points[o] >= 2;
  else if (F.golden) gameWon = s.points[team] >= 4;
  else gameWon = s.points[team] >= 4 && s.points[team] - s.points[o] >= 2;

  if (gameWon) {
    const wasTB = s.tiebreak;
    s.games[team]++;
    s.totalGames[team]++;
    s.points = [0, 0];
    s.gameIndex++;
    lvl = 'Game';
    const N = F.games;
    let setWon = wasTB || (s.games[team] >= N && s.games[team] - s.games[o] >= 2);
    if (!setWon && s.games[0] === N && s.games[1] === N) {
      s.tiebreak = true;
      reason = 'Tie-break!';
    }
    if (setWon) {
      s.tiebreak = false;
      s.history.push([...s.games]);
      s.sets[team]++;
      s.games = [0, 0];
      lvl = 'Set';
      if (s.sets[team] >= F.setsToWin) {
        matchWinner = team;
        lvl = 'Match';
      }
    }
  }
  serveFaults = 0;
  phase = 'pointOver';
  phaseT = 0;
  lastPointWinner = team;
  for (const p of players) p.pending = null;
  clearMarkers();
  const porTres = reason.startsWith('Por tres');
  announce({ k: 'point', team, lvl, reason, hitter, big: gameWon || porTres, ooh: porTres });
  updateHud();
}

function fault(team, reason) {
  awardPoint(1 - team, reason, team);
}

function serveFault(reason) {
  serveFaults++;
  if (serveFaults >= 2) {
    const T = serve.team;
    awardPoint(1 - T, 'Double fault');
    return;
  }
  phase = 'serveReset';
  phaseT = 0;
  clearMarkers();
  announce({ k: 'plain', title: 'Fault', reason, tone: 'neutral' });
}

function serveLet() {
  phase = 'serveReset';
  phaseT = 0;
  announce({ k: 'plain', title: 'Let', reason: 'Replay the serve', tone: 'neutral' });
}

function processEvent(e) {
  if (e.type === 'ground' || e.type === 'groundOut') play('bounce', e.speed, pan(e.x));
  else if (e.type === 'wall' || e.type === 'wallOutside') play(e.surf === 'glass' ? 'glass' : 'mesh', e.speed, pan(e.x));
  else if (e.type === 'net' || e.type === 'netcord') play('net', e.type === 'netcord', pan(e.x));

  if (phase === 'toss') return;
  if (phase !== 'play' || !rally) return;
  const T = rally.lastHit;
  switch (e.type) {
    case 'netcord':
      if (rally.serve) rally.netTouch = true;
      break;
    case 'ground': {
      const s = sideOf(e.z);
      if (!rally.valid) {
        if (s === T) {
          if (rally.serve) return serveFault('Into the net');
          return fault(T, 'Into the net');
        }
        if (rally.serve) {
          if (!inServiceBox(e.x, e.z)) return serveFault('Out of the service box');
          if (rally.netTouch) return serveLet();
        }
        rally.valid = true;
        bounceMarker.visible = false;
        net.marks.b = null;
        planTeam(1 - T, false);
      } else {
        return awardPoint(T, s === T ? 'Came back over!' : 'Double bounce');
      }
      break;
    }
    case 'wall': {
      const s = sideOf(e.z);
      if (!rally.valid) {
        if (rally.serve) return serveFault('Hit the wall first');
        if (s !== T) return fault(T, `{hitter} shot hit the ${e.surf === 'glass' ? 'glass' : 'fence'} on the full`);
      } else if (rally.serve && e.surf === 'mesh') {
        return serveFault('Serve hit the fence');
      }
      planTeam(1 - T, false);
      break;
    }
    case 'out':
      if (rally.valid) {
        // Out over a side wall or through a door is still live: the defenders may chase it outside.
        if (sideExit(e)) {
          rally.outPlay = true;
          planTeam(1 - T, false);
          announce({ k: 'chase', team: 1 - T });
          break;
        }
        return awardPoint(T, winnerOutReason(T));
      }
      if (rally.serve) return serveFault('Out');
      return fault(T, 'Out');
    case 'groundOut':
      if (rally.valid) return awardPoint(T, winnerOutReason(T));
      return fault(T, 'Out');
  }
}

function winnerOutReason() {
  if (rally.lastKind === 'pop' || rally.lastKind === 'smash') return 'Por tres! Smashed out of the court';
  return 'Out of the court — winner!';
}

// ---------------------------------------------------------------- update
const DOOR_Z0 = DOOR.z0 + 0.2, DOOR_Z1 = DOOR.z1 - 0.2;
const inDoorway = (z) => Math.abs(z) > DOOR_Z0 && Math.abs(z) < DOOR_Z1;

// Walls block players except at the doors. Outside, players can roam the whole length of the court,
// but may only come back in through a door on their own half.
function movePlayer(p, dt, desiredX, desiredZ) {
  const k = Math.min(1, dt * 10);
  p.vel.x += (desiredX - p.vel.x) * k;
  p.vel.z += (desiredZ - p.vel.z) * k;
  const wasOut = isOut(p.pos.x);
  let nx = p.pos.x + p.vel.x * dt;
  let nz = clampZ(p.team, p.pos.z + p.vel.z * dt, wasOut);
  const sx = Math.sign(nx) || 1, ax = Math.abs(nx);
  const ownDoor = inDoorway(nz) && sideOf(nz) === p.team;
  if (!ownDoor) {
    if (wasOut && ax < 5.25) nx = sx * 5.25;
    else if (!wasOut && ax > 4.75) nx = sx * 4.75;
  }
  nx = clamp(nx, -9, 9);
  if (Math.abs(nx) > 4.75 && Math.abs(nx) < 5.25) nz = Math.sign(nz) * clamp(Math.abs(nz), DOOR_Z0, DOOR_Z1);
  if (!isOut(nx)) nz = clampZ(p.team, nz);
  p.pos.x = nx;
  p.pos.z = nz;
}

function seek(p, dt, tx, tz, slow = 1) {
  const wp = waypoint(p, tx, tz);
  if (wp) { tx = wp.x; tz = wp.z; }
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.02) return movePlayer(p, dt, 0, 0);
  const sp = Math.min(p.speedMax * slow, wp ? Infinity : dist * 4);
  movePlayer(p, dt, (dx / dist) * sp, (dz / dist) * sp);
}

function updatePlayers(dt) {
  for (const p of players) {
    p.cooldown = Math.max(0, p.cooldown - dt);
    // Players plant their feet while swinging.
    const slow = p.pending ? 0.3 : p.ch.swinging ? 0.6 : 1;
    if (isHuman(p.team) && p === teamPlayers(p.team)[ctrl[p.team]]) {
      const a = axisFor(p.team);
      const mt = moveTarget[p.team];
      if (Math.hypot(a.x, a.y) > 0.05) {
        moveTarget[p.team] = null;
        movePlayer(p, dt, a.x * p.speedMax * slow, -sideZ(p.team) * a.y * p.speedMax * slow);
      } else if (mt) {
        seek(p, dt, mt.x, mt.z, slow);
      } else if (touchTeam[p.team]) {
        // Touch assist: with no tap target, run to the incoming ball (or back into position).
        const tgt = p.plan || formationTarget(p);
        seek(p, dt, tgt.x, tgt.z, slow);
      } else {
        movePlayer(p, dt, 0, 0);
      }
      // If you deliberately run deep into your partner's half, they swap over to cover yours.
      const partner = teamPlayers(p.team)[1 - ctrl[p.team]];
      const crossed = !isOut(p.pos.x) && Math.sign(p.pos.x) === partner.lane && Math.abs(p.pos.x) > 1.4;
      p.crossT = crossed ? p.crossT + dt : 0;
      if (p.crossT > 0.5) {
        p.lane = -p.lane;
        partner.lane = -partner.lane;
        p.crossT = 0;
      }
      continue;
    }
    if (p.reactT > 0) {
      p.reactT -= dt;
      movePlayer(p, dt, p.vel.x * 0.9, p.vel.z * 0.9);
      continue;
    }
    const tgt = p.plan || formationTarget(p);
    seek(p, dt, tgt.x, tgt.z, slow);
  }
  for (const t of [0, 1]) {
    const [a, b] = teamPlayers(t);
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6 && d > 1e-4) {
      const push = (0.6 - d) / 2;
      a.pos.x += (dx / d) * push; a.pos.z += (dz / d) * push;
      b.pos.x -= (dx / d) * push; b.pos.z -= (dz / d) * push;
    }
  }
}

function stepBallAndRules(dt) {
  events.length = 0;
  stepBall(ball, dt, events);
  for (const e of events) processEvent(e);
}

function simStep(dt) {
  simTime += dt;
  phaseT += dt;
  for (const t of [0, 1]) {
    if (hitBuffer[t] && (hitBuffer[t].t -= dt) <= 0) hitBuffer[t] = null;
    manualSwitchT[t] -= dt;
  }

  switch (phase) {
    case 'preServe':
      holdBallAtServer();
      if (!isHuman(serve.team) && phaseT > 1.1) startToss();
      break;
    case 'toss':
      stepBallAndRules(dt);
      if (!serve.whooshed && simTime >= serveContactT - 0.1) {
        serve.whooshed = true;
        play('whoosh', 0.6, pan(serve.server.pos.x));
      }
      if (simTime >= serveContactT - DT * 0.5) doServe();
      break;
    case 'play':
      updatePlayers(dt);
      updateSwings();
      if (phase !== 'play') break;
      stepBallAndRules(dt);
      if (phase === 'play') {
        const sp = Math.hypot(ball.vx, ball.vy, ball.vz);
        rally.stillT = sp < 0.3 && ball.y < 0.1 ? rally.stillT + dt : 0;
        if (rally.stillT > 0.6 || phaseT > 30) {
          if (rally.valid) awardPoint(rally.lastHit, 'Dead ball');
          else fault(rally.lastHit, 'Dead ball');
        }
      }
      break;
    case 'serveReset':
    case 'pointOver':
      updatePlayers(dt);
      stepBallAndRules(dt);
      if (phaseT > (phase === 'serveReset' ? 1.2 : 1.9)) {
        if (phase === 'pointOver' && matchWinner !== null) endMatch();
        else setupServe();
      }
      break;
  }
}

// ---------------------------------------------------------------- visuals
const _look = new THREE.Vector3();
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function updateVisuals(dt, rdt) {
  camera.position.sub(_shake);
  // Draw between the last two physics steps so motion is smooth at any frame rate.
  const a = renderAlpha;
  const bx = lerp(ballPrev.x, ball.x, a), by = lerp(ballPrev.y, ball.y, a), bz = lerp(ballPrev.z, ball.z, a);
  ballMesh.position.set(bx, by, bz);
  ballShadow.position.set(bx, 0.006, bz);
  const sh = clamp(1 - by / 8, 0.3, 1);
  ballShadow.scale.setScalar(0.8 + by * 0.15);
  ballShadow.material.opacity = 0.35 * sh;
  ballShadow.visible = Math.abs(bx) < 9.5 && Math.abs(bz) < 12.5;

  _look.set(bx, by, bz);
  const celebrate = phase === 'pointOver' || mode === 'over';
  const winner = mode === 'over' ? matchWinner : lastPointWinner;
  const visTime = simTime - (1 - a) * DT;
  for (const p of players) {
    const px = lerp(p.prev.x, p.pos.x, a), pz = lerp(p.prev.z, p.pos.z, a);
    const base = baseYaw(p.team);
    const holding = phase === 'preServe' && serve && p === serve.server;
    let yaw = base;
    if (!holding) {
      const want = Math.atan2(-(bx - px), -(bz - pz));
      yaw = base + clamp(wrapAngle(want - base), -0.7, 0.7);
    }
    p.ch.update(dt, {
      simTime: visTime, yaw, look: _look,
      x: px, z: pz, vx: p.vel.x, vz: p.vel.z,
      alert: phase === 'play' && !!rally && rally.lastHit !== p.team,
      mood: celebrate && winner !== null ? (p.team === winner ? 'happy' : 'sad') : null,
      holdBall: holding,
    });
    if (p.blob) {
      p.blob.position.set(px, 0.007, pz);
      const lift = p.ch.root.position.y;
      p.blob.scale.setScalar(1 - Math.min(0.5, lift * 0.6));
    }
  }

  const me = myTeam();
  const ctrlP = teamPlayers(me)[ctrl[me]];
  const cx = lerp(ctrlP.prev.x, ctrlP.pos.x, a), cz = lerp(ctrlP.prev.z, ctrlP.pos.z, a);
  const showCtrl = mode === 'playing' || mode === 'paused';
  ctrlRing.visible = ctrlArrow.visible = showCtrl;
  ctrlRing.position.set(cx, 0.009, cz);
  ctrlArrow.position.set(cx, 2.45 + Math.sin(performance.now() / 200) * 0.05, cz);
  moveMarkT = Math.max(0, moveMarkT - rdt);
  moveMarker.visible = moveMarkT > 0 && showCtrl;
  if (moveMarker.visible) {
    moveMarker.material.opacity = Math.min(1, moveMarkT * 2) * 0.9;
    moveMarker.scale.setScalar(1 + (0.9 - moveMarkT) * 0.6);
  }

  crowd.update(rdt);
  updateFx(rdt, bx, by, bz);

  // Camera x is in view space; the guest's world is spun 180°.
  const k = Math.min(1, rdt * 2.5);
  if (camera.aspect < 1) {
    fitPortrait(me);
    camera.position.lerp(_fitPos, k);
    camLook.lerp(_fitLook, k);
  } else {
    if (camera.view) camera.clearViewOffset();
    const camX = mode === 'menu' ? Math.sin(performance.now() / 4000) * 6 : (bx * 0.25 + cx * 0.15) * rightX(me);
    camera.position.x = lerp(camera.position.x, camX, k);
    camera.position.y = lerp(camera.position.y, camBase.y, k);
    camera.position.z = lerp(camera.position.z, camBase.z, k);
    camLook.set(camera.position.x * 0.4, 0.3, camBase.lookZ);
  }
  camera.lookAt(camLook);
  const amp = fx.shake * fx.shake * 0.6;
  _shake.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp * 0.5);
  camera.position.add(_shake);
  const dc = AUTOPILOT && window.__cam;
  if (dc && dc.follow !== undefined) {
    const fp = players[dc.follow].pos;
    camera.position.set(fp.x + dc.off[0], dc.off[1], fp.z + dc.off[2]);
    camera.lookAt(fp.x, 1.1, fp.z);
  } else if (dc) {
    camera.position.set(...dc.pos);
    camera.lookAt(...dc.look);
  }
}

// ---------------------------------------------------------------- smash FX
// Camera shake, speed lines, an impact burst and a comet trail.
const fx = { shake: 0, trail: 0, burst: -1 };
const _shake = new THREE.Vector3();
const burstSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.translate(128, 128);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,230,120,0.9)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2, r = i % 2 ? 40 : 90 + Math.random() * 38;
      g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    g.closePath();
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })(),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
burstSprite.visible = false;
scene.add(burstSprite);
const TRAIL_N = 16;
const trailMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.06, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xffa52e, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  TRAIL_N,
);
trailMesh.frustumCulled = false;
trailMesh.count = 0;
scene.add(trailMesh);
const trailPts = [];
const _tm = new THREE.Matrix4();

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function renderSmashFx(kind, x, y, z, full) {
  const big = kind === 'pop';
  fx.trail = 1.5;
  fx.burst = 0;
  burstSprite.position.set(x, y, z);
  if (!full) {
    fx.shake = Math.max(fx.shake, 0.22);
    return;
  }
  fx.shake = big ? 0.6 : 0.42;
  restartAnim($('speedlines'), 'show');
  crowd.celebrate(big ? 1 : 0.75);
  sfx.crowd(big ? 1.1 : 0.7, big);
}

function smashFx(kind, x, y, z, full) {
  renderSmashFx(kind, x, y, z, full);
  hostSend({ t: 'fx', k: kind, p: [x, y, z], f: full });
}

function updateFx(rdt, bx, by, bz) {
  fx.shake = Math.max(0, fx.shake - rdt * 1.2);
  if (fx.burst >= 0) {
    fx.burst += rdt;
    const u = fx.burst / 0.45;
    if (u >= 1) { fx.burst = -1; burstSprite.visible = false; }
    else {
      burstSprite.visible = true;
      burstSprite.scale.setScalar(0.4 + 3.2 * Math.sqrt(u));
      burstSprite.material.opacity = 1 - u * u;
      burstSprite.material.rotation = u * 0.6;
    }
  }
  fx.trail = Math.max(0, fx.trail - rdt);
  const fast = mode === 'playing' && phase === 'play' && Math.hypot(ball.vx, ball.vy, ball.vz) > 21;
  if (fx.trail > 0 || fast) {
    trailPts.unshift(bx, by, bz);
    if (trailPts.length > TRAIL_N * 3) trailPts.length = TRAIL_N * 3;
  } else if (trailPts.length) {
    trailPts.length = Math.max(0, trailPts.length - 6);
  }
  const n = trailPts.length / 3;
  trailMesh.count = n;
  trailMesh.material.color.setHex(fx.trail > 0 ? 0xff7a2e : 0xffd060);
  for (let i = 0; i < n; i++) {
    const s = (1 - i / TRAIL_N) * (fx.trail > 0 ? 1.4 : 0.9);
    _tm.makeScale(s, s, s).setPosition(trailPts[i * 3], trailPts[i * 3 + 1], trailPts[i * 3 + 2]);
    trailMesh.setMatrixAt(i, _tm);
  }
  trailMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- portrait camera
// Portrait keeps a normal lens and a fixed viewing angle; the camera slides along that angle until the
// whole court (plus your players, if they run outside) fits between the HUD and the controls.
const PORTRAIT_PITCH = 0.52;
const _fitPos = new THREE.Vector3(), _fitLook = new THREE.Vector3();
// Fit to the playing surface and the top of the far glass; walls nearer the camera may crop slightly.
const FIT_COURT = [
  [-5, 0, 10.1], [5, 0, 10.1], [-5, 0, -10], [5, 0, -10], [-5, 3.2, -10], [5, 3.2, -10],
];
const fitPts = [];
let fitHud = { h: 0, px: 0 };
let fitMid = 0;
const PORTRAIT_FOV = 30;
// Fraction of the whole-court distance used during play (lower = closer).
const PORTRAIT_ZOOM = 0.62;
function fitPortrait(me) {
  fitPts.length = 0;
  for (const p of FIT_COURT) fitPts.push(p);
  const h = window.innerHeight;
  const hudOn = !$('hud').classList.contains('hidden');
  // Measuring the HUD forces a layout pass, so cache it until the window changes.
  if (hudOn && fitHud.h !== h) fitHud = { h, px: $('scoreboard').offsetTop + $('scoreboard').offsetHeight + 6 };
  const topPx = hudOn ? fitHud.px : 16;
  const mTop = (2 * topPx) / h, mBot = 20 / h;
  // A long lens maximises how much of a tall screen the whole court can fill at this angle.
  if (camera.fov !== PORTRAIT_FOV) {
    camera.fov = PORTRAIT_FOV;
    camera.updateProjectionMatrix();
  }
  if (mode !== 'menu') {
    // View coordinates: the guest's world is rotated 180°.
    const v = me === 0 ? 1 : -1;
    for (const p of teamPlayers(me)) {
      const x = p.pos.x * v, z = p.pos.z * v;
      fitPts.push([x - 0.7, 0, z], [x + 0.7, 0, z], [x, 2.1, z]);
    }
  }
  const r = fitCourt(camera.fov, mTop, mBot);
  const s = Math.sin(PORTRAIT_PITCH), c = Math.cos(PORTRAIT_PITCH);
  let d = r.d, lx = r.cx, lz = r.z, mid = r.mid;
  if (mode !== 'menu') {
    // In play: zoom in on the action and follow a point between the ball and your player.
    const v = me === 0 ? 1 : -1;
    const cp = teamPlayers(me)[ctrl[me]];
    const focusX = ball.x * v * 0.6 + cp.pos.x * v * 0.4, focusZ = ball.z * v * 0.6 + cp.pos.z * v * 0.4;
    d = r.d * PORTRAIT_ZOOM;
    lx = clamp(focusX * 0.85, -3.5, 3.5);
    lz = r.z + (focusZ - r.z) * 0.8;
    mid = 0;
    // Never show grass past either end: near baseline stays at/below the screen bottom, far glass at/above the HUD.
    const th = Math.tan((camera.fov * Math.PI) / 360);
    const lift = (mTop - mBot) / 2;
    const solveTz = (dist, y, z, target) => {
      let lo = -16, hi = 16;
      for (let i = 0; i < 22; i++) {
        const m = (lo + hi) / 2;
        const vy = y - dist * s, vz = z - (m + dist * c);
        if ((c * vy - s * vz) / ((-s * vy - c * vz) * th) < target) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    };
    const slack = (dist) => solveTz(dist, 3.2, -10, 1 + lift - mTop) - solveTz(dist, 0, 10.1, -1 + lift);
    // Close enough that the court is at least as tall as the screen.
    if (slack(d) > 0) {
      let lo = d * 0.4, hi = d;
      for (let i = 0; i < 18; i++) {
        const m = (lo + hi) / 2;
        if (slack(m) > 0) hi = m; else lo = m;
      }
      d = lo;
    }
    const tzNear = solveTz(d, 0, 10.1, -1 + lift);
    const tzFar = solveTz(d, 3.2, -10, 1 + lift - mTop);
    lz = clamp(lz, Math.min(tzFar, tzNear), tzNear);
  }
  _fitLook.set(lx, 0, lz);
  _fitPos.set(lx, d * s, lz + d * c);
  // Lens shift: keep the subject centred in the space below the HUD.
  const shiftPx = (mid - (mBot - mTop) / 2) * h / 2;
  portraitShift = lerp(portraitShift, shiftPx, 0.2);
  camera.setViewOffset(window.innerWidth, h, 0, portraitShift, window.innerWidth, h);
}
let portraitShift = 0;

// Closest camera distance (along the fixed pitch) that keeps every fit point on screen, centred vertically.
function fitCourt(fov, mTop, mBot) {
  const mSide = 0.012;
  const th = Math.tan((fov * Math.PI) / 360), tw = th * camera.aspect;
  const s = Math.sin(PORTRAIT_PITCH), c = Math.cos(PORTRAIT_PITCH);
  let minX = Infinity, maxX = -Infinity;
  for (const p of fitPts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
  const cx = (minX + maxX) / 2;
  const fits = (tz, d) => {
    const cy = d * s, cz = tz + d * c;
    let lo = Infinity, hi = -Infinity;
    for (const [x, y, z] of fitPts) {
      const vx = x - cx, vy = y - cy, vz = z - cz;
      const depth = -s * vy - c * vz;
      if (depth < 1) return false;
      const ny = (c * vy - s * vz) / (depth * th);
      if (Math.abs(vx / (depth * tw)) > 1 - mSide || ny > 1 - mTop || ny < -1 + mBot) return false;
      lo = Math.min(lo, ny); hi = Math.max(hi, ny);
    }
    fitMid = (lo + hi) / 2;
    return true;
  };
  let bestD = Infinity;
  for (let tz = -8; tz <= 8; tz += 0.5) {
    let lo = 2, hi = 120;
    if (!fits(tz, hi)) continue;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (fits(tz, mid)) hi = mid; else lo = mid;
    }
    bestD = Math.min(bestD, hi);
  }
  if (!isFinite(bestD)) bestD = 30;
  const d = bestD * 1.01, band = (mBot - mTop) / 2;
  let bestZ = 0, bestOff = Infinity, mid = 0;
  for (let tz = -8; tz <= 8; tz += 0.1) {
    if (!fits(tz, d)) continue;
    const off = Math.abs(fitMid - band);
    if (off < bestOff) { bestOff = off; bestZ = tz; mid = fitMid; }
  }
  return { cx, d, z: bestZ, mid };
}


// ---------------------------------------------------------------- HUD & menus
function setHint(t) {
  $('hint').textContent = t;
  $('hint').classList.toggle('show', !!t);
}

let msgTimer = 0;
function showMessage(title, sub, tone) {
  const m = $('message');
  m.className = `message show ${tone}`;
  m.querySelector('.msg-title').textContent = title;
  m.querySelector('.msg-sub').textContent = sub || '';
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => m.classList.remove('show'), 1600);
}

// Messages are described by team so each player sees them from their own side.
function renderAnnounce(s) {
  const me = myTeam();
  const opp = net.role ? 'Rival' : 'CPU';
  const who = s.hitter === me ? 'Your' : net.role ? 'Their' : 'CPU';
  const reason = String(s.reason || '').replace('{hitter}', who);
  if (s.k === 'point') {
    const mine = s.team === me;
    const title = s.lvl === 'Match' ? (mine ? 'Match won!' : 'Match lost') : mine ? `${s.lvl}!` : `${s.lvl} ${opp}`;
    showMessage(title, reason, mine ? 'good' : 'bad');
    if (s.ooh && !mine) sfx.ooh();
    if (mine) sfx.crowd(s.big ? 1.3 : 0.8, !!s.big);
    else sfx.crowd(s.big ? 0.6 : 0.35, false);
    if (mine) haptic(30);
    crowd.celebrate(s.big ? 1 : mine ? 0.45 : 0.25);
  } else if (s.k === 'chase') {
    if (s.team === me) showMessage('Out of the court!', 'Run out through the door', 'neutral');
  } else {
    showMessage(String(s.title || ''), reason, s.tone === 'good' || s.tone === 'bad' ? s.tone : 'neutral');
  }
}

function announce(s) {
  renderAnnounce(s);
  hostSend({ t: 'msg', s });
}

function renderHint(h) {
  const how = isTouch ? 'swipe up to serve (direction aims)' : 'press SPACE (aim with arrows)';
  const t = h && h.team === myTeam() ? `${h.second ? 'Second serve' : 'Your serve'} — ${how}` : '';
  setHint(t);
}

function serveHint(h) {
  renderHint(h);
  hostSend({ t: 'hint', h });
}

const SFX_FORWARD = ['bounce', 'glass', 'mesh', 'net', 'hit', 'whoosh'];
// Positional sounds; the last argument is always the stereo pan.
function play(m, ...a) {
  sfx[m](...a);
  hostSend({ t: 'sfx', m, a });
}

function formatMoney(n) {
  return `$${n.toLocaleString('en-US')}`;
}

function updateMoney() {
  document.querySelectorAll('.money-value').forEach((el) => { el.textContent = formatMoney(save.money); });
}

function updateHud() {
  if (!score) return;
  const srv = phase === 'preServe' || phase === 'toss' || phase === 'play' ? serve?.team : null;
  renderHud(score, srv);
  hostSend({ t: 'hud', score, srv });
}

function renderHud(s, srv) {
  const me = myTeam();
  for (const t of [0, 1]) {
    const row = $(t === me ? 'sb-you' : 'sb-cpu');
    row.querySelector('.sb-serve').classList.toggle('on', srv === t);
    row.querySelector('.sb-sets').innerHTML = s.history.map((h) => `<span>${Number(h[t]) || 0}</span>`).join('');
    row.querySelector('.sb-games').textContent = s.games[t];
    row.querySelector('.sb-pts').textContent = pointLabel(s, t);
  }
  $('sb-cpu').querySelector('.sb-name').textContent = net.role ? 'RIVAL' : `CPU · ${D.label}`;
  $('sb-tag').textContent = s.tiebreak ? 'TIE-BREAK' : F.golden && s.points[0] >= 3 && s.points[1] >= 3 ? 'GOLDEN POINT' : '';
}

function show(id, on) {
  $(id).classList.toggle('hidden', !on);
}

function buildMenu() {
  const diffSeg = $('diff-seg');
  diffSeg.innerHTML = Object.entries(DIFF).map(([k, d]) =>
    `<button data-v="${k}" class="${k === diffKey ? 'sel' : ''}">${d.label}<small>Win ${formatMoney(Math.round(d.reward * F.mult))}</small></button>`).join('');
  const fmtSeg = $('fmt-seg');
  fmtSeg.innerHTML = Object.entries(FORMATS).map(([k, f]) =>
    `<button data-v="${k}" class="${k === fmtKey ? 'sel' : ''}">${f.label}<small>${f.desc}</small></button>`).join('');
  diffSeg.querySelectorAll('button').forEach((b) => b.onclick = () => {
    diffKey = b.dataset.v; D = DIFF[diffKey]; save.lastDifficulty = diffKey; Store.save(save); buildMenu();
  });
  fmtSeg.querySelectorAll('button').forEach((b) => b.onclick = () => {
    fmtKey = b.dataset.v; F = FORMATS[fmtKey]; save.lastFormat = fmtKey; Store.save(save); buildMenu();
  });
  $('opt-guides').checked = save.settings.guides;
  $('opt-auto').checked = save.settings.autoSwing;
  $('menu-racket').textContent = Store.racketTier(save.upgrades).name;
  $('menu-record').textContent = `${save.stats.wins}W – ${save.stats.losses}L`;
  updateMoney();
}

function buildShop() {
  const u = save.upgrades;
  const tier = Store.racketTier(u);
  $('shop-racket-name').textContent = tier.name;
  $('shop-racket-swatch').style.background = `#${tier.color.toString(16).padStart(6, '0')}`;
  const next = Store.TIERS.find((t) => t.min > Store.totalLevel(u));
  $('shop-racket-next').textContent = next ? `${next.min - Store.totalLevel(u)} more upgrades to unlock ${next.name}` : 'Fully upgraded';
  $('shop-list').innerHTML = Store.UPGRADES.map((up) => {
    const lvl = u[up.id];
    const cost = Store.upgradeCost(lvl);
    const pips = Array.from({ length: Store.MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    const btn = cost === null
      ? '<button class="btn small" disabled>MAX</button>'
      : `<button class="btn small primary" data-up="${up.id}" ${save.money < cost ? 'disabled' : ''}>${formatMoney(cost)}</button>`;
    return `<div class="shop-row"><div><b>${up.name}</b><p>${up.desc}</p><div class="pips">${pips}</div></div>${btn}</div>`;
  }).join('');
  $('shop-list').querySelectorAll('[data-up]').forEach((b) => b.onclick = () => {
    const id = b.dataset.up;
    const cost = Store.upgradeCost(save.upgrades[id]);
    if (cost === null || save.money < cost) return;
    save.money -= cost;
    save.upgrades[id]++;
    Store.save(save);
    applyRacketLook();
    haptic(15);
    buildShop();
  });
  updateMoney();
}

function startMatch() {
  if (net.role === 'guest') return;
  const online = net.role === 'host';
  score = newScore();
  matchWinner = null;
  serveFaults = 0;
  hitCounter = 0;
  // Online matches are on level terms: upgrades don't count.
  const hs = Store.racketStats(online ? { power: 0, control: 0, spin: 0, reach: 0 } : save.upgrades);
  for (const p of teamPlayers(0)) {
    p.stats = hs;
    p.reach = hs.reach;
    p.speedMax = PLAYER_SPEED;
  }
  for (const p of teamPlayers(1)) {
    p.stats = online ? hs : { power: D.power, err: D.err, spin: 1, reach: D.reach };
    p.reach = online ? hs.reach : D.reach;
    p.speedMax = online ? PLAYER_SPEED : PLAYER_SPEED * D.speed;
  }
  setRackets(myRacketColor(), online ? net.guestColor : null);
  if (online) {
    net.remoteAxis = { x: 0, y: 0 };
    net.rematch = { me: false, them: false };
    hostSend({ t: 'start', fmt: fmtKey, rc: [myRacketColor(), net.guestColor] });
  }
  enterMatchUI();
  setupServe();
  announce({ k: 'plain', title: 'Game on', reason: online ? `Online · ${F.label}` : `${D.label} · ${F.label}`, tone: 'neutral' });
}

function enterMatchUI() {
  show('menu', false);
  show('online', false);
  show('pause', false);
  show('result', false);
  show('hud', true);
  show('touch', isTouch);
  $('kb-help').classList.toggle('hidden', isTouch);
  netPaused = false;
  mode = 'playing';
  Object.assign(fx, { shake: 0, trail: 0 });
  setViewSide(myTeam());
}

function endMatch() {
  mode = 'over';
  phase = 'idle';
  if (net.role) {
    hostSend({ t: 'end', score, w: matchWinner });
    showOnlineResult();
    return;
  }
  const won = matchWinner === 0;
  const gamesWon = score.totalGames[0];
  const winReward = won ? Math.round(D.reward * F.mult) : 0;
  const gameBonus = gamesWon * 15;
  const total = winReward + gameBonus;
  save.money += total;
  if (won) save.stats.wins++; else save.stats.losses++;
  Store.save(save);
  $('result-title').textContent = won ? 'Victory!' : 'Defeat';
  $('result-title').className = won ? 'good' : 'bad';
  const sets = score.history.map((h) => `${h[0]}–${h[1]}`).join('  ');
  $('result-score').textContent = sets;
  $('result-breakdown').innerHTML =
    (won ? `<div><span>Match win (${D.label})</span><b>+${formatMoney(winReward)}</b></div>` : '') +
    `<div><span>Games won × ${gamesWon}</span><b>+${formatMoney(gameBonus)}</b></div>` +
    `<div class="total"><span>Earned</span><b>+${formatMoney(total)}</b></div>`;
  updateMoney();
  show('hud', false);
  show('touch', false);
  show('result-shop-btn', true);
  $('result-money').classList.remove('hidden');
  setRematchButton();
  show('result', true);
}

function showOnlineResult() {
  const me = myTeam(), them = 1 - me;
  const won = matchWinner === me;
  if (won) save.stats.onlineWins = (save.stats.onlineWins || 0) + 1;
  else save.stats.onlineLosses = (save.stats.onlineLosses || 0) + 1;
  Store.save(save);
  $('result-title').textContent = won ? 'Victory!' : 'Defeat';
  $('result-title').className = won ? 'good' : 'bad';
  $('result-score').textContent = score ? score.history.map((h) => `${Number(h[me]) || 0}–${Number(h[them]) || 0}`).join('  ') : '';
  $('result-breakdown').textContent = `Online record: ${save.stats.onlineWins || 0}W – ${save.stats.onlineLosses || 0}L`;
  show('hud', false);
  show('touch', false);
  show('pause', false);
  show('result-shop-btn', false);
  $('result-money').classList.add('hidden');
  setRematchButton();
  show('result', true);
}

function setRematchButton() {
  const b = $('rematch-btn');
  const r = net.rematch;
  b.disabled = !!(net.role && r.me);
  b.textContent = !net.role ? 'Rematch' : r.me ? 'Waiting for rival…' : r.them ? 'Rival wants a rematch!' : 'Rematch';
}

function rematch() {
  if (!net.role) return startMatch();
  net.rematch.me = true;
  netSend({ t: 'rematch' });
  if (net.role === 'host' && net.rematch.them) startMatch();
  else setRematchButton();
}

function pauseGame() {
  if (mode !== 'playing' || netPaused) return;
  keys.clear();
  // Online the match can't stop for one player; the menu just overlays it.
  if (net.role) netPaused = true;
  else mode = 'paused';
  $('pause-note').textContent = net.role ? 'The match keeps running online. Leaving ends it for both players.' : 'Quitting forfeits any reward for this match.';
  $('quit-btn').textContent = net.role ? 'Leave match' : 'Quit to menu';
  show('pause', true);
}

function resumeGame() {
  if (mode === 'paused') mode = 'playing';
  netPaused = false;
  show('pause', false);
}

function toMenu() {
  leaveOnline();
  mode = 'menu';
  phase = 'idle';
  score = null;
  netPaused = false;
  setHint('');
  setViewSide(0);
  applyRacketLook();
  show('pause', false);
  show('result', false);
  show('hud', false);
  show('touch', false);
  show('shop', false);
  show('online', false);
  show('menu', true);
  buildMenu();
  idleCourt();
}

function idleCourt() {
  setPlayerPos(players[0], 2.4, 7.5);
  setPlayerPos(players[1], -2.4, 4);
  setPlayerPos(players[2], -2.4, -7.5);
  setPlayerPos(players[3], 2.4, -4);
  Object.assign(ball, makeBall(), { x: 0, y: 1.2, z: 0.5 });
  clearMarkers();
}

// ---------------------------------------------------------------- online
function onlineStatus(t) {
  $('online-status').textContent = t;
}

function onlineView(v) {
  show('online-choose', v === 'choose');
  show('online-wait', v === 'wait');
  $('host-btn').disabled = $('join-btn').disabled = v === 'busy';
  if (v === 'busy') show('online-choose', true);
}

function openOnline(status = '') {
  show('menu', false);
  show('online', true);
  onlineView('choose');
  onlineStatus(status);
  $('online-fmt').textContent = `${F.label} — ${F.desc}`;
}

function leaveOnline() {
  const link = net.link;
  if (link) {
    link.onClose = link.onData = link.onConnect = null;
    if (net.role) link.send({ t: 'bye' });
    // Let the goodbye flush before tearing the connection down.
    setTimeout(() => link.close(), 150);
  }
  net.link = null;
  net.role = null;
  net.code = '';
  net.snaps = [];
  net.queue = [];
  net.renderT = null;
  net.remoteAxis = { x: 0, y: 0 };
  net.rematch = { me: false, them: false };
}

function onLinkLost(why = 'Connection lost — your rival left the match.') {
  const wasConnected = !!net.role;
  toMenu();
  if (wasConnected) openOnline(why);
}

function wireLink(link) {
  link.onData = (d) => {
    if (net.link !== link || !d || typeof d !== 'object') return;
    net.lastRecv = performance.now();
    if (d.t === 'bye') return onLinkLost();
    if (net.role === 'host') onHostData(d);
    else if (net.role === 'guest') onGuestData(d);
  };
  link.onClose = () => { if (net.link === link) onLinkLost(); };
}

async function hostOnline() {
  leaveOnline();
  const link = new Link();
  net.link = link;
  wireLink(link);
  link.onConnect = () => {
    if (net.link !== link) return;
    net.role = 'host';
    net.lastRecv = performance.now();
    onlineStatus('Friend connected — starting…');
  };
  onlineView('busy');
  onlineStatus('Creating game…');
  try {
    const code = await link.host();
    if (net.link !== link) return;
    net.code = code;
    $('online-code').textContent = code;
    onlineView('wait');
    onlineStatus('Waiting for your friend to join…');
  } catch (err) {
    if (net.link !== link) return;
    leaveOnline();
    onlineView('choose');
    onlineStatus(err.message);
  }
}

async function joinOnline(raw) {
  const code = normalizeCode(raw);
  $('join-code').value = code;
  if (code.length !== CODE_LEN) return onlineStatus(`Enter the ${CODE_LEN}-character code from your friend`);
  leaveOnline();
  const link = new Link();
  net.link = link;
  wireLink(link);
  onlineView('busy');
  onlineStatus('Connecting…');
  try {
    await link.join(code);
  } catch (err) {
    if (net.link !== link) return;
    leaveOnline();
    onlineView('choose');
    onlineStatus(err.message);
    return;
  }
  if (net.link !== link) return;
  net.role = 'guest';
  net.lastRecv = performance.now();
  onlineStatus('Connected — waiting for the host…');
  netSend({ t: 'hello', rc: myRacketColor(), touch: isTouch });
}

function inviteUrl() {
  return `${location.origin}${location.pathname}?join=${net.code}`;
}

async function shareInvite() {
  if (!net.code) return;
  const url = inviteUrl();
  if (isTouch && navigator.share) {
    try {
      await navigator.share({ title: 'Padel Royale', text: `Play padel with me! Code: ${net.code}`, url });
      return;
    } catch { /* fall back to copying */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    onlineStatus('Invite link copied — send it to your friend. Waiting…');
  } catch {
    onlineStatus(`Send your friend this link: ${url}`);
  }
}

const ACTS = ['drive', 'lob', 'smash', 'switch'];
function onHostData(d) {
  switch (d.t) {
    case 'hello':
      net.guestColor = (Number(d.rc) || 0) & 0xffffff;
      touchTeam[1] = d.touch === true;
      if (mode !== 'playing') startMatch();
      break;
    case 'in': {
      let x = clamp(Number(d.x) || 0, -1, 1), y = clamp(Number(d.y) || 0, -1, 1);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      net.remoteAxis = { x, y };
      net.remoteAuto = d.a === true;
      break;
    }
    case 'act':
      if (d.a === 'swipe') {
        const it = validIntent(d.i);
        if (it) actionFor(1, 'swipe', it);
      } else if (ACTS.includes(d.a)) actionFor(1, d.a);
      break;
    case 'mv':
      if (Number.isFinite(d.x) && Number.isFinite(d.z)) moveFor(1, d.x, d.z);
      break;
    case 'rematch':
      net.rematch.them = true;
      if (mode === 'over' && net.rematch.me) startMatch();
      else setRematchButton();
      break;
  }
}

function onGuestData(d) {
  switch (d.t) {
    case 'start':
      guestStart(d);
      break;
    case 's':
      if (mode === 'playing' && Array.isArray(d.b) && Array.isArray(d.p)) net.snaps.push(d);
      break;
    case 'rematch':
      net.rematch.them = true;
      setRematchButton();
      break;
    default:
      if (mode === 'playing' && typeof d.st === 'number') net.queue.push(d);
  }
}

function guestStart(d) {
  F = FORMATS[d.fmt] || FORMATS.quick;
  const rc = Array.isArray(d.rc) ? d.rc : [];
  setRackets((Number(rc[0]) || 0) & 0xffffff, (Number(rc[1]) || 0) & 0xffffff);
  score = null;
  matchWinner = null;
  lastPointWinner = null;
  for (const p of players) p.ch.cancelSwing();
  net.snaps = [];
  net.queue = [];
  net.renderT = null;
  net.rematch = { me: false, them: false };
  setHint('');
  enterMatchUI();
}

// Fires host events once the guest's delayed clock catches up, so sound and sight stay in sync.
function guestEvent(d) {
  const p = players[d.i];
  switch (d.t) {
    case 'sfx':
      if (SFX_FORWARD.includes(d.m) && Array.isArray(d.a) && d.a.length) {
        const a = [...d.a];
        a[a.length - 1] = -(Number(a[a.length - 1]) || 0);
        sfx[d.m](...a);
      }
      break;
    case 'sw':
      if (p && STROKE_TIMING[d.anim] && Array.isArray(d.c)) {
        p.ch.startSwing(d.anim, d.side === -1 ? -1 : 1, new THREE.Vector3(...d.c.map(Number)), simTime, Number(d.ct), { pos: p.pos, jump: Number(d.j) || 0, spin: Number(d.sp) || 0 });
      }
      break;
    case 'fx':
      if ((d.k === 'smash' || d.k === 'pop') && Array.isArray(d.p)) renderSmashFx(d.k, ...d.p.slice(0, 3).map(Number), d.f === true);
      break;
    case 'cs': p?.ch.cancelSwing(); break;
    case 'ss': p?.ch.splitStep(); break;
    case 'gr': p?.ch.grunt(Number(d.v) || 0); break;
    case 'hap': haptic(clamp(Number(d.ms) || 0, 0, 60)); break;
    case 'msg': if (d.s && typeof d.s === 'object') renderAnnounce(d.s); break;
    case 'hint': renderHint(d.h && typeof d.h === 'object' ? d.h : null); break;
    case 'hud':
      if (d.score && Array.isArray(d.score.history)) {
        score = d.score;
        renderHud(score, d.srv);
      }
      break;
    case 'end':
      if (d.score && Array.isArray(d.score.history)) score = d.score;
      matchWinner = d.w === 0 || d.w === 1 ? d.w : null;
      mode = 'over';
      phase = 'idle';
      showOnlineResult();
      break;
  }
}

function guestStep(realDt) {
  const snaps = net.snaps;
  if (!snaps.length) return;
  const newest = snaps[snaps.length - 1].st;
  const target = newest - NET_INTERP;
  if (net.renderT === null || Math.abs(net.renderT - target) > 0.3) net.renderT = target;
  else net.renderT += realDt * GAME_SPEED + (target - net.renderT) * Math.min(1, realDt * 3);
  const rt = Math.min(net.renderT, newest);
  while (snaps.length > 2 && snaps[1].st <= rt) snaps.shift();
  const a = snaps[0], b = snaps[1] || a;
  const k = b.st > a.st ? clamp((rt - a.st) / (b.st - a.st), 0, 1) : 0;
  simTime = rt;
  ball.x = lerp(a.b[0], b.b[0], k);
  ball.y = lerp(a.b[1], b.b[1], k);
  ball.z = lerp(a.b[2], b.b[2], k);
  players.forEach((p, i) => {
    const o = i * 4;
    p.pos.x = lerp(a.p[o], b.p[o], k);
    p.pos.z = lerp(a.p[o + 1], b.p[o + 1], k);
    p.vel.x = lerp(a.p[o + 2], b.p[o + 2], k);
    p.vel.z = lerp(a.p[o + 3], b.p[o + 3], k);
  });
  const s = k < 0.5 ? a : b;
  phase = s.ph;
  const sv = players[s.sv];
  serve = sv ? { team: sv.team, server: sv } : null;
  rally = s.lh === 0 || s.lh === 1 ? { lastHit: s.lh } : null;
  lastPointWinner = s.pw === 0 || s.pw === 1 ? s.pw : null;
  ctrl[1] = s.c === 1 ? 1 : 0;
  const guides = save.settings.guides;
  bounceMarker.visible = guides && Array.isArray(s.mb);
  if (bounceMarker.visible) bounceMarker.position.set(s.mb[0], 0.008, s.mb[1]);
  interceptMarker.visible = guides && Array.isArray(s.mi);
  if (interceptMarker.visible) interceptMarker.position.set(s.mi[0], 0.007, s.mi[1]);

  while (net.queue.length && net.queue[0].st <= rt && mode === 'playing') guestEvent(net.queue.shift());
}

const r3 = (v) => Math.round(v * 1000) / 1000;
function sendSnapshot(now) {
  if (now - net.lastSnap < 14) return;
  net.lastSnap = now;
  const p = [];
  for (const pl of players) p.push(r3(pl.pos.x), r3(pl.pos.z), r3(pl.vel.x), r3(pl.vel.z));
  const m = net.marks;
  netSend({
    t: 's', st: simTime, b: [r3(ball.x), r3(ball.y), r3(ball.z)], p, ph: phase,
    sv: serve ? players.indexOf(serve.server) : -1, lh: rally ? rally.lastHit : -1,
    pw: lastPointWinner ?? -1, c: ctrl[1],
    mb: m.b ? m.b.map(r3) : 0, mi: m.i ? m.i.map(r3) : 0,
  });
}

function sendGuestInput(now) {
  const a = netPaused || mode !== 'playing' ? { x: 0, y: 0 } : inputAxis();
  const x = Math.round(a.x * 100) / 100, y = Math.round(a.y * 100) / 100;
  const li = net.lastIn;
  if (x === li.x && y === li.y && now - li.t < 250) return;
  net.lastIn = { x, y, t: now };
  netSend({ t: 'in', x, y, a: !!save.settings.autoSwing });
}

function netTick(now, realDt) {
  if (!net.role) return;
  if (net.role === 'guest') {
    if (mode === 'playing') guestStep(realDt);
    sendGuestInput(now);
  } else if (mode === 'playing') {
    sendSnapshot(now);
  }
  if (now - net.lastSent > 1000) netSend({ t: 'p' });
  if (now - net.lastRecv > NET_TIMEOUT) onLinkLost('Connection timed out — your rival dropped out.');
}

$('play-btn').onclick = startMatch;
$('online-btn').onclick = () => openOnline();
$('host-btn').onclick = hostOnline;
$('join-btn').onclick = () => joinOnline($('join-code').value);
$('join-code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinOnline(e.target.value); });
$('share-btn').onclick = shareInvite;
$('online-back').onclick = () => { leaveOnline(); show('online', false); show('menu', true); buildMenu(); };
$('shop-btn').onclick = () => { buildShop(); show('menu', false); show('shop', true); };
$('shop-back').onclick = () => { show('shop', false); show('menu', true); buildMenu(); };
$('pause-btn').onclick = pauseGame;
$('resume-btn').onclick = resumeGame;
$('quit-btn').onclick = toMenu;
$('rematch-btn').onclick = rematch;
$('result-shop-btn').onclick = () => { show('result', false); buildShop(); show('shop', true); };
$('result-menu-btn').onclick = toMenu;
$('opt-guides').onchange = (e) => { save.settings.guides = e.target.checked; Store.save(save); };
$('opt-auto').onchange = (e) => { save.settings.autoSwing = e.target.checked; Store.save(save); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------------------------------------------------------------- loop
let last = performance.now();
let acc = 0;
let renderAlpha = 1;
const ballPrev = { x: 0, y: 0, z: 0 };
function savePrev() {
  ballPrev.x = ball.x; ballPrev.y = ball.y; ballPrev.z = ball.z;
  for (const p of players) { p.prev.x = p.pos.x; p.prev.z = p.pos.z; }
}

// Dynamic resolution: drop the pixel ratio when frames are slow, creep back up (never past a level that was too slow).
const perf = { t: 0, n: 0, cap: MAX_DPR };
function adaptResolution(realDt) {
  perf.t += realDt;
  perf.n++;
  if (perf.t < 1.5) return;
  const avg = perf.t / perf.n;
  perf.t = perf.n = 0;
  let next = dpr;
  if (avg > 1 / 48 && dpr > 1) { perf.cap = dpr - 0.25; next = Math.max(1, dpr - 0.25); }
  else if (avg < 1 / 57 && dpr + 0.25 <= perf.cap) next = dpr + 0.25;
  if (next !== dpr) {
    dpr = next;
    renderer.setPixelRatio(dpr);
    resize();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  adaptResolution(realDt);
  renderAlpha = 1;
  if (mode === 'playing' && net.role !== 'guest') {
    acc += realDt * GAME_SPEED;
    while (acc >= DT) {
      savePrev();
      simStep(DT);
      acc -= DT;
      if (mode !== 'playing') { acc = 0; break; }
    }
    renderAlpha = mode === 'playing' ? acc / DT : 1;
  }
  netTick(now, realDt);
  updateVisuals(realDt * (mode === 'playing' ? GAME_SPEED : 1), realDt);
  drawSwipeTrail(realDt);
  renderer.render(scene, camera);
}

idleCourt();
buildMenu();
applyRacketLook();
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) {
  history.replaceState(null, '', location.pathname);
  openOnline();
  joinOnline(joinParam);
}
if (AUTOPILOT) {
  window.__padel = {
    ball, players, planTeam, predictFor, bestIntercept,
    step: (n) => { for (let i = 0; i < n && mode === 'playing'; i++) simStep(DT); },
    render: () => { updateVisuals(1 / 60, 1 / 60); renderer.render(scene, camera); },
    get rally() { return rally; }, get phase() { return phase; }, get simTime() { return simTime; },
  };
}
camera.position.set(0, camBase.y, camBase.z);
requestAnimationFrame(frame);
