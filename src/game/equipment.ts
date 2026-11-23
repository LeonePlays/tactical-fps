import { box, type Solid, type Vec3 } from './physics';
import { rayBox } from '../network/arena';

export type EquipmentKind = 'knife' | 'grenade';
export const EQUIPMENT = {
  knife: { name: 'FACA DE COMBATE', damage: 45, range: 1.8, cooldown: 0.6 },
  grenade: {
    name: 'GRANADA HE',
    fuse: 3,
    radius: 6,
    damage: 100,
    price: 300,
    speed: 13,
    gravity: 12,
    size: 0.08,
  },
} as const;
export interface EquipmentTarget {
  id: string;
  position: Vec3;
  height: number;
  alive?: boolean;
}
export interface GrenadeProjectile {
  position: Vec3;
  velocity: Vec3;
  remaining: number;
  bounces: number;
  detonated: boolean;
}
export interface Explosion {
  position: Vec3;
  radius: number;
  damage: number;
}

function unit(direction: Vec3): Vec3 {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 1e-8) return { x: 0, y: 0, z: 1 };
  return { x: direction.x / length, y: direction.y / length, z: direction.z / length };
}

/** Includes world occlusion: a knife never reaches through a wall or another target. */
export function meleeTarget(
  origin: Vec3,
  direction: Vec3,
  solids: readonly Solid[],
  targets: readonly EquipmentTarget[],
): string | null {
  const dir = unit(direction);
  let nearest: number = EQUIPMENT.knife.range;
  for (const solid of solids) nearest = Math.min(nearest, rayBox(origin, dir, solid));
  let id: string | null = null;
  for (const target of targets) {
    if (target.alive === false) continue;
    const p = target.position;
    const distance = rayBox(
      origin,
      dir,
      box(p.x, p.y + target.height / 2, p.z, 0.8, target.height, 0.8),
    );
    if (distance < nearest) {
      nearest = distance;
      id = target.id;
    }
  }
  return id;
}

export function launchGrenade(
  origin: Vec3,
  direction: Vec3,
  solids: readonly Solid[] = [],
): GrenadeProjectile {
  const dir = unit(direction);
  // Do not create a projectile behind a wall just because the muzzle offset crossed it.
  let clearance = 0.35;
  for (const solid of solids)
    clearance = Math.min(clearance, Math.max(0, rayBox(origin, dir, solid) - 0.1));
  return {
    position: {
      x: origin.x + dir.x * clearance,
      y: origin.y + dir.y * clearance,
      z: origin.z + dir.z * clearance,
    },
    velocity: {
      x: dir.x * EQUIPMENT.grenade.speed,
      y: dir.y * EQUIPMENT.grenade.speed + 2.4,
      z: dir.z * EQUIPMENT.grenade.speed,
    },
    remaining: EQUIPMENT.grenade.fuse,
    bounces: 0,
    detonated: false,
  };
}

/** Pure shared inventory: no ammo can be granted by replaying an attack sequence. */
export class EquipmentInventory {
  private slots: [boolean, boolean] = [true, false];
  private sequence = 0;
  private knifeReady = 0;
  private throwReady = 0;
  get grenades() {
    return Number(this.slots[0]) + Number(this.slots[1]);
  }
  get grenadeSlots(): [boolean, boolean] {
    return [...this.slots];
  }
  set grenadeSlots(value: [boolean, boolean]) {
    this.slots = [value[0] === true, value[1] === true];
  }
  set grenades(value: number) {
    const count = Number.isFinite(value) ? Math.max(0, Math.min(2, Math.floor(value))) : 0;
    this.slots = [count >= 1, count >= 2];
  }
  /** Call when changing tools or respawning to consume an already-observed button press. */
  observe(sequence: number): void {
    if (Number.isSafeInteger(sequence)) this.sequence = Math.max(this.sequence, sequence);
  }
  reset(sequence = 0): void {
    this.slots = [true, false];
    this.sequence = Math.max(0, sequence);
    this.knifeReady = 0;
    this.throwReady = 0;
  }
  addGrenade(): boolean {
    const slot = this.slots.findIndex((occupied) => !occupied);
    if (slot < 0) return false;
    this.slots[slot] = true;
    return true;
  }
  dropGrenade(slot: 0 | 1 = 0): boolean {
    if (!this.slots[slot]) return false;
    this.slots[slot] = false;
    return true;
  }
  private pressed(sequence: number): boolean {
    if (!Number.isSafeInteger(sequence) || sequence <= this.sequence || sequence > 1e9)
      return false;
    this.sequence = sequence;
    return true;
  }
  swing(now: number, sequence: number): boolean {
    if (!this.pressed(sequence) || !Number.isFinite(now) || now < this.knifeReady) return false;
    this.knifeReady = now + EQUIPMENT.knife.cooldown;
    return true;
  }
  throw(
    now: number,
    sequence: number,
    origin: Vec3,
    direction: Vec3,
    solids: readonly Solid[] = [],
    slot: 0 | 1 = 0,
  ): GrenadeProjectile | null {
    if (
      !this.pressed(sequence) ||
      !Number.isFinite(now) ||
      now < this.throwReady ||
      !this.slots[slot]
    )
      return null;
    this.slots[slot] = false;
    this.throwReady = now + 0.8;
    return launchGrenade(origin, direction, solids);
  }
}

