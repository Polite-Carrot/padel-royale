import { makeBall, stepBall, solveShot } from '../js/physics.js';

// Low drive back through the access opening next to the net.
for (const [x, z, y] of [[6.0, -1.2, 0.8], [5.6, -0.6, 0.6], [6.5, -1.8, 0.9]]) {
  const from = { x, y, z };
  const target = { x: 1, z: 6.5 };
  const dist = Math.hypot(target.x - x, target.z - z);
  const ux = (target.x - x) / dist, uz = (target.z - z) / dist;
  const spin = { x: 60 * uz, y: 0, z: -60 * ux };
  const v = solveShot(from, target, dist / 13, spin, 0.3);
  const b = { ...makeBall(), ...from, vx: v.x, vy: v.y, vz: v.z, wx: spin.x, wy: spin.y, wz: spin.z, outside: true };
  const seq = [];
  for (let i = 0; i < 240 * 5 && seq.length < 2; i++) {
    const ev = []; stepBall(b, 1 / 240, ev);
    for (const e of ev) seq.push(e.type === 'ground' ? `G(${e.x.toFixed(1)},${e.z.toFixed(1)})` : e.type);
  }
  console.log(`drive from (${x},${z}): ${seq.join(' ')}`);
}

// A player standing outside the side fence lobs the ball back into the opponents' half.
for (const [x, z, y] of [[6.5, -3, 1.0], [7.5, -5, 0.8], [5.8, -2, 1.3], [6.8, -8, 1.0]]) {
  for (const tx of [-2, 0, 2]) {
    const from = { x, y, z };
    const target = { x: tx, z: 7 };
    const top = 70, dist = Math.hypot(target.x - x, target.z - z);
    const ux = (target.x - x) / dist, uz = (target.z - z) / dist;
    const spin = { x: top * uz, y: 0, z: -top * ux };
    const v = solveShot(from, target, 2.4, spin, 1.0);
    const b = { ...makeBall(), ...from, vx: v.x, vy: v.y, vz: v.z, wx: spin.x, wy: spin.y, wz: spin.z, outside: true };
    const seq = [];
    for (let i = 0; i < 240 * 5 && seq.length < 3; i++) {
      const ev = []; stepBall(b, 1 / 240, ev);
      for (const e of ev) seq.push(e.type === 'ground' ? `G(${e.x.toFixed(1)},${e.z.toFixed(1)})` : e.type);
    }
    console.log(`from (${x},${z}) -> tx=${tx}: ${seq.join(' ')}`);
  }
}
