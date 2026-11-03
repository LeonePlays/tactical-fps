import { describe, expect, it } from 'vitest';
import {
  box,
  HEIGHT,
  PlayerBody,
  SPEED,
  type MovementInput,
  type Solid,
} from '../src/game/physics';

const idle: MovementInput = {
  forward: 0,
  right: 0,
  sprint: false,
  jump: false,
  stance: 'standing',
};
const ground = box(0, -0.5, 0, 100, 1, 100);
function player(extra: Solid[] = []) {
  const body = new PlayerBody([ground, ...extra], { x: 0, y: 0, z: 0 });
  body.step(idle, 0, 1 / 60);
  return body;
}
function advance(body: PlayerBody, input: Partial<MovementInput>, seconds = 1, yaw = 0) {
  for (let i = 0; i < Math.round(seconds * 120); i++)
    body.step({ ...idle, ...input }, yaw, 1 / 120);
}

describe('desktop FPS kinematic movement', () => {
  it('falls onto the floor without penetration or accumulated velocity', () => {
    const body = new PlayerBody([ground], { x: 0, y: 4, z: 0 });
    advance(body, {}, 2);
    expect(body.position.y).toBeCloseTo(0, 5);
    expect(body.grounded).toBe(true);
    expect(body.velocityY).toBe(0);
  });
  it('moves relative to yaw and normalizes diagonal speed', () => {
    const straight = player();
    const diagonal = player();
    const rotated = player();
    advance(straight, { forward: 1 });
    advance(diagonal, { forward: 1, right: 1 });
    advance(rotated, { forward: 1 }, 1, Math.PI / 2);
    expect(straight.speed).toBeCloseTo(SPEED.run);
    expect(straight.position.z).toBeGreaterThan(SPEED.run - 1.2);
    expect(Math.hypot(diagonal.position.x, diagonal.position.z)).toBeCloseTo(straight.position.z);
    expect(rotated.position.x).toBeCloseTo(straight.position.z);
    expect(rotated.position.z).toBeCloseTo(0);
  });
  it('walks with Shift and limits crouch/prone top speeds', () => {
    const sprint = player();
    const backwards = player();
    const crouch = player();
    const prone = player();
    advance(sprint, { forward: 1, sprint: true });
    advance(backwards, { forward: -1, sprint: true });
    advance(crouch, { forward: 1, sprint: true, stance: 'crouching' });
    advance(prone, { forward: 1, sprint: true, stance: 'prone' });
    expect(sprint.speed).toBeCloseTo(SPEED.walk);
    expect(backwards.velocityZ).toBeCloseTo(-SPEED.walk);
    expect(crouch.speed).toBeCloseTo(SPEED.crouching);
    expect(prone.speed).toBeCloseTo(SPEED.prone);
  });
  it('jumps, lands, and requires release before jumping again', () => {
    const body = player();
    advance(body, { jump: true }, 0.2);
    expect(body.position.y).toBeGreaterThan(0.8);
    advance(body, { jump: true }, 1);
    expect(body.grounded).toBe(true);
    expect(body.position.y).toBeCloseTo(0);
    advance(body, {}, 0.1);
    advance(body, { jump: true }, 0.1);
    expect(body.grounded).toBe(false);
  });
  it('does not jump while prone', () => {
    const body = player();
    advance(body, { stance: 'prone', jump: true }, 0.2);
    expect(body.position.y).toBeCloseTo(0);
    expect(body.grounded).toBe(true);
  });
  it('collides with thin walls at run speed during slow frames', () => {
    const body = player([box(0, 1, 2, 20, 2, 0.05)]);
    for (let i = 0; i < 20; i++) body.step({ ...idle, forward: 1 }, 0, 0.1);
    expect(body.position.z).toBeCloseTo(1.675, 4);
    expect(body.position.y).toBe(0);
  });
  it('slides along walls instead of freezing diagonal movement', () => {
    const body = player([box(1, 1, 0, 0.2, 2, 30)]);
    advance(body, { forward: 1, right: 1 });
    expect(body.position.x).toBeCloseTo(0.6);
    expect(body.position.z).toBeGreaterThan(1.3);
  });
  it('blocks standing under a low ceiling, then permits it after exiting', () => {
    const body = player([box(0, 1.5, 2, 4, 0.5, 2)]);
    advance(body, { forward: 1, stance: 'crouching' }, 1);
    expect(body.position.z).toBeGreaterThan(1.3);
    expect(body.canUseStance('standing')).toBe(false);
    advance(body, { stance: 'standing' }, 0.1);
    expect(body.stance).toBe('crouching');
    advance(body, { forward: 1, stance: 'crouching' }, 1);
    advance(body, { stance: 'standing' }, 0.1);
    expect(body.stance).toBe('standing');
    expect(body.height).toBe(HEIGHT.standing);
  });
  it('requires prone stance to traverse the lower maintenance passage', () => {
    const body = player([box(0, 0.85, 2, 4, 0.4, 2)]);
    advance(body, { forward: 1, stance: 'crouching' }, 1);
    expect(body.position.z).toBeLessThan(1);
    advance(body, { forward: 1, stance: 'prone' }, 3);
    expect(body.position.z).toBeGreaterThan(3.3);
  });
  it('can land on and leave jumpable cover', () => {
    const body = player([box(0, 0.4, 3.5, 2, 0.8, 5)]);
    body.position.z = -2;
    advance(body, { forward: 1 }, 0.3);
    advance(body, { forward: 1, jump: true }, 0.5);
    advance(body, {}, 0.5);
    expect(body.position.y).toBeCloseTo(0.8);
    expect(body.grounded).toBe(true);
    advance(body, { right: 1 }, 1);
    advance(body, {}, 1);
    expect(body.position.y).toBeCloseTo(0);
  });
});

