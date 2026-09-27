/**
 * Command constructors. Pure data — this file has no listeners and no Phaser.
 *
 * The Command type itself lives in sim/types.ts, because sim must be able to
 * name the type it consumes and sim may not import from input/ (spec §3.2).
 */

import type { Command, Side, Stance, UnitTypeId } from '../sim/types';

export function train(side: Side, typeId: UnitTypeId): Command {
  return { kind: 'train', side, typeId };
}

export function setStance(side: Side, unitIds: number[], stance: Stance): Command {
  // Copy: the caller may reuse and mutate its array, and a queued command must
  // not change after the fact.
  return { kind: 'setStance', side, unitIds: [...unitIds], stance };
}
