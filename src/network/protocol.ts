import type { MovementInput, Vec3 } from '../game/physics';
import type { WeaponSlot } from '../game/ballistics';
export interface MatchInput extends MovementInput {
  yaw: number;
  pitch: number;
  fire: boolean;
  reload: boolean;
  weapon: WeaponSlot;
}
export interface ActorState {
  id: string;
  bot: boolean;
  position: Vec3;
  yaw: number;
  stance: MovementInput['stance'];
  health: number;
  kills: number;
  deaths: number;
  ammo: number;
  weapon: WeaponSlot;
}
export interface MatchState {
  type: 'state';
  room: string;
  self: string;
  actors: ActorState[];
}
export const IDLE_INPUT: MatchInput = {
  forward: 0,
  right: 0,
  sprint: false,
  jump: false,
  stance: 'standing',
  yaw: 0,
  pitch: 0,
  fire: false,
  reload: false,
  weapon: 'primary',
};
export function parseInput(value: unknown): MatchInput | null {
  if (!value || typeof value !== 'object') return null;
  const x = value as Record<string, unknown>;
  if (
    !['forward', 'right', 'yaw', 'pitch'].every(
      (key) => typeof x[key] === 'number' && Number.isFinite(x[key]),
    )
  )
    return null;
  if (
    !['standing', 'crouching', 'prone'].includes(String(x.stance)) ||
    !['primary', 'secondary'].includes(String(x.weapon))
  )
    return null;
  if (!['sprint', 'jump', 'fire', 'reload'].every((key) => typeof x[key] === 'boolean'))
    return null;
  return {
    forward: Math.max(-1, Math.min(1, x.forward as number)),
    right: Math.max(-1, Math.min(1, x.right as number)),
    yaw: (x.yaw as number) % (Math.PI * 2),
    pitch: Math.max(-1.48, Math.min(1.48, x.pitch as number)),
    stance: x.stance as MatchInput['stance'],
    weapon: x.weapon as MatchInput['weapon'],
    sprint: x.sprint as boolean,
    jump: x.jump as boolean,
    fire: x.fire as boolean,
    reload: x.reload as boolean,
  };
}
