import { describe, it, expect } from 'vitest';
import { Match } from '../server/match';
import { IDLE_INPUT, parseInput } from '../src/network/protocol';
import { ARENA_SOLIDS, rayBox } from '../src/network/arena';
import { WeaponController } from '../src/game/weapons';
import { box, PlayerBody } from '../src/game/physics';
describe('authoritative arena', () => {
  it('rejects invalid input and clamps movement rather than accepting client positions', () => {
    expect(parseInput({ ...IDLE_INPUT, yaw: Infinity })).toBeNull();
    expect(parseInput({ ...IDLE_INPUT, fire: 'yes' })).toBeNull();
    expect(parseInput({ ...IDLE_INPUT, forward: 100 })?.forward).toBe(1);
  });
  it('stops abandoned inputs and confines players to arena collisions', () => {
    const m = new Match();
    m.add('one');
    m.input('one', { ...IDLE_INPUT, forward: 1 });
    for (let i = 0; i < 200; i++) m.step(0.05);
    expect(m.snapshot()[0].position.z).toBeLessThan(-9);
    const stopped = m.snapshot()[0].position;
    for (let i = 0; i < 40; i++) m.step(0.05);
    expect(m.snapshot()[0].position).toEqual(stopped);
    for (let i = 0; i < 600; i++) {
      m.input('one', { ...IDLE_INPUT, forward: 1 });
      m.step(0.05);
    }
    expect(m.snapshot()[0].position.z).toBeLessThan(15.3);
  });
  it('ray queries respect solid cover', () => {
    expect(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box(0, 1, 5, 2, 2, 2))).toBe(4);
    expect(rayBox({ x: 5, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box(0, 1, 5, 2, 2, 2))).toBe(
      Infinity,
    );
  });
  it('server resolves damage, deaths and respawns without trusting claimed hits', () => {
    const m = new Match();
    m.add('a');
    m.add('b');
    const a = m.actors.get('a')!,
      b = m.actors.get('b')!;
    a.gun = new WeaponController(1);
    a.body = new PlayerBody(ARENA_SOLIDS, { x: -12, y: 0, z: -8 });
    b.body = new PlayerBody(ARENA_SOLIDS, { x: -12, y: 0, z: 0 });
    for (let i = 0; i < 80 && b.health > 0; i++) {
      m.input('a', {
        ...IDLE_INPUT,
        fire: true,
        pitch: -a.gun.recoil.pitch,
        yaw: -a.gun.recoil.yaw,
      });
      m.step(0.05);
    }
    expect(b.health).toBe(0);
    expect(a.kills).toBe(1);
    expect(b.deaths).toBe(1);
    for (let i = 0; i < 65; i++) m.step(0.05);
    expect(b.health).toBe(100);
  });
  it('bots move, fire and share the same rules as players', () => {
    const m = new Match();
    m.add('player');
    m.add('bot', true);
    const initial = m.snapshot()[1].position;
    for (let i = 0; i < 100; i++) m.step(0.05);
    const bot = m.snapshot()[1];
    expect(bot.position).not.toEqual(initial);
    expect(bot.shots).toBeGreaterThan(0);
  });
});

it('authorizes purchases once per command, denies distant purchases and ignores client money', () => {
  const m = new Match();
  m.add('buyer');
  const initial = m.snapshot()[0];
  expect(initial.weapon).toBe('secondary');
  m.input('buyer', { ...IDLE_INPUT, weapon: 'secondary', buyItem: 'primary', buySequence: 1 });
  m.step(0.05);
  expect(m.snapshot()[0].money).toBe(1300);
  expect(m.snapshot()[0].weaponState.inventory.primary.owned).toBe(true);
  m.step(0.05);
  expect(m.snapshot()[0].money).toBe(1300);
  const actor = m.actors.get('buyer')!;
  actor.body.position.x = 12;
  m.input('buyer', { ...IDLE_INPUT, weapon: 'primary', buyItem: 'armor', buySequence: 2 });
  m.step(0.05);
  expect(m.snapshot()[0].armor).toBe(0);
  expect(m.snapshot()[0].money).toBe(1300);
});
