/** Pure match rules, shared by local practice and the authoritative server. */
import type { MatchMode } from './match-config';
export type { MatchMode } from './match-config';
export type Team = 'alpha' | 'bravo';
export type RoundPhase = 'freeze' | 'active' | 'round-over' | 'match-over';
export interface RoundPosition {
  x: number;
  y?: number;
  z: number;
}
export interface RoundActor {
  id: string;
  team: Team;
  health: number;
  kills: number;
  position: RoundPosition;
}
export const BOMB_SITE = Object.freeze({ x: 0, y: 0, z: 10 });
export const ROUND_RULES = Object.freeze({
  deathmatchSeconds: 180,
  killLimit: 10,
  freezeSeconds: 5,
  roundSeconds: 90,
  intermissionSeconds: 5,
  roundsToWin: 3,
  plantSeconds: 3,
  defuseSeconds: 5,
  fuseSeconds: 35,
  siteRadius: 2.5,
  defuseRadius: 2,
  pickupRadius: 1.5,
});
export interface BombSnapshot {
  status: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
  carrierId: string | null;
  position: { x: number; y: number; z: number };
  remaining: number;
}
export interface RoundInteraction {
  actorId: string;
  action: 'plant' | 'defuse';
  progress: number;
  duration: number;
}
export interface RoundSnapshot {
  mode: MatchMode;
  phase: RoundPhase;
  round: number;
  scores: Record<Team, number>;
  remaining: number;
  winner: Team | null;
  winnerId: string | null;
  reason: string;
  bomb: BombSnapshot | null;
  interaction: RoundInteraction | null;
}
export interface RoundEvents {
  /** Entered a fresh round; respawn/reset actors before the next step. */
  newRound: boolean;
  /** An outcome was reached; stop combat while showing the result. */
  roundEnded: boolean;
  /** Final result reached; leave it visible until restart(). */
  matchEnded: boolean;
}
export interface RoundOptions {
  /** Session duration for deathmatch; active round duration for defuse. */
  timeLimit?: number;
  /** Eliminations for deathmatch; rounds to win for defuse. */
  scoreLimit?: number;
  bombSite?: RoundPosition;
}
const EPSILON = 1e-7;
const distance = (a: RoundPosition, b: RoundPosition) => Math.hypot(a.x - b.x, a.z - b.z);
const position = (p: RoundPosition) => ({ x: p.x, y: p.y ?? 0, z: p.z });

/**
 * Call after combat with an authoritative roster and IDs currently holding E.
 * The host pauses time by not calling step. Use ordinary simulation ticks
 * (e.g. 0.05 s). Phase changes return before the next round's combat so the
 * host has an opportunity to respawn actors. No health/economy is mutated here.
 */
export class RoundController {
  private phase: RoundPhase = 'active';
  private round = 1;
  private scores: Record<Team, number> = { alpha: 0, bravo: 0 };
  private remaining: number = ROUND_RULES.deathmatchSeconds;
  private winner: Team | null = null;
  private winnerId: string | null = null;
  private reason = '';
  private bomb: BombSnapshot | null = null;
  private interaction: (RoundInteraction & { anchor: RoundPosition }) | null = null;
  private readonly seenTeams = new Set<Team>();
  readonly timeLimit: number;
  readonly scoreLimit: number;
  readonly bombSite: { x: number; y: number; z: number };
  constructor(
    readonly mode: MatchMode = 'deathmatch',
    options: RoundOptions = {},
  ) {
    const duration = options.timeLimit;
    const limit = options.scoreLimit;
    this.timeLimit =
      typeof duration === 'number' && Number.isFinite(duration) && duration > 0
        ? duration
        : mode === 'defuse'
          ? ROUND_RULES.roundSeconds
          : ROUND_RULES.deathmatchSeconds;
    this.scoreLimit =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.floor(limit)
        : mode === 'defuse'
          ? ROUND_RULES.roundsToWin
          : ROUND_RULES.killLimit;
    this.bombSite = position(options.bombSite ?? BOMB_SITE);
    this.restart();
  }

  restart(): void {
    this.phase = this.mode === 'defuse' ? 'freeze' : 'active';
    this.round = 1;
    this.scores = { alpha: 0, bravo: 0 };
    this.seenTeams.clear();
    this.remaining = this.mode === 'defuse' ? ROUND_RULES.freezeSeconds : this.timeLimit;
    this.winner = null;
    this.winnerId = null;
    this.reason = '';
    this.resetBomb();
  }

  /** Record an authoritative enemy kill, retaining team points after disconnects. */
  recordKill(team: Team): void {
    if (this.mode === 'team-deathmatch' && this.phase === 'active') this.scores[team]++;
  }

