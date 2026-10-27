import { PlayerBody, box } from './physics';
import { ARENA_SOLIDS, SPAWNS, rayBox } from '../network/arena';
import { IDLE_INPUT, type MatchInput, type ActorState } from '../network/protocol';
import { WEAPONS, spread } from './ballistics';
interface Actor {
  id: string;
  bot: boolean;
  body: PlayerBody;
  input: MatchInput;
  health: number;
  kills: number;
  deaths: number;
  ammo: Record<'primary' | 'secondary', number>;
  nextShot: number;
  reloadUntil: number;
  respawnAt: number;
  lastInput: number;
  heat: number;
  fireHeld: boolean;
  lastWeapon: MatchInput['weapon'];
}
export class Match {
  actors = new Map<string, Actor>();
  time = 0;
  add(id: string, bot = false) {
    if (this.actors.size >= 8 || this.actors.has(id))
      throw new Error('Sala cheia ou conta já conectada.');
    const body = new PlayerBody(ARENA_SOLIDS, SPAWNS[this.actors.size]);
    this.actors.set(id, {
      id,
      bot,
      body,
      input: { ...IDLE_INPUT, yaw: Math.atan2(-body.position.x, -body.position.z) },
      health: 100,
      kills: 0,
      deaths: 0,
      ammo: { primary: 30, secondary: 12 },
      nextShot: 0,
      reloadUntil: 0,
      respawnAt: 0,
      lastInput: this.time,
      heat: 0,
      fireHeld: false,
      lastWeapon: 'primary',
    });
  }
  input(id: string, input: MatchInput) {
    const a = this.actors.get(id);
    if (a) {
      a.input = input;
      a.lastInput = this.time;
    }
  }
  step(dt: number) {
    this.time += dt;
    for (const a of this.actors.values()) {
      if (a.health <= 0) {
        if (this.time >= a.respawnAt) {
          const spawn = SPAWNS.reduce((best, p) => {
            const score = (q: typeof p) =>
              Math.min(
                ...[...this.actors.values()]
                  .filter((b) => b !== a && b.health > 0)
                  .map((b) => Math.hypot(q.x - b.body.position.x, q.z - b.body.position.z)),
              );
            return score(p) > score(best) ? p : best;
          }, SPAWNS[0]);
          a.body = new PlayerBody(ARENA_SOLIDS, spawn);
          a.health = 100;
          a.ammo = { primary: 30, secondary: 12 };
          a.reloadUntil = 0;
          a.input = { ...IDLE_INPUT, yaw: Math.atan2(-spawn.x, -spawn.z) };
          a.fireHeld = false;
          a.nextShot = this.time + 1;
        }
        continue;
      }
      if (a.bot) {
        const enemies = [...this.actors.values()].filter((b) => b !== a && b.health > 0);
        const target = enemies.sort(
          (b, c) =>
            Math.hypot(
              b.body.position.x - a.body.position.x,
              b.body.position.z - a.body.position.z,
            ) -
            Math.hypot(
              c.body.position.x - a.body.position.x,
              c.body.position.z - a.body.position.z,
            ),
        )[0];
        if (target) {
          const dx = target.body.position.x - a.body.position.x,
            dz = target.body.position.z - a.body.position.z;
          const distance = Math.hypot(dx, dz);
          a.input = {
            ...IDLE_INPUT,
            yaw: Math.atan2(dx, dz),
            pitch: Math.atan2(
              a.body.position.y + a.body.eyeHeight - target.body.position.y - target.body.eyeHeight,
              distance,
            ),
            forward: distance > 7 ? 0.7 : 0,
            right: Math.sin(this.time + a.id.length) > 0 ? 0.5 : -0.5,
            fire: true,
          };
        }
      } else if (this.time - a.lastInput > 0.3)
        a.input = { ...a.input, forward: 0, right: 0, fire: false, jump: false };
      a.body.step(a.input, a.input.yaw, dt);
      a.heat = Math.max(0, a.heat - dt * 4);
      const spec = WEAPONS[a.input.weapon];
      if (a.lastWeapon !== a.input.weapon) {
        a.reloadUntil = 0;
        a.nextShot = Math.max(a.nextShot, this.time + 0.25);
        a.lastWeapon = a.input.weapon;
      }
      if (a.reloadUntil && this.time >= a.reloadUntil) {
        a.ammo[a.input.weapon] = spec.capacity;
        a.reloadUntil = 0;
      }
      if (
        (a.input.reload || a.ammo[a.input.weapon] === 0) &&
        !a.reloadUntil &&
        a.ammo[a.input.weapon] < spec.capacity
      )
        a.reloadUntil = this.time + spec.reload;
      const pressed = a.input.fire && !a.fireHeld;
      a.fireHeld = a.input.fire;
      if (!a.input.fire || (!spec.automatic && !pressed) || a.reloadUntil || this.time < a.nextShot)
        continue;
      a.nextShot = this.time + (a.bot ? 0.65 : spec.interval);
      a.ammo[a.input.weapon]--;
      a.heat = Math.min(6, a.heat + 1);
      const angle =
        spread(a.body.moving, a.body.grounded, a.body.stance, a.heat) + (a.bot ? 0.07 : 0);
      const yaw = a.input.yaw + (Math.random() - 0.5) * angle,
        pitch = a.input.pitch + (Math.random() - 0.5) * angle;
      const dir = {
        x: Math.sin(yaw) * Math.cos(pitch),
        y: -Math.sin(pitch),
        z: Math.cos(yaw) * Math.cos(pitch),
      };
      const origin = { ...a.body.position, y: a.body.position.y + a.body.eyeHeight };
      let nearest = Math.min(...ARENA_SOLIDS.map((s) => rayBox(origin, dir, s)));
      let victim: Actor | undefined;
      for (const b of this.actors.values()) {
        if (b === a || b.health <= 0) continue;
        const p = b.body.position;
        const distance = rayBox(
          origin,
          dir,
          box(p.x, p.y + b.body.height / 2, p.z, 0.65, b.body.height, 0.65),
        );
        if (distance < nearest) {
          nearest = distance;
          victim = b;
        }
      }
      if (victim) {
        victim.health = Math.max(0, victim.health - (a.input.weapon === 'primary' ? 25 : 34));
        if (!victim.health) {
          a.kills++;
          victim.deaths++;
          victim.respawnAt = this.time + 3;
        }
      }
    }
  }
  snapshot(): ActorState[] {
    return [...this.actors.values()].map((a) => ({
      id: a.id,
      bot: a.bot,
      position: { ...a.body.position },
      yaw: a.input.yaw,
      stance: a.body.stance,
      health: a.health,
      kills: a.kills,
      deaths: a.deaths,
      ammo: a.ammo[a.input.weapon],
      weapon: a.input.weapon,
    }));
  }
}
