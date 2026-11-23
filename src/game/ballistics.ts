import { SPEED, type Stance } from './physics';
const rad = (degrees: number) => (degrees * Math.PI) / 180;
export type WeaponSlot = 'primary' | 'secondary';
export interface GunSpec {
  name: string;
  slot: WeaponSlot;
  kind:
    | 'carbine'
    | 'assault'
    | 'smg'
    | 'dmr'
    | 'shotgun'
    | 'sniper'
    | 'lmg'
    | 'pistol'
    | 'heavy-pistol'
    | 'compact-pistol';
  capacity: number;
  reserve: number;
  interval: number;
  reload: number;
  deploy: number;
  damage: number;
  automatic: boolean;
  price: number;
  pellets: number;
  range: number;
  falloff: number;
  spread: number;
  recoil: number;
  zoom: number;
}
export const WEAPONS = {
  primary: {
    name: 'CARABINA T-04',
    capacity: 30,
    reserve: 90,
    interval: 0.1,
    reload: 2.45,
    deploy: 1,
    damage: 36,
    automatic: true,
    price: 2700,
  },
  secondary: {
    name: 'PISTOLA P-09',
    capacity: 12,
    reserve: 100,
    interval: 0.15,
    reload: 2.2,
    deploy: 0.75,
    damage: 34,
    automatic: false,
    price: 500,
  },
} as const;
/** Original weapons and tuning; identifiers survive snapshots, pickups and purchases. */
export const GUNS = {
  t04: {
    ...WEAPONS.primary,
    slot: 'primary',
    kind: 'carbine',
    pellets: 1,
    range: 140,
    falloff: 0.12,
    spread: 1,
    recoil: 1,
    zoom: 0.72,
  },
  p09: {
    ...WEAPONS.secondary,
    slot: 'secondary',
    kind: 'pistol',
    pellets: 1,
    range: 65,
    falloff: 0.22,
    spread: 1,
    recoil: 1,
    zoom: 0.8,
  },
  ar47: {
    name: 'FUZIL AR-47',
    slot: 'primary',
    kind: 'assault',
    capacity: 30,
    reserve: 90,
    interval: 0.115,
    reload: 2.8,
    deploy: 1,
    damage: 43,
    automatic: true,
    price: 2900,
    pellets: 1,
    range: 150,
    falloff: 0.1,
    spread: 1.13,
    recoil: 1.35,
    zoom: 0.72,
  },
  smg9: {
    name: 'SUBMETRALHADORA S-9',
    slot: 'primary',
    kind: 'smg',
    capacity: 32,
    reserve: 128,
    interval: 0.068,
    reload: 2.05,
    deploy: 0.65,
    damage: 23,
    automatic: true,
    price: 1500,
    pellets: 1,
    range: 70,
    falloff: 0.34,
    spread: 1.1,
    recoil: 0.58,
    zoom: 0.78,
  },
  dmr14: {
    name: 'PRECISÃO DMR-14',
    slot: 'primary',
    kind: 'dmr',
    capacity: 20,
    reserve: 80,
    interval: 0.26,
    reload: 2.8,
    deploy: 1,
    damage: 62,
    automatic: false,
    price: 3300,
    pellets: 1,
    range: 190,
    falloff: 0.05,
    spread: 0.55,
    recoil: 1.5,
    zoom: 0.5,
  },
  sg12: {
    name: 'ESCOPETA SG-12',
    slot: 'primary',
    kind: 'shotgun',
    capacity: 8,
    reserve: 32,
    interval: 0.85,
    reload: 3.3,
    deploy: 0.9,
    damage: 15,
    automatic: false,
    price: 1800,
    pellets: 8,
    range: 38,
    falloff: 0.62,
    spread: 1.2,
    recoil: 1.7,
    zoom: 0.82,
  },
  sr8: {
    name: 'FERROLHO SR-8',
    slot: 'primary',
    kind: 'sniper',
    capacity: 5,
    reserve: 25,
    interval: 1.25,
    reload: 3.5,
    deploy: 1.3,
    damage: 105,
    automatic: false,
    price: 3900,
    pellets: 1,
    range: 220,
    falloff: 0.03,
    spread: 0.3,
    recoil: 2,
    zoom: 0.36,
  },
  lmg60: {
    name: 'METRALHADORA L-60',
    slot: 'primary',
    kind: 'lmg',
    capacity: 60,
    reserve: 180,
    interval: 0.095,
    reload: 4.4,
    deploy: 1.5,
    damage: 33,
    automatic: true,
    price: 3700,
    pellets: 1,
    range: 145,
    falloff: 0.14,
    spread: 1.45,
    recoil: 1.3,
    zoom: 0.75,
  },
  p45: {
    name: 'PISTOLA P-45',
    slot: 'secondary',
    kind: 'heavy-pistol',
    capacity: 7,
    reserve: 35,
    interval: 0.32,
    reload: 2.4,
    deploy: 0.8,
    damage: 58,
    automatic: false,
    price: 800,
    pellets: 1,
    range: 80,
    falloff: 0.15,
    spread: 0.9,
    recoil: 1.9,
    zoom: 0.78,
  },
  p22: {
    name: 'COMPACTA P-22',
    slot: 'secondary',
    kind: 'compact-pistol',
    capacity: 18,
    reserve: 108,
    interval: 0.13,
    reload: 1.75,
    deploy: 0.55,
    damage: 24,
    automatic: false,
    price: 400,
    pellets: 1,
    range: 55,
    falloff: 0.28,
    spread: 1.1,
    recoil: 0.65,
    zoom: 0.82,
  },
} as const satisfies Record<string, GunSpec>;
export type WeaponId = keyof typeof GUNS;
export const DEFAULT_WEAPON_IDS: Record<WeaponSlot, WeaponId> = {
  primary: 't04',
  secondary: 'p09',
};
export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && Object.hasOwn(GUNS, value);
}
export function weaponSpec(id: WeaponId): GunSpec {
  return GUNS[id];
}
export function weaponIdForSlot(value: unknown, slot: WeaponSlot): WeaponId {
  return isWeaponId(value) && GUNS[value].slot === slot ? value : DEFAULT_WEAPON_IDS[slot];
}
export function weaponDamage(spec: GunSpec, distance: number): number {
  return Math.max(
    1,
    spec.damage * (1 - spec.falloff * Math.min(1, Math.max(0, distance) / spec.range)),
  );
}
export interface AimContext {
  speed: number;
  grounded: boolean;
  stance: Stance;
  aiming?: boolean;
}
// Original, controllable patterns. These are tunable targets, not extracted CS assets/data.
const RIFLE_SPRAY = [
  [0, 0],
  [0.1, 0.7],
  [0.15, 1.5],
  [0.1, 2.4],
  [-0.15, 3.4],
  [-0.4, 4.4],
  [-0.2, 5.4],
  [0.2, 6.2],
  [0.7, 6.8],
  [1.3, 7.2],
  [1.9, 7.4],
  [2.3, 7.5],
  [2.5, 7.6],
  [2.4, 7.7],
  [2, 7.8],
  [1.3, 7.9],
  [0.5, 8],
  [-0.4, 8],
  [-1.2, 8.1],
  [-1.9, 8.1],
  [-2.3, 8.2],
  [-2.5, 8.2],
  [-2.4, 8.3],
  [-2, 8.3],
  [-1.4, 8.4],
  [-0.6, 8.4],
  [0.3, 8.5],
  [1, 8.5],
  [1.6, 8.6],
  [2, 8.6],
] as const;
export function recoilAt(slot: WeaponSlot, shot: number): { yaw: number; pitch: number } {
  if (shot <= 0) return { yaw: 0, pitch: 0 };
  if (slot === 'secondary')
    return { yaw: rad(Math.sin(shot * 1.4) * 0.35), pitch: -rad(Math.min(shot * 0.75, 3)) };
  const p = RIFLE_SPRAY[Math.min(shot, RIFLE_SPRAY.length) - 1];
  return { yaw: rad(p[0]), pitch: -rad(p[1] + 0.65) };
}
export function weaponRecoil(id: WeaponId, shot: number): { yaw: number; pitch: number } {
  const spec = GUNS[id];
  const recoil = recoilAt(spec.slot, shot);
  return { yaw: recoil.yaw * spec.recoil, pitch: recoil.pitch * spec.recoil };
}
export function spreadFor(context: AimContext, heat = 0): number {
  const ratio = Math.min(1, context.speed / SPEED.run);
  // Grounded accuracy recovers from actual velocity, including release/counter-strafing.
  return (
    ((context.grounded ? 0.0008 + ratio * ratio * 0.035 : 0.065) *
      (context.stance === 'standing' ? 1 : context.stance === 'crouching' ? 0.65 : 0.45) +
      heat * 0.0006) *
    (context.aiming && context.grounded && context.speed < 0.2 ? 0.7 : 1)
  );
}
export function shotDirection(yaw: number, pitch: number, cone: number, seed: number) {
  let state = seed | 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
  const angle = random() * Math.PI * 2,
    radius = Math.sqrt(random()) * cone;
  const y = yaw + Math.cos(angle) * radius,
    p = pitch + Math.sin(angle) * radius;
  return { x: Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) };
}
export function seedFor(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
