/**
 * Builds the initial World from a MatchConfig and a seed.
 *
 * Unit durations arrive from data/unitTicks.ts already in integer ticks, so
 * nothing here converts seconds (spec §5.1).
 */

import { BASE_X, MINE_X } from '../data/levels';
import { SPAWN_OFFSET, UNITS, type UnitTypeId } from '../data/units';
import { spawnUnit } from './spawn';
import type { MatchConfig, Side, Stance, Unit, World } from './types';

const SIDES: readonly Side[] = ['player', 'enemy'];

/** Default gap between roster-spawned units when MatchConfig does not specify one. */
const DEFAULT_INITIAL_SPACING = 40;

/** How far off-map a parked (noBases) base sits. Unreachable by any unit. */
const OFF_MAP_MARGIN = 1000;

export function createWorld(config: MatchConfig, seed: number): World {
  const units: Unit[] = [];
  let nextUnitId = 1;

  for (const side of SIDES) {
    const roster = config.initialUnits?.[side];

    if (roster && roster.length > 0) {
      // An explicit roster means "these units are meant to fight", so the
      // default posture is advance. Callers wanting a passive line set
      // initialStance explicitly.
      const stance: Stance = config.initialStance ?? 'advance';
      const spacing = config.initialSpacing ?? DEFAULT_INITIAL_SPACING;

      let cursor = 0;
      for (const typeId of roster) {
        const def = UNITS[typeId];
        const dir = side === 'player' ? 1 : -1;
        const offset = SPAWN_OFFSET + cursor;
        const x = clamp(BASE_X[side] + dir * offset, 0, config.worldWidth);
        units.push(spawnUnit({ id: nextUnitId++, side, typeId, x, stance }));
        cursor += spacing + def.bodyRadius * 2;
      }
      continue;
    }

    const count = config.startMiners[side] ?? 0;
    for (let i = 0; i < count; i++) {
      units.push(spawnInitialMiner(side, i, config, nextUnitId++));
    }
  }

  const popUsed: Record<Side, number> = { player: 0, enemy: 0 };
  for (const unit of units) {
    popUsed[unit.side] += UNITS[unit.typeId].popCost;
  }

  // Base-less matchups park the bases off-map at full hp, so the "base fell"
  // win condition can never fire and the match is decided by attrition alone.
  const playerBaseX = config.noBases ? -OFF_MAP_MARGIN : BASE_X.player;
  const enemyBaseX = config.noBases ? config.worldWidth + OFF_MAP_MARGIN : BASE_X.enemy;

  return {
    tick: 0,
    rngState: seed,
    units,
    nextUnitId,
    bases: {
      player: {
        side: 'player',
        x: playerBaseX,
        hp: config.baseHp.player,
        maxHp: config.baseHp.player,
      },
      enemy: {
        side: 'enemy',
        x: enemyBaseX,
        hp: config.baseHp.enemy,
        maxHp: config.baseHp.enemy,
      },
    },
    mines: {
      player: { side: 'player', x: MINE_X.player, goldLeft: config.mineGold.player },
      enemy: { side: 'enemy', x: MINE_X.enemy, goldLeft: config.mineGold.enemy },
    },
    projectiles: [],
    nextProjectileId: 1,
    gold: { player: config.startGold.player, enemy: config.startGold.enemy },
    popUsed,
    popCap: { player: config.popCap.player, enemy: config.popCap.enemy },
    trainingQueue: { player: [], enemy: [] },
    stats: {
      player: { damageDealt: 0 },
      enemy: { damageDealt: 0 },
    },
    waveIndex: 0,
    nextWaveTick: config.waves.length > 0 ? config.waves[0].atTick : Number.MAX_SAFE_INTEGER,
    waves: config.waves,
    // Only an economy enemy has a bank to spend, so only it gets a tactical
    // layer. A scripted level's force is entirely in its wave table.
    aiProfile: config.enemyAi === 'economy' ? 'standard' : 'none',
    outcome: 'ongoing',
    levelId: config.levelId,
    worldWidth: config.worldWidth,
    difficultyMult: config.difficultyMult,
    endless: config.endless,
  };
}

function spawnInitialMiner(
  side: Side,
  index: number,
  config: MatchConfig,
  id: number,
): Unit {
  const def = UNITS.miner;
  const dir = side === 'player' ? 1 : -1;
  const rawX = BASE_X[side] + dir * (SPAWN_OFFSET + index * def.bodyRadius * 2.5);
  const x = clamp(rawX, 0, config.worldWidth);
  return spawnUnit({ id, side, typeId: 'miner' as UnitTypeId, x, stance: 'hold' });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