describe('classic acceleration and air control', () => {
  it('accelerates over time and retains velocity when input is released', () => {
    const body = player();
    advance(body, { forward: 1 }, 0.05);
    expect(body.speed).toBeGreaterThan(0);
    expect(body.speed).toBeLessThan(SPEED.run);
    advance(body, { forward: 1 }, 0.5);
    const before = body.position.z;
    advance(body, {}, 0.05);
    expect(body.speed).toBeGreaterThan(0);
    expect(body.position.z).toBeGreaterThan(before);
    advance(body, {}, 1);
    expect(body.speed).toBe(0);
  });
  it('counter-strafing brakes faster than releasing the direction', () => {
    const released = player(),
      counter = player();
    advance(released, { right: 1 });
    advance(counter, { right: 1 });
    advance(released, {}, 0.12);
    advance(counter, { right: -1 }, 0.12);
    expect(counter.speed).toBeLessThan(released.speed * 0.3);
  });
  it('keeps horizontal momentum in air and permits bounded directional air-strafing', () => {
    const body = player();
    advance(body, { forward: 1 }, 0.5);
    const initial = body.speed;
    advance(body, { jump: true }, 0.1);
    expect(body.grounded).toBe(false);
    expect(body.velocityZ).toBeCloseTo(initial);
    advance(body, { right: 1 }, 0.1);
    expect(body.velocityX).toBeGreaterThan(0.5);
    expect(body.velocityZ).toBeCloseTo(initial);
    expect(body.speed).toBeGreaterThan(initial);
    expect(body.speed).toBeLessThan(initial + 1);
  });
  it('has comparable displacement at 30 and 144 Hz and clears velocity into walls', () => {
    const low = player(),
      high = player();
    for (let i = 0; i < 30; i++) low.step({ ...idle, forward: 1 }, 0, 1 / 30);
    for (let i = 0; i < 144; i++) high.step({ ...idle, forward: 1 }, 0, 1 / 144);
    expect(Math.abs(low.position.z - high.position.z)).toBeLessThan(0.04);
    const body = player([box(0, 1, 2, 10, 2, 0.1)]);
    advance(body, { forward: 1 }, 1);
    expect(body.velocityZ).toBe(0);
    expect(body.position.z).toBeCloseTo(1.65);
  });
});
