import {
  recoilAt,
  shotDirection,
  spreadFor,
  WEAPONS,
  type AimContext,
  type WeaponSlot,
} from './ballistics';
export type Inventory = Record<WeaponSlot, { ammo: number; reserve: number; owned: boolean }>;
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
  constructor(
    public seed = 1,
    primary = true,
  ) {
    this.slot = primary ? 'primary' : 'secondary';
    this.inventory = {
      primary: { ammo: 30, reserve: 90, owned: primary },
      secondary: { ammo: 12, reserve: 100, owned: true },
    };
  }
  resetTrigger(sequence: number) {
    this.lastSequence = sequence;
    this.semiHeld = false;
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
    this.readyAt = now + WEAPONS[slot].deploy;
    this.burst = 0;
    this.recoil = { pitch: 0, yaw: 0 };
    this.semiHeld = false;
    return true;
  }
  reload(now: number): boolean {
    const mag = this.inventory[this.slot];
    if (
      this.reloadEnd ||
      now < this.readyAt ||
      mag.ammo === WEAPONS[this.slot].capacity ||
      mag.reserve === 0
    )
      return false;
    this.reloadEnd = now + WEAPONS[this.slot].reload;
    return true;
  }
  update(now: number, dt: number) {
    if (this.reloadEnd && now + 1e-8 >= this.reloadEnd) {
      const mag = this.inventory[this.slot];
      const transfer = Math.min(WEAPONS[this.slot].capacity - mag.ammo, mag.reserve);
      mag.ammo += transfer;
      mag.reserve -= transfer;
      this.reloadEnd = 0;
    }
    const recovery = WEAPONS[this.slot].interval + 0.12;
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
    const spec = WEAPONS[this.slot];
    if (
      (!trigger && !pressed) ||
      (!spec.automatic && !pressed) ||
      this.reloadEnd ||
      now + 1e-8 < Math.max(this.readyAt, this.nextShot) ||
      this.ammo === 0
    )
      return null;
    const cone = spreadFor(context, this.burst);
    const direction = shotDirection(
      aim.yaw + this.recoil.yaw,
      aim.pitch + this.recoil.pitch,
      cone,
      this.seed + this.shots,
    );
    this.inventory[this.slot].ammo--;
    this.shots++;
    this.burst++;
    this.nextShot = now + spec.interval;
    this.lastShot = now;
    this.recoil = recoilAt(this.slot, this.burst);
    return { direction, cone, damage: spec.damage, slot: this.slot };
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
      recoveryRemaining: Math.max(0, WEAPONS[this.slot].interval + 0.12 - (now - this.lastShot)),
      recoil: { ...this.recoil },
    };
  }
  reconcile(state: WeaponState, now: number) {
    this.lastShot = now - (WEAPONS[this.slot].interval + 0.12 - state.recoveryRemaining);
    this.inventory = {
      primary: { ...state.inventory.primary },
      secondary: { ...state.inventory.secondary },
    };
    this.burst = state.burst;
    this.shots = state.shots;
    this.recoil = { ...state.recoil };
    this.reloadEnd = state.reloadRemaining > 0 ? now + state.reloadRemaining : 0;
    this.readyAt = now + state.deployRemaining;
    this.nextShot = now + state.shotRemaining;
  }
}
