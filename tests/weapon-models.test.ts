import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GUNS, type WeaponId } from '../src/game/ballistics';
import { createWeapon, animateWeapon } from '../src/game/weapon';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new UniversalCamera('camera', Vector3.Zero(), scene);
  cleanup.push(() => {
    scene.dispose();
    engine.dispose();
  });
  return { scene, camera };
}
const ids = Object.keys(GUNS) as WeaponId[];

describe('original arsenal view models', () => {
  it('builds every firearm with a distinct physical silhouette and bounded material batches', () => {
    const { scene, camera } = setup();
    const signatures = new Set<string>();
    for (const id of ids) {
      const model = createWeapon(scene, camera, GUNS[id].slot === 'secondary', id);
      expect(model.metadata.weaponId).toBe(id);
      const meshes = model.getChildMeshes();
      expect(meshes.length).toBeLessThanOrEqual(28);
      expect(
        meshes.every(
          (mesh) =>
            mesh.renderingGroupId === 1 && !mesh.isPickable && mesh.alwaysSelectAsActiveMesh,
        ),
      ).toBe(true);
      for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        expect(mesh.getTotalVertices()).toBeGreaterThan(0);
        expect(mesh.getVerticesData('position')?.every(Number.isFinite)).toBe(true);
      }
      const { min, max } = model.getHierarchyBoundingVectors(true);
      expect([...min.asArray(), ...max.asArray()].every(Number.isFinite)).toBe(true);
      expect(max.z - min.z).toBeGreaterThan(0.2);
      const vertices = meshes.reduce((count, mesh) => count + mesh.getTotalVertices(), 0);
      signatures.add(`${vertices}/${(max.z - min.z).toFixed(4)}/${(max.x - min.x).toFixed(4)}`);
      const flash = meshes.find((mesh) => mesh.name === 'muzzle-flash')!;
      expect(flash).toBeDefined();
      expect(flash.isEnabled()).toBe(false);
      model.dispose();
    }
    expect(signatures.size).toBe(ids.length);
  });

  it('has glass optics for scoped rifles and a moving fore-end for the pump shotgun', () => {
    const { scene, camera } = setup();
    for (const id of ['dmr14', 'sr8'] as const) {
      const model = createWeapon(scene, camera, false, id);
      expect(
        model.getChildMeshes().some((mesh) => mesh.material?.name === 'view-coated-optic-glass'),
      ).toBe(true);
    }
    const shotgun = createWeapon(scene, camera, false, 'sg12');
    const action = shotgun.getChildTransformNodes().find((node) => node.name === 'carbine-bolt')!;
    const hand = shotgun
      .getChildTransformNodes()
      .find((node) => node.name === 'weapon-support-hand')!;
    const rest = action.position.z;
    const handRest = hand.position.z;
    animateWeapon(shotgun, 1, 1, false, false);
    expect(action.position.z).toBeLessThan(rest - 0.1);
    expect(hand.position.z).toBeLessThan(handRest - 0.1);
    animateWeapon(shotgun, 1.3, 0, false, false);
    expect(action.position.z).toBeCloseTo(rest);
    expect(hand.position.z).toBeCloseTo(handRest);
  });

  it('survives repeated swaps, animation and disposal without accumulating meshes or materials', () => {
    const { scene, camera } = setup();
    createWeapon(scene, camera).dispose();
    const materials = scene.materials.length;
    const baseline = scene.meshes.length;
    for (let cycle = 0; cycle < 3; cycle++)
      for (const id of ids) {
        const model = createWeapon(scene, camera, false, id);
        animateWeapon(model, 0, 0, true, true);
        animateWeapon(model, GUNS[id].reload / 2, 0.5, true, false);
        animateWeapon(model, GUNS[id].reload + 1, 0, false, false);
        expect(
          model
            .getChildTransformNodes()
            .every((node) =>
              [...node.position.asArray(), ...node.rotation.asArray()].every(Number.isFinite),
            ),
        ).toBe(true);
        model.dispose();
        expect(scene.meshes.length).toBe(baseline);
        expect(scene.materials.length).toBe(materials);
      }
  });
});
