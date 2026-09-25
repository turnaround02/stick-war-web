import { describe, it, expect } from 'vitest';

describe('vitest wiring', () => {
  it('runs tests in the node environment', () => {
    expect(1 + 1).toBe(2);
  });
});
