/**
 * Step 2 of 6: consume this tick's Command[].
 *
 * Runs after economy (so gold earned this tick is spendable in the same tick)
 * and before AI/movement (so orders take effect immediately rather than a tick
 * late).
 *
 * The player and the AI share this exact Command type — the AI is literally
 * pressing the same buttons (spec §9.1). That is why `side` is enforced here:
 * a command may only touch units belonging to the side that issued it.
 *
 * Commands are fire-and-forget: an unaffordable order is dropped, not queued.
 */

import { queueUnit } from '../training';
import type { Side, Stance, TickContext, World } from '../types';

export function commandsSystem(ctx: TickContext): void {
  const { world, commands } = ctx;

  for (const command of commands) {
    switch (command.kind) {
      case 'train':
        // A rejected order changes nothing at all: no gold spent, nothing
        // queued. The UI greys the button out; the sim just refuses.
        queueUnit(world, command.side, command.typeId);
        break;

      case 'setStance':
        applyStance(world, command.side, command.unitIds, command.stance);
        break;
    }
  }
}

function applyStance(world: World, side: Side, unitIds: number[], stance: Stance): void {
  if (unitIds.length === 0) return;

  const wanted = new Set(unitIds);
  for (const unit of world.units) {
    if (!wanted.has(unit.id)) continue;
    // Only your own, living units obey.
    if (unit.side !== side) continue;
    if (unit.state === 'dead' || unit.hp <= 0) continue;
    unit.stance = stance;
  }
}
