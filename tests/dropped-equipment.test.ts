import { describe, expect, it } from 'vitest';
import { Match } from '../src/game/match';
import { PlayerBody } from '../src/game/physics';
import { IDLE_INPUT } from '../src/network/protocol';
import { WeaponController } from '../src/game/weapons';

describe('authoritative dropped equipment', () => {
  it('moves a real magazine into the world, blocks shooting and picks it up only once', () => {
    const match = new Match();
    match.add('player');
    const actor = match.actors.get('player')!;
    actor.gun.inventory.primary.ammo = 7;
    actor.gun.inventory.primary.reserve = 41;
    match.input('player', { ...IDLE_INPUT, dropSequence: 1 });
    match.step(0.05);
    expect(actor.gun.inventory.primary).toEqual({ owned: false, ammo: 0, reserve: 0 });
    expect(match.state().droppedItems).toHaveLength(1);
    expect(match.state().droppedItems[0]).toMatchObject({ kind: 'primary', ammo: 7, reserve: 41 });
    match.input('player', { ...IDLE_INPUT, dropSequence: 1, fire: true, fireSequence: 1 });
    match.step(0.05);
    expect(actor.shots).toBe(0);
    expect(match.state().droppedItems).toHaveLength(1);
    match.input('player', { ...IDLE_INPUT, dropSequence: 1, interact: true });
    match.step(0.05);
    expect(actor.gun.inventory.primary).toEqual({ owned: true, ammo: 7, reserve: 41 });
    expect(match.state().droppedItems).toHaveLength(0);
    match.step(0.05);
    expect(actor.gun.inventory.primary.ammo).toBe(7);
  });

  it('does not pick up another weapon of the same slot or reach beyond pickup range', () => {
    const match = new Match();
    match.add('donor');
    match.add('receiver');
    const donor = match.actors.get('donor')!;
    const receiver = match.actors.get('receiver')!;
    donor.body = new PlayerBody(match.map.solids, { x: -12, y: 0, z: -8 });
    receiver.body = new PlayerBody(match.map.solids, { x: -12, y: 0, z: -8 });
    match.input('donor', { ...IDLE_INPUT, dropSequence: 1 });
    match.step(0.05);
    match.input('receiver', { ...IDLE_INPUT, interact: true });
    match.step(0.05);
    expect(match.state().droppedItems).toHaveLength(1);
    receiver.gun.drop('primary', match.time);
    receiver.body = new PlayerBody(match.map.solids, { x: 12, y: 0, z: 12 });
    match.input('receiver', { ...IDLE_INPUT, interact: false });
    match.step(0.05);
    match.input('receiver', { ...IDLE_INPUT, interact: true });
    match.step(0.05);
    expect(receiver.gun.inventory.primary.owned).toBe(false);
    expect(match.state().droppedItems).toHaveLength(1);
  });

  it('rejects a nearby pickup when a solid boundary lies between the item and player', () => {
    const match = new Match();
    match.add('donor');
    match.add('receiver');
    const donor = match.actors.get('donor')!;
    const receiver = match.actors.get('receiver')!;
    // Place the fixture just outside the thin east boundary and aim back toward it.
    donor.body = new PlayerBody(match.map.solids, { x: 16.85, y: 0, z: 10 });
    receiver.body = new PlayerBody(match.map.solids, { x: 15.15, y: 0, z: 10 });
    receiver.gun.drop('primary', 0);
    match.input('donor', { ...IDLE_INPUT, yaw: -Math.PI / 2, dropSequence: 1 });
    match.step(0.05);
    const item = match.state().droppedItems[0];
    expect(
      Math.hypot(
        item.position.x - receiver.body.position.x,
        item.position.z - receiver.body.position.z,
      ),
    ).toBeLessThan(1.8);
    match.input('receiver', { ...IDLE_INPUT, interact: true });
    match.step(0.05);
    expect(receiver.gun.inventory.primary.owned).toBe(false);
    expect(match.state().droppedItems).toHaveLength(1);
  });

  it('drops only the selected grenade slot and consumes every Q sequence once', () => {
    const match = new Match();
    match.add('player');
    const actor = match.actors.get('player')!;
    actor.equipment.addGrenade();
    match.input('player', { ...IDLE_INPUT, tool: 'grenade', grenadeSlot: 1, dropSequence: 1 });
    match.step(0.05);
    match.step(0.05);
    expect(actor.equipment.grenadeSlots).toEqual([true, false]);
    expect(match.state().droppedItems).toHaveLength(1);
    match.input('player', { ...IDLE_INPUT, tool: 'grenade', grenadeSlot: 1, dropSequence: 2 });
    match.step(0.05);
    expect(match.state().droppedItems).toHaveLength(1);
    match.input('player', { ...IDLE_INPUT, interact: true, dropSequence: 2 });
    match.step(0.05);
    expect(actor.equipment.grenadeSlots).toEqual([true, true]);
    expect(match.state().droppedItems).toHaveLength(0);
    match.restart();
    expect(match.snapshot()[0].grenadeSlots).toEqual([true, false]);
  });

  it('drops a carried bomb with Q and recovers it with E without firing the hidden gun', () => {
    const match = new Match('defuse');
    match.add('carrier');
    match.step(0.05);
    expect(match.state().rounds.bomb?.carrierId).toBe('carrier');
    match.input('carrier', {
      ...IDLE_INPUT,
      tool: 'bomb',
      dropSequence: 1,
      fire: true,
      fireSequence: 1,
    });
    match.step(0.05);
    expect(match.state().rounds.bomb?.status).toBe('dropped');
    expect(match.snapshot()[0].shots).toBe(0);
    match.input('carrier', { ...IDLE_INPUT, tool: 'bomb', dropSequence: 1, interact: true });
    match.step(0.05);
    expect(match.state().rounds.bomb?.carrierId).toBe('carrier');
    expect(match.state().rounds.bomb?.status).toBe('carried');
  });

  it('cannot fire or reload a dropped magazine and enforces pickup deployment', () => {
    const gun = new WeaponController();
    gun.inventory.primary.ammo = 3;
    const magazine = gun.drop('primary', 0)!;
    expect(gun.reload(1)).toBe(false);
    expect(
      gun.fire(1, true, 1, { yaw: 0, pitch: 0 }, { speed: 0, grounded: true, stance: 'standing' }),
    ).toBeNull();
    expect(gun.pickup('primary', magazine, 1)).toBe(true);
    expect(gun.pickup('primary', magazine, 1)).toBe(false);
    expect(
      gun.fire(
        1.01,
        true,
        2,
        { yaw: 0, pitch: 0 },
        { speed: 0, grounded: true, stance: 'standing' },
      ),
    ).toBeNull();
    expect(gun.inventory.primary.ammo).toBe(3);
  });

  it('requires unobstructed E interaction to recover a dropped bomb across a thin café wall', () => {
    const match = new Match({ mode: 'defuse', map: 'old-quarter' });
    match.add('carrier');
    match.add('defender');
    match.add('receiver');
    for (let i = 0; i < 102; i++) match.step(0.05);
    const carrier = match.actors.get('carrier')!;
    const receiver = match.actors.get('receiver')!;
    carrier.body = new PlayerBody(match.map.solids, { x: -17.6, y: 0, z: 0 });
    receiver.body = new PlayerBody(match.map.solids, { x: -16.4, y: 0, z: 0 });
    match.input('carrier', { ...IDLE_INPUT, tool: 'bomb', dropSequence: 1 });
    match.step(0.05);
    expect(match.state().rounds.bomb?.status).toBe('dropped');
    match.input('receiver', { ...IDLE_INPUT, interact: true });
    match.step(0.05);
    expect(match.state().rounds.bomb?.status).toBe('dropped');
    receiver.body = new PlayerBody(match.map.solids, { x: -17.6, y: 0, z: 0.7 });
    match.input('receiver', { ...IDLE_INPUT, interact: true });
    match.step(0.05);
    expect(match.state().rounds.bomb?.carrierId).toBe('receiver');
  });
});
