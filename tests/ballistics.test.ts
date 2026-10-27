import { describe, it, expect } from 'vitest';
import { spread, WEAPONS } from '../src/game/ballistics';
describe('weapon handling', () => {
  it('rewards stable crouched/prone fire and penalizes movement and sustained fire', () => {
    const stable = spread(false, true, 'standing', 0);
    expect(spread(false, true, 'prone', 0)).toBeLessThan(stable);
    expect(spread(false, true, 'crouching', 0)).toBeLessThan(stable);
    expect(spread(true, true, 'standing', 0)).toBeGreaterThan(stable);
    expect(spread(false, false, 'standing', 0)).toBeGreaterThan(stable);
    expect(spread(false, true, 'standing', 5)).toBeGreaterThan(stable);
  });
  it('keeps pistol semi automatic with its own magazine', () => {
    expect(WEAPONS.secondary.automatic).toBe(false);
    expect(WEAPONS.secondary.capacity).toBe(12);
    expect(WEAPONS.primary.automatic).toBe(true);
  });
});
