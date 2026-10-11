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
export const LEVELS: readonly MatchConfig[] = [LEVEL_1, LEVEL_2, LEVEL_ENDLESS];

/** The seed the campaign starts on. Fixed so a level plays the same each time. */
export const CAMPAIGN_SEED = 20260926;
