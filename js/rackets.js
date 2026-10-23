import * as THREE from '../vendor/three.module.js';

/* Racket catalogue: 6 made-up brands x 5 models, four head shapes, four attributes (1-10).
 *
 * Shapes follow real padel frames:
 *  - Round: low balance, big sweet spot near the throat -> control and forgiveness.
 *  - Teardrop: medium balance, sweet spot mid-high -> power + control all-rounder.
 *  - Diamond: head-heavy, small high sweet spot -> maximum power, least forgiving.
 *  - Hexagon: the "pro" frame here: wide sweet spot set high, strong everywhere.
 * Attributes: control (accuracy), power (ball speed), spin, weight (higher = lighter = faster feet). */

export const SHAPES = {
  round: { label: 'Round', role: 'Control', w: 0.262, h: 0.272, mods: { control: 2, power: -1, spin: 0, weight: 1 }, reach: 1.2 },
  teardrop: { label: 'Teardrop', role: 'Power + control', w: 0.258, h: 0.286, mods: { control: 1, power: 1, spin: 0, weight: 0 }, reach: 1.15 },
  diamond: { label: 'Diamond', role: 'Power', w: 0.254, h: 0.298, mods: { control: -1, power: 2, spin: 1, weight: -1 }, reach: 1.1 },
  hexagon: { label: 'Hexagon', role: 'Pro', w: 0.26, h: 0.29, mods: { control: 1, power: 1, spin: 1, weight: 0 }, reach: 1.17 },
};

export const ATTRS = [
  { id: 'control', label: 'Control' },
  { id: 'power', label: 'Power' },
  { id: 'spin', label: 'Spin' },
  { id: 'weight', label: 'Weight' },
];

