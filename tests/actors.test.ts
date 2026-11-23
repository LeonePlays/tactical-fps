import { afterEach, describe, it, expect, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { createActor } from '../src/game/actors';
import { Match } from '../src/game/match';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
  vi.restoreAllMocks();
});
function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  vi.spyOn(engine, 'getDeltaTime').mockReturnValue(1000 / 60);
  cleanups.push(() => {
    scene.dispose();
    engine.dispose();
  });
  const model = createActor(scene, true),
    match = new Match();
  match.add('operator', true);
  const state = match.snapshot()[0];
  return {
    engine,
    scene,
    model,
    state,
    frames: (count = 120) => {
      for (let i = 0; i < count; i++) scene.onBeforeRenderObservable.notifyObservers(scene);
    },
  };
}
describe('original low-poly actor models', () => {
  it('has articulated limbs, equipment and a forward facing head rather than a lone box', () => {
    const { model, state, frames } = setup();
    model.update(state);
    frames();
    const names = model.root.getDescendants().map((node) => node.name);
    expect(names).toContain('operator-jacket');
    expect(names).toContain('operator-helmet-shell');
    expect(names).toContain('operator-thigh');
    expect(names).toContain('operator-forearm');
    expect(names).toContain('operator-held-weapon');
    expect(model.root.getChildMeshes().every((mesh) => !mesh.isPickable)).toBe(true);
  });
  it('uses shared materials and disposes its observer/meshes without deleting shared resources', async () => {
    const { scene, model } = setup();
    const materials = scene.materials.length,
      observers = scene.onBeforeRenderObservable.observers.length;
    const other = createActor(scene, true);
    expect(scene.materials.length).toBe(materials);
    expect(scene.onBeforeRenderObservable.observers.length).toBe(observers + 1);
    const root = other.root;
    other.dispose();
    expect(root.isDisposed()).toBe(true);
    await expect.poll(() => scene.onBeforeRenderObservable.observers.length).toBe(observers);
    expect(scene.materials.length).toBe(materials);
    expect(model.root.isDisposed()).toBe(false);
  });
  it('lowers the silhouette for crouch and prone and hides an eliminated actor', () => {
    const { model, state, frames } = setup();
    model.update(state);
    frames();
    const head = model.root.getChildTransformNodes().find((node) => node.name === 'operator-head')!;
    const standing = head.getAbsolutePosition().y;
    model.update({ ...state, stance: 'crouching' });
    frames();
    head.computeWorldMatrix(true);
    const crouching = head.getAbsolutePosition().y;
    expect(crouching).toBeLessThan(standing - 0.4);
    model.update({ ...state, stance: 'prone' });
    frames();
    head.computeWorldMatrix(true);
    expect(head.getAbsolutePosition().y).toBeLessThan(crouching - 0.4);
    model.update({ ...state, health: 0 });
    expect(model.root.isEnabled()).toBe(false);
  });
  it('uses team uniforms for both human and bot operators', () => {
    const { scene, model, state } = setup();
    const human = createActor(scene, false);
    model.update({ ...state, team: 'alpha' });
    human.update({ ...state, team: 'alpha' });
    const jacket = model.root.getChildMeshes().find((mesh) => mesh.name === 'operator-jacket')!;
    const humanJacket = human.root
      .getChildMeshes()
      .find((mesh) => mesh.name === 'operator-jacket')!;
    expect(jacket.material).toBe(humanJacket.material);
    model.update({ ...state, team: 'bravo' });
    expect(jacket.material).not.toBe(humanJacket.material);
  });
  it('uses sculpted geometry and renders the authoritative equipment selection', () => {
    const { model, state, frames } = setup();
    const jacket = model.root.getChildMeshes().find((mesh) => mesh.name === 'operator-jacket')!;
    expect(jacket.getTotalVertices()).toBeGreaterThan(24);
    const nodes = model.root.getChildTransformNodes();
    const rifle = nodes.find((node) => node.name === 'operator-rifle')!;
    const pistol = nodes.find((node) => node.name === 'operator-sidearm')!;
    const knife = nodes.find((node) => node.name === 'operator-held-knife')!;
    const grenade = nodes.find((node) => node.name === 'operator-held-grenade')!;
    model.update({ ...state, tool: 'firearm', weapon: 'secondary' });
    frames();
    expect(pistol.isEnabled()).toBe(true);
    expect(rifle.isEnabled()).toBe(false);
    model.update({ ...state, tool: 'knife' });
    expect(knife.isEnabled()).toBe(true);
    expect(pistol.isEnabled()).toBe(false);
    model.update({ ...state, tool: 'grenade', grenades: 1 });
    expect(grenade.isEnabled()).toBe(true);
    expect(knife.isEnabled()).toBe(false);
    model.update({ ...state, tool: 'grenade', grenades: 0 });
    expect(grenade.isEnabled()).toBe(false);
  });
  it('aims with pitch, animates confirmed shots once, and reaches for the magazine on reload', () => {
    const { model, state, frames } = setup();
    const nodes = model.root.getChildTransformNodes();
    const head = nodes.find((node) => node.name === 'operator-head')!;
    const magazine = nodes.find((node) => node.name === 'operator-rifle-magazine')!;
    const flash = model.root
      .getChildMeshes()
      .find((mesh) => mesh.name === 'operator-muzzle-flash')!;
    model.update({ ...state, tool: 'firearm', weapon: 'primary', pitch: 0.5 });
    frames();
    expect(head.rotation.x).toBeGreaterThan(0.3);
    expect(flash.isEnabled()).toBe(false);
    model.update({ ...state, tool: 'firearm', weapon: 'primary', shots: state.shots + 1 });
    frames(1);
    expect(flash.isEnabled()).toBe(true);
    frames(20);
    expect(flash.isEnabled()).toBe(false);
    model.update({
      ...state,
      tool: 'firearm',
      weapon: 'primary',
      weaponState: { ...state.weaponState, reloadRemaining: 1.225 },
    });
    frames();
    expect(magazine.position.y).toBeLessThan(-0.18);
    expect(flash.isEnabled()).toBe(false);
  });
  it('keeps planted boots level and on the ground while crouching, with attached belt equipment', () => {
    const { model, state, frames } = setup();
    const nodes = model.root.getChildTransformNodes();
    const ankles = nodes.filter((node) => node.name.startsWith('operator-ankle-'));
    const belt = nodes.find((node) => node.name === 'operator-belt-equipment')!;
    model.update({ ...state, grounded: true, velocity: { x: 0, y: 0, z: 0 } });
    frames();
    for (const ankle of ankles) {
      ankle.computeWorldMatrix(true);
      expect(ankle.getAbsolutePosition().y - model.root.position.y).toBeCloseTo(0.085, 2);
    }
    const standingBelt = belt.position.y;
    model.update({ ...state, stance: 'crouching', grounded: true, velocity: { x: 0, y: 0, z: 0 } });
    frames();
    for (const ankle of ankles) {
      ankle.computeWorldMatrix(true);
      expect(ankle.getAbsolutePosition().y - model.root.position.y).toBeCloseTo(0.085, 2);
      const knee = ankle.parent as import('@babylonjs/core/Meshes/transformNode').TransformNode;
      const hip = knee.parent as import('@babylonjs/core/Meshes/transformNode').TransformNode;
      expect(ankle.rotation.x + knee.rotation.x + hip.rotation.x).toBeCloseTo(0, 4);
    }
    expect(belt.position.y).toBeLessThan(standingBelt - 0.3);
  });
  it('restores deterministic appearance and shows class-specific remote weapon silhouettes', () => {
    const { scene, model, state, frames } = setup();
    const other = createActor(scene, false);
    model.update(state);
    other.update(state);
    expect(model.root.metadata).toEqual(other.root.metadata);
    const nodes = model.root.getChildTransformNodes();
    const scope = nodes.find((node) => node.name === 'operator-rifle-scope')!;
    const rifle = nodes.find((node) => node.name === 'operator-rifle')!;
    const drum = nodes.find((node) => node.name === 'operator-lmg-drum')!;
    const bomb = nodes.find((node) => node.name === 'operator-held-bomb')!;
    model.update({
      ...state,
      weaponState: {
        ...state.weaponState,
        inventory: {
          ...state.weaponState.inventory,
          primary: { ...state.weaponState.inventory.primary, weaponId: 'sr8' },
        },
      },
    });
    frames();
    expect(scope.isEnabled()).toBe(true);
    expect(rifle.scaling.z).toBeGreaterThan(1.3);
    model.update({
      ...state,
      weaponState: {
        ...state.weaponState,
        inventory: {
          ...state.weaponState.inventory,
          primary: { ...state.weaponState.inventory.primary, weaponId: 'lmg60' },
        },
      },
    });
    expect(scope.isEnabled()).toBe(false);
    expect(drum.isEnabled()).toBe(true);
    model.update({ ...state, tool: 'bomb' });
    expect(bomb.isEnabled()).toBe(true);
    expect(rifle.isEnabled()).toBe(false);
    other.dispose();
  });
});
