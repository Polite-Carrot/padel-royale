const KEY = 'padel3d.save.v1';

export const UPGRADES = [
  { id: 'power', name: 'Power', desc: 'Faster drives, volleys and smashes' },
  { id: 'control', name: 'Control', desc: 'Tighter accuracy, fewer errors' },
  { id: 'spin', name: 'Spin', desc: 'More topspin kick and slice bite' },
  { id: 'reach', name: 'Sweet Spot', desc: 'Bigger hitting zone and reach' },
];

export const MAX_LEVEL = 5;
const COSTS = [150, 350, 700, 1200, 2000];

export const TIERS = [
  { min: 0, name: 'Rookie Foam', color: 0x9aa5b1 },
  { min: 4, name: 'Club Carbon', color: 0x2ec4b6 },
  { min: 9, name: 'Pro Tour 12K', color: 0xffc23d },
  { min: 14, name: 'Elite 18K', color: 0xff4d6d },
  { min: 19, name: 'Legend Graphene', color: 0xb36bff },
];

const DEFAULT = {
  money: 0,
  upgrades: { power: 0, control: 0, spin: 0, reach: 0 },
  settings: { guides: true, autoSwing: false },
  stats: { wins: 0, losses: 0 },
  lastDifficulty: 'medium',
  lastFormat: 'quick',
};

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT);
    return {
      ...structuredClone(DEFAULT),
      ...raw,
      upgrades: { ...DEFAULT.upgrades, ...raw.upgrades },
      settings: { ...DEFAULT.settings, ...raw.settings },
      stats: { ...DEFAULT.stats, ...raw.stats },
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or disabled */ }
}

export function upgradeCost(level) {
  return level >= MAX_LEVEL ? null : COSTS[level];
}

export function totalLevel(u) {
  return u.power + u.control + u.spin + u.reach;
}

export function racketTier(u) {
  const total = totalLevel(u);
  let tier = TIERS[0];
  for (const t of TIERS) if (total >= t.min) tier = t;
  return tier;
}

export function racketStats(u) {
  return {
    power: 1 + 0.06 * u.power,
    err: Math.max(0.4, 1 - 0.12 * u.control),
    spin: 1 + 0.15 * u.spin,
    reach: 1.15 + 0.08 * u.reach,
  };
}