export const BRANDS = [
  {
    id: 'padpad', name: 'PadPad', tagline: 'Comfy, forgiving, friendly. The racket that likes you back.',
    bias: { control: 2, power: -1, spin: 0, weight: 1 }, frame: '#20223a', pattern: 'dots',
    font: '900 S "Arial Rounded MT Bold", "Trebuchet MS", system-ui', logo: 'PADPAD',
    shapes: ['round', 'teardrop', 'round', 'diamond', 'hexagon'],
    models: ['Bubble', 'Comfy', 'Bounce', 'Zippy', 'Pro Pad'],
    colors: [['#ff8fb1', '#ffe06e'], ['#7ee0d3', '#ff8fb1'], ['#9b8cff', '#ffe06e'], ['#ffb347', '#5bd6c8'], ['#ff4f86', '#fff3a6']],
  },
  {
    id: 'lily', name: 'Lily', tagline: 'Precision with a soft touch. Spin that blooms.',
    bias: { control: 1, power: -1, spin: 2, weight: 1 }, frame: '#3b2a4f', pattern: 'petals',
    font: 'italic 700 S Georgia, "Times New Roman", serif', logo: 'Lily',
    shapes: ['round', 'teardrop', 'diamond', 'round', 'hexagon'],
    models: ['Petal', 'Bloom', 'Orchid', 'Blossom', 'Lotus Pro'],
    colors: [['#f6f1fb', '#c9a7eb'], ['#e9f6ef', '#6fc493'], ['#fdeef3', '#ec7fa6'], ['#efe6ff', '#8b5cd6'], ['#fff7e3', '#c99a2e']],
  },
  {
    id: 'smashable', name: 'Smashable', tagline: 'Built to be hit hard. Then harder.',
    bias: { control: -1, power: 3, spin: 0, weight: -1 }, frame: '#0e0e10', pattern: 'flames',
    font: 'italic 900 S Impact, "Arial Black", sans-serif', logo: 'SMASHABLE',
    shapes: ['teardrop', 'round', 'diamond', 'diamond', 'hexagon'],
    models: ['Spark', 'Blaze', 'Inferno', 'Meteor', 'Supernova'],
    colors: [['#2a2a2a', '#ff4d2e'], ['#1b1b1b', '#ffb020'], ['#2b0d0d', '#ff2e2e'], ['#101418', '#3fd0ff'], ['#0b0b0b', '#ffd23d']],
  },
  {
    id: 'meow', name: 'Meow Padel', tagline: 'Light paws, quick feet, a little cheeky.',
    bias: { control: 0, power: -1, spin: 1, weight: 3 }, frame: '#2d1e14', pattern: 'paws',
    font: '900 S "Chalkboard SE", "Comic Sans MS", system-ui', logo: 'meow',
    shapes: ['round', 'teardrop', 'diamond', 'teardrop', 'hexagon'],
    models: ['Kitten', 'Whiskers', 'Pounce', 'Tabby', 'Panther Pro'],
    colors: [['#ffcf8a', '#3a2a20'], ['#f5f5f5', '#ff8fb8'], ['#ff9d47', '#2d1e14'], ['#c9c9d6', '#4c4c6a'], ['#1c1c1c', '#ffd23d']],
  },
  {
    id: 'hex', name: 'Hex', tagline: 'Engineered carbon. Balanced like a pro.',
    bias: { control: 1, power: 1, spin: 1, weight: 0 }, frame: '#0d1117', pattern: 'hexgrid',
    font: '800 S ui-monospace, Menlo, monospace', logo: 'HEX',
    shapes: ['teardrop', 'round', 'diamond', 'teardrop', 'hexagon'],
    models: ['Hex One', 'Hex Flow', 'Hex Strike', 'Hex Apex', 'Hex Prime'],
    colors: [['#2b313a', '#3fd0ff'], ['#23282f', '#7cff6b'], ['#1d2027', '#ff5dd8'], ['#181b21', '#ffb020'], ['#0f1115', '#e8ff3a']],
  },
  {
    id: 'garlic', name: 'Garlic', tagline: 'Heavy, spicy, impossible to ignore.',
    bias: { control: 0, power: 1, spin: 3, weight: -2 }, frame: '#3a2448', pattern: 'cloves',
    font: '900 S "Avenir Next", "Futura", system-ui', logo: 'GARLIC',
    shapes: ['round', 'diamond', 'teardrop', 'diamond', 'hexagon'],
    models: ['Clove', 'Bulb', 'Aioli', 'Black Garlic', 'Garlic Supreme'],
    colors: [['#f7f1e6', '#b48ad6'], ['#f3ead9', '#7a4fa0'], ['#efe2cc', '#5e8f3c'], ['#2a2a2a', '#efe2cc'], ['#1d1424', '#d9b8ff']],
  },
];

const round50 = (v) => Math.max(0, Math.round(v / 50) * 50);

export const CATALOG = [];
for (const b of BRANDS) {
  b.models.forEach((model, tier) => {
    const shape = b.shapes[tier];
    const sm = SHAPES[shape].mods;
    const base = 2 + 1.4 * tier;
    const attrs = {};
    for (const { id } of ATTRS) attrs[id] = Math.max(1, Math.min(10, Math.round(base + sm[id] + b.bias[id] * 0.6)));
    const avg = (attrs.control + attrs.power + attrs.spin + attrs.weight) / 4;
    CATALOG.push({
      id: `${b.id}-${tier + 1}`, brand: b.id, tier, model, shape, attrs,
      name: `${b.name} ${model}`, price: round50(45 * avg * avg + 50),
      grams: 382 - 4 * attrs.weight,
      colors: b.colors[tier],
    });
  });
}
export const STARTER_ID = 'padpad-1';
CATALOG.find((r) => r.id === STARTER_ID).price = 0;

export const racketById = (id) => CATALOG.find((r) => r.id === id) || CATALOG.find((r) => r.id === STARTER_ID);
export const brandOf = (r) => BRANDS.find((b) => b.id === r.brand);

// Gameplay effect of a racket. Online matches use LEVEL_STATS for everyone.
export function racketStats(r) {
  const a = r.attrs;
  return {
    power: 0.88 + 0.028 * a.power,
    err: 1.3 - 0.075 * a.control,
    spin: 0.75 + 0.085 * a.spin,
    speed: 0.9 + 0.02 * a.weight,
    reach: SHAPES[r.shape].reach,
  };
}
export const LEVEL_STATS = { power: 1, err: 0.92, spin: 1.15, speed: 1, reach: 1.15 };

