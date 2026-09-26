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
  difficultyMult: 1,
};

/**
 * TEMPORARY (M2): a symmetric collision demo so the render pipeline can be
 * watched. Both sides advance and meet in the middle. M4 replaces this with
 * level-driven spawns.
 */
export const RENDER_DEMO_MATCH: MatchConfig = {
  ...DEFAULT_MATCH,
  levelId: 'render-demo',
  startMiners: { player: 0, enemy: 0 },
  initialUnits: {
    // Archers are listed FIRST so they spawn nearest the base and end up
    // behind the swordsmen — createWorld places a smaller cursor closer to
    // home, so the back rank must come first in this list. R1/R2 (arrows pass
    // through allies, front ranks do not block the back) only mean anything
    // if the archers are actually screened.
    player: [
      'archer', 'archer', 'archer',
      'swordsman', 'swordsman', 'swordsman', 'swordsman', 'swordsman', 'swordsman',
    ],
    enemy: [
      'archer', 'archer', 'archer',
      'swordsman', 'swordsman', 'swordsman', 'swordsman', 'swordsman', 'swordsman',
    ],
  },
};

/** TEMPORARY (M2): fixed seed for the render demo, so screenshots are repeatable. */
export const RENDER_DEMO_SEED = 20260926;

/** Positions used by createWorld. Kept here so geometry has one source of truth. */
export const BASE_X = { player: PLAYER_BASE_X, enemy: ENEMY_BASE_X } as const;
export const MINE_X = { player: PLAYER_MINE_X, enemy: ENEMY_MINE_X } as const;
