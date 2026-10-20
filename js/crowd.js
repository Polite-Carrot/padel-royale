import * as THREE from '../vendor/three.module.js';

// Mii-style fans in the stands: instanced bodies, heads, hair, eyes and hands that jump and spin on big moments.
const SKIN = [0xf3d2b3, 0xe0b48f, 0xc68a5e, 0x8d5a3b, 0x5e3a24, 0xf6dcc4];
const HAIR = [0x2b1a10, 0x111111, 0x6b4423, 0xd8b25a, 0xa0522d, 0x3a3a3a];
const SHIRT = [0xff5a5a, 0xffc23d, 0x2ec4b6, 0x6b5bff, 0xff7a1a, 0x3fa9f5, 0xff6ec7, 0x7bd35a, 0xffffff];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const smooth = (u) => u * u * (3 - 2 * u);

export class Crowd {
  constructor(scene, rows) {
    this.fans = [];
    for (const r of rows) {
      for (let z = -10; z <= 10; z += 0.95) {
        if (Math.random() < 0.12) continue;
        this.fans.push({
          x: r.x + (Math.random() - 0.5) * 0.25, y: r.y, z: z + (Math.random() - 0.5) * 0.3, face: r.face,
          phase: Math.random() * 6.28, h: 0.9 + Math.random() * 0.25,
          jumps: [], spin: 0, cheer: 0,
        });
      }
    }
    const n = this.fans.length;
    const mat = () => new THREE.MeshLambertMaterial();
    const mk = (geo, count) => {
      const m = new THREE.InstancedMesh(geo, mat(), count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.body = mk(new THREE.CapsuleGeometry(0.2, 0.32, 3, 8), n);
    this.head = mk(new THREE.SphereGeometry(0.19, 12, 10), n);
    this.hair = mk(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), n);
    this.eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), n * 2);
    this.eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eyes.frustumCulled = false;
    scene.add(this.eyes);
    this.hands = mk(new THREE.SphereGeometry(0.07, 8, 6), n * 2);
    const c = new THREE.Color();
    this.fans.forEach((f, i) => {
      const skin = pick(SKIN);
      this.body.setColorAt(i, c.setHex(pick(SHIRT)));
      this.head.setColorAt(i, c.setHex(skin));
      this.hair.setColorAt(i, c.setHex(pick(HAIR)));
      this.hands.setColorAt(i * 2, c.setHex(skin));
      this.hands.setColorAt(i * 2 + 1, c.setHex(skin));
    });
    for (const m of [this.body, this.head, this.hair, this.hands]) m.instanceColor.needsUpdate = true;
    this.time = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._e = new THREE.Euler();
  }

  // level 0..1: a polite clap-bounce for normal points, jumping and spinning for big ones.
  celebrate(level) {
    for (const f of this.fans) {
      if (Math.random() > 0.35 + level * 0.65) continue;
      const count = level > 0.7 ? 2 + Math.floor(Math.random() * 2) : 1;
      let t = -Math.random() * 0.35;
      for (let k = 0; k < count; k++) {
        f.jumps.push({ t, dur: 0.42 + Math.random() * 0.14, h: (0.12 + Math.random() * 0.4) * (0.4 + level) });
        t -= 0.5 + Math.random() * 0.1;
      }
      if (level > 0.7 && Math.random() < 0.45) f.spin = { t: f.jumps[0].t, dir: Math.random() < 0.5 ? -1 : 1 };
      f.cheer = 1.6 + level * 1.4;
    }
  }

  update(dt) {
    this.time += dt;
    const { _m, _q, _p, _s, _e } = this;
    this.fans.forEach((f, i) => {
      let y = f.y + Math.sin(this.time * 2 + f.phase) * 0.012;
      let sq = 1;
      for (const j of f.jumps) j.t += dt;
      while (f.jumps.length && f.jumps[0].t > f.jumps[0].dur) f.jumps.shift();
      const j = f.jumps[0];
      if (j && j.t > 0) {
        const u = j.t / j.dur;
        y += j.h * 4 * u * (1 - u);
        sq = u < 0.12 ? 1 - (0.12 - u) * 1.2 : 1 + Math.sin(u * Math.PI) * 0.06;
      }
      let yaw = f.face;
      if (f.spin) {
        f.spin.t += dt;
        const u = Math.min(1, Math.max(0, f.spin.t / 0.55));
        yaw += f.spin.dir * Math.PI * 2 * smooth(u);
        if (u >= 1) f.spin = 0;
      }
      f.cheer = Math.max(0, f.cheer - dt);
      const arms = Math.min(1, f.cheer);
      const s = f.h;
      _q.setFromEuler(_e.set(0, yaw, 0));
      _m.compose(_p.set(f.x, y + 0.36 * s, f.z), _q, _s.set(s, s * sq, s));
      this.body.setMatrixAt(i, _m);
      const hy = y + (0.78 + 0.02 * (sq - 1)) * s;
      _m.compose(_p.set(f.x, hy, f.z), _q, _s.set(s, s, s));
      this.head.setMatrixAt(i, _m);
      _m.compose(_p.set(f.x, hy + 0.02 * s, f.z), _q, _s.set(s * 1.02, s, s * 1.02));
      this.hair.setMatrixAt(i, _m);
      const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      for (let e = 0; e < 2; e++) {
        const side = e ? 1 : -1;
        _m.makeTranslation(f.x + (fx * 0.17 + rx * side * 0.07) * s, hy + 0.02 * s, f.z + (fz * 0.17 + rz * side * 0.07) * s);
        this.eyes.setMatrixAt(i * 2 + e, _m);
        const wave = Math.sin(this.time * 14 + f.phase + e) * 0.06 * arms;
        const hx = (rx * side * (0.27 + 0.05 * arms) + fx * 0.05) * s;
        const hz = (rz * side * (0.27 + 0.05 * arms) + fz * 0.05) * s;
        _m.makeTranslation(f.x + hx, y + (0.32 + arms * 0.75 + wave) * s, f.z + hz);
        this.hands.setMatrixAt(i * 2 + e, _m);
      }
    });
    for (const m of [this.body, this.head, this.hair, this.eyes, this.hands]) m.instanceMatrix.needsUpdate = true;
  }
}