function overlaps(position: Vec3, solid: Solid): boolean {
  const radius = EQUIPMENT.grenade.size;
  return (
    position.x + radius > solid.min.x &&
    position.x - radius < solid.max.x &&
    position.y + radius > solid.min.y &&
    position.y - radius < solid.max.y &&
    position.z + radius > solid.min.z &&
    position.z - radius < solid.max.z
  );
}

/** Substeps and axis collision keep fast grenades inside thin arena walls. */
export function stepGrenade(
  grenade: GrenadeProjectile,
  dt: number,
  solids: readonly Solid[],
): Explosion | null {
  if (grenade.detonated || !Number.isFinite(dt) || dt <= 0) return null;
  const elapsed = Math.min(dt, Math.max(0, grenade.remaining));
  const steps = Math.max(1, Math.ceil(elapsed * 120));
  const sub = elapsed / steps;
  for (let i = 0; i < steps; i++) {
    grenade.velocity.y -= EQUIPMENT.grenade.gravity * sub;
    for (const axis of ['x', 'y', 'z'] as const) {
      const amount = grenade.velocity[axis] * sub;
      grenade.position[axis] += amount;
      if (!amount) continue;
      for (const solid of solids) {
        if (!overlaps(grenade.position, solid)) continue;
        grenade.position[axis] =
          amount > 0
            ? solid.min[axis] - EQUIPMENT.grenade.size
            : solid.max[axis] + EQUIPMENT.grenade.size;
        grenade.velocity[axis] *= -0.42;
        if (axis === 'y' && amount < 0) {
          if (Math.abs(grenade.velocity.y) < 0.6) grenade.velocity.y = 0;
          grenade.velocity.x *= 0.75;
          grenade.velocity.z *= 0.75;
        }
        grenade.bounces++;
      }
    }
  }
  grenade.remaining = Math.max(0, grenade.remaining - elapsed);
  if (grenade.remaining > 1e-8) return null;
  grenade.detonated = true;
  return {
    position: { ...grenade.position },
    radius: EQUIPMENT.grenade.radius,
    damage: EQUIPMENT.grenade.damage,
  };
}

/** Linear falloff and a solid-world visibility check; includes self damage if present. */
export function blastHits(
  explosion: Explosion,
  targets: readonly EquipmentTarget[],
  solids: readonly Solid[],
): { id: string; damage: number }[] {
  const hits: { id: string; damage: number }[] = [];
  for (const target of targets) {
    if (target.alive === false) continue;
    // Test the closest point on the character volume, so a grenade at their feet is dangerous.
    const p = target.position;
    const closest = {
      x: Math.max(p.x - 0.3, Math.min(p.x + 0.3, explosion.position.x)),
      y: Math.max(p.y + 0.15, Math.min(p.y + target.height - 0.1, explosion.position.y)),
      z: Math.max(p.z - 0.3, Math.min(p.z + 0.3, explosion.position.z)),
    };
    const delta = {
      x: closest.x - explosion.position.x,
      y: closest.y - explosion.position.y,
      z: closest.z - explosion.position.z,
    };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    if (distance >= explosion.radius) continue;
    const dir = unit(delta);
    if (
      distance > 0.001 &&
      solids.some((solid) => rayBox(explosion.position, dir, solid) < distance - 0.01)
    )
      continue;
    const damage = Math.max(1, Math.round(explosion.damage * (1 - distance / explosion.radius)));
    hits.push({ id: target.id, damage });
  }
  return hits;
}
