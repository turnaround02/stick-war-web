/**
 * Builds Unit instances. Shared by createWorld and the balance harness so both
 * produce byte-identical units for the same inputs.
 */

import { UNITS, type UnitTypeId } from '../data/units';
import type { Side, Stance, Unit } from './types';

export interface SpawnOptions {
  id: number;
  side: Side;
  typeId: UnitTypeId;
  x: number;
  stance?: Stance;
}

export function spawnUnit(opts: SpawnOptions): Unit {
  const def = UNITS[opts.typeId];
  return {
    id: opts.id,
    side: opts.side,
    typeId: opts.typeId,
    x: opts.x,
    prevX: opts.x,
    hp: def.maxHp,
    state: 'idle',
    stateEnteredTick: 0,
    stance: opts.stance ?? 'hold',
    target: null,
    windupTicksLeft: 0,
    cooldownTicksLeft: 0,
    gatherTicksLeft: 0,
    carrying: 0,
    stunTicksLeft: 0,
  };
}
