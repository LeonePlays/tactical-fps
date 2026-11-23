import { expect, it } from 'vitest';
import { localPractice } from '../src/network/local';
import { IDLE_INPUT, type MatchState, PROTOCOL_VERSION } from '../src/network/protocol';

it('publishes a real configured match and advances only when the fixed-step host calls step', async () => {
  let latest: MatchState | undefined;
  let snapshots = 0;
  const room = localPractice(
    0,
    (state) => {
      latest = state;
      snapshots++;
    },
    { mode: 'team-deathmatch', map: 'old-quarter', team: 'bravo', timeLimit: 30, scoreLimit: 2 },
    'Diana',
  );
  await Promise.resolve();
  expect(snapshots).toBe(1);
  expect(latest?.protocol).toBe(PROTOCOL_VERSION);
  expect(latest?.config.map).toBe('old-quarter');
  expect(latest?.actors[0].name).toBe('Diana');
  expect(latest?.actors[0].team).toBe('bravo');
  const initial = { ...latest!.actors[0].position };
  for (let i = 0; i < 60; i++) {
    room.send({ ...IDLE_INPUT, forward: 1, yaw: Math.PI });
    room.step(1 / 60);
  }
  expect(latest!.rounds.remaining).toBeCloseTo(29, 5);
  expect(latest!.actors[0].position.z).toBeLessThan(initial.z - 1);
  const count = snapshots;
  await Promise.resolve();
  expect(snapshots).toBe(count);
  const id = latest!.matchId;
  room.restart();
  expect(latest!.matchId).toBe(id + 1);
  expect(latest!.rounds.remaining).toBe(30);
  room.close();
  const closedCount = snapshots;
  room.step(1 / 60);
  room.restart();
  expect(snapshots).toBe(closedCount);
});
