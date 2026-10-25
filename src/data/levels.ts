/**
 * Level and match presets (spec §8.4).
 *
 * M1 only needs DEFAULT_MATCH — a symmetric skirmish used to bring the
 * render pipeline up. Levels 1 and 2 arrive in M4.
 */

import {
  BASE_HP,
  ENEMY_BASE_X,
  ENEMY_MINE_X,
  MINE_GOLD,
  PLAYER_BASE_X,
  PLAYER_MINE_X,
  POP_CAP,
  START_GOLD,
  WORLD_WIDTH,
  toTicks,
} from './constants';
import type { MatchConfig } from './types';

/** Symmetric sandbox match. Both sides get a mine and start with no units. */
export const DEFAULT_MATCH: MatchConfig = {
  levelId: 'sandbox',
  worldWidth: WORLD_WIDTH,
  baseHp: { player: BASE_HP, enemy: BASE_HP },
  mineGold: { player: MINE_GOLD, enemy: MINE_GOLD },
  startGold: { player: START_GOLD, enemy: START_GOLD },
  startMiners: { player: 0, enemy: 0 },
  popCap: { player: POP_CAP, enemy: POP_CAP },
  enemyAi: 'economy',
  waves: [],
  endless: false,
};

/**
 * Level 1 (tutorial) — spec §8.4.
 *
 * The enemy has NO economy: its entire force is scripted. That is deliberate,
 * and it is the cheapest way to teach "manage the line, not the bank" — the
 * player faces a predictable, mounting attack with no enemy economy to model.
 *
 * The enemy base is half strength (1500 vs 3000) so the tutorial can be won
 * before the player has learned to mass an army. `enemyAi: 'scripted'` is what
 * makes cleanupSystem refuse to call an empty enemy field a victory while
 * waves remain — otherwise this level would be won on tick 1.
 *
 * Wave ticks come from `toTicks(seconds)`, never from hand-written tick counts:
 * data tables are written in seconds and converted exactly once (spec §5.1).
 */
export const LEVEL_1: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'level-1',
  baseHp: { player: BASE_HP, enemy: 1500 },
  startGold: { player: START_GOLD, enemy: 0 },
  startMiners: { player: 3, enemy: 0 },
  initialUnits: { player: [], enemy: [] },
  enemyAi: 'scripted',
  waves: [
    { atTick: toTicks(5), units: ['swordsman', 'swordsman'] },
    { atTick: toTicks(50), units: ['swordsman', 'swordsman', 'swordsman', 'archer'] },
    {
      atTick: toTicks(110),
      units: ['swordsman', 'swordsman', 'swordsman', 'swordsman', 'archer', 'archer', 'spearman'],
    },
    {
      atTick: toTicks(180),
      units: [
        'swordsman', 'swordsman', 'swordsman', 'swordsman',
        'archer', 'archer', 'spearman', 'spearman',
      ],
    },
  ],
};

/** Positions used by createWorld. Kept here so geometry has one source of truth. */
export const BASE_X = { player: PLAYER_BASE_X, enemy: ENEMY_BASE_X } as const;
export const MINE_X = { player: PLAYER_MINE_X, enemy: ENEMY_MINE_X } as const;

/**
 * Level 2 — the symmetric economy level (spec §8.4.3).
 *
 * Both sides get the same start, and the enemy runs its own tactical profile.
 * `winCondition: 'base'` is the important field: the enemy REBUILDS, so an empty
 * enemy field is not a terminal state and only the base falling ends the match.
 * That is what makes the base an objective instead of scenery — measured under
 * the old rule, thirty matches ended with both bases untouched at 3000/3000.
 *
 * The enemy base is 1500, matching level 1's: at 3000 the breakthrough is
 * followed by ~43s of unopposed base-chewing, and halving it cuts that to ~22s.
 */
/**
 * Level 3 — a campaign level 2 with a more aggressive enemy profile.
 *
 * Symmetric economy, `winCondition: 'base'` (must destroy the enemy base).
 * The enemy profile is swept to target 3–6 minute duration with reference
 * player winning on all 5 seeds (same methodology as the level-2 sweep).
 */
