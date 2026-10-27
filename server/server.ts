import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Match } from './match';
import { parseInput } from '../src/network/protocol';
export type Verify = (token: string) => Promise<string | null>;
export const verifySupabase: Verify = async (token) => {
  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL || 'https://rrxwarhfizeuhowqpzle.supabase.co'}/auth/v1/user`,
      {
        headers: {
          apikey:
            process.env.SUPABASE_PUBLISHABLE_KEY ||
            'sb_publishable_zUcg_k51ypxP6FMCmNXJFw_EOjXkTNf',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { id?: string; is_anonymous?: boolean };
    return typeof data.id === 'string' && !data.is_anonymous ? data.id : null;
  } catch {
    return null;
  }
};
export function createMatchServer(
  verify: Verify = verifySupabase,
  origins = ['http://localhost:5173', 'http://127.0.0.1:5173'],
) {
  const rooms = new Map<string, Match>();
  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  let connectionCount = 0;
  const wss = new WebSocketServer({
    server: http,
    maxPayload: 4096,
    verifyClient: (info: { origin: string }) =>
      origins.includes(info.origin) && connectionCount < 128,
  });
  const clients = new Map<
    WebSocket,
    { id: string; room: string; last: number; count: number; window: number }
  >();
  wss.on('connection', (ws) => {
    connectionCount++;
    let authenticating = false;
    let lastToken = '';
    const timeout = setTimeout(() => ws.close(1008, 'Login obrigatório'), 8000);
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const joined = clients.get(ws);
        if (joined) {
          if (Date.now() - joined.window > 1000) {
            joined.count = 0;
            joined.window = Date.now();
          }
          if (++joined.count > 90) {
            ws.close(1008, 'Limite de mensagens');
            return;
          }
          joined.last = Date.now();
          const input = parseInput(data.input);
          if (data.type === 'input' && input) rooms.get(joined.room)?.input(joined.id, input);
          return;
        }
        if (authenticating) return;
        if (data.type !== 'join' || typeof data.token !== 'string' || data.token.length > 4096)
          throw new Error('Conexão inválida.');
        authenticating = true;
        lastToken = data.token;
        if (clients.size >= 128) throw new Error('Servidor cheio.');
        const id = await verify(data.token);
        if (!id) throw new Error('Sessão inválida. Entre novamente.');
        if (ws.readyState !== WebSocket.OPEN) return;
        if ([...clients.values()].some((c) => c.id === id))
          throw new Error('Esta conta já está numa sala.');
        let room: string, match: Match;
        if (data.create === true) {
          if (rooms.size >= 16) throw new Error('Limite de salas atingido.');
          if (!Number.isInteger(data.bots) || data.bots < 0 || data.bots > 4)
            throw new Error('Escolha de zero a quatro bots.');
          do {
            room = randomBytes(3).toString('hex').toUpperCase();
          } while (rooms.has(room));
          match = new Match();
          match.add(id);
          for (let i = 0; i < data.bots; i++) match.add(`bot-${i}`, true);
          rooms.set(room, match);
        } else {
          if (typeof data.room !== 'string' || !/^[0-9A-F]{6}$/.test(data.room))
            throw new Error('Código de sala inválido.');
          room = data.room;
          const existing = rooms.get(room);
          if (!existing) throw new Error('Sala não encontrada.');
          match = existing;
          match.add(id);
        }
        clearTimeout(timeout);
        clients.set(ws, { id, room, last: Date.now(), count: 0, window: Date.now() });
        ws.send(JSON.stringify({ type: 'state', room, self: id, actors: match.snapshot() }));
      } catch (error) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: error instanceof Error ? error.message : 'Falha de conexão.',
            }),
          );
          ws.close(1008);
        }
      }
    });
    const revalidate = setInterval(() => {
      if (!clients.has(ws)) return;
      void verify(lastToken)
        .then((id) => {
          if (id !== clients.get(ws)?.id) ws.close(1008, 'Sessão expirada');
        })
        .catch(() => ws.close(1008, 'Falha ao verificar sessão'));
    }, 60000);
    ws.on('error', () => ws.close());
    ws.on('close', () => {
      connectionCount--;
      clearInterval(revalidate);
      clearTimeout(timeout);
      const c = clients.get(ws);
      if (!c) return;
      clients.delete(ws);
      const match = rooms.get(c.room);
      match?.actors.delete(c.id);
      if (match && ![...match.actors.values()].some((a) => !a.bot)) rooms.delete(c.room);
    });
  });
  const tick = setInterval(() => {
    for (const match of rooms.values()) match.step(0.05);
    for (const [ws, c] of clients) {
      if (Date.now() - c.last > 15000) {
        ws.close(1008, 'Conexão inativa');
        continue;
      }
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536)
        ws.send(
          JSON.stringify({
            type: 'state',
            room: c.room,
            self: c.id,
            actors: rooms.get(c.room)?.snapshot() || [],
          }),
        );
    }
  }, 50);
  return {
    http,
    wss,
    rooms,
    async close() {
      clearInterval(tick);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
