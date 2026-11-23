import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { animateWeapon, createWeapon } from '../src/game/weapon';
import { animateEquipmentView, createEquipmentView } from '../src/game/equipment-view';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
});
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new UniversalCamera('camera', Vector3.Zero(), scene);
  cleanups.push(() => {
    scene.dispose();
    engine.dispose();
  });
  return { engine, scene, camera };
}

describe('original first person models', () => {
  it('keeps every firearm/equipment mesh visible in its overlay group and out of bullet picking', () => {
    const { scene, camera } = setup();
    for (const model of [
      createWeapon(scene, camera),
      createWeapon(scene, camera, true),
      createEquipmentView(scene, camera, 'knife'),
      createEquipmentView(scene, camera, 'grenade'),
    ]) {
      expect(model.parent).toBe(camera);
      expect(model.position.asArray()).toEqual([0.23, -0.24, 0.55]);
      expect(model.scaling.asArray()).toEqual([0.65, 0.65, 0.65]);
      const meshes = model.getChildMeshes();
      expect(meshes.length).toBeGreaterThan(3);
      expect(
        meshes.every(
          (mesh) =>
            mesh.renderingGroupId === 1 && mesh.alwaysSelectAsActiveMesh && !mesh.isPickable,
        ),
      ).toBe(true);
      expect(meshes.every((mesh) => mesh.getTotalVertices() > 0)).toBe(true);
      // Batching keeps detail from turning into dozens of draw calls per view model.
      expect(meshes.length).toBeLessThanOrEqual(20);
    }
  });
  it('preserves muzzle flashes and separate magazine/actions after batching', () => {
    const { scene, camera } = setup();
    for (const pistol of [false, true]) {
      const model = createWeapon(scene, camera, pistol);
      const flash = model.getChildMeshes().find((mesh) => mesh.name === 'muzzle-flash');
      expect(flash).toBeDefined();
      expect(flash?.isEnabled()).toBe(false);
      const magazine = model
        .getChildTransformNodes()
        .find((node) => node.name === 'weapon-magazine');
      const action = model
        .getChildTransformNodes()
        .find((node) => node.name === (pistol ? 'pistol-slide' : 'carbine-bolt'));
      expect(magazine?.getChildMeshes().length).toBeGreaterThan(0);
      expect(action?.getChildMeshes().length).toBeGreaterThan(0);
    }
  });
  it('moves the slide/bolt with recoil and returns it without moving the owning root', () => {
    const { scene, camera } = setup();
    const model = createWeapon(scene, camera, true),
      position = model.position.clone(),
      rotation = model.rotation.clone();
    const slide = model.getChildTransformNodes().find((node) => node.name === 'pistol-slide')!;
    const resting = slide.position.z;
    animateWeapon(model, 1, 1, false, false);
    expect(slide.position.z).toBeLessThan(resting - 0.03);
    animateWeapon(model, 1.3, 0, false, false);
    expect(slide.position.z).toBeCloseTo(resting);
    expect(model.position.equals(position)).toBe(true);
    expect(model.rotation.equals(rotation)).toBe(true);
  });
  it('removes/reinserts the magazine and hand during reload, restoring the idle pose', () => {
    const { scene, camera } = setup();
    const model = createWeapon(scene, camera),
      rootPosition = model.position.clone();
    const magazine = model
      .getChildTransformNodes()
      .find((node) => node.name === 'weapon-magazine')!;
    const hand = model
      .getChildTransformNodes()
      .find((node) => node.name === 'weapon-support-hand')!;
    const magazineY = magazine.position.y,
      handY = hand.position.y;
    animateWeapon(model, 10, 0, true, false);
    animateWeapon(model, 11, 0, true, false);
    expect(magazine.position.y).toBeLessThan(magazineY - 0.2);
    expect(hand.position.y).toBeLessThan(handY - 0.1);
    animateWeapon(model, 12.5, 0, false, false);
    expect(magazine.position.y).toBeCloseTo(magazineY);
    expect(hand.position.y).toBeCloseTo(handY);
    expect(model.position.equals(rootPosition)).toBe(true);
  });
  it('shares scene materials across swaps and safely animates equipment/invalid values', () => {
    const { scene, camera } = setup();
    const rifle = createWeapon(scene, camera),
      knife = createEquipmentView(scene, camera, 'knife');
    createEquipmentView(scene, camera, 'grenade');
    const materials = scene.materials.length;
    for (let i = 0; i < 4; i++) {
      const other = createWeapon(scene, camera);
      other.dispose();
      const equipment = createEquipmentView(scene, camera, 'knife');
      equipment.dispose();
    }
    expect(scene.materials.length).toBe(materials);
    const rootPosition = knife.position.clone();
    animateEquipmentView(knife, 1, 1);
    animateEquipmentView(knife, Number.NaN, Number.POSITIVE_INFINITY);
    expect(knife.position.equals(rootPosition)).toBe(true);
    expect(
      knife
        .getChildTransformNodes()
        .every((node) => Number.isFinite(node.position.y) && Number.isFinite(node.rotation.x)),
    ).toBe(true);
    animateWeapon(rifle, Number.NaN, 1, true, true);
    expect(rifle.position.asArray()).toEqual([0.23, -0.24, 0.55]);
  });
});
