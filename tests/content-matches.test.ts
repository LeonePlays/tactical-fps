import { describe, expect, it } from 'vitest';
import { MAP_CATALOG } from '../src/game/map-catalog';
import { Match } from '../src/game/match';
import { GUNS } from '../src/game/ballistics';
import { IDLE_INPUT } from '../src/network/protocol';

describe('complete matches across the map catalog', () => {
  for (const [index, map] of MAP_CATALOG.entries()) {
    it(`${map.name}: bots navigate, matches finish and selected equipment survives a rematch`, () => {
      const match = new Match({
        map: map.id,
        mode: index % 2 ? 'team-deathmatch' : 'deathmatch',
        bots: 3,
        difficulty: 'normal',
        timeLimit: 30,
        scoreLimit: 100,
        primary: 'smg9',
        secondary: 'p45',
      });
      match.add('player');
      for (let i = 0; i < 3; i++) match.add(`bot-${i}`, true);
      const starts = new Map(match.snapshot().map((actor) => [actor.id, { ...actor.position }]));
      let moved = false;
      for (let tick = 0; tick < 720; tick++) {
        match.input('player', IDLE_INPUT);
        match.step(0.05);
        for (const actor of match.snapshot()) {
          expect(Object.values(actor.position).every(Number.isFinite)).toBe(true);
          expect(actor.position.y).toBeGreaterThanOrEqual(-0.001);
          expect(actor.position.x).toBeGreaterThan(match.map.bounds.minX);
          expect(actor.position.x).toBeLessThan(match.map.bounds.maxX);
          expect(actor.position.z).toBeGreaterThan(match.map.bounds.minZ);
          expect(actor.position.z).toBeLessThan(match.map.bounds.maxZ);
          expect(match.actors.get(actor.id)!.body.canUseStance(actor.stance)).toBe(true);
          if (
            actor.bot &&
            Math.hypot(
              actor.position.x - starts.get(actor.id)!.x,
              actor.position.z - starts.get(actor.id)!.z,
            ) > 2
          )
            moved = true;
        }
      }
      expect(moved).toBe(true);
      expect(match.state().rounds.phase).toBe('match-over');
      const previous = match.state().matchId;
      match.restart();
      expect(match.state().matchId).toBeGreaterThan(previous);
      const player = match.snapshot().find((actor) => actor.id === 'player')!;
      expect(player.weaponId).toBe('smg9');
      expect(player.ammo).toBe(GUNS.smg9.capacity);
      expect(player.kills).toBe(0);
      expect(player.health).toBe(100);
    }, 15000);
  }
});