export const LEVEL_3: MatchConfig = {
  levelId: 'level-3',
  worldWidth: 3000,
  baseHp: { player: 3000, enemy: 3000 },
  mineGold: { player: 6000, enemy: 6000 },
  // startGold 300 + 5 miners, swept (2026-10-25) WITH giant+mage in the enemy
  // buildOrder. The M6.4 finding re-measured under popCap 12: the enemy's peak
  // gold is 150 at the old economy, so a 400-gold giant can never happen
  // without a buff. Grid (startGold × startMiners, 5 seeds):
  //   300/4 158s giant NOT built · 300/5 192s giant BUILT · 400/4 184s not
  //   450/3 196s giant BUILT · 260/4 157s · 280/5+260/5 192s (no giant at 260)
  // Chosen 300/5: mildest buff that actually yields a giant, 192s inside the
  // window. NOTE the M4b lesson repeating: buffing the enemy SHORTENS matches
  // (both sides get richer; the player's 12-pop army matures sooner).
  startGold: { player: 300, enemy: 300 },
  startMiners: { player: 5, enemy: 5 },
  // 12, not the original 8. Swept (2026-10-19, 5 seeds, real runMatch path):
  //   8 -> 281s (baseline)   12 -> 280s   16 -> 213s   24 -> 212s
  // The 3-6min window centre is 270s, so 12 keeps the calibrated pacing
  // (280 ≈ 281) while unlocking "2 giants + a real economy" — a structure 8
  // could not hold (2 giants = 6 pop left only 2 for miners). 16/24 measure
  // IDENTICALLY (213/212s): past 16 the pacing is saturated by the enemy's
  // early collapse, so the extra cap buys nothing but micro. If a future task
  // wants a roomier feel, re-pin to 213s at cap 16 — measured, one line.
  popCap: { player: 12, enemy: 12 },
  enemyAi: 'economy',
  enemyProfile: 'level-3',
  waves: [],
  endless: false,
  winCondition: 'base',
};

export const LEVEL_2: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'level-2',
  baseHp: { player: BASE_HP, enemy: 1500 },
  startGold: { player: START_GOLD, enemy: START_GOLD },
  startMiners: { player: 3, enemy: 3 },
  initialUnits: { player: [], enemy: [] },
  enemyAi: 'economy',
  enemyProfile: 'level-2',
  winCondition: 'base',
  waves: [],
  endless: false,
};

/**
 * Endless mode (spec §8.4.4).
 *
 * The enemy has NO economy: its force arrives through generated waves, and the
 * wave budget is the entire difficulty curve. `endless: true` is what makes an
 * empty enemy field non-terminal — the mode can only be LOST, never won by
 * clearing the field.
 *
 * The player gets the same opening as level 2 so the mode starts from a known,
 * playable position.
 */
export const LEVEL_ENDLESS: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'endless',
  baseHp: { player: BASE_HP, enemy: 1500 },
  startGold: { player: START_GOLD, enemy: 0 },
  startMiners: { player: 3, enemy: 0 },
  initialUnits: { player: [], enemy: [] },
  enemyAi: 'scripted',
  waves: [],
  endless: true,
};

/**
 * The campaign, in play order.
 *
 * The ARRAY ORDER is the level order. There is deliberately no `order` field on
 * MatchConfig — two sources of truth for the same fact is one too many.
 */
export const LEVELS: readonly MatchConfig[] = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_ENDLESS];

/**
 * Index of the LAST campaign (winnable) level.
 *
 * Endless is the final entry in LEVELS but cannot be "completed", so progress
 * is capped here: beating the last campaign level must not park a resume in a
 * mode the player cannot win. Computed by scan (not `findLastIndex`, which is
 * ES2023 and outside this project's ES2020 lib).
 */
export const LAST_CAMPAIGN_INDEX = (() => {
  let last = 0;
  for (let i = 0; i < LEVELS.length; i++) if (!LEVELS[i].endless) last = i;
  return last;
})();

/** The seed the campaign starts on. Fixed so a level plays the same each time. */
export const CAMPAIGN_SEED = 20260926;
