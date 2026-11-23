import {
  weaponRecoil,
  shotDirection,
  spreadFor,
  GUNS,
  DEFAULT_WEAPON_IDS,
  weaponIdForSlot,
  type AimContext,
  type WeaponSlot,
  type WeaponId,
  type GunSpec,
} from './ballistics';
export interface Magazine {
  ammo: number;
  reserve: number;
  owned: boolean;
  weaponId?: WeaponId;
}
export type Inventory = Record<WeaponSlot, Magazine>;
export interface Loadout {
  primary?: WeaponId;
  secondary?: WeaponId;
}
export interface WeaponState {
  slot: WeaponSlot;
  inventory: Inventory;
  burst: number;
  shots: number;
  reloadRemaining: number;
  deployRemaining: number;
  shotRemaining: number;
  recoveryRemaining: number;
  recoil: { pitch: number; yaw: number };
}
export class WeaponController {
  slot: WeaponSlot;
  inventory: Inventory;
  burst = 0;
  shots = 0;
  recoil = { pitch: 0, yaw: 0 };
  private reloadEnd = 0;
  private readyAt = 0;
  private nextShot = 0;
  private lastShot = -Infinity;
  private lastSequence = 0;
  private semiHeld = false;
  readonly loadout: Record<WeaponSlot, WeaponId>;
  constructor(
    public seed = 1,
    primary = true,
    loadout: Loadout = {},
  ) {
    this.loadout = {
      primary: weaponIdForSlot(loadout.primary, 'primary'),
      secondary: weaponIdForSlot(loadout.secondary, 'secondary'),
    };
    this.slot = primary ? 'primary' : 'secondary';
    this.inventory = {
      primary: this.magazine(this.loadout.primary, primary),
      secondary: this.magazine(this.loadout.secondary, true),
    };
  }
  private magazine(id: WeaponId, owned: boolean): Magazine {
    const spec = GUNS[id];
    return {
      ammo: spec.capacity,
      reserve: spec.reserve,
      owned,
      ...(id === DEFAULT_WEAPON_IDS[spec.slot] ? {} : { weaponId: id }),
    };
  }
  idForSlot(slot: WeaponSlot): WeaponId {
    return weaponIdForSlot(this.inventory[slot].weaponId, slot);
  }
  specForSlot(slot: WeaponSlot): GunSpec {
    return GUNS[this.idForSlot(slot)];
  }
  get weaponId(): WeaponId {
    return this.idForSlot(this.slot);
  }
  get spec(): GunSpec {
    return this.specForSlot(this.slot);
  }
  /** Replaces one slot. Selecting is optional for purchases and initial equipment. */
  equip(id: WeaponId, now: number, select = true): void {
    const spec = GUNS[id];
    this.inventory[spec.slot] = this.magazine(id, true);
    if (select) this.slot = spec.slot;
    if (this.slot === spec.slot) {
      this.reloadEnd = 0;
      this.readyAt = now + spec.deploy;
      this.burst = 0;
      this.recoil = { pitch: 0, yaw: 0 };
      this.semiHeld = false;
    }
  }
  resetTrigger(sequence: number) {
    this.lastSequence = sequence;
    this.semiHeld = false;
  }
  /** Moves the magazine out of the inventory; switching cannot recreate it. */
  drop(
    slot: WeaponSlot,
    now: number,
  ): { ammo: number; reserve: number; weaponId?: WeaponId } | null {
    const magazine = this.inventory[slot];
    if (!magazine.owned) return null;
    const id = magazine.weaponId ? { weaponId: magazine.weaponId } : {};
    const dropped = { ammo: magazine.ammo, reserve: magazine.reserve, ...id };
    this.inventory[slot] = { ammo: 0, reserve: 0, owned: false, ...id };
    if (this.slot === slot) {
      this.reloadEnd = 0;
      this.readyAt = now + 0.3;
      this.burst = 0;
      this.recoil = { pitch: 0, yaw: 0 };
    }
    return dropped;
  }
  pickup(
    slot: WeaponSlot,
    magazine: { ammo: number; reserve: number; weaponId?: WeaponId },
    now: number,
  ): boolean {
    if (this.inventory[slot].owned) return false;
    const id = weaponIdForSlot(magazine.weaponId, slot),
      spec = GUNS[id];
    this.inventory[slot] = {
      owned: true,
      ammo: Math.max(0, Math.min(spec.capacity, Math.floor(magazine.ammo))),
      reserve: Math.max(0, Math.min(spec.reserve, Math.floor(magazine.reserve))),
      ...(id === DEFAULT_WEAPON_IDS[slot] ? {} : { weaponId: id }),
    };
    if (this.slot === slot) this.readyAt = now + spec.deploy;
    return true;
  }
  get ammo() {
    return this.inventory[this.slot].ammo;
  }
  get reserve() {
    return this.inventory[this.slot].reserve;
  }
  isDeploying(now: number) {
    return now < this.readyAt;
  }
  get reloading() {
    return this.reloadEnd > 0;
  }
  switch(slot: WeaponSlot, now: number): boolean {
    if (slot === this.slot || !this.inventory[slot].owned) return false;
    this.slot = slot;
    this.reloadEnd = 0;
    this.readyAt = now + this.spec.deploy;
    this.burst = 0;
    this.recoil = { pitch: 0, yaw: 0 };
    this.semiHeld = false;
    return true;
  }
  reload(now: number): boolean {
    const mag = this.inventory[this.slot];
    if (
      !mag.owned ||
      this.reloadEnd ||
      now < this.readyAt ||
      mag.ammo === this.spec.capacity ||
      mag.reserve === 0
    )
      return false;
    this.reloadEnd = now + this.spec.reload;
    return true;
  }
  update(now: number, dt: number) {
    if (this.reloadEnd && now + 1e-8 >= this.reloadEnd) {
      const mag = this.inventory[this.slot];
      const transfer = Math.min(this.spec.capacity - mag.ammo, mag.reserve);
      mag.ammo += transfer;
      mag.reserve -= transfer;
      this.reloadEnd = 0;
    }
    const recovery = this.spec.interval + 0.12;
    if (now - this.lastShot > recovery) {
      const f = Math.exp(-12 * Math.max(0, dt));
      this.recoil.pitch *= f;
      this.recoil.yaw *= f;
      if (now - this.lastShot > 0.45) this.burst = 0;
    }
  }
  fire(
    now: number,
    trigger: boolean,
    sequence: number,
    aim: { yaw: number; pitch: number },
    context: AimContext,
  ) {
    const pressed = sequence > this.lastSequence || (trigger && !this.semiHeld);
    this.lastSequence = Math.max(this.lastSequence, sequence);
    this.semiHeld = trigger;
    const spec = this.spec;
    if (
      (!trigger && !pressed) ||
      !this.inventory[this.slot].owned ||
      (!spec.automatic && !pressed) ||
      this.reloadEnd ||
      now + 1e-8 < Math.max(this.readyAt, this.nextShot) ||
      this.ammo === 0
    )
      return null;
    const cone = spreadFor(context, this.burst) * spec.spread;
    const direction = shotDirection(
      aim.yaw + this.recoil.yaw,
      aim.pitch + this.recoil.pitch,
      cone,
      this.seed + this.shots,
    );
    const directions =
      spec.pellets === 1
        ? [direction]
        : Array.from({ length: spec.pellets }, (_, pellet) =>
            shotDirection(
              aim.yaw + this.recoil.yaw,
              aim.pitch + this.recoil.pitch,
              cone + 0.045,
              this.seed + this.shots * 31 + pellet * 977,
            ),
          );
    this.inventory[this.slot].ammo--;
    this.shots++;
    this.burst++;
    this.nextShot = now + spec.interval;
    this.lastShot = now;
    this.recoil = weaponRecoil(this.weaponId, this.burst);
    return {
      direction: directions[0],
      directions,
      cone,
      damage: spec.damage,
      range: spec.range,
      falloff: spec.falloff,
      slot: this.slot,
      weaponId: this.weaponId,
    };
  }
  snapshot(now: number): WeaponState {
    return {
      slot: this.slot,
      inventory: {
        primary: { ...this.inventory.primary },
        secondary: { ...this.inventory.secondary },
      },
      burst: this.burst,
      shots: this.shots,
      reloadRemaining: Math.max(0, this.reloadEnd - now),
      deployRemaining: Math.max(0, this.readyAt - now),
      shotRemaining: Math.max(0, this.nextShot - now),
      recoveryRemaining: Math.max(0, this.spec.interval + 0.12 - (now - this.lastShot)),
      recoil: { ...this.recoil },
    };
  }
  reconcile(state: WeaponState, now: number) {
    this.slot = state.slot;
    this.inventory = {
      primary: { ...state.inventory.primary },
      secondary: { ...state.inventory.secondary },
    };
    this.lastShot = now - (this.spec.interval + 0.12 - state.recoveryRemaining);
    this.burst = state.burst;
    this.shots = state.shots;
    this.recoil = { ...state.recoil };
    this.reloadEnd = state.reloadRemaining > 0 ? now + state.reloadRemaining : 0;
    this.readyAt = now + state.deployRemaining;
    this.nextShot = now + state.shotRemaining;
  }
}
