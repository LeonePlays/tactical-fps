import { describe, expect, it } from 'vitest';
import { Match } from '../src/game/match';
import { PROTOCOL_VERSION, type MatchState } from '../src/network/protocol';
import { DEFAULT_MATCH_CONFIG } from '../src/game/match-config';
import {
  KillfeedTracker,
  clock,
  matchResult,
  orderedActors,
  parsePreferences,
  parseProfile,
} from '../src/ui/session';

function state(mode: 'deathmatch' | 'team-deathmatch' | 'defuse' = 'deathmatch'): MatchState {
  const match = new Match(mode);
  match.add('first');
  match.add('second');
  return {
    protocol: PROTOCOL_VERSION,
    type: 'state',
    room: 'LOCAL',
    self: 'first',
    actors: match.snapshot(),
    ...match.state(),
  };
}

describe('real match presentation and local profile', () => {
  it('restores validated preferences and falls back from malformed storage', () => {
    expect(parsePreferences('{broken')).toEqual(DEFAULT_MATCH_CONFIG);
    expect(
      parsePreferences(
        '{"mode":"defuse","map":"old-quarter","timeLimit":30,"scoreLimit":3,"difficulty":"hard"}',
      ),
    ).toMatchObject({
      mode: 'defuse',
      map: 'old-quarter',
      timeLimit: 30,
      scoreLimit: 3,
      difficulty: 'hard',
    });
  });
  it('sanitizes the guest name and only restores a real, dated stored result', () => {
    expect(parseProfile(null)).toEqual({ name: 'Visitante' });
    expect(parseProfile('{"name":" <abc> ","lastResult":{"title":"Won"}}')).toEqual({
      name: 'abc',
    });
    expect(
      parseProfile(
        JSON.stringify({
          name: 'Player',
          lastResult: { title: 'EMPATE', detail: '1 / 1', playedAt: '2026-11-11T12:00:00Z' },
        }),
      ),
    ).toHaveProperty('lastResult.title', 'EMPATE');
  });
  it('identifies the FFA winner by authoritative id and handles draws', () => {
    const snapshot = state();
    snapshot.actors[1].name = 'Campeão';
    snapshot.rounds.winnerId = 'second';
    expect(matchResult(snapshot).title).toBe('Campeão VENCEU');
    snapshot.rounds.winnerId = null;
    expect(matchResult(snapshot).title).toBe('EMPATE');
  });
  it('uses team outcomes for both team modes and orders the actual score rows', () => {
    for (const mode of ['team-deathmatch', 'defuse'] as const) {
      const snapshot = state(mode);
      snapshot.rounds.winner = 'bravo';
      snapshot.actors[0].kills = 2;
      snapshot.actors[1].kills = 4;
      expect(matchResult(snapshot).title).toBe('EQUIPE BRAVO VENCEU');
      expect(orderedActors(snapshot.actors).map((actor) => actor.id)).toEqual(['second', 'first']);
      expect(snapshot.actors[0].id).toBe('first');
    }
  });
  it('shows a killfeed entry only when a known actor death count increases', () => {
    const snapshot = state();
    snapshot.actors[1].name = 'Alvo';
    const tracker = new KillfeedTracker();
    expect(tracker.update(snapshot.actors)).toEqual([]);
    snapshot.actors[1].deaths++;
    expect(tracker.update(snapshot.actors)).toEqual(['Alvo foi eliminado']);
    expect(tracker.update(snapshot.actors)).toEqual([]);
    tracker.clear();
    expect(tracker.update(snapshot.actors)).toEqual([]);
  });
  it('formats finite countdowns without negative or invalid display values', () => {
    expect(clock(30)).toBe('00:30');
    expect(clock(61.1)).toBe('01:02');
    expect(clock(-1)).toBe('00:00');
    expect(clock(NaN)).toBe('00:00');
  });
});
