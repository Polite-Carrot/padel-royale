// Real padel ball physics: gravity, quadratic drag, Magnus lift, and spin-aware
// bounces on turf, glass and metal mesh. Court: x = width (±5), z = length (±10).

export const G = 9.81;
export const BALL_R = 0.0335;
export const COURT = { halfW: 5, halfL: 10, serviceZ: 6.95, netH: 0.88, netHPost: 0.92 };
// One open access per side wall at the net, 1.8 m wide x 2 m high: |z| < z1.
export const DOOR = { z0: 0, z1: 0.9, h: 2.0 };

const RHO = 1.2, CD = 0.55, MASS = 0.057;
const DRAG_K = (0.5 * RHO * CD * Math.PI * BALL_R * BALL_R) / MASS;
const MAGNUS_K = 0.0007;
const SPIN_DECAY = 0.2;
// Moment of inertia factor (I = ALPHA m r^2) for a thick-shelled pressurised ball.
const ALPHA = 0.6;

export const SURF = {
  ground: { e: 0.77, mu: 0.6 },
  glass: { e: 0.7, mu: 0.3 },
  mesh: { e: 0.3, mu: 0.5 },
};

export function makeBall() {
  return { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, outside: false, onGround: false };
}

export function cloneBall(b) {
  return { ...b };
}

export function netHeight(x) {
  const t = x / COURT.halfW;
  return COURT.netH + (COURT.netHPost - COURT.netH) * t * t;
}

// Side walls: two 2 m panels of 3 m glass at each end (mesh above the corner one up to 4 m), the rest is mesh.
export function sideWallSurf(z, y) {
  const az = Math.abs(z);
  if (az > 8) return y < 3 ? 'glass' : y < 4 ? 'mesh' : null;
  if (az > 6) return y < 3 ? 'glass' : null;
  if (az >= DOOR.z0 && az < DOOR.z1 && y < DOOR.h) return null;
  return y < 3 ? 'mesh' : null;
}

export function sideWallTop(z) {
  const az = Math.abs(z);
  return az > 8 ? 4 : 3;
}

export function throughDoor(z, y) {
  const az = Math.abs(z);
  return az < DOOR.z1 - 0.06 && y + BALL_R < DOOR.h - 0.05;
}

export function backWallSurf(y) {
  return y < 3 ? 'glass' : y < 4 ? 'mesh' : null;
}

function integrate(b, dt) {
  const s = Math.hypot(b.vx, b.vy, b.vz);
  const ax = -DRAG_K * s * b.vx + MAGNUS_K * (b.wy * b.vz - b.wz * b.vy);
  const ay = -G - DRAG_K * s * b.vy + MAGNUS_K * (b.wz * b.vx - b.wx * b.vz);
  const az = -DRAG_K * s * b.vz + MAGNUS_K * (b.wx * b.vy - b.wy * b.vx);
  b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  const k = 1 - SPIN_DECAY * dt;
  b.wx *= k; b.wy *= k; b.wz *= k;
}

// Impulse-based bounce with friction: the contact patch either grips (spin and
// velocity equalise) or slides (friction limited by mu). Returns impact speed.
function bounce(b, nx, ny, nz, surf) {
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return 0;
  const tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
  const rx = -BALL_R * nx, ry = -BALL_R * ny, rz = -BALL_R * nz;
  const cx = b.wy * rz - b.wz * ry, cy = b.wz * rx - b.wx * rz, cz = b.wx * ry - b.wy * rx;
  const f = ALPHA / (1 + ALPHA);
  let jx = -(tx + cx) * f, jy = -(ty + cy) * f, jz = -(tz + cz) * f;
  const jm = Math.hypot(jx, jy, jz);
  const maxJ = surf.mu * (1 + surf.e) * -vn;
  if (jm > maxJ && jm > 0) {
    const s = maxJ / jm;
    jx *= s; jy *= s; jz *= s;
  }
  b.vx = tx + jx - surf.e * vn * nx;
  b.vy = ty + jy - surf.e * vn * ny;
  b.vz = tz + jz - surf.e * vn * nz;
  const k = 1 / (ALPHA * BALL_R * BALL_R);
  b.wx += (ry * jz - rz * jy) * k;
  b.wy += (rz * jx - rx * jz) * k;
  b.wz += (rx * jy - ry * jx) * k;
  return -vn;
}

function meshJitter(b, rng) {
  const s = Math.hypot(b.vx, b.vy, b.vz);
  b.vx += (rng() - 0.5) * 0.3 * s;
  b.vy += (rng() - 0.5) * 0.3 * s;
  b.vz += (rng() - 0.5) * 0.3 * s;
  b.wx *= 0.3; b.wy *= 0.3; b.wz *= 0.3;
}

