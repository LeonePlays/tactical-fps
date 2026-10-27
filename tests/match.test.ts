import { describe, it, expect } from 'vitest';
import { Match } from '../server/match';
import { IDLE_INPUT, parseInput } from '../src/network/protocol';
import { ARENA_SOLIDS, rayBox } from '../src/network/arena';
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
    expect(m.snapshot()[0].position.z).toBeLessThan(-10);
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
    a.body = new PlayerBody(ARENA_SOLIDS, { x: -12, y: 0, z: -8 });
    b.body = new PlayerBody(ARENA_SOLIDS, { x: -12, y: 0, z: 0 });
    for (let i = 0; i < 80 && b.health > 0; i++) {
      m.input('a', { ...IDLE_INPUT, fire: true });
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
    expect(bot.ammo).toBeLessThan(30);
  });
});
