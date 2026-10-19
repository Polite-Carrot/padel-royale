import { makeBall, stepBall, solveShot, BALL_R } from '../js/physics.js';

// Drop test: padel regulation says a 2.54 m drop rebounds 1.35–1.45 m.
const b = makeBall(); b.y = 2.54;
let peak = 0, bounced = false;
for (let i = 0; i < 2000; i++) {
  const ev = []; stepBall(b, 1 / 240, ev);
  if (ev.some(e => e.type === 'ground')) { if (bounced) break; bounced = true; }
  if (bounced) peak = Math.max(peak, b.y);
}
console.log('drop rebound', peak.toFixed(2));

// Shot accuracy
for (const [name, from, target, T, spin, clear] of [
  ['drive', { x: 2, y: 0.9, z: 8 }, { x: -2, z: -7 }, 15 / 17, { x: -150, y: 0, z: 0 }, 0.4],
  ['lob', { x: 0, y: 0.8, z: 8 }, { x: 1, z: -8.5 }, 2.2, { x: -70, y: 0, z: 0 }, 2],
  ['smash', { x: 0, y: 2.6, z: 4 }, { x: 2, z: -6 }, 10 / 25, { x: -40, y: 0, z: 0 }, 0.12],
]) {
  const v = solveShot(from, target, T, spin, clear);
  const ball = { ...makeBall(), ...from, vx: v.x, vy: v.y, vz: v.z, wx: spin.x, wy: spin.y, wz: spin.z };
  let land = null, events = [];
  for (let i = 0; i < 2400 && !land; i++) {
    const ev = []; stepBall(ball, 1 / 240, ev);
    for (const e of ev) { events.push(e.type); if (e.type === 'ground') land = e; }
  }
  console.log(name, 'speed', Math.hypot(v.x, v.y, v.z).toFixed(1), 'landed', land && land.x.toFixed(2), land && land.z.toFixed(2), events.join(','));
}
