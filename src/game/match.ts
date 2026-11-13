import { RoundController, type Team } from './rounds';
import {
  normalizeMatchConfig,
  playerName,
  type MatchConfig,
  type MatchMode,
  type TeamPreference,
} from './match-config';
import { getMap, type MapDefinition } from './maps';
import {
  EquipmentInventory,
  meleeTarget,
  stepGrenade,
  blastHits,
  type GrenadeProjectile,
} from './equipment';
import { botDecision } from './navigation';
import { PlayerBody, box, type Vec3 } from './physics';
import { rayBox } from '../network/arena';
import { IDLE_INPUT, type MatchInput, type ActorState } from '../network/protocol';
import { WeaponController } from './weapons';
import { seedFor } from './ballistics';
import { buy, damageWithArmor } from './shop';
interface Actor {
  name: string;
  spawnSlot: number;
  aiState: string;
  botShotInterval: number;
  team: Team;
  equipment: EquipmentInventory;
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
  readonly rounds: RoundController;
  readonly config: MatchConfig;
  readonly map: MapDefinition;
  readonly mode: MatchMode;
  private matchId = 1;
  private projectiles: { id: string; owner: string; team: Team; projectile: GrenadeProjectile }[] =
    [];
  private projectileSequence = 0;
  constructor(options: MatchMode | Partial<MatchConfig> = 'deathmatch') {
    const raw = typeof options === 'string' ? { mode: options } : options;
    const config = normalizeMatchConfig(raw);
    if (config.mode === 'defuse') {
      if (raw.timeLimit === undefined) config.timeLimit = 90;
      if (raw.scoreLimit === undefined) config.scoreLimit = 3;
    }
    this.config = Object.freeze(config);
    this.mode = config.mode;
    this.map = getMap(config.map);
    this.rounds = new RoundController(config.mode, {
      timeLimit: config.timeLimit,
      scoreLimit: config.scoreLimit,
      bombSite: this.map.bombSite,
    });
  }
  private resetActor(a: Actor, position: Vec3) {
    a.spawn = { ...position };
    a.body = new PlayerBody(this.map.solids, position);
    a.health = 100;
    a.armor = 0;
    a.gun = new WeaponController(seedFor(a.id) + a.deaths, this.mode !== 'defuse' || a.bot);
    a.gun.resetTrigger(a.input.fireSequence);
    a.equipment.reset(a.input.fireSequence);
    a.input = {
      ...IDLE_INPUT,
      fireSequence: a.input.fireSequence,
      reloadSequence: a.reloadSequence,
      buySequence: a.buySequence,
      weapon: a.gun.slot,
      yaw: Math.atan2(-position.x, -position.z),
    };
    a.buyEndsAt = this.time + 90;
    a.buyMessage = '';
    a.nextBotShot = this.time + 1;
    a.respawnAt = 0;
    a.lastInput = this.time;
    a.aiState = 'patrol';
  }
  private hurt(
    attacker: Actor | undefined,
    victim: Actor,
    damage: number,
    sourceTeam = attacker?.team,
  ) {
    if (victim.health <= 0) return;
    if (this.mode !== 'deathmatch' && attacker !== victim && sourceTeam === victim.team) return;
    victim.health = Math.max(0, victim.health - damageWithArmor(victim, damage));
    if (!victim.health) {
      if (attacker && attacker !== victim) {
        attacker.kills++;
        attacker.money = Math.min(16000, attacker.money + 300);
      }
      if (sourceTeam && sourceTeam !== victim.team) this.rounds.recordKill(sourceTeam);
      victim.deaths++;
      victim.respawnAt = this.time + 3;
    }
  }
  state() {
    return {
      config: { ...this.config },
      matchId: this.matchId,
      rounds: this.rounds.snapshot(),
      grenades: this.projectiles.map((g) => ({
        id: g.id,
        owner: g.owner,
        position: { ...g.projectile.position },
        remaining: g.projectile.remaining,
      })),
    };
  }

