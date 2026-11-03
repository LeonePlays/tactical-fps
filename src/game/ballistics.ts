import { SPEED, type Stance } from './physics';
const rad = (degrees: number) => (degrees * Math.PI) / 180;
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
export type WeaponSlot = keyof typeof WEAPONS;
export interface AimContext {
  speed: number;
  grounded: boolean;
  stance: Stance;
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
export function spreadFor(context: AimContext, heat = 0): number {
  const ratio = Math.min(1, context.speed / SPEED.run);
  // Grounded accuracy recovers from actual velocity, including release/counter-strafing.
  return (
    (context.grounded ? 0.0008 + ratio * ratio * 0.035 : 0.065) *
      (context.stance === 'standing' ? 1 : context.stance === 'crouching' ? 0.65 : 0.45) +
    heat * 0.0006
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
