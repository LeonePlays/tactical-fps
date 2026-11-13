import {
  DEFAULT_MATCH_CONFIG,
  normalizeMatchConfig,
  playerName,
  type MatchConfig,
} from '../game/match-config';
import type { ActorState, MatchState } from '../network/protocol';

export const PREFERENCES_KEY = 'tactical-fps.match.v1';
export const PROFILE_KEY = 'tactical-fps.guest.v1';
export interface LocalProfile {
  name: string;
  lastResult?: { title: string; detail: string; playedAt: string };
}
export function parsePreferences(raw: string | null): MatchConfig {
  try {
    return normalizeMatchConfig(raw ? JSON.parse(raw) : DEFAULT_MATCH_CONFIG);
  } catch {
    return normalizeMatchConfig(DEFAULT_MATCH_CONFIG);
  }
}
export function parseProfile(raw: string | null): LocalProfile {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<LocalProfile>) : {};
    const last = value?.lastResult;
    return {
      name: playerName(value?.name),
      ...(last &&
      typeof last.title === 'string' &&
      typeof last.detail === 'string' &&
      typeof last.playedAt === 'string' &&
      Number.isFinite(Date.parse(last.playedAt))
        ? {
            lastResult: {
              title: last.title.slice(0, 100),
              detail: last.detail.slice(0, 300),
              playedAt: last.playedAt,
            },
          }
        : {}),
    };
  } catch {
    return { name: 'Visitante' };
  }
}
export function loadLocalData<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}
export function saveLocalData(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function clock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)
    .toString()
    .padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}
export const MODE_NAMES = {
  deathmatch: 'COMBATE LIVRE',
  'team-deathmatch': 'COMBATE EM EQUIPES',
  defuse: 'BOMBA',
} as const;
export function actorName(
  actor: Pick<ActorState, 'id' | 'bot'> & { name?: string },
  self?: string,
): string {
  return playerName(actor.name, actor.id === self ? 'Você' : actor.bot ? 'Bot' : 'Jogador');
}
export function orderedActors(actors: readonly ActorState[]): ActorState[] {
  return [...actors].sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths || actorName(a).localeCompare(actorName(b)),
  );
}
export function matchResult(state: MatchState): { title: string; detail: string } {
  const { rounds } = state;
  const winner = state.actors.find((actor) => actor.id === rounds.winnerId);
  const title =
    rounds.mode === 'deathmatch'
      ? rounds.winnerId
        ? `${winner ? actorName(winner, state.self) : 'Jogador'} VENCEU`
        : 'EMPATE'
      : rounds.winner
        ? `EQUIPE ${rounds.winner.toUpperCase()} VENCEU`
        : 'EMPATE';
  return {
    title,
    detail: orderedActors(state.actors)
      .map((actor) => `${actorName(actor, state.self)}: ${actor.kills} / ${actor.deaths}`)
      .join(' · '),
  };
}

/** Snapshot deltas are evidence of a death; no invented killer attribution. */
export class KillfeedTracker {
  private previous = new Map<string, number>();
  update(actors: readonly ActorState[]): string[] {
    const result: string[] = [];
    for (const actor of actors) {
      const old = this.previous.get(actor.id);
      if (old !== undefined && actor.deaths > old) result.push(`${actorName(actor)} foi eliminado`);
      this.previous.set(actor.id, actor.deaths);
    }
    for (const id of this.previous.keys())
      if (!actors.some((actor) => actor.id === id)) this.previous.delete(id);
    return result;
  }
  clear() {
    this.previous.clear();
  }
}