  add(id: string, bot = false, preference: TeamPreference = 'auto', name?: string) {
    if (this.actors.size >= 8 || this.actors.has(id))
      throw new Error('Sala cheia ou conta já conectada.');
    const counts = { alpha: 0, bravo: 0 };
    for (const actor of this.actors.values()) counts[actor.team]++;
    const team: Team =
      preference !== 'auto' &&
      counts[preference] <= counts[preference === 'alpha' ? 'bravo' : 'alpha']
        ? preference
        : counts.alpha <= counts.bravo
          ? 'alpha'
          : 'bravo';
    const free = this.map.spawns
      .map((_, i) => i)
      .filter((i) => ![...this.actors.values()].some((a) => a.spawnSlot === i));
    const available = free.filter((i) => i % 2 === (team === 'alpha' ? 0 : 1));
    const safe = (i: number) =>
      ![...this.actors.values()].some(
        (a) =>
          a.health > 0 &&
          Math.hypot(
            a.body.position.x - this.map.spawns[i].x,
            a.body.position.z - this.map.spawns[i].z,
          ) < 0.8,
      );
    const spawnSlot = available.find(safe) ?? free.find(safe) ?? available[0] ?? free[0];
    const spawn = { ...this.map.spawns[spawnSlot] },
      body = new PlayerBody(this.map.solids, spawn),
      gun = new WeaponController(seedFor(id), this.mode !== 'defuse' || bot);
    this.actors.set(id, {
      id,
      name: playerName(
        name,
        bot ? `BOT ${[...this.actors.values()].filter((a) => a.bot).length + 1}` : 'Visitante',
      ),
      spawnSlot,
      aiState: 'patrol',
      botShotInterval: 0.65,
      team,
      equipment: new EquipmentInventory(),
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
      ['active', 'freeze'].includes(this.rounds.snapshot().phase) &&
      this.time <= a.buyEndsAt &&
      Math.hypot(a.body.position.x - a.spawn.x, a.body.position.z - a.spawn.z) <= 6
    );
  }
  /** Reset a completed match without replacing its connected roster or command counters. */
  restart() {
    this.matchId++;
    this.rounds.restart();
    this.projectiles = [];
    for (const a of this.actors.values()) {
      a.kills = 0;
      a.deaths = 0;
      a.hits = 0;
      a.shots = 0;
      a.money = 4000;
      this.resetActor(a, this.teamSpawn(a));
    }
  }
  private teamSpawn(a: Actor): Vec3 {
    return this.map.spawns[a.spawnSlot];
  }
  step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.rounds.snapshot().phase === 'match-over') return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const phase = this.rounds.snapshot().phase;
    const combat = phase === 'active';
    for (const a of this.actors.values()) {
      if (a.health <= 0) {
        if (this.mode !== 'defuse' && combat && this.time >= a.respawnAt) {
          const score = (p: Vec3) =>
            Math.min(
              ...[...this.actors.values()]
                .filter(
                  (b) =>
                    b !== a && b.health > 0 && (this.mode === 'deathmatch' || a.team !== b.team),
                )
                .map((b) => Math.hypot(p.x - b.body.position.x, p.z - b.body.position.z)),
            );
          const teamSpawns =
            this.mode === 'team-deathmatch'
              ? this.map.spawns.filter((_, i) => i % 2 === (a.team === 'alpha' ? 0 : 1))
              : this.map.spawns;
          const unoccupied = (p: Vec3) =>
            ![...this.actors.values()].some(
              (b) =>
                b !== a &&
                b.health > 0 &&
                Math.hypot(p.x - b.body.position.x, p.z - b.body.position.z) < 0.8,
            );
          const candidates = teamSpawns.filter((p) => unoccupied(p));
          const alternate = candidates.length ? candidates : this.map.spawns.filter(unoccupied);
          const spawns = alternate.length ? alternate : teamSpawns;
          const spawn = spawns.reduce((best, p) => (score(p) > score(best) ? p : best), spawns[0]);
          this.resetActor(a, spawn);
        }
        continue;
      }
      if (a.bot && combat) {
        const candidates = [...this.actors.values()].filter(
          (b) => b !== a && b.health > 0 && (this.mode === 'deathmatch' || a.team !== b.team),
        );
        const round = this.rounds.snapshot();
        const objective =
          this.mode === 'defuse'
            ? round.bomb?.status === 'planted'
              ? round.bomb.position
              : round.bomb?.carrierId === a.id
                ? this.map.bombSite
                : round.bomb?.status === 'dropped'
                  ? round.bomb.position
                  : undefined
            : undefined;
        const decision = botDecision(a.body, candidates, a.id, this.time, objective, {
          map: this.map,
          difficulty: this.config.difficulty,
          health: a.health,
          role:
            this.mode === 'defuse'
              ? round.bomb?.status === 'planted' && a.team === 'bravo'
                ? 'defuse'
                : round.bomb?.carrierId === a.id
                  ? 'plant'
                  : 'support'
              : 'support',
          allies:
            this.mode === 'deathmatch'
              ? []
              : [...this.actors.values()].filter(
                  (b) => b !== a && b.team === a.team && b.health > 0,
                ),
        });
        a.aiState = decision.state;
        a.botShotInterval = decision.shotInterval;
        a.input = {
          ...IDLE_INPUT,
          yaw: decision.yaw - a.gun.recoil.yaw * decision.recoilControl,
          pitch: decision.pitch - a.gun.recoil.pitch * decision.recoilControl,
          forward: decision.forward,
          right: decision.right,
          fire: decision.fire && this.time >= a.nextBotShot,
          weapon: 'primary',
        };
      } else if (a.bot) {
        // A frozen actor must not advance perception/reaction or stuck recovery.
        a.input = { ...IDLE_INPUT, weapon: a.gun.slot, yaw: a.input.yaw, pitch: a.input.pitch };
      } else if (this.time - a.lastInput > 0.3)
        a.input = {
          ...a.input,
          forward: 0,
          right: 0,
          fire: false,
          jump: false,
          reload: false,
          interact: false,
        };
      if (a.bot && combat && this.mode === 'defuse') {
        const bomb = this.rounds.snapshot().bomb;
        const objective =
          bomb?.status === 'planted' && a.team === 'bravo'
            ? bomb.position
            : bomb?.carrierId === a.id
              ? this.map.bombSite
              : bomb?.status === 'dropped' && a.team === 'alpha'
                ? bomb.position
                : null;
        if (
          objective &&
          Math.hypot(a.body.position.x - objective.x, a.body.position.z - objective.z) < 1.4
        ) {
          a.input = { ...a.input, forward: 0, right: 0, interact: true, fire: false };
        }
      }
      a.body.step(
        combat ? a.input : { ...a.input, forward: 0, right: 0, jump: false },
        a.input.yaw,
        dt,
      );
      if (a.input.buyItem && a.input.buySequence > a.buySequence) {
        a.buySequence = a.input.buySequence;
        a.buyMessage = buy(a.gun, a, a.input.buyItem, this.canBuy(a), a.equipment);
      }
      a.gun.switch(a.input.weapon, this.time);
      a.gun.update(this.time, dt);
      const reloadPressed = a.input.reloadSequence > a.reloadSequence;
      a.reloadSequence = a.input.reloadSequence;
      if (reloadPressed || a.input.reload || a.gun.ammo === 0) a.gun.reload(this.time);
      if (!combat) {
        a.gun.resetTrigger(a.input.fireSequence);
        a.equipment.observe(a.input.fireSequence);
        continue;
      }
      const origin = { ...a.body.position, y: a.body.position.y + a.body.eyeHeight };
      const direction = {
        x: Math.sin(a.input.yaw) * Math.cos(a.input.pitch),
        y: -Math.sin(a.input.pitch),
        z: Math.cos(a.input.yaw) * Math.cos(a.input.pitch),
      };
      if (a.input.tool === 'knife') {
        a.gun.resetTrigger(a.input.fireSequence);
        if (a.equipment.swing(this.time, a.input.fireSequence)) {
          const id = meleeTarget(
            origin,
            direction,
            this.map.solids,
            [...this.actors.values()]
              .filter((b) => b !== a)
              .map((b) => ({
                id: b.id,
                position: b.body.position,
                height: b.body.height,
                alive: b.health > 0,
              })),
          );
          const victim = id ? this.actors.get(id) : undefined;
          if (victim) this.hurt(a, victim, 45);
        }
        continue;
      }
      if (a.input.tool === 'grenade') {
        a.gun.resetTrigger(a.input.fireSequence);
        const projectile = a.equipment.throw(
          this.time,
          a.input.fireSequence,
          origin,
          direction,
          this.map.solids,
        );
        if (projectile)
          this.projectiles.push({
            id: String(++this.projectileSequence),
            owner: a.id,
            team: a.team,
            projectile,
          });
        continue;
      }
      a.equipment.observe(a.input.fireSequence);
      const shot = a.gun.fire(this.time, a.input.fire, a.input.fireSequence, a.input, {
        speed: a.body.speed,
        grounded: a.body.grounded,
        stance: a.body.stance,
      });
      if (!shot) continue;
      a.shots++;
      if (a.bot) a.nextBotShot = this.time + a.botShotInterval;
      const dir = shot.direction;
      let nearest = Math.min(...this.map.solids.map((s) => rayBox(origin, dir, s))),
        victim: Actor | undefined;
      for (const b of this.actors.values()) {
        if (b === a || b.health <= 0 || (this.mode !== 'deathmatch' && a.team === b.team)) continue;
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
        this.hurt(a, victim, shot.damage);
      }
    }
    if (combat)
      for (const grenade of this.projectiles) {
        const explosion = stepGrenade(grenade.projectile, dt, this.map.solids);
        if (explosion) {
          const hits = blastHits(
            explosion,
            [...this.actors.values()].map((a) => ({
              id: a.id,
              position: a.body.position,
              height: a.body.height,
              alive: a.health > 0,
            })),
            this.map.solids,
          );
          for (const hit of hits) {
            const victim = this.actors.get(hit.id);
            if (victim) this.hurt(this.actors.get(grenade.owner), victim, hit.damage, grenade.team);
          }
        }
      }
    this.projectiles = this.projectiles.filter((g) => !g.projectile.detonated);
    const event = this.rounds.step(
      dt,
      [...this.actors.values()].map((a) => ({
        id: a.id,
        team: a.team,
        health: a.health,
        kills: a.kills,
        position: a.body.position,
      })),
      [...this.actors.values()].filter((a) => a.input.interact && a.health > 0).map((a) => a.id),
    );
    const bomb = this.rounds.snapshot().bomb;
    if (event.roundEnded && bomb?.status === 'exploded') {
      for (const hit of blastHits(
        { position: { ...bomb.position, y: bomb.position.y + 0.2 }, radius: 9, damage: 180 },
        [...this.actors.values()].map((a) => ({
          id: a.id,
          position: a.body.position,
          height: a.body.height,
          alive: a.health > 0,
        })),
        this.map.solids,
      )) {
        const victim = this.actors.get(hit.id);
        if (victim) this.hurt(undefined, victim, hit.damage);
      }
    }
    if (event.newRound) {
      this.projectiles = [];
      for (const a of this.actors.values()) {
        a.money = Math.min(16000, a.money + 2000);
        this.resetActor(a, this.teamSpawn(a));
      }
    }
  }
  snapshot(): ActorState[] {
    return [...this.actors.values()].map((a) => ({
      id: a.id,
      name: a.name,
      pitch: a.input.pitch,
      tool: a.input.tool,
      ...(a.bot ? { aiState: a.aiState } : {}),
      team: a.team,
      grenades: a.equipment.grenades,
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
