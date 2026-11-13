import { describe, expect, it } from 'vitest';
import {
  ArenaNavigation,
  botDecision,
  canSee,
  type BotDecision,
  type BotOptions,
} from '../src/game/navigation';
import { getMap, type MapDefinition } from '../src/game/maps';
import type { BotDifficulty } from '../src/game/match-config';
import { box, PlayerBody } from '../src/game/physics';
import { IDLE_INPUT } from '../src/network/protocol';
import { Match } from '../src/game/match';

const industrial = getMap('industrial');
const urban = getMap('old-quarter');
function body(x: number, z: number, map = industrial) {
  const result = new PlayerBody(map.solids, { x, y: 0, z });
  result.step(IDLE_INPUT, 0, 0.05);
  return result;
}
function runMovement(value: PlayerBody, decision: BotDecision) {
  value.step(
    { ...IDLE_INPUT, forward: decision.forward, right: decision.right },
    decision.yaw,
    0.05,
  );
}
function difficultySample(difficulty: BotDifficulty) {
  const observer = body(-10, -10),
    target = body(-5, -5);
  const exactYaw = Math.PI / 4;
  let firstFire = Infinity,
    squaredError = 0,
    samples = 0,
    shotInterval = 0;
  for (let i = 0; i < 100; i++) {
    const decision = botDecision(
      observer,
      [{ id: 'target', body: target }],
      'same-seed',
      i * 0.05,
      undefined,
      {
        map: industrial,
        difficulty,
      },
    );
    if (decision.fire && firstFire === Infinity) firstFire = i * 0.05;
    if (i > 40) {
      squaredError += (decision.yaw - exactYaw) ** 2 + decision.pitch ** 2;
      samples++;
    }
    shotInterval = decision.shotInterval;
  }
  return { firstFire, error: Math.sqrt(squaredError / samples), shotInterval };
}