// ---------------------------------------------------------------- shape outlines
// Normalised outline (x and y in [-0.5, 0.5], y up), counter-clockwise.
function chaikin(pts, passes) {
  for (let k = 0; k < passes; k++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = out;
  }
  return pts;
}

const outlines = {};
export function shapeOutline(shape) {
  if (outlines[shape]) return outlines[shape];
  const n = 72;
  let pts = [];
  if (shape === 'round') {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push([0.5 * Math.cos(t), 0.5 * Math.sin(t) * (Math.sin(t) < 0 ? 0.97 : 1)]);
    }
  } else if (shape === 'teardrop') {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const f = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(t));
      pts.push([0.5 * Math.cos(t) * f / 0.995, 0.5 * Math.sin(t)]);
    }
  } else if (shape === 'diamond') {
    // Rounded top, widest a little above centre, straight flanks down to a narrow throat.
    const raw = [[0.5, 0.08], [0.42, 0.34], [0.2, 0.5], [-0.2, 0.5], [-0.42, 0.34], [-0.5, 0.08], [-0.16, -0.5], [0.16, -0.5]];
    pts = chaikin(raw, 4);
  } else {
    const raw = [[0.3, 0.5], [-0.3, 0.5], [-0.5, 0.12], [-0.28, -0.5], [0.28, -0.5], [0.5, 0.12]];
    pts = chaikin(raw.reverse(), 3);
  }
  // Normalise to exactly fill [-0.5, 0.5] in both axes.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  pts = pts.map(([x, y]) => [(x - (x0 + x1) / 2) / (x1 - x0), (y - (y0 + y1) / 2) / (y1 - y0)]);
  if (THREE.ShapeUtils.area(pts.map(([x, y]) => new THREE.Vector2(x, y))) < 0) pts.reverse();
  outlines[shape] = pts;
  return pts;
}

// ---------------------------------------------------------------- 2D art (shop cards and 3D face textures)
function tracePath(ctx, shape, x, y, w, h, scale = 1) {
  const pts = shapeOutline(shape);
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const cx = x + w / 2 + px * w * scale, cy = y + h / 2 - py * h * scale;
    if (i) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy);
  });
  ctx.closePath();
}

