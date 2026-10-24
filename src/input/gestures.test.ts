import { describe, it, expect } from 'vitest';
import { PanTracker, PinchTracker, TAP_SLOP_PX, PINCH_ZOOM_RATE } from './gestures';

describe('PanTracker', () => {
  it('stays inactive before a press', () => {
    const t = new PanTracker();
    expect(t.active).toBe(false);
    expect(t.drag(100)).toBe(0);
    expect(t.movedBeyondTap()).toBe(false);
  });

  it('does not start a drag within the tap slop', () => {
    const t = new PanTracker();
    t.press(100);
    expect(t.drag(100 + TAP_SLOP_PX - 1)).toBe(0);
    expect(t.active).toBe(false);
    expect(t.movedBeyondTap()).toBe(false);
  });

  it('starts dragging once the movement exceeds the slop', () => {
    const t = new PanTracker();
    t.press(100);
    const d = t.drag(100 + TAP_SLOP_PX + 5);
    // The whole motion since press is handed over at drag start.
    expect(d).toBe(TAP_SLOP_PX + 5);
    expect(t.active).toBe(true);
    expect(t.movedBeyondTap()).toBe(true);
  });

  it('reports only the movement since the last update once dragging', () => {
    const t = new PanTracker();
    t.press(100);
    t.drag(130);
    expect(t.drag(140)).toBe(10);
    expect(t.drag(120)).toBe(-20);
  });

  it('a tap (press + release without slop) never counts as a drag', () => {
    const t = new PanTracker();
    t.press(100);
    t.drag(103);
    t.release();
    expect(t.movedBeyondTap()).toBe(false);
  });

  it('ignores moves after release', () => {
    const t = new PanTracker();
    t.press(100);
    t.drag(150);
    t.release();
    expect(t.drag(200)).toBe(0);
    expect(t.active).toBe(false);
  });

  it('a new press resets the drag state', () => {
    const t = new PanTracker();
    t.press(100);
    t.drag(150);
    t.release();
    t.press(300);
    expect(t.active).toBe(false);
    expect(t.movedBeyondTap()).toBe(false);
    // Small move on the new press: still a tap.
    expect(t.drag(303)).toBe(0);
  });

  it('right-to-left drags produce negative deltas', () => {
    const t = new PanTracker();
    t.press(200);
    const d = t.drag(150);
    expect(d).toBeLessThan(0);
  });
});

describe('PinchTracker', () => {
  it('is inactive before start', () => {
    const p = new PinchTracker();
    expect(p.active).toBe(false);
    expect(p.move(200)).toBe(0);
  });

  it('maps distance growth to a positive zoom delta', () => {
    const p = new PinchTracker();
    p.start(200);
    const d = p.move(220);
    expect(d).toBeCloseTo(20 * PINCH_ZOOM_RATE, 10);
    expect(d).toBeGreaterThan(0);
  });

  it('maps distance shrink to a negative zoom delta', () => {
    const p = new PinchTracker();
    p.start(200);
    expect(p.move(180)).toBeLessThan(0);
  });

  it('reports only the change since the last move', () => {
    const p = new PinchTracker();
    p.start(200);
    p.move(220);
    expect(p.move(230)).toBeCloseTo(10 * PINCH_ZOOM_RATE, 10);
  });

  it('ignores a degenerate zero-distance move', () => {
    const p = new PinchTracker();
    p.start(200);
    expect(p.move(0)).toBe(0);
  });

  it('stops reporting after release', () => {
    const p = new PinchTracker();
    p.start(200);
    p.release();
    expect(p.move(240)).toBe(0);
    expect(p.active).toBe(false);
  });

  it('the rate turns a 200px spread into roughly 1.0 zoom delta', () => {
    expect(200 * PINCH_ZOOM_RATE).toBeCloseTo(1.0, 10);
  });
});
