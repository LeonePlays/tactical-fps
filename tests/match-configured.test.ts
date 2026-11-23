import { describe, expect, it } from 'vitest';
import { Match } from '../src/game/match';
import { getMap } from '../src/game/maps';
import { BOT_PROFILES } from '../src/game/navigation';
import { PlayerBody } from '../src/game/physics';
import { IDLE_INPUT, type MatchInput } from '../src/network/protocol';

function advance(match: Match, seconds: number, tick?: () => void) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
    tick?.();
    match.step(0.05);
  }
}
function place(match: Match, id: string, x: number, z: number) {
  match.actors.get(id)!.body = new PlayerBody(match.map.solids, { x, y: 0, z });
}
function input(match: Match, id: string, command: Partial<MatchInput>) {
  match.input(id, { ...IDLE_INPUT, ...command });
}
function duel() {
  const match = new Match({ mode: 'team-deathmatch', scoreLimit: 10 });
  match.add('attacker', false, 'alpha', 'Ana');
  match.add('defender', false, 'bravo', 'Beto');
  match.add('ally');
  place(match, 'attacker', -12, -8);
  place(match, 'defender', -12, -6.8);
  place(match, 'ally', -10, -8);
  return match;
}

describe('configured authoritative matches', () => {
  it.each(['easy', 'normal', 'hard'] as const)(
    'uses the %s bot cadence without targeting allies',
    (difficulty) => {
      const match = new Match({ mode: 'team-deathmatch', difficulty });
      match.add('bot-one', true);
      match.add('bot-two', true);
      // A deliberately ally-only roster verifies that target filtering happens in Match.
      match.actors.get('bot-two')!.team = 'alpha';
      advance(match, 3);
      expect(match.snapshot().every((a) => a.shots === 0)).toBe(true);
      expect(match.actors.get('bot-one')!.botShotInterval).toBe(
        BOT_PROFILES[difficulty].shotInterval,
      );
      expect(match.snapshot()[0].aiState).toBeTruthy();
    },
  );

  it('preserves legacy modes and grants both firearms per life in FFA and TDM', () => {
    expect(new Match('defuse').config).toMatchObject({ timeLimit: 90, scoreLimit: 3 });
    for (const mode of ['deathmatch', 'team-deathmatch'] as const) {
      const match = new Match({ mode, timeLimit: 60, scoreLimit: 7, difficulty: 'hard' });
      match.add('player');
      expect(match.snapshot()[0].weaponState.inventory.primary.owned).toBe(true);
      expect(match.snapshot()[0].weaponState.inventory.secondary.owned).toBe(true);
      match.actors.get('player')!.health = 0;
      match.actors.get('player')!.respawnAt = 0;
      match.step(0.05);
      expect(match.snapshot()[0]).toMatchObject({ health: 100, weapon: 'primary' });
      expect(match.snapshot()[0].weaponState.inventory.primary.owned).toBe(true);
      expect(match.state().config).toMatchObject({
        mode,
        timeLimit: 60,
        scoreLimit: 7,
        difficulty: 'hard',
      });
      match.state().config.timeLimit = 999;
      expect(match.config.timeLimit).toBe(60);
    }
    const defuse = new Match('defuse');
    defuse.add('player');
    expect(defuse.snapshot()[0].weapon).toBe('secondary');
    expect(defuse.snapshot()[0].weaponState.inventory.primary.owned).toBe(false);
  });

  it('honors balanced team preferences and reuses vacant slots after disconnects', () => {
    const match = new Match('team-deathmatch');
    match.add('first', false, 'bravo', '<A>');
    match.add('second', false, 'bravo');
    expect(match.snapshot().map((a) => a.team)).toEqual(['bravo', 'alpha']);
    expect(match.snapshot()[0].name).toBe('A');
    for (let i = 2; i < 8; i++) match.add(`p${i}`);
    match.actors.delete('second');
    match.add('replacement', false, 'bravo');
    const actors = match.snapshot();
    expect(actors.filter((a) => a.team === 'alpha')).toHaveLength(4);
    expect(actors.filter((a) => a.team === 'bravo')).toHaveLength(4);
    expect(new Set(actors.map((a) => `${a.position.x},${a.position.z}`)).size).toBe(8);
    expect(() => match.add('ninth')).toThrow('Sala cheia');
  });

  it('scores real enemy eliminations once, retains team points after disconnects and respawns', () => {
    const match = duel();
    match.actors.get('defender')!.health = 30;
    input(match, 'attacker', { tool: 'knife', fire: true, fireSequence: 1 });
    match.step(0.05);
    expect(match.snapshot().find((a) => a.id === 'attacker')).toMatchObject({
      kills: 1,
      name: 'Ana',
      tool: 'knife',
    });
    expect(match.state().rounds.scores).toEqual({ alpha: 1, bravo: 0 });
    match.actors.delete('attacker');
    advance(match, 3.1);
    expect(match.state().rounds.scores).toEqual({ alpha: 1, bravo: 0 });
    expect(match.snapshot().find((a) => a.id === 'defender')).toMatchObject({
      health: 100,
      deaths: 1,
      weapon: 'primary',
    });
  });

  it('protects teammates from firearms and knives while allowing enemy hits', () => {
    const match = duel();
    place(match, 'ally', -12, -6.8);
    place(match, 'defender', -12, -4.5);
    input(match, 'attacker', { fire: true });
    match.step(0.05);
    expect(match.actors.get('ally')!.health).toBe(100);
    expect(match.actors.get('defender')!.health).toBeLessThan(100);
    input(match, 'attacker', { tool: 'knife', fire: true, fireSequence: 1 });
    match.step(0.05);
    expect(match.actors.get('ally')!.health).toBe(100);
    expect(match.state().rounds.scores).toEqual({ alpha: 0, bravo: 0 });
  });

  it('preserves grenade team protection and kill credit after the thrower disconnects', () => {
    const match = duel();
    place(match, 'ally', -11, -8);
    place(match, 'defender', -12, -6);
    match.actors.get('defender')!.health = 1;
    input(match, 'attacker', { tool: 'grenade', pitch: Math.PI / 2, fire: true, fireSequence: 1 });
    match.step(0.05);
    expect(match.state().grenades).toHaveLength(1);
    match.actors.delete('attacker');
    advance(match, 3.1);
    expect(match.actors.get('ally')!.health).toBe(100);
    expect(match.actors.get('defender')!.deaths).toBe(1);
    expect(match.state().rounds.scores).toEqual({ alpha: 1, bravo: 0 });
  });

  it('ends at the configured team score, freezes combat, and restarts the connected roster', () => {
    const match = new Match({ mode: 'team-deathmatch', scoreLimit: 1, timeLimit: 30 });
    match.add('winner');
    match.add('loser');
    place(match, 'winner', -12, -8);
    place(match, 'loser', -12, -6.8);
    match.actors.get('loser')!.health = 30;
    input(match, 'winner', { tool: 'knife', fire: true, fireSequence: 1 });
    match.step(0.05);
    expect(match.state().rounds).toMatchObject({
      phase: 'round-over',
      winner: 'alpha',
      scores: { alpha: 1, bravo: 0 },
    });
    advance(match, 5.05);
    expect(match.state().rounds.phase).toBe('match-over');
    const before = match.snapshot();
    advance(match, 3);
    expect(match.snapshot()).toEqual(before);
    const oldId = match.state().matchId;
    match.restart();
    expect(match.state().matchId).toBe(oldId + 1);
    expect(match.state().rounds).toMatchObject({
      phase: 'active',
      remaining: 30,
      scores: { alpha: 0, bravo: 0 },
    });
    expect(match.snapshot().every((a) => a.health === 100 && a.kills === 0 && a.deaths === 0)).toBe(
      true,
    );
    expect(match.state().config.scoreLimit).toBe(1);
  });

  it('keeps FFA enemies independent of cosmetic team assignment', () => {
    const match = new Match('deathmatch');
    match.add('attacker');
    match.add('other');
    match.add('same-team');
    place(match, 'attacker', -12, -8);
    place(match, 'same-team', -12, -6.8);
    match.actors.get('same-team')!.health = 30;
    input(match, 'attacker', { tool: 'knife', fire: true, fireSequence: 1 });
    match.step(0.05);
    expect(match.actors.get('same-team')!.health).toBe(0);
    expect(match.actors.get('attacker')!.kills).toBe(1);
    expect(match.state().rounds.scores).toEqual({ alpha: 0, bravo: 0 });
  });

  it.each(['industrial', 'old-quarter'] as const)(
    'shares %s collision geometry, spawns and bomb site',
    (map) => {
      const match = new Match({ mode: 'defuse', map });
      match.add('attacker');
      match.add('defender');
      expect(match.map).toBe(getMap(map));
      expect(match.snapshot()[0].position).toEqual(match.map.spawns[0]);
      advance(match, 5.05);
      place(match, 'attacker', match.map.bombSite.x, match.map.bombSite.z);
      advance(match, 3.1, () => input(match, 'attacker', { interact: true }));
      expect(match.state().rounds.bomb).toMatchObject({
        status: 'planted',
        position: { ...match.map.bombSite, y: 0 },
      });
    },
  );

  it('awards defuse rounds when the last defender disconnects after participating', () => {
    const match = new Match('defuse');
    match.add('attacker');
    match.add('defender');
    advance(match, 5.05);
    match.actors.delete('defender');
    match.step(0.05);
    expect(match.state().rounds).toMatchObject({ phase: 'round-over', winner: 'alpha' });
  });
});
