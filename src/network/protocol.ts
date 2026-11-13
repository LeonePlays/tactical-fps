import type { RoundSnapshot, Team } from '../game/rounds';
import type { MatchConfig } from '../game/match-config';
import type { WeaponState } from '../game/weapons';
import { SHOP, type BuyItem } from '../game/shop';
import type { MovementInput, Vec3 } from '../game/physics';
import type { WeaponSlot } from '../game/ballistics';
export const PROTOCOL_VERSION = 5 as const;
export interface MatchInput extends MovementInput {
  tool: 'firearm' | 'knife' | 'grenade' | 'bomb';
  dropSequence: number;
  grenadeSlot: 0 | 1;
  aiming: boolean;
  interact: boolean;
  yaw: number;
  pitch: number;
  fire: boolean;
  fireSequence: number;
  reloadSequence: number;
  buySequence: number;
  buyItem: BuyItem | null;
  reload: boolean;
  weapon: WeaponSlot;
}
export interface ActorState {
  name: string;
  pitch: number;
  tool: MatchInput['tool'];
  aiState?: string;
  team: Team;
  grenades: number;
  grenadeSlots?: [boolean, boolean];
  commandSequences?: { fire: number; reload: number; buy: number; drop: number };
  id: string;
  bot: boolean;
  position: Vec3;
  yaw: number;
  stance: MovementInput['stance'];
  velocity: Vec3;
  grounded: boolean;
  health: number;
  armor: number;
  money: number;
  buyAllowed: boolean;
  buyMessage: string;
  buySequence: number;
  weaponState: WeaponState;
  shots: number;
  hits: number;
  kills: number;
  deaths: number;
  ammo: number;
  weapon: WeaponSlot;
}
export interface MatchState {
  protocol: typeof PROTOCOL_VERSION;
  type: 'state';
  room: string;
  self: string;
  actors: ActorState[];
  config: MatchConfig;
  matchId: number;
  hostId?: string;
  rounds: RoundSnapshot;
  grenades: { id: string; owner: string; position: Vec3; remaining: number }[];
  droppedItems?: DroppedItemState[];
}
export interface DroppedItemState {
  id: string;
  kind: WeaponSlot | 'grenade';
  position: Vec3;
  ammo?: number;
  reserve?: number;
  expiresAt: number;
}
export const IDLE_INPUT: MatchInput = {
  tool: 'firearm',
  dropSequence: 0,
  grenadeSlot: 0,
  aiming: false,
  walk: false,
  interact: false,
  forward: 0,
  right: 0,
  sprint: false,
  jump: false,
  stance: 'standing',
  yaw: 0,
  pitch: 0,
  fire: false,
  fireSequence: 0,
  reloadSequence: 0,
  buySequence: 0,
  buyItem: null,
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
  for (const key of ['fireSequence', 'buySequence', 'reloadSequence', 'dropSequence'])
    if (
      x[key] !== undefined &&
      (!Number.isSafeInteger(x[key]) || (x[key] as number) < 0 || (x[key] as number) > 1e9)
    )
      return null;
  if (
    x.buyItem !== undefined &&
    x.buyItem !== null &&
    (typeof x.buyItem !== 'string' || !Object.hasOwn(SHOP, x.buyItem))
  )
    return null;
  if (x.tool !== undefined && !['firearm', 'knife', 'grenade', 'bomb'].includes(String(x.tool)))
    return null;
  if (x.grenadeSlot !== undefined && x.grenadeSlot !== 0 && x.grenadeSlot !== 1) return null;
  for (const key of ['walk', 'aiming'])
    if (x[key] !== undefined && typeof x[key] !== 'boolean') return null;
  if (x.interact !== undefined && typeof x.interact !== 'boolean') return null;
  return {
    tool: (x.tool as MatchInput['tool'] | undefined) ?? 'firearm',
    dropSequence: (x.dropSequence as number | undefined) ?? 0,
    grenadeSlot: (x.grenadeSlot as 0 | 1 | undefined) ?? 0,
    aiming: x.aiming === true,
    walk: x.walk === true,
    interact: x.interact === true,
    reloadSequence: (x.reloadSequence as number | undefined) ?? 0,
    fireSequence: (x.fireSequence as number | undefined) ?? 0,
    buySequence: (x.buySequence as number | undefined) ?? 0,
    buyItem: (x.buyItem as BuyItem | null | undefined) ?? null,
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
