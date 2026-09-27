/**
 * Desktop input state. Produces Commands; never touches the sim directly.
 *
 * The scene owns the Phaser listeners and feeds this module; keeping the state
 * machine Phaser-free makes the queueing and key logic testable without a
 * canvas.
 */

import { setStance, train } from './commands';
import type { Command } from '../sim/types';

export { setStance, train };

/**
 * Collects commands between logic ticks.
 *
 * Commands are drained once per render frame and handed only to the FIRST tick
 * of that frame (spec §6.3.3): at 4x speed a frame runs several ticks, and
 * replaying the same order on each would spend four times the gold.
 */
export class CommandQueue {
  private pending: Command[] = [];

  push(command: Command): void {
    this.pending.push(command);
  }

  /** Returns everything queued and empties the queue. */
  drain(): Command[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  get size(): number {
    return this.pending.length;
  }
}

/** Held-key state, driven by the scene's keydown/keyup listeners. */
export class KeyState {
  private down = new Set<string>();

  update(code: string, isDown: boolean): void {
    if (isDown) this.down.add(code);
    else this.down.delete(code);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Drops every held key. Used when the window loses focus mid-scroll. */
  clear(): void {
    this.down.clear();
  }

  /**
   * -1 to scroll left, +1 to scroll right, 0 for neither or both.
   * Holding both cancels rather than letting one win a race.
   */
  scrollDir(): -1 | 0 | 1 {
    const left = this.isDown('KeyA') || this.isDown('ArrowLeft');
    const right = this.isDown('KeyD') || this.isDown('ArrowRight');
    if (left === right) return 0;
    return left ? -1 : 1;
  }
}
