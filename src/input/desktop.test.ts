import { describe, it, expect } from 'vitest';
import { train, setStance, CommandQueue, KeyState } from './desktop';

describe('command constructors', () => {
  it('builds a train command', () => {
    expect(train('player', 'swordsman')).toEqual({
      kind: 'train',
      side: 'player',
      typeId: 'swordsman',
    });
  });

  it('builds a stance command', () => {
    expect(setStance('player', [1, 2], 'retreat')).toEqual({
      kind: 'setStance',
      side: 'player',
      unitIds: [1, 2],
      stance: 'retreat',
    });
  });

  it('copies the id list so later mutation cannot alter a queued command', () => {
    const ids = [1, 2];
    const cmd = setStance('player', ids, 'advance');
    ids.push(3);
    expect(cmd).toEqual({ kind: 'setStance', side: 'player', unitIds: [1, 2], stance: 'advance' });
  });
});

describe('CommandQueue', () => {
  it('drains everything queued', () => {
    const q = new CommandQueue();
    q.push(train('player', 'miner'));
    q.push(train('player', 'archer'));
    expect(q.drain()).toHaveLength(2);
  });

  it('empties itself on drain', () => {
    const q = new CommandQueue();
    q.push(train('player', 'miner'));
    q.drain();
    expect(q.drain()).toHaveLength(0);
  });

  it('preserves order', () => {
    const q = new CommandQueue();
    q.push(train('player', 'miner'));
    q.push(train('player', 'archer'));
    expect(q.drain().map((c) => (c.kind === 'train' ? c.typeId : ''))).toEqual(['miner', 'archer']);
  });

  it('returns a fresh array each time so callers cannot corrupt the queue', () => {
    const q = new CommandQueue();
    q.push(train('player', 'miner'));
    const first = q.drain();
    first.push(train('player', 'archer'));
    expect(q.drain()).toHaveLength(0);
  });

  it('reports its size', () => {
    const q = new CommandQueue();
    expect(q.size).toBe(0);
    q.push(train('player', 'miner'));
    expect(q.size).toBe(1);
    q.drain();
    expect(q.size).toBe(0);
  });
});

describe('KeyState', () => {
  it('reports a key as up by default', () => {
    expect(new KeyState().isDown('KeyA')).toBe(false);
  });

  it('tracks press and release', () => {
    const k = new KeyState();
    k.update('KeyA', true);
    expect(k.isDown('KeyA')).toBe(true);
    k.update('KeyA', false);
    expect(k.isDown('KeyA')).toBe(false);
  });

  it('tracks several keys independently', () => {
    const k = new KeyState();
    k.update('KeyA', true);
    k.update('KeyD', true);
    k.update('KeyA', false);
    expect(k.isDown('KeyD')).toBe(true);
    expect(k.isDown('KeyA')).toBe(false);
  });

  it('reports a horizontal scroll direction', () => {
    const k = new KeyState();
    expect(k.scrollDir()).toBe(0);
    k.update('KeyA', true);
    expect(k.scrollDir()).toBe(-1);
    k.update('KeyD', true);
    // Both held: the net is zero rather than a race between them.
    expect(k.scrollDir()).toBe(0);
  });

  it('accepts the arrow keys as well', () => {
    const k = new KeyState();
    k.update('ArrowRight', true);
    expect(k.scrollDir()).toBe(1);
    k.update('ArrowLeft', true);
    expect(k.scrollDir()).toBe(0);
  });

  it('clears all held keys', () => {
    const k = new KeyState();
    k.update('KeyA', true);
    k.clear();
    expect(k.isDown('KeyA')).toBe(false);
  });
});
