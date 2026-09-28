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

import { decideCommands } from '../tactic';
import { ENEMY_STANDARD } from '../ai-profile';
import { queueUnit } from '../training';
import type { Command, Side, Stance, TickContext, World } from '../types';

export function commandsSystem(ctx: TickContext): void {
  const { world, commands } = ctx;

  // The tactical layer runs FIRST, in the same step that consumes its output,
  // so an AI order takes effect on the tick it was decided. This is the spec's
  // own split (§9.1): `commands` is the tactical layer, `ai` is the unit layer.
  //
  // `aiProfile: 'none'` skips it entirely. Two callers need that: a scripted
  // level (no enemy economy, so there is nothing to spend) and the balance
  // harness (which measures pure unit matchups and must not have an AI buying
  // units or re-issuing stance orders mid-fight).
  if (world.aiProfile === 'standard') {
    for (const command of decideCommands(world, 'enemy', ENEMY_STANDARD)) {
      consume(world, command);
    }
  }

  // Player commands are consumed last. That favours neither side: the two
  // sides' orders cannot overlap (each touches only its own units), so the
  // order only matters within one side, and a player issues at most one batch
  // per frame.
  for (const command of commands) {
    consume(world, command);
  }
}

/** Applies one command. Shared by the AI layer and the player's input. */
function consume(world: World, command: Command): void {
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
