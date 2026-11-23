import { describe, expect, it } from 'vitest';
import { GUNS, weaponDamage, type WeaponId } from '../src/game/ballistics';
import { WeaponController } from '../src/game/weapons';
import { Match } from '../src/game/match';
import { PlayerBody } from '../src/game/physics';
import { buy } from '../src/game/shop';
import { IDLE_INPUT } from '../src/network/protocol';

const aim = { yaw: 0, pitch: 0 };
const grounded = { speed: 0, grounded: true, stance: 'standing' as const };

describe('original firearm arsenal', () => {
  it('gives all ten firearms distinct functional magazine, cadence, class and reload tuning', () => {
    expect(Object.keys(GUNS)).toHaveLength(10);
    const fingerprints = new Set<string>();
    for (const [id, spec] of Object.entries(GUNS)) {
      const gun = new WeaponController(14);
      gun.equip(id as WeaponId, 0);
      expect(gun.weaponId).toBe(id);
      expect(gun.ammo).toBe(spec.capacity);
      expect(gun.reserve).toBe(spec.reserve);
      expect(gun.fire(spec.deploy / 2, true, 1, aim, grounded)).toBeNull();
      const shot = gun.fire(spec.deploy, true, 2, aim, grounded)!;
      expect(shot).not.toBeNull();
      expect(shot.directions).toHaveLength(spec.pellets);
      expect(gun.ammo).toBe(spec.capacity - 1);
      expect(gun.reload(spec.deploy + 0.01)).toBe(true);
      gun.update(spec.deploy + spec.reload + 0.02, spec.reload);
      expect(gun.ammo).toBe(spec.capacity);
      expect(gun.reserve).toBe(spec.reserve - 1);
      fingerprints.add(
        [spec.capacity, spec.interval, spec.reload, spec.damage, spec.pellets].join(':'),
      );
    }
    expect(fingerprints.size).toBe(10);
  });

  it('uses actual automatic cadence and requires separate presses for bolt/DMR/shotgun/pistols', () => {
    const smg = new WeaponController(5, true, { primary: 'smg9' });
    const rifle = new WeaponController(5);
    for (let i = 0; i <= 100; i++) {
      smg.fire(i / 100, true, 1, aim, grounded);
      rifle.fire(i / 100, true, 1, aim, grounded);
    }
    expect(smg.shots).toBeGreaterThan(rifle.shots);
    for (const id of ['dmr14', 'sg12', 'sr8', 'p45'] as WeaponId[]) {
      const gun = new WeaponController(9);
      gun.equip(id, 0);
      expect(gun.fire(2, true, 1, aim, grounded)).not.toBeNull();
      expect(gun.fire(4, true, 1, aim, grounded)).toBeNull();
      expect(gun.fire(4, false, 2, aim, grounded)).not.toBeNull();
    }
  });

  it('produces reproducible independent shotgun pellets and meaningful distance falloff', () => {
    const a = new WeaponController(17, true, { primary: 'sg12' });
    const b = new WeaponController(17, true, { primary: 'sg12' });
    const shot = a.fire(0, true, 1, aim, grounded)!;
    expect(shot).toEqual(b.fire(0, true, 1, aim, grounded));
    expect(new Set(shot.directions.map((dir) => JSON.stringify(dir))).size).toBe(8);
    expect(weaponDamage(GUNS.sg12, 3)).toBeGreaterThan(weaponDamage(GUNS.sg12, 30));
    expect(weaponDamage(GUNS.sr8, 100)).toBeGreaterThan(weaponDamage(GUNS.t04, 100));
  });

  it('preserves firearm identity and exact ammunition across drop, pickup and reconciliation', () => {
    const gun = new WeaponController(19, true, { primary: 'lmg60', secondary: 'p45' });
    gun.inventory.primary.ammo = 17;
    gun.inventory.primary.reserve = 113;
    const magazine = gun.drop('primary', 1)!;
    expect(magazine).toEqual({ weaponId: 'lmg60', ammo: 17, reserve: 113 });
    expect(gun.pickup('primary', magazine, 2)).toBe(true);
    const clone = new WeaponController();
    clone.reconcile(gun.snapshot(3), 9);
    expect(clone.weaponId).toBe('lmg60');
    expect(clone.spec.capacity).toBe(60);
    expect(clone.inventory).toEqual(gun.inventory);
    clone.switch('secondary', 10);
    expect(clone.weaponId).toBe('p45');
  });

  it('charges replacement purchases and buys the chosen bomb-mode primary rather than a default rifle', () => {
    const gun = new WeaponController(4, false, { primary: 'sg12', secondary: 'p22' });
    const wallet = { money: 4000, armor: 0 };
    expect(buy(gun, wallet, 'primary', true)).toBe('Compra efetuada.');
    expect(gun.idForSlot('primary')).toBe('sg12');
    expect(wallet.money).toBe(2200);
    expect(buy(gun, wallet, 'primary', true)).not.toBe('Compra efetuada.');
    expect(buy(gun, wallet, 'smg9', true)).toBe('Compra efetuada.');
    expect(wallet.money).toBe(700);
    expect(gun.idForSlot('primary')).toBe('smg9');
    expect(buy(gun, wallet, 'sr8', true)).toBe('Dinheiro insuficiente.');
    expect(gun.idForSlot('primary')).toBe('smg9');
  });
});

