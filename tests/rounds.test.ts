import { describe, expect, it } from 'vitest';
import { BOMB_SITE, RoundController, type RoundActor, type RoundEvents } from '../src/game/rounds';
const roster = (): RoundActor[] => [
  { id: 'player', team: 'alpha', health: 100, kills: 0, position: { ...BOMB_SITE } },
  { id: 'defender', team: 'bravo', health: 100, kills: 0, position: { x: 12, y: 0, z: -12 } },
];
function advance(
  game: RoundController,
  seconds: number,
  actors: RoundActor[],
  ids: string[] = [],
): RoundEvents {
  const result: RoundEvents = { newRound: false, roundEnded: false, matchEnded: false };
  const count = Math.round(seconds / 0.05);
  for (let i = 0; i < count; i++) {
    const events = game.step(0.05, actors, ids);
    result.newRound ||= events.newRound;
    result.roundEnded ||= events.roundEnded;
    result.matchEnded ||= events.matchEnded;
  }
  return result;
}
function planted() {
  const actors = roster(),
    game = new RoundController('defuse');
  advance(game, 5, actors);
  advance(game, 3, actors, ['player']);
  expect(game.snapshot().bomb?.status).toBe('planted');
  return { game, actors };
}
describe('complete deathmatch session', () => {
  it('ends at ten kills, shows an intermission and reaches a persistent result', () => {
    const game = new RoundController(),
      actors = roster();
    actors[0].kills = 10;
    expect(game.step(0.05, actors).roundEnded).toBe(true);
    expect(game.snapshot()).toMatchObject({
      phase: 'round-over',
      winnerId: 'player',
      remaining: 5,
    });
    expect(advance(game, 5, actors).matchEnded).toBe(true);
    const end = game.snapshot();
    game.step(100, actors);
    expect(game.snapshot()).toEqual(end);
  });
  it('uses the highest score at the time limit and represents ties honestly', () => {
    const actors = roster(),
      game = new RoundController();
    actors[0].kills = 3;
    actors[1].kills = 1;
    advance(game, 180, actors);
    expect(game.snapshot().winnerId).toBe('player');
    const tied = new RoundController();
    actors[1].kills = 3;
    advance(tied, 180, actors);
    expect(tied.snapshot()).toMatchObject({
      phase: 'round-over',
      winnerId: null,
      reason: 'Empate.',
    });
  });
  it('restarts the entire session and ignores invalid elapsed times', () => {
    const actors = roster(),
      game = new RoundController();
    actors[0].kills = 10;
    game.step(0.05, actors);
    game.restart();
    const initial = game.snapshot();
    expect(initial).toMatchObject({ phase: 'active', remaining: 180, round: 1, winnerId: null });
    for (const dt of [0, -1, NaN, Infinity]) game.step(dt, actors);
    expect(game.snapshot()).toEqual(initial);
  });
});
describe('bomb rounds', () => {
  it('has a real freeze phase, then allows a three-second plant', () => {
    const game = new RoundController('defuse'),
      actors = roster();
    advance(game, 4, actors, ['player']);
    expect(game.snapshot()).toMatchObject({ phase: 'freeze', interaction: null });
    advance(game, 1, actors);
    expect(game.snapshot()).toMatchObject({ phase: 'active', remaining: 90 });
    advance(game, 2.95, actors, ['player']);
    expect(game.snapshot().bomb?.status).toBe('carried');
    game.step(0.05, actors, ['player']);
    expect(game.snapshot().bomb).toMatchObject({
      status: 'planted',
      remaining: 35,
      carrierId: null,
    });
  });
  it('interrupts planting when E is released or the player moves', () => {
    const game = new RoundController('defuse'),
      actors = roster();
    advance(game, 5, actors);
    advance(game, 2, actors, ['player']);
    game.step(0.05, actors);
    expect(game.snapshot().interaction).toBeNull();
    advance(game, 1, actors, ['player']);
    expect(game.snapshot().interaction?.progress).toBeCloseTo(1);
    actors[0].position.x = 0.3;
    game.step(0.05, actors, ['player']);
    expect(game.snapshot().interaction?.progress).toBeCloseTo(0.05);
    actors[0].position.x = 5;
    advance(game, 4, actors, ['player']);
    expect(game.snapshot().bomb?.status).toBe('carried');
    expect(game.snapshot().interaction).toBeNull();
  });
  it('rejects planting away from the site or while airborne', () => {
    const game = new RoundController('defuse'),
      actors = roster();
    advance(game, 5, actors);
    actors[0].position.z = -10;
    advance(game, 4, actors, ['player']);
    expect(game.snapshot().bomb?.status).toBe('carried');
    actors[0].position = { ...BOMB_SITE, y: 1 };
    advance(game, 4, actors, ['player']);
    expect(game.snapshot().bomb?.status).toBe('carried');
  });
  it('drops the bomb on carrier death and lets a living nearby attacker recover it', () => {
    const game = new RoundController('defuse'),
      actors = roster();
    actors.push({
      id: 'ally',
      team: 'alpha',
      health: 100,
      kills: 0,
      position: { x: -10, y: 0, z: -10 },
    });
    advance(game, 5, actors);
    actors[0].health = 0;
    game.step(0.05, actors, ['defender']);
    expect(game.snapshot().bomb).toMatchObject({
      status: 'dropped',
      carrierId: null,
      position: BOMB_SITE,
    });
    game.step(0.05, actors, ['ally']);
    expect(game.snapshot().bomb?.status).toBe('dropped');
    actors[2].position = { ...BOMB_SITE, x: 0.2 };
    game.step(0.05, actors, ['ally']);
    expect(game.snapshot().bomb).toMatchObject({ status: 'carried', carrierId: 'ally' });
  });
  it('ends an unplanted round when attackers die, but keeps a planted bomb alive', () => {
    const actors = roster(),
      unplanted = new RoundController('defuse');
    advance(unplanted, 5, actors);
    actors[0].health = 0;
    unplanted.step(0.05, actors);
    expect(unplanted.snapshot()).toMatchObject({ phase: 'round-over', winner: 'bravo' });
    const { game, actors: plantedActors } = planted();
    plantedActors[0].health = 0;
    game.step(0.05, plantedActors);
    expect(game.snapshot().phase).toBe('active');
    advance(game, 34.95, plantedActors);
    expect(game.snapshot()).toMatchObject({ winner: 'alpha', bomb: { status: 'exploded' } });
  });
  it('requires five uninterrupted seconds for a nearby defender to disarm', () => {
    const { game, actors } = planted();
    actors[1].position = { ...BOMB_SITE, x: 1 };
    advance(game, 4, actors, ['defender']);
    expect(game.snapshot().bomb?.status).toBe('planted');
    game.step(0.05, actors);
    expect(game.snapshot().interaction).toBeNull();
    advance(game, 4.95, actors, ['defender']);
    expect(game.snapshot().bomb?.status).toBe('planted');
    game.step(0.05, actors, ['defender']);
    expect(game.snapshot()).toMatchObject({
      phase: 'round-over',
      winner: 'bravo',
      scores: { alpha: 0, bravo: 1 },
      bomb: { status: 'defused' },
    });
  });
  it('does not let an attacker, distant defender or airborne defender defuse', () => {
    const { game, actors } = planted();
    advance(game, 5, actors, ['player', 'defender']);
    expect(game.snapshot().interaction).toBeNull();
    actors[1].position = { ...BOMB_SITE, y: 2 };
    advance(game, 5, actors, ['defender']);
    expect(game.snapshot().interaction).toBeNull();
    expect(game.snapshot().bomb?.status).toBe('planted');
  });
  it('resolves an exact fuse/defuse tie as detonation', () => {
    const { game, actors } = planted();
    advance(game, 30, actors);
    actors[1].position = { ...BOMB_SITE };
    advance(game, 5, actors, ['defender']);
    expect(game.snapshot()).toMatchObject({ winner: 'alpha', bomb: { status: 'exploded' } });
  });
  it('awards timeout to defenders when the bomb was not planted', () => {
    const game = new RoundController('defuse'),
      actors = roster();
    advance(game, 5, actors);
    advance(game, 90, actors);
    expect(game.snapshot()).toMatchObject({
      winner: 'bravo',
      phase: 'round-over',
      reason: 'Tempo esgotado sem plantio.',
    });
  });
  it('wins on defender elimination after planting and finishes best of five at three wins', () => {
    const game = new RoundController('defuse'),
      actors = roster();
    for (let round = 1; round <= 3; round++) {
      actors.forEach((actor) => (actor.health = 100));
      advance(game, 5, actors);
      actors[1].health = 0;
      const result = game.step(0.05, actors);
      expect(result.roundEnded).toBe(true);
      expect(game.snapshot().scores.alpha).toBe(round);
      if (round < 3) {
        expect(advance(game, 5, actors).newRound).toBe(true);
        expect(game.snapshot().round).toBe(round + 1);
      } else {
        expect(result.matchEnded).toBe(true);
        expect(game.snapshot()).toMatchObject({
          phase: 'match-over',
          winner: 'alpha',
          remaining: 0,
        });
      }
    }
    game.restart();
    expect(game.snapshot()).toMatchObject({
      phase: 'freeze',
      round: 1,
      scores: { alpha: 0, bravo: 0 },
      winner: null,
    });
  });
  it('does not invent an elimination victory for an empty team and returns independent snapshots', () => {
    const game = new RoundController('defuse'),
      actors = roster().slice(0, 1);
    advance(game, 5, actors);
    game.step(0.05, actors);
    expect(game.snapshot().phase).toBe('active');
    const copy = game.snapshot();
    copy.scores.alpha = 99;
    copy.bomb!.position.x = 999;
    expect(game.snapshot().scores.alpha).toBe(0);
    expect(game.snapshot().bomb?.position.x).toBe(0);
  });
});

it('resolves simultaneous elimination according to whether the bomb is planted', () => {
  const actors = roster(),
    game = new RoundController('defuse');
  advance(game, 5, actors);
  actors.forEach((actor) => (actor.health = 0));
  game.step(0.05, actors);
  expect(game.snapshot().winner).toBe('bravo');
  const active = planted();
  active.actors.forEach((actor) => (actor.health = 0));
  active.game.step(0.05, active.actors);
  expect(active.game.snapshot().winner).toBe('alpha');
});
