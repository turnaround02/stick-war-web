/**
 * Selection is RENDER-LAYER state and never enters the simulation (spec §3.1).
 *
 * It lives here rather than in World because nothing in the simulation depends
 * on what the player has highlighted — selection changes no rule, and putting
 * it in the world would make the determinism hash depend on UI clicks.
 */

import type { Side, Unit } from '../sim/types';

export class Selection {
  /** Insertion-ordered so `ids()` is deterministic. */
  private selected = new Set<number>();

  /** Replaces the selection with a single id. */
  select(id: number): void {
    this.selected.clear();
    this.selected.add(id);
  }

  /** Adds or removes one id, leaving the rest alone. */
  toggle(id: number): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  clear(): void {
    this.selected.clear();
  }

  has(id: number): boolean {
    return this.selected.has(id);
  }

  get size(): number {
    return this.selected.size;
  }

  /** A copy, so a caller mutating the result cannot corrupt the selection. */
  ids(): number[] {
    return [...this.selected];
  }
}

/**
 * The selection narrowed to units that actually exist, are alive, and belong
 * to `side`. Used when building a stance command.
 */
export function selectedIdsOf(selection: Selection, units: Unit[], side: Side): number[] {
  const wanted = selection.ids();
  if (wanted.length === 0) return [];

  const byId = new Map<number, Unit>();
  for (const unit of units) byId.set(unit.id, unit);

  const out: number[] = [];
  for (const id of wanted) {
    const unit = byId.get(id);
    if (!unit) continue;
    if (unit.side !== side) continue;
    if (unit.state === 'dead' || unit.hp <= 0) continue;
    out.push(id);
  }
  return out;
}
