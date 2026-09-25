/**
 * Builds the initial World from a MatchConfig and a seed.
 *
 * This is the ONLY place where data-table seconds are converted to integer
 * ticks. Downstream code can assume every duration field is already an
 * integer tick count (spec §5.1).
 *
 * M1 creates no units from data tables, so no conversion happens yet; the
 * toTicks import arrives with M2's training queue.
 */

import { BASE_X, MINE_X } from '../data/levels';
import { SPAWN_OFFSET, UNITS } from '../data/units';
import type { MatchConfig, Side, Unit, World } from './types';

const SIDES: readonly Side[] = ['player', 'enemy'];

export function createWorld(config: MatchConfig, seed: number): World {
  const units: Unit[] = [];
  let nextUnitId = 1;

  for (const side of SIDES) {
    const count = config.startMiners[side] ?? 0;
    for (let i = 0; i < count; i++) {
      units.push(
        spawnInitialUnit('miner', side, i, config, nextUnitId++),
      );
    }
  }

  const popUsed = { player: 0, enemy: 0 } as Record<Side, number>;
  for (const unit of units) {
    popUsed[unit.side] += UNITS[unit.typeId].popCost;
  }

  return {
    tick: 0,
    rngState: seed,
    units,
    nextUnitId,
    bases: {
      player: { side: 'player', x: BASE_X.player, hp: config.baseHp.player, maxHp: config.baseHp.player },
      enemy: { side: 'enemy', x: BASE_X.enemy, hp: config.baseHp.enemy, maxHp: config.baseHp.enemy },
    },
    mines: {
      player: { side: 'player', x: MINE_X.player, goldLeft: config.mineGold.player },
      enemy: { side: 'enemy', x: MINE_X.enemy, goldLeft: config.mineGold.enemy },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: config.startGold.player, enemy: config.startGold.enemy },
    popUsed,
    trainingQueue: { player: [], enemy: [] },
    waveIndex: 0,
    nextWaveTick: config.waves.length > 0 ? config.waves[0].atTick : Number.MAX_SAFE_INTEGER,
    outcome: 'ongoing',
    levelId: config.levelId,
  };
}

/**
 * Places a starting unit just inside its own base, spread along X so the
 * initial stack does not violate the separation constraint on tick 1.
 */
function spawnInitialUnit(
  typeId: Unit['typeId'],
  side: Side,
  index: number,
  config: MatchConfig,
  id: number,
): Unit {
  const def = UNITS[typeId];
  const dir = side === 'player' ? 1 : -1;
  const rawX = BASE_X[side] + dir * (SPAWN_OFFSET + index * def.bodyRadius * 2.5);
  const x = clamp(rawX, 0, config.worldWidth);

  return {
    id,
    side,
    typeId,
    x,
    prevX: x,
    hp: def.maxHp,
    state: 'idle',
    stateEnteredTick: 0,
    stance: 'hold',
    targetId: null,
    windupTicksLeft: 0,
    cooldownTicksLeft: 0,
    gatherTicksLeft: 0,
    carrying: 0,
    stunTicksLeft: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