  /** Only the actual living carrier may release the objective. Pickup still requires E. */
  dropBomb(actorId: string, location: RoundPosition): boolean {
    if (
      !['active', 'freeze'].includes(this.phase) ||
      this.bomb?.status !== 'carried' ||
      this.bomb.carrierId !== actorId
    )
      return false;
    this.bomb.status = 'dropped';
    this.bomb.carrierId = null;
    this.bomb.position = position(location);
    this.interaction = null;
    return true;
  }

  snapshot(): RoundSnapshot {
    return {
      mode: this.mode,
      phase: this.phase,
      round: this.round,
      scores: { ...this.scores },
      remaining: Math.max(
        0,
        this.bomb?.status === 'planted' && this.phase === 'active'
          ? this.bomb.remaining
          : this.remaining,
      ),
      winner: this.winner,
      winnerId: this.winnerId,
      reason: this.reason,
      bomb: this.bomb ? { ...this.bomb, position: { ...this.bomb.position } } : null,
      interaction: this.interaction
        ? {
            actorId: this.interaction.actorId,
            action: this.interaction.action,
            progress: this.interaction.progress,
            duration: this.interaction.duration,
          }
        : null,
    };
  }

  step(
    dt: number,
    actors: readonly RoundActor[],
    interactingIds: readonly string[] = [],
  ): RoundEvents {
    const events: RoundEvents = { newRound: false, roundEnded: false, matchEnded: false };
    if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'match-over') return events;
    if (this.phase === 'round-over') {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining <= EPSILON) {
        if (this.mode !== 'defuse') {
          this.phase = 'match-over';
          events.matchEnded = true;
        } else {
          this.round++;
          this.phase = 'freeze';
          this.remaining = ROUND_RULES.freezeSeconds;
          this.winner = null;
          this.winnerId = null;
          this.reason = '';
          this.resetBomb();
          events.newRound = true;
        }
      }
      return events;
    }
    for (const actor of actors) this.seenTeams.add(actor.team);
    this.syncCarrier(actors);
    if (this.bomb?.status === 'dropped') {
      const picker = actors.find(
        (actor) =>
          actor.team === 'alpha' &&
          actor.health > 0 &&
          interactingIds.includes(actor.id) &&
          distance(actor.position, this.bomb!.position) <= ROUND_RULES.pickupRadius &&
          Math.abs((actor.position.y ?? 0) - this.bomb!.position.y) <= 1,
      );
      if (picker) {
        this.bomb.status = 'carried';
        this.bomb.carrierId = picker.id;
        this.bomb.position = position(picker.position);
      }
    }
    if (this.phase === 'freeze') {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining <= EPSILON) {
        this.phase = 'active';
        this.remaining = this.timeLimit;
      }
      return events;
    }
    if (this.mode === 'team-deathmatch') {
      this.remaining = Math.max(0, this.remaining - dt);
      if (
        Math.max(this.scores.alpha, this.scores.bravo) >= this.scoreLimit ||
        this.remaining <= EPSILON
      ) {
        this.winner =
          this.scores.alpha === this.scores.bravo
            ? null
            : this.scores.alpha > this.scores.bravo
              ? 'alpha'
              : 'bravo';
        this.reason =
          this.winner === null
            ? 'Empate entre equipes.'
            : Math.max(this.scores.alpha, this.scores.bravo) >= this.scoreLimit
              ? 'Limite de eliminações da equipe atingido.'
              : 'Tempo de partida esgotado.';
        this.phase = 'round-over';
        this.remaining = ROUND_RULES.intermissionSeconds;
        events.roundEnded = true;
      }
      return events;
    }
    if (this.mode === 'deathmatch') {
      this.remaining = Math.max(0, this.remaining - dt);
      const highest = Math.max(0, ...actors.map((actor) => actor.kills));
      if (highest >= this.scoreLimit || this.remaining <= EPSILON) {
        const leaders = actors.filter((actor) => actor.kills === highest);
        this.winnerId = leaders.length === 1 ? leaders[0].id : null;
        this.reason =
          leaders.length !== 1
            ? 'Empate.'
            : highest >= this.scoreLimit
              ? 'Limite de eliminações atingido.'
              : 'Tempo de partida esgotado.';
        this.phase = 'round-over';
        this.remaining = ROUND_RULES.intermissionSeconds;
        events.roundEnded = true;
      }
      return events;
    }

    const alpha = actors.filter((actor) => actor.team === 'alpha');
    const bravo = actors.filter((actor) => actor.team === 'bravo');
    // With no planted objective, simultaneous elimination favors defense.
    // Never grant an elimination victory merely because a roster is empty.
    if (
      this.bomb?.status !== 'planted' &&
      this.seenTeams.has('alpha') &&
      alpha.every((actor) => actor.health <= 0)
    ) {
      this.endRound('bravo', 'Atacantes eliminados.', events);
      return events;
    }
    if (this.seenTeams.has('bravo') && bravo.every((actor) => actor.health <= 0)) {
      this.endRound('alpha', 'Defensores eliminados.', events);
      return events;
    }
    if (this.bomb?.status === 'planted') {
      // The fuse wins an exact tie. Defuse must complete before detonation.
      this.bomb.remaining = Math.max(0, this.bomb.remaining - dt);
      if (this.bomb.remaining <= EPSILON) {
        this.bomb.status = 'exploded';
        this.endRound('alpha', 'Bomba detonada.', events);
        return events;
      }
      const valid = bravo.filter(
        (actor) =>
          actor.health > 0 &&
          interactingIds.includes(actor.id) &&
          distance(actor.position, this.bomb!.position) <= ROUND_RULES.defuseRadius &&
          Math.abs((actor.position.y ?? 0) - this.bomb!.position.y) <= 1,
      );
      const current = valid.find((actor) => actor.id === this.interaction?.actorId);
      const actor =
        current ??
        valid.sort(
          (a, b) =>
            distance(a.position, this.bomb!.position) - distance(b.position, this.bomb!.position) ||
            a.id.localeCompare(b.id),
        )[0];
      if (actor && this.advanceInteraction(actor, 'defuse', dt, ROUND_RULES.defuseSeconds)) {
        this.bomb.status = 'defused';
        this.endRound('bravo', 'Bomba desarmada.', events);
      } else if (!actor) this.interaction = null;
      return events;
    }
    this.remaining = Math.max(0, this.remaining - dt);
    // A plant must finish before the unplanted round timer expires.
    if (this.remaining <= EPSILON) {
      this.endRound('bravo', 'Tempo esgotado sem plantio.', events);
      return events;
    }
    const bomb = this.bomb!;
    const carrier = alpha.find((actor) => actor.id === bomb.carrierId && actor.health > 0);
    if (
      carrier &&
      interactingIds.includes(carrier.id) &&
      distance(carrier.position, this.bombSite) <= ROUND_RULES.siteRadius &&
      Math.abs((carrier.position.y ?? 0) - this.bombSite.y) <= 0.2
    ) {
      if (this.advanceInteraction(carrier, 'plant', dt, ROUND_RULES.plantSeconds)) {
        bomb.status = 'planted';
        bomb.position = position(carrier.position);
        bomb.carrierId = null;
        bomb.remaining = ROUND_RULES.fuseSeconds;
        this.interaction = null;
      }
    } else this.interaction = null;
    return events;
  }

  private resetBomb(): void {
    this.bomb =
      this.mode === 'defuse'
        ? { status: 'carried', carrierId: null, position: { ...this.bombSite }, remaining: 0 }
        : null;
    this.interaction = null;
  }
  private syncCarrier(actors: readonly RoundActor[]): void {
    const bomb = this.bomb;
    if (!bomb || bomb.status !== 'carried') return;
    if (!bomb.carrierId)
      bomb.carrierId =
        actors.find((actor) => actor.team === 'alpha' && actor.health > 0)?.id ?? null;
    const carrier = actors.find((actor) => actor.id === bomb.carrierId);
    if (carrier) bomb.position = position(carrier.position);
    if ((carrier && carrier.health <= 0) || (bomb.carrierId && !carrier)) {
      bomb.status = 'dropped';
      bomb.carrierId = null;
      this.interaction = null;
    }
  }
  private advanceInteraction(
    actor: RoundActor,
    action: 'plant' | 'defuse',
    dt: number,
    duration: number,
  ): boolean {
    if (
      !this.interaction ||
      this.interaction.actorId !== actor.id ||
      this.interaction.action !== action ||
      distance(this.interaction.anchor, actor.position) > 0.18 ||
      Math.abs((this.interaction.anchor.y ?? 0) - (actor.position.y ?? 0)) > 0.18
    ) {
      this.interaction = {
        actorId: actor.id,
        action,
        progress: 0,
        duration,
        anchor: { ...actor.position },
      };
    }
    this.interaction.progress = Math.min(duration, this.interaction.progress + dt);
    return this.interaction.progress + EPSILON >= duration;
  }
  private endRound(winner: Team, reason: string, events: RoundEvents): void {
    this.winner = winner;
    this.reason = reason;
    this.scores[winner]++;
    this.interaction = null;
    this.phase = this.scores[winner] >= this.scoreLimit ? 'match-over' : 'round-over';
    this.remaining = this.phase === 'round-over' ? ROUND_RULES.intermissionSeconds : 0;
    events.roundEnded = true;
    events.matchEnded = this.phase === 'match-over';
  }
}
