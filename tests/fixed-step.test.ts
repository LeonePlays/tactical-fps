import { expect, it } from 'vitest';
import { FixedStepClock } from '../src/core/fixed-step';
import { PlayerBody, box } from '../src/game/physics';
const idle = { forward: 1, right: 0, sprint: false, jump: false, stance: 'standing' as const };
it('produces the same movement and elapsed time at 10,30,60 and144 FPS', () => {
  const results = [10, 30, 60, 144].map((fps) => {
    const clock = new FixedStepClock();
    const body = new PlayerBody([box(0, -0.5, 0, 100, 1, 100)], { x: 0, y: 0, z: 0 });
    let elapsed = 0;
    for (let frame = 0; frame < fps * 2; frame++)
      clock.advance(1 / fps, (dt) => {
        elapsed += dt;
        body.step(idle, 0, dt);
      });
    return { elapsed, z: body.position.z };
  });
  for (const result of results) {
    expect(result.elapsed).toBeCloseTo(2, 8);
    expect(result.z).toBeCloseTo(results[0].z, 8);
  }
});
it('bounds stalls, ignores invalid time and resets paused remainder', () => {
  const clock = new FixedStepClock();
  let count = 0;
  clock.advance(10, () => count++);
  expect(count).toBe(15);
  clock.advance(NaN, () => count++);
  expect(count).toBe(15);
  clock.advance(0.008, () => count++);
  clock.reset();
  clock.advance(0.009, () => count++);
  expect(count).toBe(15);
});
