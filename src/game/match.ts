import { PlayerBody, box, type Vec3 } from './physics';
import { ARENA_SOLIDS, SPAWNS, rayBox } from '../network/arena';
import { IDLE_INPUT, type MatchInput, type ActorState } from '../network/protocol';
import { WeaponController } from './weapons';
import { seedFor } from './ballistics';
import { buy, damageWithArmor } from './shop';
interface Actor {
  id: string;
  bot: boolean;
  body: PlayerBody;
  input: MatchInput;
  health: number;
  armor: number;
  money: number;
  kills: number;
  deaths: number;
  hits: number;
  shots: number;
  gun: WeaponController;
  respawnAt: number;
  lastInput: number;
  nextBotShot: number;
  reloadSequence: number;
  spawn: Vec3;
  buyEndsAt: number;
  buySequence: number;
  buyMessage: string;
}
export class Match {
  actors = new Map<string, Actor>();
  time = 0;
  add(id: string, bot = false) {
    if (this.actors.size >= 8 || this.actors.has(id))
      throw new Error('Sala cheia ou conta já conectada.');
    const spawn = { ...SPAWNS[this.actors.size] },
      body = new PlayerBody(ARENA_SOLIDS, spawn),
      gun = new WeaponController(seedFor(id), bot);
    this.actors.set(id, {
      id,
      bot,
      body,
      gun,
      input: { ...IDLE_INPUT, weapon: gun.slot, yaw: Math.atan2(-spawn.x, -spawn.z) },
      health: 100,
      armor: 0,
      money: 4000,
      kills: 0,
      deaths: 0,
      hits: 0,
      shots: 0,
      respawnAt: 0,
      lastInput: this.time,
      nextBotShot: 0,
      reloadSequence: 0,
      spawn,
      buyEndsAt: this.time + 90,
      buySequence: 0,
      buyMessage: '',
    });
  }
  input(id: string, input: MatchInput) {
    const actor = this.actors.get(id);
    if (actor) {
      actor.input = input;
      actor.lastInput = this.time;
    }
  }
  private canBuy(a: Actor) {
    return (
      a.health > 0 &&
      this.time <= a.buyEndsAt &&
      Math.hypot(a.body.position.x - a.spawn.x, a.body.position.z - a.spawn.z) <= 6
    );
  }
  step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    for (const a of this.actors.values()) {
      if (a.health <= 0) {
        if (this.time >= a.respawnAt) {
          const score = (p: Vec3) =>
            Math.min(
              ...[...this.actors.values()]
                .filter((b) => b !== a && b.health > 0)
                .map((b) => Math.hypot(p.x - b.body.position.x, p.z - b.body.position.z)),
            );
          const spawn = SPAWNS.reduce((best, p) => (score(p) > score(best) ? p : best), SPAWNS[0]);
          a.spawn = { ...spawn };
          a.body = new PlayerBody(ARENA_SOLIDS, spawn);
          a.health = 100;
          a.armor = 0;
          a.gun = new WeaponController(seedFor(a.id) + a.deaths, a.bot);
          a.gun.resetTrigger(a.input.fireSequence);
          a.input = { ...IDLE_INPUT, weapon: a.gun.slot, yaw: Math.atan2(-spawn.x, -spawn.z) };
          a.buyEndsAt = this.time + 90;
          a.buyMessage = '';
          a.nextBotShot = this.time + 1;
        }
        continue;
      }
      if (a.bot) {
        let target: Actor | undefined,
          distance = Infinity;
        for (const b of this.actors.values()) {
          if (b === a || b.health <= 0) continue;
          const d = Math.hypot(
            b.body.position.x - a.body.position.x,
            b.body.position.z - a.body.position.z,
          );
          if (d < distance) {
            distance = d;
            target = b;
          }
        }
        if (target) {
          const dx = target.body.position.x - a.body.position.x,
            dz = target.body.position.z - a.body.position.z;
          a.input = {
            ...IDLE_INPUT,
            yaw: Math.atan2(dx, dz) - a.gun.recoil.yaw,
            pitch:
              Math.atan2(
                a.body.position.y +
                  a.body.eyeHeight -
                  target.body.position.y -
                  target.body.eyeHeight,
                distance,
              ) - a.gun.recoil.pitch,
            forward: distance > 7 ? 0.7 : 0,
            right: Math.sin(this.time + a.id.length) > 0 ? 0.5 : -0.5,
            fire: this.time >= a.nextBotShot,
            weapon: 'primary',
          };
        }
      } else if (this.time - a.lastInput > 0.3)
        a.input = { ...a.input, forward: 0, right: 0, fire: false, jump: false, reload: false };
      a.body.step(a.input, a.input.yaw, dt);
      if (a.input.buyItem && a.input.buySequence > a.buySequence) {
        a.buySequence = a.input.buySequence;
        a.buyMessage = buy(a.gun, a, a.input.buyItem, this.canBuy(a));
      }
      a.gun.switch(a.input.weapon, this.time);
      a.gun.update(this.time, dt);
      const reloadPressed = a.input.reloadSequence > a.reloadSequence;
      a.reloadSequence = a.input.reloadSequence;
      if (reloadPressed || a.input.reload || a.gun.ammo === 0) a.gun.reload(this.time);
      const shot = a.gun.fire(this.time, a.input.fire, a.input.fireSequence, a.input, {
        speed: a.body.speed,
        grounded: a.body.grounded,
        stance: a.body.stance,
      });
      if (!shot) continue;
      a.shots++;
      if (a.bot) a.nextBotShot = this.time + 0.65;
      const origin = { ...a.body.position, y: a.body.position.y + a.body.eyeHeight },
        dir = shot.direction;
      let nearest = Math.min(...ARENA_SOLIDS.map((s) => rayBox(origin, dir, s))),
        victim: Actor | undefined;
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
        a.hits++;
        victim.health = Math.max(0, victim.health - damageWithArmor(victim, shot.damage));
        if (!victim.health) {
          a.kills++;
          a.money = Math.min(16000, a.money + 300);
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
      velocity: { x: a.body.velocityX, y: a.body.velocityY, z: a.body.velocityZ },
      grounded: a.body.grounded,
      yaw: a.input.yaw,
      stance: a.body.stance,
      health: a.health,
      armor: a.armor,
      money: a.money,
      buyAllowed: this.canBuy(a),
      buyMessage: a.buyMessage,
      buySequence: a.buySequence,
      weaponState: a.gun.snapshot(this.time),
      kills: a.kills,
      deaths: a.deaths,
      shots: a.shots,
      hits: a.hits,
      ammo: a.gun.ammo,
      weapon: a.gun.slot,
    }));
  }
}