function drawPattern(ctx, b, r, w, h) {
  const [base, acc] = r.colors;
  ctx.save();
  switch (b.pattern) {
    case 'dots': {
      ctx.fillStyle = acc;
      for (let y = 0; y < h; y += w * 0.13) for (let x = ((y / (w * 0.13)) % 2) * w * 0.065; x < w; x += w * 0.13) {
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(x, y, w * 0.035, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'petals': {
      ctx.fillStyle = acc;
      ctx.globalAlpha = 0.75;
      const cx = w * 0.5, cy = h * 0.36;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i / 6) * Math.PI * 2);
        ctx.beginPath(); ctx.ellipse(0, -w * 0.13, w * 0.06, w * 0.13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#f3c84b';
      ctx.beginPath(); ctx.arc(cx, cy, w * 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = acc; ctx.globalAlpha = 0.5; ctx.lineWidth = w * 0.012;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(w * 0.5, h * 1.25, w * (0.55 + i * 0.12), Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); }
      break;
    }
    case 'flames': {
      const g = ctx.createLinearGradient(0, h, 0, h * 0.25);
      g.addColorStop(0, acc); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i <= 8; i++) {
        const x = (i / 8) * w, peak = h * (0.25 + 0.25 * Math.abs(Math.sin(i * 1.7)));
        ctx.quadraticCurveTo(x - w / 16, h * 0.7, x, peak);
      }
      ctx.lineTo(w, h);
      ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = w * 0.02; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.08); ctx.lineTo(w * 0.45, h * 0.42); ctx.lineTo(w * 0.58, h * 0.42); ctx.lineTo(w * 0.4, h * 0.78); ctx.stroke();
      break;
    }
    case 'paws': {
      ctx.fillStyle = acc;
      ctx.globalAlpha = 0.5;
      const paw = (x, y, s, a) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, s * 0.35, s * 0.42, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = -1.5; i <= 1.5; i++) { ctx.beginPath(); ctx.ellipse(i * s * 0.28, -s * 0.18 - Math.abs(i) * -s * 0.05, s * 0.13, s * 0.17, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      };
      paw(w * 0.3, h * 0.28, w * 0.16, -0.3); paw(w * 0.68, h * 0.5, w * 0.16, 0.3); paw(w * 0.35, h * 0.74, w * 0.14, -0.2);
      // Cat ears peeking over the top of the face.
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.16); ctx.lineTo(w * 0.3, 0); ctx.lineTo(w * 0.4, h * 0.12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * 0.78, h * 0.16); ctx.lineTo(w * 0.7, 0); ctx.lineTo(w * 0.6, h * 0.12); ctx.fill();
      break;
    }
    case 'hexgrid': {
      ctx.strokeStyle = acc; ctx.lineWidth = w * 0.008; ctx.globalAlpha = 0.45;
      const s = w * 0.08;
      for (let row = 0; row * s * 1.5 < h + s; row++) {
        for (let col = 0; col * s * 1.73 < w + s; col++) {
          const cx = col * s * 1.73 + (row % 2) * s * 0.866, cy = row * s * 1.5;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            const px = cx + s * Math.cos(a), py = cy + s * Math.sin(a);
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.9; ctx.lineWidth = w * 0.025;
      ctx.beginPath(); ctx.moveTo(0, h * 0.62); ctx.lineTo(w, h * 0.38); ctx.stroke();
      break;
    }
    case 'cloves': {
      ctx.globalAlpha = 0.55; ctx.strokeStyle = acc; ctx.lineWidth = w * 0.025;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.05);
        ctx.quadraticCurveTo(w * (0.5 + i * 0.16), h * 0.5, w * 0.5, h * 0.95);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.85; ctx.fillStyle = acc;
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.3, w * 0.07, w * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(w * 0.49, h * 0.18, w * 0.02, h * 0.05);
      break;
    }
  }
  ctx.restore();
  void base;
}

