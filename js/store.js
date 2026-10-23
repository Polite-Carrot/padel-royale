import { CATALOG, STARTER_ID } from './rackets.js';

const KEY = 'padel3d.save.v1';
const OLD_UPGRADE_COSTS = [150, 350, 700, 1200, 2000];

const DEFAULT = {
  money: 0,
  rackets: { owned: [STARTER_ID], equipped: STARTER_ID },
  settings: { guides: true },
  stats: { wins: 0, losses: 0 },
  lastDifficulty: 'medium',
  lastFormat: 'quick',
};

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT);
    const state = {
      ...structuredClone(DEFAULT),
      ...raw,
      settings: { ...DEFAULT.settings, ...raw.settings },
      stats: { ...DEFAULT.stats, ...raw.stats },
    };
    delete state.settings.autoSwing;
    // Old saves bought stat upgrades; refund them now that rackets replaced upgrades.
    if (raw.upgrades && typeof raw.upgrades === 'object') {
      for (const lvl of Object.values(raw.upgrades)) {
        for (let i = 0; i < Math.min(Number(lvl) || 0, OLD_UPGRADE_COSTS.length); i++) state.money += OLD_UPGRADE_COSTS[i];
      }
      delete state.upgrades;
    }
    const known = new Set(CATALOG.map((r) => r.id));
    const owned = Array.isArray(raw.rackets?.owned) ? raw.rackets.owned.filter((id) => known.has(id)) : [];
    if (!owned.includes(STARTER_ID)) owned.unshift(STARTER_ID);
    const equipped = owned.includes(raw.rackets?.equipped) ? raw.rackets.equipped : STARTER_ID;
    state.rackets = { owned, equipped };
    if (raw.upgrades) save(state);
    return state;
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or disabled */ }
}
