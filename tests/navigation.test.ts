import { describe, it, expect } from 'vitest';
import { ArenaNavigation, botDecision, canSee } from '../src/game/navigation';
import { ARENA_SOLIDS } from '../src/network/arena';
import { PlayerBody } from '../src/game/physics';
import { IDLE_INPUT } from '../src/network/protocol';

const navigation = new ArenaNavigation();
const body = (x: number, z: number) => {
  const value = new PlayerBody(ARENA_SOLIDS, { x, y: 0, z });
  value.step(IDLE_INPUT, 0, 0.05);
  return value;
};

describe('arena navigation and bot perception', () => {
  it('routes around tall cover with clearance for the player body', () => {
    const start = { x: -5, z: -10 },
      goal = { x: -5, z: 10 };
    expect(navigation.clear(start, goal)).toBe(false);
    const path = navigation.path(start, goal);
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(goal);
    let previous = start;
    for (const waypoint of path) {
      expect(navigation.walkable(waypoint)).toBe(true);
      expect(navigation.clear(previous, waypoint)).toBe(true);
      previous = waypoint;
    }
  });
  it('finds navigable routes between all safe arena corners', () => {
    const points = [
      { x: -12, z: -12 },
      { x: 12, z: 12 },
      { x: 12, z: -12 },
      { x: -12, z: 12 },
      { x: 0, z: 0 },
    ];
    for (const a of points)
      for (const b of points) {
        const path = navigation.path(a, b);
        expect(path.length).toBeGreaterThan(0);
        expect(path.at(-1)).toEqual(b);
        let previous = a;
        for (const waypoint of path) {
          expect(navigation.clear(previous, waypoint)).toBe(true);
          previous = waypoint;
        }
      }
  });
  it('does not see or fire through solid cover', () => {
    const observer = body(-5, -9),
      target = body(-5, 9);
    expect(canSee({ ...observer.position, y: 1.62 }, { ...target.position, y: 1.62 })).toBe(false);
    for (let i = 0; i < 40; i++) {
      const decision = botDecision(
        observer,
        [{ id: 'target', body: target }],
        'test-bot',
        i * 0.05,
      );
      expect(decision.visible).toBe(false);
      expect(decision.fire).toBe(false);
    }
  });
  it('waits for reaction and turns before firing at a visible opponent', () => {
    const observer = body(-10, -10),
      target = body(10, -10);
    const first = botDecision(observer, [{ id: 'target', body: target }], 'react-bot', 0);
    expect(first.visible).toBe(true);
    expect(first.fire).toBe(false);
    let ready = false;
    for (let i = 1; i <= 30; i++)
      ready ||= botDecision(observer, [{ id: 'target', body: target }], 'react-bot', i * 0.05).fire;
    expect(ready).toBe(true);
  });
  it('patrols without getting stuck when no opponent can be seen', () => {
    const observer = body(-12, -12),
      initial = { ...observer.position };
    for (let i = 0; i < 400; i++) {
      const decision = botDecision(observer, [], 'patrol-bot', i * 0.05);
      observer.step(
        { ...IDLE_INPUT, forward: decision.forward, right: decision.right },
        decision.yaw,
        0.05,
      );
      expect(Number.isFinite(observer.position.x)).toBe(true);
      expect(Math.abs(observer.position.x)).toBeLessThan(15.3);
      expect(Math.abs(observer.position.z)).toBeLessThan(15.3);
    }
    expect(
      Math.hypot(observer.position.x - initial.x, observer.position.z - initial.z),
    ).toBeGreaterThan(4);
  });
  it('reaches an objective behind cover using the same collision physics as the player', () => {
    const observer = body(-5, -10),
      objective = { x: -5, z: 10 };
    let closest = Infinity;
    for (let i = 0; i < 500; i++) {
      const decision = botDecision(observer, [], 'objective-bot', i * 0.05, objective);
      observer.step(
        { ...IDLE_INPUT, forward: decision.forward, right: decision.right },
        decision.yaw,
        0.05,
      );
      closest = Math.min(
        closest,
        Math.hypot(observer.position.x - objective.x, observer.position.z - objective.z),
      );
    }
    expect(closest).toBeLessThan(1);
  });
});
