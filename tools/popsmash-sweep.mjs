import { makeBall, stepBall, solveShot } from '../js/physics.js';

// Sweep smash parameters to find shots that bounce on the far side and leave the court over the walls.
function run(from, target, vh, top) {
  const dist = Math.hypot(target.x - from.x, target.z - from.z);
  const ux = (target.x - from.x) / dist, uz = (target.z - from.z) / dist;
  const spin = { x: top * uz, y: 0, z: -top * ux };
  const v = solveShot(from, target, dist / vh, spin, 0.1);
  const b = { ...makeBall(), ...from, vx: v.x, vy: v.y, vz: v.z, wx: spin.x, wy: spin.y, wz: spin.z };
  const seq = [];
  for (let i = 0; i < 240 * 4; i++) {
    const ev = []; stepBall(b, 1 / 240, ev, () => 0.5);
    for (const e of ev) seq.push(e.type === 'wall' ? `${e.surf}@${e.y.toFixed(1)}` : e.type === 'ground' ? `G${e.z.toFixed(1)}` : e.type);
    if (seq.includes('out') || seq.filter((s) => s[0] === 'G').length >= 2) break;
  }
  return { speed: Math.hypot(v.x, v.y, v.z).toFixed(1), seq: seq.join(' ') };
}

for (const fromZ of [2, 3.5, 5, 6]) for (const depth of [3.8, 4.6, 5.4]) for (const vh of [26, 30, 34]) for (const tx of [2.7, 3.5]) {
  const r = run({ x: 0.5, y: 3.0, z: fromZ }, { x: tx, z: -depth }, vh, 0);
  console.log(`fromZ=${fromZ} depth=${depth} vh=${vh} tx=${tx} speed=${r.speed} -> ${r.seq}`);
}
