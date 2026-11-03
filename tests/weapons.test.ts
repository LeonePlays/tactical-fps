import { describe, it, expect } from 'vitest';
import { WeaponController } from '../src/game/weapons';
import { buy } from '../src/game/shop';
import { WEAPONS } from '../src/game/ballistics';
const aim = { yaw: 0, pitch: 0 },
  standing = { speed: 0, grounded: true, stance: 'standing' } as const;
describe('shared weapon controller', () => {
  it('respects automatic cadence, with reproducible spray and no frame-rate catchup burst', () => {
    const gun = new WeaponController(42);
    let accepted = 0;
    for (let i = 0; i <= 100; i++) {
      const now = i / 100;
      gun.update(now, 0.01);
      if (gun.fire(now, true, 1, aim, standing)) accepted++;
    }
    expect(accepted).toBe(11);
    expect(gun.ammo).toBe(19);
    const other = new WeaponController(42),
      first = new WeaponController(42);
    for (let i = 0; i < 10; i++) {
      other.update(i * 0.1, 0.1);
      first.update(i * 0.1, 0.1);
      expect(other.fire(i * 0.1, true, 1, aim, standing)).toEqual(
        first.fire(i * 0.1, true, 1, aim, standing),
      );
    }
  });
  it('requires a new press for semiautomatic fire, including clicks released between server ticks', () => {
    const gun = new WeaponController(1, false);
    expect(gun.fire(0, true, 1, aim, standing)).not.toBeNull();
    expect(gun.fire(0.5, true, 1, aim, standing)).toBeNull();
    expect(gun.fire(0.5, false, 2, aim, standing)).not.toBeNull();
    expect(gun.ammo).toBe(10);
  });
  it('blocks shooting during deploy, and a repeated switch to the same weapon does not restart it', () => {
    const gun = new WeaponController();
    gun.switch('secondary', 0);
    expect(gun.switch('secondary', 0.5)).toBe(false);
    expect(gun.fire(0.5, true, 1, aim, standing)).toBeNull();
    expect(gun.fire(WEAPONS.secondary.deploy, true, 2, aim, standing)).not.toBeNull();
  });
  it('conserves ammo across tactical reloads, cancels reload on switch, and handles an exhausted reserve', () => {
    const gun = new WeaponController();
    gun.fire(0, true, 1, aim, standing);
    expect(gun.reload(0.1)).toBe(true);
    gun.update(3, 3);
    expect(gun.ammo).toBe(30);
    expect(gun.reserve).toBe(89);
    gun.inventory.primary.ammo = 1;
    gun.inventory.primary.reserve = 2;
    gun.reload(4);
    gun.update(7, 4);
    expect(gun.ammo).toBe(3);
    expect(gun.reserve).toBe(0);
    expect(gun.reload(8)).toBe(false);
    gun.inventory.primary.ammo = 10;
    gun.inventory.primary.reserve = 30;
    gun.reload(9);
    gun.switch('secondary', 9.1);
    gun.update(12, 3);
    expect(gun.inventory.primary.ammo).toBe(10);
    expect(gun.inventory.primary.reserve).toBe(30);
  });
  it('recovers recoil/burst after release and restores authoritative ammo without inventing reserve', () => {
    const gun = new WeaponController();
    gun.fire(0, true, 1, aim, standing);
    gun.fire(0.1, true, 1, aim, standing);
    expect(gun.recoil.pitch).toBeLessThan(0);
    gun.update(1, 0.9);
    expect(gun.burst).toBe(0);
    expect(Math.abs(gun.recoil.pitch)).toBeLessThan(0.001);
    const copy = new WeaponController();
    copy.reconcile(gun.snapshot(1), 10);
    expect(copy.inventory).toEqual(gun.inventory);
  });
  it('charges only valid purchases and never grants ammo/armor outside the buy window/zone', () => {
    const gun = new WeaponController(1, false),
      wallet = { money: 4000, armor: 0 };
    expect(buy(gun, wallet, 'primary', false)).not.toBe('Compra efetuada.');
    expect(wallet.money).toBe(4000);
    expect(buy(gun, wallet, 'primary', true)).toBe('Compra efetuada.');
    expect(gun.inventory.primary.owned).toBe(true);
    expect(wallet.money).toBe(1300);
    buy(gun, wallet, 'primary', true);
    expect(wallet.money).toBe(1300);
    buy(gun, wallet, 'armor', true);
    expect(wallet.armor).toBe(100);
    expect(wallet.money).toBe(650);
    buy(gun, wallet, 'armor', true);
    expect(wallet.money).toBe(650);
  });
});
