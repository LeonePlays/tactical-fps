import { afterEach, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { createMatchServer } from '../server/server';
import { IDLE_INPUT, PROTOCOL_VERSION, type MatchState } from '../src/network/protocol';

const origin = 'http://localhost:5173';
const servers: ReturnType<typeof createMatchServer>[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
function receive(socket: WebSocket, predicate: (value: Record<string, unknown>) => boolean) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', listener);
      reject(new Error('Server response timed out'));
    }, 3000);
    function listener(raw: WebSocket.RawData) {
      const data = JSON.parse(String(raw)) as Record<string, unknown>;
      if (!predicate(data)) return;
      clearTimeout(timeout);
      socket.off('message', listener);
      resolve(data);
    }
    socket.on('message', listener);
  });
}
async function fixture() {
  const server = createMatchServer(async (token) => token, [origin]);
  servers.push(server);
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const join = async (token: string, room?: string, team = 'auto') => {
    const socket = new WebSocket(url, { origin });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const response = receive(socket, (data) => data.type === 'state');
    socket.send(
      JSON.stringify({
        type: 'join',
        token,
        protocol: PROTOCOL_VERSION,
        create: !room,
        room,
        team,
        name: token,
        config: { mode: 'team-deathmatch', bots: 0 },
      }),
    );
    return { socket, state: (await response) as unknown as MatchState };
  };
  return { server, join };
}
it('routes real global and team chat only to permitted room members and limits spam', async () => {
  const { join } = await fixture();
  const host = await join('host', undefined, 'alpha');
  const rival = await join('rival', host.state.room, 'bravo');
  const ally = await join('ally', host.state.room, 'alpha');
  const elsewhere = await join('elsewhere');
  const rivalMessages: unknown[] = [],
    elsewhereMessages: unknown[] = [];
  rival.socket.on('message', (raw) => {
    const data = JSON.parse(String(raw));
    if (data.type === 'chat') rivalMessages.push(data);
  });
  elsewhere.socket.on('message', (raw) => {
    const data = JSON.parse(String(raw));
    if (data.type === 'chat') elsewhereMessages.push(data);
  });
  const global = [host, rival, ally].map(({ socket }) =>
    receive(socket, (data) => data.type === 'chat'),
  );
  host.socket.send(JSON.stringify({ type: 'chat', text: 'Olá sala', team: false }));
  for (const data of await Promise.all(global))
    expect(data).toMatchObject({ name: 'host', text: 'Olá sala', team: false });
  const team = [host, ally].map(({ socket }) =>
    receive(socket, (data) => data.type === 'chat' && data.team === true),
  );
  ally.socket.send(JSON.stringify({ type: 'chat', text: '<b>Seguro como texto</b>', team: true }));
  for (const data of await Promise.all(team)) expect(data.text).toBe('<b>Seguro como texto</b>');
  expect(rivalMessages).toHaveLength(1);
  expect(elsewhereMessages).toHaveLength(0);
  const throttled = receive(host.socket, (data) => data.type === 'notice');
  host.socket.send(JSON.stringify({ type: 'chat', text: 'spam', team: false }));
  expect((await throttled).message).toContain('aguarde');
  const invalid = receive(rival.socket, (data) => data.type === 'notice');
  rival.socket.send(JSON.stringify({ type: 'chat', text: 'x'.repeat(161), team: false }));
  await invalid;
  expect(rival.socket.readyState).toBe(WebSocket.OPEN);
});
it('allows only the host to replace room settings, retaining real players and increasing match identity', async () => {
  const { join, server } = await fixture();
  const host = await join('host');
  const guest = await join('guest', host.state.room);
  const denied = receive(guest.socket, (data) => data.type === 'notice');
  guest.socket.send(JSON.stringify({ type: 'configure', config: { map: 'old-quarter' } }));
  expect((await denied).message).toContain('anfitrião');
  expect(server.rooms.get(host.state.room)?.config.map).toBe('industrial');
  const states = [host, guest].map(({ socket }) =>
    receive(
      socket,
      (data) => data.type === 'state' && (data.config as { map?: string })?.map === 'old-quarter',
    ),
  );
  host.socket.send(
    JSON.stringify({
      type: 'configure',
      config: { map: 'old-quarter', bots: 3, difficulty: 'hard', scoreLimit: 8 },
    }),
  );
  for (const data of await Promise.all(states)) {
    const state = data as unknown as MatchState;
    expect(state.room).toBe(host.state.room);
    expect(state.matchId).toBeGreaterThan(host.state.matchId);
    expect(state.hostId).toBe('host');
    expect(state.config).toMatchObject({
      map: 'old-quarter',
      bots: 3,
      difficulty: 'hard',
      scoreLimit: 8,
    });
    expect(
      state.actors
        .filter((actor) => !actor.bot)
        .map((actor) => actor.id)
        .sort(),
    ).toEqual(['guest', 'host']);
    expect(state.actors.filter((actor) => actor.bot)).toHaveLength(3);
  }
  const invalid = receive(host.socket, (data) => data.type === 'notice');
  host.socket.send(JSON.stringify({ type: 'configure', config: { bots: 500 } }));
  await invalid;
  expect(server.rooms.get(host.state.room)?.config.bots).toBe(3);
  expect(host.socket.readyState).toBe(WebSocket.OPEN);
});

it('does not replay drop, shoot or buy commands after configuring an existing room', async () => {
  const { join, server } = await fixture();
  const host = await join('host');
  const commands = {
    ...IDLE_INPUT,
    dropSequence: 1,
    reloadSequence: 4,
    fireSequence: 7,
    buySequence: 3,
    buyItem: 'armor',
  };
  host.socket.send(JSON.stringify({ type: 'input', input: commands }));
  await expect
    .poll(() => server.rooms.get(host.state.room)?.actors.get('host')?.dropSequence)
    .toBe(1);
  expect(server.rooms.get(host.state.room)?.state().droppedItems).toHaveLength(1);
  const configured = receive(
    host.socket,
    (data) => data.type === 'state' && Number(data.matchId) > host.state.matchId,
  );
  host.socket.send(JSON.stringify({ type: 'configure', config: { difficulty: 'hard' } }));
  await configured;
  const replacement = server.rooms.get(host.state.room)!;
  const fresh = replacement.actors.get('host')!;
  expect(fresh.input).toMatchObject({
    forward: 0,
    right: 0,
    fire: false,
    interact: false,
    buyItem: null,
  });
  host.socket.send(JSON.stringify({ type: 'input', input: commands }));
  // Wait for that packet and a real authoritative tick before inspecting outcomes.
  await expect.poll(() => fresh.input.buyItem).toBe('armor');
  await expect.poll(() => replacement.time).toBeGreaterThan(0.05);
  expect(fresh.gun.inventory.primary.owned).toBe(true);
  expect(fresh.gun.ammo).toBe(30);
  expect(fresh.shots).toBe(0);
  expect(fresh.armor).toBe(0);
  expect(fresh.money).toBe(4000);
  expect(replacement.state().droppedItems).toHaveLength(0);
});
