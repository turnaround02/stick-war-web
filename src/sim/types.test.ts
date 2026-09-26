import { describe, it, expect } from 'vitest';
import type { TargetRef } from './types';

/** Narrowing helper mirroring how systems will consume a TargetRef. */
function describeTarget(target: TargetRef): string {
  if (target === null) return 'none';
  switch (target.kind) {
    case 'unit':
      return `unit:${target.id}`;
    case 'base':
      return `base:${target.side}`;
    case 'mine':
      return `mine:${target.side}`;
  }
}

describe('TargetRef', () => {
  it('expresses no target', () => {
    expect(describeTarget(null)).toBe('none');
  });

  it('expresses a unit target', () => {
    expect(describeTarget({ kind: 'unit', id: 7 })).toBe('unit:7');
  });

  it('expresses a base target', () => {
    expect(describeTarget({ kind: 'base', side: 'enemy' })).toBe('base:enemy');
  });

  it('exhausts the union — the switch has no default and still type-checks', () => {
    // If a third variant were added, tsc would fail on the missing case.
    const all: TargetRef[] = [null, { kind: 'unit', id: 1 }, { kind: 'base', side: 'player' }];
    expect(all.map(describeTarget)).toEqual(['none', 'unit:1', 'base:player']);
  });
});