describe('bot difficulty and finite-state perception', () => {
  it('makes hard bots react sooner, aim more accurately and fire faster than easy bots', () => {
    const easy = difficultySample('easy'),
      normal = difficultySample('normal'),
      hard = difficultySample('hard');
    expect(easy.firstFire - hard.firstFire).toBeGreaterThan(0.3);
    expect(normal.firstFire).toBeGreaterThan(hard.firstFire);
    expect(easy.error).toBeGreaterThan(normal.error * 1.5);
    expect(normal.error).toBeGreaterThan(hard.error * 1.5);
    expect(easy.shotInterval).toBeGreaterThan(normal.shotInterval);
    expect(normal.shotInterval).toBeGreaterThan(hard.shotInterval);
  });

  it('produces repeatable decisions for identical inputs and seeds', () => {
    const a = body(-10, -10),
      b = body(-10, -10),
      target = body(-5, -5);
    for (let i = 0; i < 50; i++) {
      const candidates = [{ id: 'target', body: target }];
      const options: BotOptions = { map: industrial, difficulty: 'normal' };
      expect(botDecision(a, candidates, 'repeatable', i * 0.05, undefined, options)).toEqual(
        botDecision(b, candidates, 'repeatable', i * 0.05, undefined, options),
      );
    }
  });

  it('does not acquire an opponent behind its field of view', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const observer = body(-10, -10),
        rear = body(-14, -14);
      const decision = botDecision(observer, [{ id: 'rear', body: rear }], 'fov', 0, undefined, {
        map: industrial,
        difficulty,
      });
      expect(decision.visible).toBe(false);
      expect(decision.fire).toBe(false);
      expect(decision.targetId).toBeNull();
    }
  });

  it('uses each difficulty vision range on the selected map', () => {
    const target = body(20, -20, urban);
    const easy = botDecision(
      body(-20, -20, urban),
      [{ id: 'target', body: target }],
      'range',
      0,
      undefined,
      {
        map: urban,
        difficulty: 'easy',
      },
    );
    const hard = botDecision(
      body(-20, -20, urban),
      [{ id: 'target', body: target }],
      'range',
      0,
      undefined,
      {
        map: urban,
        difficulty: 'hard',
      },
    );
    expect(easy.visible).toBe(false);
    expect(hard.visible).toBe(true);
  });

  it('never fires through cover even at hard difficulty', () => {
    const observer = body(-5, -9),
      target = body(-5, 9);
    for (let i = 0; i < 100; i++) {
      const decision = botDecision(
        observer,
        [{ id: 'covered', body: target }],
        'los',
        i * 0.05,
        undefined,
        {
          map: industrial,
          difficulty: 'hard',
        },
      );
      expect(decision.visible).toBe(false);
      expect(decision.fire).toBe(false);
    }
  });

  it('investigates the frozen last observation without tracking a hidden opponent', () => {
    const observer = body(-5, -9),
      target = body(-5, -4);
    const options: BotOptions = { map: industrial, difficulty: 'hard' };
    expect(
      botDecision(observer, [{ id: 'target', body: target }], 'memory', 0, undefined, options)
        .visible,
    ).toBe(true);
    target.position = { x: -5, y: 0, z: 9 };
    expect(canSee({ x: -5, y: 1.62, z: -9 }, { x: -5, y: 1.62, z: 9 }, industrial.solids)).toBe(
      false,
    );
    const lost = botDecision(
      observer,
      [{ id: 'target', body: target }],
      'memory',
      0.05,
      undefined,
      options,
    );
    expect(lost.state).toBe('investigate');
    expect(lost.goal).toEqual({ x: -5, z: -4 });
    target.position = { x: -4, y: 0, z: 10 };
    const moved = botDecision(
      observer,
      [{ id: 'target', body: target }],
      'memory',
      0.1,
      undefined,
      options,
    );
    expect(moved.visible).toBe(false);
    expect(moved.fire).toBe(false);
    expect(moved.goal).toEqual(lost.goal);
  });

  it('retreats when injured, commits to a nearby objective, and regroups with known allies', () => {
    const observer = body(-10, -10),
      target = body(-5, -5);
    const injured = botDecision(
      observer,
      [{ id: 'target', body: target }],
      'injured',
      0,
      undefined,
      {
        map: industrial,
        difficulty: 'normal',
        health: 15,
      },
    );
    expect(injured.state).toBe('retreat');
    expect(Math.hypot(injured.goal.x + 5, injured.goal.z + 5)).toBeGreaterThan(Math.hypot(5, 5));
    const committed = botDecision(
      body(-10, -10),
      [{ id: 'target', body: target }],
      'defuser',
      0,
      { x: -8, z: -8 },
      {
        map: industrial,
        difficulty: 'hard',
        role: 'defuse',
      },
    );
    expect(committed.visible).toBe(true);
    expect(committed.state).toBe('objective');
    expect(committed.fire).toBe(false);
    const regroup = botDecision(body(-12, -12), [], 'support', 0, undefined, {
      map: industrial,
      difficulty: 'normal',
      role: 'escort',
      allies: [{ id: 'ally', body: body(12, -12) }],
    });
    expect(regroup.state).toBe('regroup');
    expect(regroup.goal).toEqual({ x: 12, z: -12 });
  });

  it('assigns support a stable leader instead of making both allies chase each other', () => {
    const leader = body(-12, -12),
      follower = body(12, -12);
    const a = botDecision(leader, [], 'alpha-0', 0, undefined, {
      map: industrial,
      difficulty: 'easy',
      role: 'support',
      allies: [{ id: 'alpha-1', body: follower }],
    });
    const b = botDecision(follower, [], 'alpha-1', 0, undefined, {
      map: industrial,
      difficulty: 'easy',
      role: 'support',
      allies: [{ id: 'alpha-0', body: leader }],
    });
    expect(a.state).toBe('patrol');
    expect(b.state).toBe('regroup');
    expect(b.goal).toEqual({ x: -12, z: -12 });
  });

  it('finds actual combat in an easy urban team match instead of regrouping forever', () => {
    const match = new Match({
      map: 'old-quarter',
      mode: 'team-deathmatch',
      difficulty: 'easy',
      timeLimit: 30,
      scoreLimit: 5,
      bots: 4,
    });
    for (let i = 0; i < 4; i++) match.add(`bot-${i}`, true);
    for (let tick = 0; tick < 30 * 60; tick++) match.step(1 / 60);
    const actors = match.snapshot();
    expect(actors.reduce((sum, a) => sum + a.shots, 0)).toBeGreaterThan(0);
    expect(actors.reduce((sum, a) => sum + a.kills, 0)).toBeGreaterThan(0);
  });
});

