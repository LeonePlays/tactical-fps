import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { createMatchServer } from '../server/server';
import { PROTOCOL_VERSION, type MatchState } from '../src/network/protocol';

const origin = 'http://localhost:5173';
const running: ReturnType<typeof createMatchServer>[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(running.splice(0).map((server) => server.close()));
});

async function start() {
  const server = createMatchServer(
    async (token) => (token.startsWith('valid-') ? token : null),
    [origin],
  );
  running.push(server);
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  return { server, http: `http://${address}`, ws: `ws://${address}` };
}

async function connect(url: string) {
  const socket = new WebSocket(url, { origin });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

function message(socket: WebSocket, predicate = (_data: Record<string, unknown>) => true) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', receive);
      reject(new Error('Socket response timed out'));
    }, 3000);
    function receive(raw: WebSocket.RawData) {
      const data = JSON.parse(String(raw)) as Record<string, unknown>;
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off('message', receive);
      resolve(data);
    }
    socket.on('message', receive);
  });
}

async function join(socket: WebSocket, fields: Record<string, unknown>) {
  const response = message(socket);
  socket.send(
    JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, token: 'valid-host', ...fields }),
  );
  return (await response) as unknown as MatchState & { hostId?: string };
}

describe('configured authoritative rooms', () => {
  it('publishes actual room counts and safe configuration with restricted CORS', async () => {
    const host = await start();
    const empty = await fetch(`${host.http}/rooms`, { headers: { Origin: origin } });
    expect(empty.headers.get('access-control-allow-origin')).toBe(origin);
    expect(await empty.json()).toEqual({ protocol: PROTOCOL_VERSION, rooms: [] });
    const socket = await connect(host.ws);
    const state = await join(socket, {
      create: true,
      name: '<Alpha>',
      config: {
        mode: 'team-deathmatch',
        map: 'old-quarter',
        bots: 2,
        difficulty: 'hard',
        team: 'alpha',
        timeLimit: 60,
        scoreLimit: 5,
      },
    });
    expect(state.type).toBe('state');
    expect(state.config).toMatchObject({
      mode: 'team-deathmatch',
      map: 'old-quarter',
      bots: 2,
      difficulty: 'hard',
      timeLimit: 60,
      scoreLimit: 5,
    });
    expect(state.hostId).toBe('valid-host');
    expect(state.actors.find((actor) => actor.id === state.self)?.name).toBe('Alpha');
    const response = await fetch(`${host.http}/rooms`, { headers: { Origin: origin } });
    const list = await response.json();
    expect(list).toEqual({
      protocol: PROTOCOL_VERSION,
      rooms: [
        {
          code: state.room,
          mode: 'team-deathmatch',
          map: 'old-quarter',
          difficulty: 'hard',
          players: 1,
          bots: 2,
          capacity: 8,
          phase: 'active',
        },
      ],
    });
    expect(JSON.stringify(list)).not.toContain('valid-host');
    expect(JSON.stringify(list)).not.toContain('Alpha');
    const denied = await fetch(`${host.http}/rooms`, {
      headers: { Origin: 'https://untrusted.example' },
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await fetch(`${host.http}/rooms`, {
      method: 'OPTIONS',
      headers: { Origin: origin },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    const health = await fetch(`${host.http}/health`);
    expect(await health.json()).toMatchObject({ ok: true, protocol: PROTOCOL_VERSION, rooms: 1 });
    socket.close();
    await expect.poll(() => host.server.rooms.size).toBe(0);
    expect((await (await fetch(`${host.http}/rooms`)).json()).rooms).toEqual([]);
  });

  it('rejects malformed network configuration rather than clamping or silently replacing it', async () => {
    const host = await start();
    for (const config of [
      null,
      [],
      'deathmatch',
      { mode: 'tdm' },
      { map: 'missing' },
      { difficulty: 'impossible' },
      { team: 'red' },
      { bots: 5 },
      { bots: '2' },
      { timeLimit: 29 },
      { timeLimit: 1801 },
      { scoreLimit: 1.5 },
      { scoreLimit: 0 },
      { typo: true },
    ]) {
      const socket = await connect(host.ws);
      const response = message(socket);
      socket.send(
        JSON.stringify({
          type: 'join',
          protocol: PROTOCOL_VERSION,
          token: 'valid-host',
          create: true,
          config,
        }),
      );
      expect((await response).type).toBe('error');
    }
    expect(host.server.rooms.size).toBe(0);
    const socket = await connect(host.ws);
    const conflict = message(socket);
    socket.send(
      JSON.stringify({
        type: 'join',
        protocol: PROTOCOL_VERSION,
        token: 'valid-host',
        create: true,
        bots: 1,
        config: { bots: 2 },
      }),
    );
    expect((await conflict).message).toContain('conflitantes');
    const legacy = await connect(host.ws);
    const accepted = await join(legacy, { create: true, bots: 0, mode: 'deathmatch' });
    expect(accepted.config).toMatchObject({
      mode: 'deathmatch',
      bots: 0,
      map: 'industrial',
      timeLimit: 180,
      scoreLimit: 10,
    });
    const bomb = await connect(host.ws);
    const legacyBomb = await join(bomb, {
      token: 'valid-bomb',
      create: true,
      bots: 0,
      mode: 'defuse',
    });
    expect(legacyBomb.config).toMatchObject({ mode: 'defuse', timeLimit: 90, scoreLimit: 3 });
  });

  it('allows only the host to restart and transfers that role on disconnect', async () => {
    const host = await start();
    const first = await connect(host.ws);
    const created = await join(first, {
      create: true,
      config: { mode: 'team-deathmatch', bots: 0 },
    });
    const second = await connect(host.ws);
    const joined = await join(second, {
      token: 'valid-guest',
      room: created.room,
      name: 'Guest',
      team: 'alpha',
    });
    expect(joined.actors).toHaveLength(2);
    expect(new Set(joined.actors.map((actor) => actor.team)).size).toBe(2);
    const match = host.server.rooms.get(created.room)!;
    const actor = match.actors.get(created.self)!;
    actor.kills = 9;
    actor.health = 1;
    const denied = message(second, (data) => data.type === 'error');
    second.send(JSON.stringify({ type: 'restart' }));
    expect((await denied).message).toContain('anfitrião');
    expect(actor.kills).toBe(9);
    const reset = message(first, (data) => {
      const state = data as unknown as MatchState;
      return (
        state.type === 'state' &&
        state.actors.every((item) => item.kills === 0 && item.health === 100)
      );
    });
    first.send(JSON.stringify({ type: 'restart' }));
    const restarted = (await reset) as unknown as MatchState;
    expect(restarted.rounds.phase).toBe('active');
    const transferred = message(second, (data) => data.hostId === 'valid-guest');
    first.close();
    expect((await transferred).hostId).toBe('valid-guest');
    match.actors.get('valid-guest')!.kills = 7;
    const again = message(second, (data) => {
      const state = data as unknown as MatchState;
      return state.type === 'state' && state.actors[0]?.kills === 0;
    });
    second.send(JSON.stringify({ type: 'restart' }));
    expect((await again).hostId).toBe('valid-guest');
  });
});