export function stepBall(b, dt, events, rng = Math.random) {
  const px = b.x, py = b.y, pz = b.z;
  integrate(b, dt);

  // Net
  if (!b.outside && pz !== 0 && (pz > 0) !== (b.z > 0)) {
    const f = pz / (pz - b.z);
    const xc = px + (b.x - px) * f;
    const yc = py + (b.y - py) * f;
    if (Math.abs(xc) <= COURT.halfW) {
      const h = netHeight(xc);
      if (yc - BALL_R < h) {
        const dir = Math.sign(pz);
        if (yc > h - 0.035) {
          events.push({ type: 'netcord', x: xc, z: 0 });
          if (rng() < 0.45) { b.z = dir * BALL_R; b.vz = -b.vz * 0.2; } else { b.vz *= 0.35; }
          b.vy = Math.abs(b.vy) * 0.3 + rng() * 1.2;
          b.vx *= 0.6;
        } else {
          events.push({ type: 'net', x: xc, z: 0 });
          b.z = dir * BALL_R;
          b.vz = -b.vz * 0.08; b.vx *= 0.3; b.vy *= 0.3;
        }
      }
    }
  }

  // Walls (only from inside the court)
  if (!b.outside) {
    const limX = COURT.halfW - BALL_R;
    if (Math.abs(b.x) > limX && Math.abs(px) <= limX + 1e-6) {
      const sx = Math.sign(b.x);
      const surf = sideWallSurf(b.z, b.y);
      if (surf) {
        b.x = sx * limX;
        const imp = bounce(b, -sx, 0, 0, SURF[surf]);
        if (surf === 'mesh') meshJitter(b, rng);
        if (imp > 0) events.push({ type: 'wall', surf, x: b.x, y: b.y, z: b.z, speed: imp });
      } else {
        b.outside = true;
        events.push({ type: 'out', x: b.x, z: b.z });
      }
    }
    const limZ = COURT.halfL - BALL_R;
    if (!b.outside && Math.abs(b.z) > limZ && Math.abs(pz) <= limZ + 1e-6) {
      const sz = Math.sign(b.z);
      const surf = backWallSurf(b.y);
      if (surf) {
        b.z = sz * limZ;
        const imp = bounce(b, 0, 0, -sz, SURF[surf]);
        if (surf === 'mesh') meshJitter(b, rng);
        if (imp > 0) events.push({ type: 'wall', surf, x: b.x, y: b.y, z: b.z, speed: imp });
      } else {
        b.outside = true;
        events.push({ type: 'out', x: b.x, z: b.z });
      }
    }
  } else if (Math.abs(px) > COURT.halfW && Math.abs(b.x) <= COURT.halfW && Math.abs(b.z) < COURT.halfL) {
    // Coming back in from outside: through a door or over the top, else off the outside of the wall.
    const surf = sideWallSurf(b.z, b.y);
    if (!surf) {
      b.outside = false;
    } else {
      const sx = Math.sign(px);
      b.x = sx * (COURT.halfW + BALL_R);
      const imp = bounce(b, sx, 0, 0, SURF[surf]);
      if (imp > 0) events.push({ type: 'wallOutside', surf, x: b.x, y: b.y, z: b.z, speed: imp });
    }
  }

  // Ground
  if (b.y < BALL_R) {
    b.y = BALL_R;
    const wasAirborne = !b.onGround;
    const imp = b.vy < -0.35 ? bounce(b, 0, 1, 0, SURF.ground) : 0;
    if (imp === 0) {
      b.vy = 0;
      b.onGround = true;
      const k = 1 - 1.5 * dt;
      b.vx *= k; b.vz *= k;
    }
    if (imp > 0 || wasAirborne) {
      events.push({ type: b.outside ? 'groundOut' : 'ground', x: b.x, z: b.z, speed: imp });
    }
  } else if (b.y > BALL_R + 0.002) {
    b.onGround = false;
  }
}

// Free flight to ground (no collisions); used by the shot solver.
function flight(b0, maxT = 6) {
  const b = cloneBall(b0);
  const dt = 1 / 240;
  let t = 0, netY = null, netX = 0, wallY = null, wallZ = 0;
  while (t < maxT) {
    const pz = b.z, py = b.y, px = b.x;
    integrate(b, dt);
    t += dt;
    if (netY === null && pz !== 0 && (pz > 0) !== (b.z > 0)) {
      const f = pz / (pz - b.z);
      netY = py + (b.y - py) * f;
      netX = px + (b.x - px) * f;
    }
    if (wallY === null && Math.abs(px) > COURT.halfW && Math.abs(b.x) <= COURT.halfW) {
      wallY = b.y;
      wallZ = b.z;
    }
    if (b.y <= BALL_R && b.vy < 0) break;
  }
  return { x: b.x, z: b.z, t, netY, netX, wallY, wallZ };
}

// Finds a launch velocity that lands the ball on `target` with the given spin,
// iterating on drag/Magnus error and lengthening flight time until the net is cleared.
export function solveShot(from, target, T, spin, netClear) {
  const aim = { x: target.x, z: target.z };
  let v = null, res = null;
  for (let tries = 0; tries < 16; tries++) {
    // Secant steps per axis: heavy spin and drag mean the landing moves less than the aim does.
    let prev = null;
    for (let it = 0; it < 12; it++) {
      v = {
        x: (aim.x - from.x) / T,
        y: (BALL_R - from.y + 0.5 * G * T * T) / T,
        z: (aim.z - from.z) / T,
      };
      res = flight({ ...from, vx: v.x, vy: v.y, vz: v.z, wx: spin.x, wy: spin.y, wz: spin.z });
      const ex = target.x - res.x, ez = target.z - res.z;
      if (Math.abs(ex) + Math.abs(ez) < 0.02) break;
      let gx = 1, gz = 1;
      if (prev) {
        const dax = aim.x - prev.ax, dlx = res.x - prev.rx, daz = aim.z - prev.az, dlz = res.z - prev.rz;
        if (Math.abs(dax) > 1e-4 && Math.abs(dlx) > 1e-4) gx = Math.min(4, Math.max(0.5, dax / dlx));
        if (Math.abs(daz) > 1e-4 && Math.abs(dlz) > 1e-4) gz = Math.min(4, Math.max(0.5, daz / dlz));
      }
      prev = { ax: aim.x, az: aim.z, rx: res.x, rz: res.z };
      aim.x += ex * gx;
      aim.z += ez * gz;
    }
    const netOk = res.netY === null || res.netY - BALL_R >= netHeight(res.netX) + netClear;
    const wallOk = res.wallY === null || res.wallY - BALL_R >= sideWallTop(res.wallZ) + 0.25 || throughDoor(res.wallZ, res.wallY);
    if (netOk && wallOk) return v;
    T *= 1.12;
  }
  return v;
}
