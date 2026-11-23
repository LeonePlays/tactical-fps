import { describe, expect, it } from 'vitest';
import { box } from '../src/game/physics';
import {
  blastHits,
  EQUIPMENT,
  EquipmentInventory,
  launchGrenade,
  meleeTarget,
  stepGrenade,
} from '../src/game/equipment';

const origin = { x: 0, y: 1.5, z: 0 };
const forward = { x: 0, y: 0, z: 1 };
const floor = box(0, -0.5, 0, 100, 1, 100);
const target = (id: string, z: number, x = 0) => ({
  id,
  position: { x, y: 0, z },
  height: 1.8,
  alive: true,
});

describe('knife and grenade shared rules', () => {
  it('limits knife attacks by range, wall occlusion and closest living target', () => {
    expect(meleeTarget(origin, forward, [], [target('far', 5)])).toBeNull();
    expect(meleeTarget(origin, forward, [], [target('front', 1.4)])).toBe('front');
    expect(
      meleeTarget(origin, forward, [box(0, 1, 0.7, 2, 2, 0.1)], [target('blocked', 1.4)]),
    ).toBeNull();
    expect(meleeTarget(origin, forward, [], [target('back', 1.7), target('near', 1)])).toBe('near');
    expect(meleeTarget(origin, forward, [], [{ ...target('dead', 1), alive: false }])).toBeNull();
  });
  it('applies knife cooldown and consumes old presses instead of replaying them after time passes', () => {
    const inventory = new EquipmentInventory();
    expect(inventory.swing(0, 1)).toBe(true);
    expect(inventory.swing(0.3, 2)).toBe(false);
    expect(inventory.swing(1, 2)).toBe(false);
    expect(inventory.swing(1, 3)).toBe(true);
    expect(inventory.swing(2, 3)).toBe(false);
    expect(EQUIPMENT.knife.damage).toBe(45);
  });
  it('starts with one grenade and supports two independently selectable slots', () => {
    const inventory = new EquipmentInventory();
    expect(inventory.grenades).toBe(1);
    expect(inventory.grenadeSlots).toEqual([true, false]);
    expect(inventory.addGrenade()).toBe(true);
    expect(inventory.addGrenade()).toBe(false);
    expect(inventory.grenadeSlots).toEqual([true, true]);
    expect(inventory.throw(0, 1, origin, forward, [], 1)).not.toBeNull();
    expect(inventory.grenadeSlots).toEqual([true, false]);
    expect(inventory.throw(1, 2, origin, forward, [], 1)).toBeNull();
    expect(inventory.throw(1, 3, origin, forward)).not.toBeNull();
    expect(inventory.grenades).toBe(0);
    inventory.reset(3);
    expect(inventory.throw(2, 4, origin, forward)).not.toBeNull();
    expect(inventory.grenades).toBe(0);
    expect(inventory.throw(3, 5, origin, forward)).toBeNull();
    expect(inventory.addGrenade()).toBe(true);
    expect(inventory.throw(4, 5, origin, forward)).toBeNull();
    expect(inventory.throw(4, 6, origin, forward)).not.toBeNull();
    inventory.reset(6);
    expect(inventory.grenades).toBe(1);
    expect(inventory.throw(5, 6, origin, forward)).toBeNull();
  });
  it('observes tool-switch presses without accidentally attacking', () => {
    const inventory = new EquipmentInventory();
    inventory.observe(10);
    expect(inventory.swing(0, 10)).toBe(false);
    expect(inventory.swing(0, 11)).toBe(true);
    inventory.grenades = 8;
    expect(inventory.grenades).toBe(2);
    inventory.grenades = -2;
    expect(inventory.grenades).toBe(0);
  });
  it('does not launch a grenade through a nearby wall', () => {
    const wall = box(0, 1, 0.25, 2, 3, 0.04),
      grenade = launchGrenade(origin, forward, [wall]);
    expect(grenade.position.z).toBeLessThan(wall.min.z - EQUIPMENT.grenade.size);
  });
  it('collides with thin walls while following gravity', () => {
    const wall = box(0, 1.5, 2, 5, 4, 0.04),
      grenade = launchGrenade(origin, forward, [floor, wall]);
    for (let i = 0; i < 60; i++) {
      stepGrenade(grenade, 1 / 120, [floor, wall]);
      expect(grenade.position.z).toBeLessThanOrEqual(wall.min.z - EQUIPMENT.grenade.size + 1e-8);
    }
    expect(grenade.bounces).toBeGreaterThan(0);
    expect(grenade.velocity.z).toBeLessThan(0);
    expect(grenade.position.y).toBeGreaterThanOrEqual(EQUIPMENT.grenade.size);
  });
  it('detonates once after three simulation seconds, including a longer frame', () => {
    const grenade = launchGrenade(origin, forward, [floor]);
    expect(stepGrenade(grenade, 2.9, [floor])).toBeNull();
    const explosion = stepGrenade(grenade, 0.2, [floor]);
    expect(explosion?.radius).toBe(6);
    expect(grenade.detonated).toBe(true);
    expect(stepGrenade(grenade, 1, [floor])).toBeNull();
  });
  it('blast damage falls off, includes self damage, and is blocked by solid cover', () => {
    const explosion = { position: { x: 0, y: 1, z: 0 }, radius: 6, damage: 100 };
    const hits = blastHits(
      explosion,
      [target('self', 0), target('near', 2), target('edge', 5), target('outside', 8)],
      [],
    );
    expect(hits.find((h) => h.id === 'self')?.damage).toBe(100);
    expect(hits.find((h) => h.id === 'near')!.damage).toBeGreaterThan(
      hits.find((h) => h.id === 'edge')!.damage,
    );
    expect(hits.some((h) => h.id === 'outside')).toBe(false);
    expect(blastHits(explosion, [target('covered', 2)], [box(0, 1, 1, 4, 3, 0.1)])).toEqual([]);
  });
  it('ignores invalid simulation deltas and invalid press sequences', () => {
    const grenade = launchGrenade(origin, forward),
      copy = { ...grenade.position };
    expect(stepGrenade(grenade, NaN, [])).toBeNull();
    expect(grenade.position).toEqual(copy);
    const inventory = new EquipmentInventory();
    expect(inventory.swing(0, NaN)).toBe(false);
    expect(inventory.throw(0, -1, origin, forward)).toBeNull();
    expect(inventory.grenades).toBe(1);
  });
});
