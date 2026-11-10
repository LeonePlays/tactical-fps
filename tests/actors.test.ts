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
});
