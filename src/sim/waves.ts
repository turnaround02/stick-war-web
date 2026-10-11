/**
 * Scripted wave spawning (spec §8.4).
 *
 * A scripted level's enemy has no economy: its whole force arrives through this
 * table. That is a deliberate design for the tutorial level — it moves the
 * player's attention from "manage the economy" to "manage the line" without
 * costing an AI.
 *
 * Waves spawn on ADVANCE. The spec's level-1 table reads as a mounting attack
 * (two swordsmen at 5s, a mixed group at 50s, more at 110s), so `advance` is
 * the only posture that matches its description. A per-wave stance field would
 * be a knob with no user.
 */

import { endlessWaveAt } from './endless';
import { spawnUnit } from './spawn';
import { findSpawnX } from './training';
import type { Stance, WaveScript, World } from './types';

/** Posture for wave units. See the file comment for why it is not configurable. */
export const WAVE_STANCE: Stance = 'advance';

/**
 * The wave that should be due next, extending the table when endless.
 *
 * Endless mode's table is grown on demand rather than pre-filled: "endless"
 * means unbounded, and a 100-wave table is still a table with a last row.
 */
function nextDueWave(world: World): WaveScript | null {
  if (world.waveIndex < world.waves.length) return world.waves[world.waveIndex];
  if (!world.endless) return null;

  const wave = endlessWaveAt(world.waveIndex + 1);
  world.waves.push(wave);
  return wave;
}

/**
 * Spawns the next wave if it is due. At most ONE wave per call, so a long frame
 * at 4x cannot collapse two waves onto the same tick — which would double the
 * enemy's local density and change the fight.
 */
export function advanceWaves(world: World): void {
  const wave = nextDueWave(world);
  if (wave === null) return;
  if (world.tick < wave.atTick) return;

  for (const typeId of wave.units) {
    // findSpawnX walks outward from the enemy base front until it finds a clear
    // spot, so a wave never buries a unit inside an existing one.
    const x = findSpawnX(world, 'enemy', typeId);
    world.units.push(
      spawnUnit({ id: world.nextUnitId++, side: 'enemy', typeId, x, stance: WAVE_STANCE }),
    );
  }

  world.waveIndex += 1;
}
