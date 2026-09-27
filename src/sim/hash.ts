/**
 * FNV-1a state hash for determinism regression tests (spec §5.1, M2 decision Q12).
 *
 * Why not JSON.stringify: it depends on object key insertion order, so merely
 * reordering fields in an interface changes the hash without changing behaviour.
 * A test that cries wolf is worse than no test — it trains you to ignore it.
 *
 * This walks a FIXED field order, so the hash reflects gameplay state only.
 */

import type { Unit, World } from './types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Positions are rounded to this many decimals: finer is float noise, coarser hides real drift. */
const POSITION_DECIMALS = 4;

function fnv1a(input: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Math.imul keeps the multiply in 32-bit and deterministic across engines.
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

function quantise(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(POSITION_DECIMALS);
}

/** Hashes the gameplay-relevant state of a world into a hex string. */
export function hashWorld(world: World): string {
  const parts: string[] = [];

  parts.push(`tick=${world.tick}`);
  parts.push(`rng=${world.rngState}`);
  parts.push(`outcome=${world.outcome}`);

  parts.push(`gold.p=${world.gold.player}`);
  parts.push(`gold.e=${world.gold.enemy}`);
  parts.push(`pop.p=${world.popUsed.player}`);
  parts.push(`pop.e=${world.popUsed.enemy}`);

  // Mine reserves are M3 economy state: a match where a seam has been drained
  // is not the same match as one where it has not, even at equal gold.
  parts.push(`mine.p=${world.mines.player.goldLeft}`);
  parts.push(`mine.e=${world.mines.enemy.goldLeft}`);

  // The queue and the id counter decide what happens NEXT, so two worlds that
  // look identical now would diverge on the following spawn.
  parts.push(`nextId=${world.nextUnitId}`);
  parts.push(`wave=${world.waveIndex}`);
  for (const side of ['player', 'enemy'] as const) {
    const q = world.trainingQueue[side]
      .map((o) => `${o.typeId}:${o.ticksLeft}`)
      .join(',');
    parts.push(`queue.${side}=${q}`);
  }

  parts.push(`base.p=${world.bases.player.hp}`);
  parts.push(`base.e=${world.bases.enemy.hp}`);

  parts.push(`dmg.p=${world.stats.player.damageDealt}`);
  parts.push(`dmg.e=${world.stats.enemy.damageDealt}`);

  for (const unit of world.units) {
    parts.push(
      `u${unit.id}:${unit.side}:${unit.typeId}:${quantise(unit.x)}:${unit.hp}:${unit.state}:${unit.stance}:${describeTarget(unit)}:${unit.windupTicksLeft}:${unit.cooldownTicksLeft}:${unit.stunTicksLeft}:${unit.gatherTicksLeft}:${unit.carrying}`,
    );
  }

  for (const p of world.projectiles) {
    parts.push(
      `p${p.id}:${p.side}:${quantise(p.x)}:${p.targetId}:${p.damage}:${p.ticksToImpact}`,
    );
  }

  return fnv1a(parts.join('|'), FNV_OFFSET).toString(16).padStart(8, '0');
}

function describeTarget(unit: Unit): string {
  const t = unit.target;
  if (t === null) return '-';
  if (t.kind === 'unit') return `u${t.id}`;
  // A mine and a base are both side-only references, so they must be
  // distinguished explicitly: a loaded miner heading home and one heading out
  // would otherwise hash identically.
  if (t.kind === 'mine') return `m${t.side}`;
  return `b${t.side}`;
}
