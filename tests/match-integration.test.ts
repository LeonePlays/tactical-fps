import { describe, expect, it } from 'vitest';
import { Match } from '../src/game/match';
import { PlayerBody } from '../src/game/physics';
import { WeaponController } from '../src/game/weapons';
import { ARENA_SOLIDS } from '../src/network/arena';
import { IDLE_INPUT, type MatchInput } from '../src/network/protocol';

function advance(match: Match, seconds: number, tick?: () => void) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
    tick?.();
    match.step(0.05);
  }
}
function position(match: Match, id: string, x: number, z: number) {
  match.actors.get(id)!.body = new PlayerBody(ARENA_SOLIDS, { x, y: 0, z });
}
function input(match: Match, id: string, values: Partial<MatchInput>) {
  match.input(id, { ...IDLE_INPUT, ...values });
}
function activeDefuse() {
  const match = new Match('defuse');
  match.add('attacker');
  match.add('defender');
  match.add('ally');
  advance(match, 5.05);
  expect(match.state().rounds.phase).toBe('active');
  return match;
}

describe('shared Match integration', () => {
  it('freezes movement and consumes equipment presses until the round starts', () => {
    const match = new Match('defuse');
    match.add('attacker');
    match.add('defender');
    const initial = match.snapshot()[0].position;
    advance(match, 4.9, () =>
      input(match, 'attacker', { forward: 1, tool: 'grenade', fire: true, fireSequence: 1 }),
    );
    expect(match.state().rounds.phase).toBe('freeze');
    expect(match.snapshot()[0].position.x).toBe(initial.x);
    expect(match.snapshot()[0].position.z).toBe(initial.z);
    expect(match.state().grenades).toHaveLength(0);
    advance(match, 0.3);
    expect(match.state().rounds.phase).toBe('active');
    expect(match.state().grenades).toHaveLength(0);
    input(match, 'attacker', { tool: 'grenade', fire: true, fireSequence: 2 });
    match.step(0.05);
    expect(match.state().grenades).toHaveLength(1);
  });

  it('requires fresh human input throughout planting and never respawns within a defuse round', () => {
    const match = activeDefuse();
    position(match, 'attacker', 0, 10);
    input(match, 'attacker', { interact: true });
    advance(match, 4);
    expect(match.state().rounds.bomb?.status).toBe('carried');
    expect(match.state().rounds.interaction).toBeNull();
    advance(match, 3.1, () => input(match, 'attacker', { interact: true }));
    expect(match.state().rounds.bomb?.status).toBe('planted');
    const attacker = match.actors.get('attacker')!;
    attacker.health = 0;
    attacker.respawnAt = match.time;
    advance(match, 4);
    expect(attacker.health).toBe(0);
    expect(match.state().rounds.phase).toBe('active');
  });

  it('does not let bots acquire targets or consume their reaction delay during freeze', () => {
    const match = new Match('defuse');
    match.add('bot', true);
    match.add('enemy');
    position(match, 'bot', -12, -8);
    position(match, 'enemy', -12, -3);
    const initialYaw = match.actors.get('bot')!.input.yaw;
    advance(match, 4.9);
    expect(match.state().rounds.phase).toBe('freeze');
    expect(match.actors.get('bot')!.input.yaw).toBe(initialYaw);
    expect(match.snapshot()[0]).toMatchObject({ shots: 0, aiState: 'patrol' });
    advance(match, 0.15);
    expect(match.state().rounds.phase).toBe('active');
    expect(match.actors.get('bot')!.input.fire).toBe(false);
    expect(match.snapshot()[0].shots).toBe(0);
    advance(match, 0.7);
    expect(match.snapshot()[0].shots).toBeGreaterThan(0);
  });

  it('lets an attacking bot defend a planted bomb and shoot a visible defender', () => {
    const match = activeDefuse();
    position(match, 'attacker', 0, 10);
    advance(match, 3.1, () => input(match, 'attacker', { interact: true }));
    expect(match.state().rounds.bomb?.status).toBe('planted');
    const attacker = match.actors.get('attacker')!;
    attacker.bot = true;
    attacker.gun = new WeaponController(1, true);
    position(match, 'defender', 0, 7.5);
    advance(match, 1);
    expect(attacker.input.interact).toBe(false);
    expect(attacker.shots).toBeGreaterThan(0);
    expect(match.actors.get('defender')!.health).toBeLessThan(100);
    expect(match.state().rounds.bomb?.status).toBe('planted');
  });

  it('blocks firearm and knife damage to teammates while applying enemy damage', () => {
    const match = activeDefuse();
    position(match, 'attacker', -12, -8);
    position(match, 'ally', -12, -6.8);
    position(match, 'defender', -12, -4.5);
    const attacker = match.actors.get('attacker')!;
    attacker.gun = new WeaponController(1, true);
    input(match, 'attacker', { fire: true });
    match.step(0.05);
    expect(match.actors.get('ally')!.health).toBe(100);
    expect(match.actors.get('defender')!.health).toBeLessThan(100);
    input(match, 'attacker', { tool: 'knife', fire: true, fireSequence: 1 });
    match.step(0.05);
    expect(match.actors.get('ally')!.health).toBe(100);
    position(match, 'ally', -10, -8);
    position(match, 'defender', -12, -6.8);
    advance(match, 0.7);
    const before = match.actors.get('defender')!.health;
    input(match, 'attacker', { tool: 'knife', fire: true, fireSequence: 2 });
    match.step(0.05);
    expect(match.actors.get('defender')!.health).toBe(before - 45);
    match.step(0.05);
    expect(match.actors.get('defender')!.health).toBe(before - 45);
  });

  it('launches one owned grenade per press and resolves real blast damage with team protection', () => {
    const match = activeDefuse();
    position(match, 'attacker', -12, -8);
    position(match, 'ally', -11, -8);
    position(match, 'defender', -12, -6);
    input(match, 'attacker', {
      tool: 'grenade',
      pitch: Math.PI / 2,
      fire: true,
      fireSequence: 1,
    });
    match.step(0.05);
    expect(match.snapshot()[0].grenades).toBe(0);
    expect(match.state().grenades).toHaveLength(1);
    match.step(0.05);
    expect(match.state().grenades).toHaveLength(1);
    advance(match, 3.1);
    expect(match.state().grenades).toHaveLength(0);
    expect(match.actors.get('defender')!.health).toBeLessThan(100);
    expect(match.actors.get('ally')!.health).toBe(100);
    expect(match.actors.get('attacker')!.health).toBeLessThan(100);
    input(match, 'attacker', { tool: 'grenade', fire: true, fireSequence: 2 });
    match.step(0.05);
    expect(match.state().grenades).toHaveLength(0);
  });

  it('does not replay a knife or grenade press as a gunshot when switching back to a firearm', () => {
    const match = new Match();
    match.add('operator');
    input(match, 'operator', { tool: 'knife', fire: true, fireSequence: 1 });
    match.step(0.05);
    input(match, 'operator', { fireSequence: 1 });
    match.step(0.05);
    expect(match.snapshot()[0].shots).toBe(0);
    input(match, 'operator', { tool: 'grenade', fire: true, fireSequence: 2 });
    match.step(0.05);
    input(match, 'operator', { fireSequence: 2 });
    match.step(0.05);
    expect(match.snapshot()[0].shots).toBe(0);
    input(match, 'operator', { fire: true, fireSequence: 3 });
    match.step(0.05);
    expect(match.snapshot()[0].shots).toBe(1);
  });

  it('keeps grenade team protection after its owner disconnects', () => {
    const match = activeDefuse();
    position(match, 'attacker', -12, -8);
    position(match, 'ally', -11, -8);
    position(match, 'defender', -12, -6);
    input(match, 'attacker', {
      tool: 'grenade',
      pitch: Math.PI / 2,
      fire: true,
      fireSequence: 1,
    });
    match.step(0.05);
    match.actors.delete('attacker');
    advance(match, 3.1);
    expect(match.actors.get('ally')!.health).toBe(100);
    expect(match.actors.get('defender')!.health).toBeLessThan(100);
  });

  it('bots navigate to the site, plant, and defenders navigate to and defuse the bomb', () => {
    const match = new Match('defuse');
    match.add('carrier', true);
    for (let i = 0; i < 1400 && match.state().rounds.bomb?.status !== 'planted'; i++)
      match.step(0.05);
    expect(match.state().rounds.bomb?.status).toBe('planted');
    match.add('defender', true);
    match.actors.get('carrier')!.health = 0;
    for (let i = 0; i < 650 && match.state().rounds.phase === 'active'; i++) match.step(0.05);
    expect(match.state().rounds.bomb?.status).toBe('defused');
    expect(match.state().rounds.winner).toBe('bravo');
  });

  it('detonates the objective once and damages nearby actors on either team', () => {
    const match = activeDefuse();
    position(match, 'attacker', 0, 10);
    advance(match, 3.1, () => input(match, 'attacker', { interact: true }));
    expect(match.state().rounds.bomb?.status).toBe('planted');
    position(match, 'defender', 1, 10);
    position(match, 'ally', -12, -12);
    advance(match, 35.05);
    expect(match.state().rounds.bomb?.status).toBe('exploded');
    expect(match.state().rounds.winner).toBe('alpha');
    expect(match.actors.get('attacker')!.health).toBe(0);
    expect(match.actors.get('defender')!.health).toBe(0);
    expect(match.actors.get('ally')!.health).toBe(100);
    const deaths = match.actors.get('attacker')!.deaths;
    advance(match, 1);
    expect(match.actors.get('attacker')!.deaths).toBe(deaths);
  });

  it('resets all eight actors into unique spawns for a new round and supports a clean restart', () => {
    const match = new Match('defuse');
    for (let i = 0; i < 8; i++) match.add(`player-${i}`);
    advance(match, 5.05);
    for (const actor of match.actors.values()) if (actor.team === 'bravo') actor.health = 0;
    match.step(0.05);
    expect(match.state().rounds.scores.alpha).toBe(1);
    advance(match, 5.05);
    expect(match.state().rounds.phase).toBe('freeze');
    expect(match.snapshot().every((actor) => actor.health === 100)).toBe(true);
    expect(
      new Set(match.snapshot().map((actor) => `${actor.position.x},${actor.position.z}`)).size,
    ).toBe(8);
    match.actors.get('player-0')!.kills = 9;
    match.actors.get('player-0')!.money = 16000;
    match.restart();
    expect(match.state().rounds.round).toBe(1);
    expect(match.state().rounds.scores).toEqual({ alpha: 0, bravo: 0 });
    expect(match.state().rounds.phase).toBe('freeze');
    expect(match.snapshot().every((actor) => actor.kills === 0 && actor.money === 4000)).toBe(true);
    expect(match.state().grenades).toHaveLength(0);
  });

  it('ends deathmatch at the kill limit, blocks further attacks, and restarts with the same roster', () => {
    const match = new Match();
    match.add('winner');
    match.add('loser');
    match.actors.get('winner')!.kills = 10;
    match.step(0.05);
    expect(match.state().rounds.phase).toBe('round-over');
    expect(match.state().rounds.winnerId).toBe('winner');
    position(match, 'winner', -12, -8);
    position(match, 'loser', -12, -6.8);
    advance(match, 5.1, () =>
      input(match, 'winner', { tool: 'knife', fire: true, fireSequence: 1 }),
    );
    expect(match.state().rounds.phase).toBe('match-over');
    expect(match.actors.get('loser')!.health).toBe(100);
    match.restart();
    expect(match.state().rounds.phase).toBe('active');
    expect(match.snapshot().map((actor) => actor.id)).toEqual(['winner', 'loser']);
    expect(match.snapshot().every((actor) => actor.kills === 0 && actor.health === 100)).toBe(true);
  });
});