// Face art inside a w x h box at (x, y): base colour, brand pattern, drilled holes and the logo.
export function drawFace(ctx, r, x, y, w, h) {
  const b = brandOf(r);
  const [base, acc] = r.colors;
  ctx.save();
  tracePath(ctx, r.shape, x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, base);
  g.addColorStop(1, shade(base, -0.12));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  drawPattern(ctx, b, r, w, h);
  // Drilled holes in the sweet-spot area.
  ctx.fillStyle = 'rgba(15,15,20,0.55)';
  const hs = w * 0.085;
  for (let yy = h * 0.2; yy < h * 0.82; yy += hs) {
    for (let xx = w * 0.2 + ((Math.round(yy / hs) % 2) * hs) / 2; xx < w * 0.82; xx += hs) {
      const nx = xx / w - 0.5, ny = 0.5 - yy / h;
      if (nx * nx / 0.12 + ny * ny / 0.13 > 1) continue;
      ctx.beginPath(); ctx.arc(xx, yy, w * 0.016, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Brand logo across the lower face.
  const size = Math.round(w * (b.logo.length > 6 ? 0.12 : 0.17));
  ctx.font = b.font.replace('S', `${size}px`);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size * 0.14);
  ctx.strokeStyle = shade(base, -0.45);
  ctx.strokeText(b.logo, w / 2, h * 0.72);
  ctx.fillStyle = acc;
  ctx.fillText(b.logo, w / 2, h * 0.72);
  // Pro models get a gold pinstripe.
  if (r.tier === 4) {
    ctx.strokeStyle = '#ffd86b';
    ctx.lineWidth = w * 0.02;
    ctx.translate(-x, -y);
    tracePath(ctx, r.shape, x, y, w, h, 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

// Full racket illustration for shop cards (head up, handle down).
export function drawRacketCard(canvas, r) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const b = brandOf(r);
  const S = SHAPES[r.shape];
  const headW = W * 0.84, headH = headW * (S.h / S.w);
  const hx = (W - headW) / 2, hy = H * 0.035;
  const rim = W * 0.035, line = W * 0.014;
  // A glossy edge so dark frames still read on a dark background.
  const hi = shade(b.frame, 0.32);
  const neckTop = hy + headH * 0.84, neckBot = hy + headH + H * 0.085;
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = hi;
  // Throat bridge.
  ctx.fillStyle = b.frame;
  ctx.beginPath();
  ctx.moveTo(W * 0.3, neckTop);
  ctx.lineTo(W * 0.7, neckTop);
  ctx.lineTo(W * 0.565, neckBot);
  ctx.lineTo(W * 0.435, neckBot);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Handle with an angled overgrip wrap and a butt cap.
  const gx = W * 0.435, gw = W * 0.13, gy = neckBot - line, gb = H * 0.955;
  ctx.fillStyle = r.colors[1];
  ctx.fillRect(gx, gy, gw, gb - gy);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let yy = gy + H * 0.02; yy < gb; yy += H * 0.03) {
    ctx.beginPath();
    ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy - H * 0.014); ctx.lineTo(gx + gw, yy - H * 0.006); ctx.lineTo(gx, yy + H * 0.008);
    ctx.fill();
  }
  ctx.strokeRect(gx, gy, gw, gb - gy);
  ctx.fillStyle = b.frame;
  ctx.beginPath();
  ctx.roundRect(W * 0.42, gb - H * 0.012, W * 0.16, H * 0.04, W * 0.03);
  ctx.fill();
  ctx.stroke();
  // Frame then face.
  ctx.fillStyle = b.frame;
  tracePath(ctx, r.shape, hx - rim, hy - rim, headW + 2 * rim, headH + 2 * rim);
  ctx.fill();
  ctx.stroke();
  drawFace(ctx, r, hx, hy, headW, headH);
  // The open "heart" of the bridge.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(W * 0.4, hy + headH + rim + line);
  ctx.lineTo(W * 0.6, hy + headH + rim + line);
  ctx.lineTo(W * 0.5, neckBot - H * 0.025);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- 3D pieces
const geoCache = {};
export function racketGeometry(shape) {
  if (geoCache[shape]) return geoCache[shape];
  const S = SHAPES[shape];
  const pts = shapeOutline(shape);
  const v2 = (sx, sy) => pts.map(([x, y]) => new THREE.Vector2(x * S.w * sx, y * S.h * sy));
  const face = new THREE.ExtrudeGeometry(new THREE.Shape(v2(1, 1)), { depth: 0.026, bevelEnabled: false, curveSegments: 1 });
  face.translate(0, 0, -0.013);
  // Planar UVs over the face so the brand art maps 1:1 (mirrored on the back so the logo reads from both sides).
  const pos = face.attributes.position, uv = face.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / S.w;
    uv.setXY(i, (pos.getZ(i) < 0 ? -u : u) + 0.5, pos.getY(i) / S.h + 0.5);
  }
  const rimW = 0.016;
  const outer = new THREE.Shape(v2(1 + (2 * rimW) / S.w, 1 + (2 * rimW) / S.h));
  outer.holes.push(new THREE.Path(v2(0.995, 0.995)));
  const frame = new THREE.ExtrudeGeometry(outer, { depth: 0.036, bevelEnabled: false, curveSegments: 1 });
  frame.translate(0, 0, -0.018);
  geoCache[shape] = { face, frame, h: S.h };
  return geoCache[shape];
}

const texCache = {};
export function racketTexture(r) {
  if (texCache[r.id]) return texCache[r.id];
  const S = SHAPES[r.shape];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round(256 * (S.h / S.w));
  drawFace(c.getContext('2d'), r, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache[r.id] = t;
  return t;
}
