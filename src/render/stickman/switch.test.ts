import { describe, it, expect } from 'vitest';
import { shouldUseSprite } from './switch';

/**
 * The renderer switch is the ONLY rule deciding sprite vs skeleton (iron rule
 * #7: it lives in a Phaser-free module precisely so it can be asserted here).
 *
 * M15 step-2 made the contract trivially simple — sprite pref = sprite, always
 * — because the strip pipeline now covers every state: walk frames for
 * move/gather, attack frames for attack, a static frame for idle/stunned, and
 * a sprite-frame ghost for death. These tests pin the simplification: the
 * state must NOT be able to sneak back into the decision.
 */
describe('shouldUseSprite', () => {
  it('sprite preference always uses sprites', () => {
    expect(shouldUseSprite('sprite')).toBe(true);
  });

  it('skeleton preference never uses sprites', () => {
    expect(shouldUseSprite('skeleton')).toBe(false);
  });
});