describe('map-specific bot routes and recovery', () => {
  it.each([industrial, urban])('connects $name spawns, objective and all patrol points', (map) => {
    const nav = new ArenaNavigation(map.solids, map.bounds);
    for (const point of map.patrolPoints) expect(nav.walkable(point)).toBe(true);
    for (const spawn of map.spawns) {
      for (const goal of [...map.patrolPoints, map.bombSite]) {
        const path = nav.path(spawn, goal);
        expect(path.length).toBeGreaterThan(0);
        expect(path.at(-1)).toEqual({ x: goal.x, z: goal.z });
        let previous = spawn;
        for (const point of path) {
          expect(nav.walkable(point)).toBe(true);
          expect(nav.clear(previous, point)).toBe(true);
          previous = { ...point, y: 0 };
        }
      }
    }
  });

  it.each([
    { x: -12, z: 0 },
    { x: 11, z: 2 },
  ])('walks through urban doorways to interior $x/$z', (objective) => {
    const observer = body(objective.x < 0 ? -18 : 18, -19, urban);
    let closest = Infinity;
    for (let i = 0; i < 650; i++) {
      const decision = botDecision(observer, [], 'interior', i * 0.05, objective, {
        map: urban,
        difficulty: 'normal',
      });
      const before = { ...observer.position };
      runMovement(observer, decision);
      expect(
        Math.hypot(observer.position.x - before.x, observer.position.z - before.z),
      ).toBeLessThan(0.4);
      closest = Math.min(
        closest,
        Math.hypot(observer.position.x - objective.x, observer.position.z - objective.z),
      );
    }
    expect(closest).toBeLessThan(0.8);
  });

  it('detects blocked commanded motion even when collision has zeroed PlayerBody.moving', () => {
    const observer = body(-5, -10),
      objective = { x: -5, z: 10 };
    let recovered = false;
    for (let i = 0; i < 24; i++) {
      const decision = botDecision(observer, [], 'blocked', i * 0.05, objective);
      recovered ||= Math.hypot(decision.goal.x - objective.x, decision.goal.z - objective.z) > 0.5;
      expect(observer.position).toEqual({ x: -5, y: 0, z: -10 });
    }
    expect(observer.moving).toBe(false);
    expect(recovered).toBe(true);
    let closest = Infinity;
    for (let i = 24; i < 650; i++) {
      runMovement(observer, botDecision(observer, [], 'blocked', i * 0.05, objective));
      closest = Math.min(
        closest,
        Math.hypot(observer.position.x - objective.x, observer.position.z - objective.z),
      );
    }
    expect(closest).toBeLessThan(0.8);
  });

  it('recovers from an inaccessible objective by using reachable patrol routes without teleporting', () => {
    const map: MapDefinition = {
      ...industrial,
      solids: [
        box(0, -0.5, 0, 20, 1, 20),
        box(-2, 1.5, 0, 0.2, 3, 4.2),
        box(2, 1.5, 0, 0.2, 3, 4.2),
        box(0, 1.5, -2, 4.2, 3, 0.2),
        box(0, 1.5, 2, 4.2, 3, 0.2),
      ],
      bounds: { minX: -9.5, maxX: 9.5, minZ: -9.5, maxZ: 9.5 },
      patrolPoints: [
        { x: -7, z: 7 },
        { x: 7, z: 7 },
        { x: 7, z: -7 },
        { x: -7, z: -7 },
      ],
      spawns: [{ x: -7, y: 0, z: -7 }],
    };
    const observer = body(-7, -7, map),
      initial = { ...observer.position };
    let travelled = 0;
    for (let i = 0; i < 350; i++) {
      const before = { ...observer.position };
      runMovement(
        observer,
        botDecision(
          observer,
          [],
          'impossible',
          i * 0.05,
          { x: 0, z: 0 },
          {
            map,
            difficulty: 'normal',
          },
        ),
      );
      const delta = Math.hypot(observer.position.x - before.x, observer.position.z - before.z);
      expect(delta).toBeLessThan(0.4);
      travelled += delta;
      expect(Math.abs(observer.position.x) < 1.85 && Math.abs(observer.position.z) < 1.85).toBe(
        false,
      );
    }
    expect(travelled).toBeGreaterThan(5);
    expect(observer.position).not.toEqual(initial);
  });
});
