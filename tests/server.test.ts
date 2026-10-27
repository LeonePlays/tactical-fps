import { test, expect } from 'vitest';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { createMatchServer } from '../server/server';
import type { MatchState } from '../src/network/protocol';
const waitMessage = (ws: WebSocket) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket timeout')), 3000);
    ws.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
  });
test('two real sockets join one room with bots; invalid tokens fail; empty rooms are removed', async () => {
  const server = createMatchServer(
    async (token) => (token.startsWith('valid-') ? token : null),
    ['http://localhost:5173'],
  );
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const sockets: WebSocket[] = [];
  async function connect() {
    const ws = new WebSocket(url, { origin: 'http://localhost:5173' });
    sockets.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));
    return ws;
  }
  try {
    const bad = await connect();
    const denied = waitMessage(bad);
    bad.send(JSON.stringify({ type: 'join', token: 'bad', create: true, bots: 0 }));
    expect((await denied).type).toBe('error');
    const first = await connect();
    const created = waitMessage(first);
    first.send(JSON.stringify({ type: 'join', token: 'valid-one', create: true, bots: 2 }));
    const state = (await created) as unknown as MatchState;
    expect(state.actors).toHaveLength(3);
    const second = await connect();
    const joined = waitMessage(second);
    second.send(JSON.stringify({ type: 'join', token: 'valid-two', room: state.room }));
    const snapshot = (await joined) as unknown as MatchState;
    expect(snapshot.room).toBe(state.room);
    expect(snapshot.actors).toHaveLength(4);
    expect(snapshot.self).not.toBe(state.self);
    first.close();
    second.close();
    await expect.poll(() => server.rooms.size).toBe(0);
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
  }
});
