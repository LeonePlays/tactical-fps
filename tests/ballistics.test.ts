import { describe, it, expect } from 'vitest';
import { spreadFor, recoilAt, shotDirection, WEAPONS } from '../src/game/ballistics';
describe('weapon handling', () => {
  it('rewards stable crouched/prone fire and penalizes movement and sustained fire', () => {
    const stable = spreadFor({ speed: 0, grounded: true, stance: 'standing' }, 0);
    expect(spreadFor({ speed: 0, grounded: true, stance: 'prone' }, 0)).toBeLessThan(stable);
    expect(spreadFor({ speed: 0, grounded: true, stance: 'crouching' }, 0)).toBeLessThan(stable);
    expect(spreadFor({ speed: 6.35, grounded: true, stance: 'standing' }, 0)).toBeGreaterThan(
      stable,
    );
    expect(spreadFor({ speed: 0, grounded: false, stance: 'standing' }, 0)).toBeGreaterThan(stable);
    expect(spreadFor({ speed: 0, grounded: true, stance: 'standing' }, 5)).toBeGreaterThan(stable);
  });
  it('keeps pistol semi automatic with its own magazine', () => {
    expect(WEAPONS.secondary.automatic).toBe(false);
    expect(WEAPONS.secondary.capacity).toBe(12);
    expect(WEAPONS.primary.automatic).toBe(true);
  });
});

it('has reproducible spray and seeded unit-length shot directions', () => {
  expect(recoilAt('primary', 15)).toEqual(recoilAt('primary', 15));
  expect(recoilAt('primary', 25).pitch).toBeLessThan(recoilAt('primary', 5).pitch);
  expect(recoilAt('primary', 12).yaw).toBeGreaterThan(0);
  expect(recoilAt('primary', 21).yaw).toBeLessThan(0);
  const dir = shotDirection(0, 0, 0.04, 42);
  expect(dir).toEqual(shotDirection(0, 0, 0.04, 42));
  expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1);
  expect(dir).not.toEqual(shotDirection(0, 0, 0.04, 43));
});