describe('authoritative loadouts and pellet collision', () => {
  it('spawns and restarts the configured equipment, while bomb mode requires buying its chosen primary', () => {
    const match = new Match({ primary: 'smg9', secondary: 'p45' });
    match.add('player');
    expect(match.snapshot()[0].weaponId).toBe('smg9');
    expect(match.snapshot()[0].ammo).toBe(32);
    match.actors.get('player')!.gun.equip('sg12', 0);
    match.restart();
    expect(match.snapshot()[0].weaponId).toBe('smg9');
    const bomb = new Match({ mode: 'defuse', primary: 'sg12', secondary: 'p45' });
    bomb.add('player');
    expect(bomb.snapshot()[0].weaponId).toBe('p45');
    expect(bomb.snapshot()[0].weaponState.inventory.primary.owned).toBe(false);
    bomb.input('player', {
      ...IDLE_INPUT,
      weapon: 'secondary',
      buySequence: 1,
      buyItem: 'primary',
    });
    bomb.step(0.05);
    expect(bomb.actors.get('player')!.gun.idForSlot('primary')).toBe('sg12');
    expect(bomb.snapshot()[0].money).toBe(2200);
  });

  it('resolves all eight pellets close up but keeps every pellet behind solid cover', () => {
    const match = new Match({ primary: 'sg12' });
    match.add('shooter');
    match.add('target');
    const shooter = match.actors.get('shooter')!,
      target = match.actors.get('target')!;
    shooter.body = new PlayerBody(match.map.solids, { x: -12, y: 0, z: -8 });
    target.body = new PlayerBody(match.map.solids, { x: -12, y: 0, z: -5 });
    match.input('shooter', { ...IDLE_INPUT, fire: true, fireSequence: 1 });
    match.step(0.05);
    expect(target.health).toBe(0);
    expect(shooter.kills).toBe(1);
    expect(shooter.shots).toBe(1);
    expect(shooter.hits).toBe(1);
    expect(shooter.gun.ammo).toBe(7);

    shooter.body = new PlayerBody(match.map.solids, { x: -5, y: 0, z: -5 });
    target.body = new PlayerBody(match.map.solids, { x: -5, y: 0, z: 5 });
    target.health = 100;
    match.time = 2;
    match.input('shooter', { ...IDLE_INPUT, fire: false, fireSequence: 2 });
    match.step(0.05);
    expect(target.health).toBe(100);
    expect(shooter.gun.ammo).toBe(6);
  });
});
