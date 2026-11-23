import { describe, expect, it } from 'vitest';
import { MAP_CATALOG, isMapId } from '../src/game/map-catalog';
import { MAPS } from '../src/game/maps';
import { ArenaNavigation } from '../src/game/navigation';
import { PlayerBody, box } from '../src/game/physics';

describe('twenty original arena layouts', () => {
  it('lists twenty unique selectable maps backed by different actual geometry', () => {
    expect(MAP_CATALOG).toHaveLength(20);
    expect(new Set(MAP_CATALOG.map((map) => map.id)).size).toBe(20);
    expect(Object.keys(MAPS).sort()).toEqual(MAP_CATALOG.map((map) => map.id).sort());
    const layouts = MAP_CATALOG.map(({ id }) =>
      JSON.stringify(MAPS[id].blocks.map(({ x, y, z, w, h, d }) => [x, y, z, w, h, d])),
    );
    expect(new Set(layouts).size).toBe(20);
    expect(isMapId('a-fake-map')).toBe(false);
    expect(isMapId('dockyard')).toBe(true);
  });

  for (const entry of MAP_CATALOG) {
    it(`${entry.id}: all spawns, objectives and patrol routes are physically valid and navigable`, () => {
      const map = MAPS[entry.id];
      expect(map.name).toBe(entry.name);
      expect(map.spawns).toHaveLength(8);
      expect(map.blocks.length).toBeLessThanOrEqual(60);
      if (map.id !== 'industrial')
        expect(map.solids).toEqual(map.blocks.map((b) => box(b.x, b.y, b.z, b.w, b.h, b.d)));
      const nav = new ArenaNavigation(map.solids, map.bounds);
      const idle = {
        forward: 0,
        right: 0,
        sprint: false,
        jump: false,
        stance: 'standing' as const,
      };
      for (const spawn of map.spawns) {
        const body = new PlayerBody(map.solids, spawn);
        expect(body.canUseStance('standing')).toBe(true);
        for (let tick = 0; tick < 10; tick++) body.step(idle, 0, 0.05);
        expect(body.grounded).toBe(true);
        expect(body.position.y).toBeCloseTo(0);
        expect(nav.walkable(spawn)).toBe(true);
        const path = nav.path(spawn, map.bombSite);
        expect(path.length).toBeGreaterThan(0);
        const last = path.at(-1)!;
        expect(Math.hypot(last.x - map.bombSite.x, last.z - map.bombSite.z)).toBeLessThan(0.05);
      }
      for (const goal of map.patrolPoints) {
        expect(nav.walkable(goal), `${entry.id} blocked patrol ${JSON.stringify(goal)}`).toBe(true);
        const path = nav.path(map.bombSite, goal);
        expect(path.length).toBeGreaterThan(0);
        const last = path.at(-1)!;
        expect(
          Math.hypot(last.x - goal.x, last.z - goal.z),
          `${entry.id} unreachable patrol ${JSON.stringify(goal)}`,
        ).toBeLessThan(0.05);
      }
    });
  }
});
