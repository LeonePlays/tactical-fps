import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { createCatalogWorld } from '../src/game/catalog-world';
import { MAP_CATALOG } from '../src/game/map-catalog';
import { getMap } from '../src/game/maps';

describe('original catalog environment renderer', () => {
  for (const entry of MAP_CATALOG.filter((map) => !['industrial', 'old-quarter'].includes(map.id)))
    it(`${entry.name} renders shared collision, finite batched geometry and disposable resources`, () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const definition = getMap(entry.id);
        const world = createCatalogWorld(scene, definition);
        expect(world.solids).toEqual(definition.solids);
        expect(world.spawn).toEqual(definition.spawns[0]);
        expect(world.targets).toHaveLength(0);
        expect(scene.meshes.some((mesh) => mesh.isPickable && mesh.getTotalVertices() > 0)).toBe(
          true,
        );
        // Detailed structures are material-batched instead of adding hundreds of draw calls.
        expect(scene.meshes.length).toBeLessThan(45);
        expect(scene.materials.length).toBeLessThan(18);
        for (const mesh of scene.meshes) {
          const positions = mesh.getVerticesData('position');
          expect(positions?.length).toBeGreaterThan(0);
          expect(positions?.every(Number.isFinite)).toBe(true);
        }
        scene.dispose();
        expect(scene.meshes).toHaveLength(0);
        expect(scene.lights).toHaveLength(0);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    });
});
