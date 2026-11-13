import { describe, expect, it } from 'vitest';
import { getMap, MAPS, type MapDefinition } from '../src/game/maps';
import { box, PlayerBody } from '../src/game/physics';
import { ARENA_BLOCKS, ARENA_SOLIDS, SPAWNS } from '../src/network/arena';

type Point = { x: number; z: number };
const idle = { forward: 0, right: 0, sprint: false, jump: false, stance: 'standing' as const };
// Independent clearance check for a standing player, deliberately wider than the body.
function free(map: MapDefinition, p: Point): boolean {
  return (
    p.x > map.bounds.minX + 0.35 &&
    p.x < map.bounds.maxX - 0.35 &&
    p.z > map.bounds.minZ + 0.35 &&
    p.z < map.bounds.maxZ - 0.35 &&
    !map.solids.some(
      (s) =>
        s.max.y > 0.05 &&
        s.min.y < 1.8 &&
        p.x + 0.35 > s.min.x &&
        p.x - 0.35 < s.max.x &&
        p.z + 0.35 > s.min.z &&
        p.z - 0.35 < s.max.z,
    )
  );
}
function clear(map: MapDefinition, a: Point, b: Point): boolean {
  const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 5));
  return Array.from({ length: samples + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / samples,
    z: a.z + ((b.z - a.z) * i) / samples,
  })).every((point) => free(map, point));
}

describe('shared industrial and urban map geometry', () => {
  it('retains the existing industrial geometry and spawn references', () => {
    const map = getMap('industrial');
    expect(map.blocks).toBe(ARENA_BLOCKS);
    expect(map.solids).toBe(ARENA_SOLIDS);
    expect(map.spawns).toBe(SPAWNS);
    expect(map.bombSite).toEqual({ x: 0, y: 0, z: 10 });
  });

  it('builds every urban collision from the exact rendered block data', () => {
    const map = getMap('old-quarter');
    expect(map.id).toBe('old-quarter');
    expect(map.name).toBe('Bairro Antigo');
    expect(map.blocks.length).toBeGreaterThan(30);
    expect(map.bounds.maxX - map.bounds.minX).toBeGreaterThan(40);
    expect(map.solids).toEqual(map.blocks.map((b) => box(b.x, b.y, b.z, b.w, b.h, b.d)));
    for (const block of map.blocks) {
      expect([block.x, block.y, block.z, block.w, block.h, block.d].every(Number.isFinite)).toBe(
        true,
      );
      expect(Math.min(block.w, block.h, block.d)).toBeGreaterThan(0);
    }
  });

  for (const map of Object.values(MAPS)) {
    it(`${map.id}: gives all eight players unique, collision-free spawns on the floor`, () => {
      expect(map.spawns).toHaveLength(8);
      expect(new Set(map.spawns.map((p) => `${p.x}:${p.z}`)).size).toBe(8);
      for (const spawn of map.spawns) {
        expect(free(map, spawn)).toBe(true);
        const body = new PlayerBody(map.solids, spawn);
        expect(body.canUseStance('standing')).toBe(true);
        for (let i = 0; i < 10; i++) body.step(idle, 0, 0.05);
        expect(body.grounded).toBe(true);
        expect(body.position.y).toBeCloseTo(0);
        expect(body.position.x).toBe(spawn.x);
        expect(body.position.z).toBe(spawn.z);
      }
    });

    it(`${map.id}: connects every spawn, objective and patrol point with body-width routes`, () => {
      const key = (p: Point) => `${p.x}:${p.z}`;
      const start = map.spawns[0];
      const queue: Point[] = [{ x: start.x, z: start.z }];
      const visited = new Set([key(start)]);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const p = queue[cursor];
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const next = { x: p.x + dx, z: p.z + dz };
          if (visited.has(key(next)) || !clear(map, p, next)) continue;
          visited.add(key(next));
          queue.push(next);
        }
      }
      for (const goal of [...map.spawns, map.bombSite, ...map.patrolPoints]) {
        expect(free(map, goal), `blocked point ${key(goal)}`).toBe(true);
        expect(
          queue.some((p) => Math.hypot(p.x - goal.x, p.z - goal.z) < 1.5 && clear(map, p, goal)),
          `unreachable point ${key(goal)}`,
        ).toBe(true);
      }
    });
  }

  it('provides traversable urban interiors with three separate doorways each', () => {
    const map = getMap('old-quarter');
    for (const [from, to] of [
      [
        { x: -12, z: -10 },
        { x: -12, z: 10 },
      ],
      [
        { x: -12, z: 0 },
        { x: -4, z: 0 },
      ],
      [
        { x: 12, z: -8 },
        { x: 12, z: 12 },
      ],
      [
        { x: 11, z: 1 },
        { x: 4, z: 1 },
      ],
    ])
      expect(clear(map, from, to)).toBe(true);
    expect(clear(map, { x: 0, z: -18 }, { x: 0, z: 16 })).toBe(false);
    expect(getMap('old-quarter').bombSite).not.toEqual(getMap('industrial').bombSite);
  });
});
