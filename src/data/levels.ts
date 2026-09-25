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
} from './constants';
import type { MatchConfig } from '../sim/types';

/** Symmetric sandbox match. Both sides get a mine and start with no units. */
export const DEFAULT_MATCH: MatchConfig = {
  levelId: 'sandbox',
  worldWidth: WORLD_WIDTH,
  baseHp: { player: BASE_HP, enemy: BASE_HP },
  mineGold: { player: MINE_GOLD, enemy: MINE_GOLD },
  startGold: { player: START_GOLD, enemy: START_GOLD },
  // TEMPORARY (M1): non-zero so the render pipeline is visible on screen.
  // M2 restores { player: 0, enemy: 0 } and drives this from level data.
  startMiners: { player: 0, enemy: 0 },
  popCap: { player: POP_CAP, enemy: POP_CAP },
  enemyAi: 'economy',
  waves: [],
  endless: false,
  difficultyMult: 1,
};

/** Positions used by createWorld. Kept here so geometry has one source of truth. */
export const BASE_X = { player: PLAYER_BASE_X, enemy: ENEMY_BASE_X } as const;
export const MINE_X = { player: PLAYER_MINE_X, enemy: ENEMY_MINE_X } as const;
