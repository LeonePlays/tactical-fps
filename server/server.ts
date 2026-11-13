import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Match } from './match';
import { PROTOCOL_VERSION, parseInput } from '../src/network/protocol';
import {
  normalizeMatchConfig,
  playerName,
  type MatchConfig,
  type TeamPreference,
} from '../src/game/match-config';

/** Browser settings may be forgiving; a network host must reject malformed options. */
function strictConfig(value: unknown): Partial<MatchConfig> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Configuração de partida inválida.');
  const raw = value as Record<string, unknown>;
  const enums = {
    mode: ['deathmatch', 'team-deathmatch', 'defuse'],
    map: ['industrial', 'old-quarter'],
    difficulty: ['easy', 'normal', 'hard'],
    team: ['auto', 'alpha', 'bravo'],
  };
  const ranges = { bots: [0, 4], timeLimit: [30, 1800], scoreLimit: [1, 100] };
  for (const [key, item] of Object.entries(raw)) {
    if (Object.hasOwn(enums, key)) {
      if (typeof item !== 'string' || !enums[key as keyof typeof enums].includes(item))
        throw new Error(`Opção de partida inválida: ${key}.`);
    } else if (Object.hasOwn(ranges, key)) {
      const [min, max] = ranges[key as keyof typeof ranges];
      if (typeof item !== 'number' || !Number.isInteger(item) || item < min || item > max)
        throw new Error(`Limite de partida inválido: ${key}.`);
    } else throw new Error(`Opção de partida desconhecida: ${key}.`);
  }
  return raw as Partial<MatchConfig>;
}

function joinOptions(data: Record<string, unknown>) {
  const raw = strictConfig(data.config);
  const legacy = strictConfig({
    ...(data.bots === undefined ? {} : { bots: data.bots }),
    ...(data.mode === undefined ? {} : { mode: data.mode }),
    ...(data.team === undefined ? {} : { team: data.team }),
  });
  for (const key of ['bots', 'mode', 'team'] as const)
    if (raw[key] !== undefined && legacy[key] !== undefined && raw[key] !== legacy[key])
      throw new Error(`Opções de partida conflitantes: ${key}.`);
  if (data.name !== undefined && (typeof data.name !== 'string' || data.name.length > 80))
    throw new Error('Nome de jogador inválido.');
  const combined = { ...legacy, ...raw };
  const config = normalizeMatchConfig(combined);
  // Preserve the original bomb rules when a legacy/partial request omits limits.
  if (config.mode === 'defuse') {
    if (combined.timeLimit === undefined) config.timeLimit = 90;
    if (combined.scoreLimit === undefined) config.scoreLimit = 3;
  }
  return {
    config,
    team: (legacy.team ?? raw.team ?? 'auto') as TeamPreference,
    name: playerName(data.name, 'Jogador'),
  };
}
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
  const hosts = new Map<string, string>();
  const roomEpochs = new Map<string, number>();
  const http = createServer((req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (origin && !origins.includes(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Origem não permitida.' }));
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET, OPTIONS' });
      res.end();
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.size }));
    } else if (req.url === '/rooms') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          protocol: PROTOCOL_VERSION,
          rooms: [...rooms].map(([code, match]) => {
            const actors = match.snapshot();
            return {
              code,
              mode: match.config.mode,
              map: match.config.map,
              difficulty: match.config.difficulty,
              players: actors.filter((actor) => !actor.bot).length,
              bots: actors.filter((actor) => actor.bot).length,
              capacity: 8,
              phase: match.state().rounds.phase,
            };
          }),
        }),
      );
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
    { id: string; room: string; last: number; count: number; window: number; chatAt: number }
  >();
  const snapshot = (room: string, id: string) => {
    const match = rooms.get(room)!;
    return {
      protocol: PROTOCOL_VERSION,
      type: 'state',
      room,
      self: id,
      hostId: hosts.get(room),
      actors: match.snapshot(),
      ...match.state(),
      matchId: (roomEpochs.get(room) ?? 0) + match.state().matchId,
    };
  };
  const broadcast = (room: string) => {
    for (const [client, info] of clients)
      if (
        info.room === room &&
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < 65536
      )
        client.send(JSON.stringify(snapshot(room, info.id)));
  };
  wss.on('connection', (ws) => {
    connectionCount++;
    let authenticating = false;
    let lastToken = '';
    const timeout = setTimeout(() => ws.close(1008, 'Login obrigatório'), 8000);
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (!data || typeof data !== 'object' || Array.isArray(data))
          throw new Error('Mensagem inválida.');
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
          if (data.type === 'chat') {
            const now = Date.now();
            if (
              typeof data.text !== 'string' ||
              data.text.length > 160 ||
              typeof data.team !== 'boolean' ||
              now - joined.chatAt < 750
            ) {
              ws.send(
                JSON.stringify({
                  type: 'notice',
                  message: 'Envie até 160 caracteres e aguarde antes de enviar outra mensagem.',
                }),
              );
              return;
            }
            const text = data.text.replace(/[\u0000-\u001f\u007f]/g, '').trim();
            if (!text) return;
            joined.chatAt = now;
            const match = rooms.get(joined.room);
            if (data.team && match?.mode === 'deathmatch') {
              ws.send(
                JSON.stringify({
                  type: 'notice',
                  message: 'Este modo não possui equipes. Use o chat global.',
                }),
              );
              return;
            }
            const actor = match?.actors.get(joined.id);
            if (!actor) return;
            const message = JSON.stringify({
              type: 'chat',
              id: joined.id,
              name: actor.name,
              team: data.team,
              text,
              at: now,
            });
            for (const [client, info] of clients) {
              if (
                info.room === joined.room &&
                (!data.team || rooms.get(joined.room)?.actors.get(info.id)?.team === actor.team) &&
                client.readyState === WebSocket.OPEN &&
                client.bufferedAmount < 65536
              )
                client.send(message);
            }
            return;
          }
          if (data.type === 'configure') {
            if (hosts.get(joined.room) !== joined.id) {
              ws.send(
                JSON.stringify({
                  type: 'notice',
                  message: 'Somente o anfitrião pode configurar a sala.',
                }),
              );
              return;
            }
            try {
              const previous = rooms.get(joined.room)!;
              const config = normalizeMatchConfig({
                ...previous.config,
                ...strictConfig(data.config),
              });
              const humans = [...previous.actors.values()].filter((actor) => !actor.bot);
              if (humans.length + config.bots > 8)
                throw new Error('A sala comporta 8 participantes. Reduza a quantidade de bots.');
              const next = new Match(config);
              for (const actor of humans) {
                next.add(actor.id, false, actor.team, actor.name);
                // Connected clients keep their command sequence numbers across matches.
                // Consume even commands awaiting the previous simulation tick; never replay
                // a discarded gun, an old purchase or a released trigger on the fresh spawn.
                const replacement = next.actors.get(actor.id)!;
                replacement.dropSequence = Math.max(actor.dropSequence, actor.input.dropSequence);
                replacement.reloadSequence = Math.max(
                  actor.reloadSequence,
                  actor.input.reloadSequence,
                );
                replacement.buySequence = Math.max(actor.buySequence, actor.input.buySequence);
                replacement.input = {
                  ...replacement.input,
                  fireSequence: actor.input.fireSequence,
                  dropSequence: replacement.dropSequence,
                  reloadSequence: replacement.reloadSequence,
                  buySequence: replacement.buySequence,
                };
                replacement.gun.resetTrigger(replacement.input.fireSequence);
                replacement.equipment.observe(replacement.input.fireSequence);
              }
              for (let i = 0; i < config.bots; i++)
                next.add(`bot-${i}`, true, 'auto', `BOT ${i + 1}`);
              roomEpochs.set(
                joined.room,
                (roomEpochs.get(joined.room) ?? 0) + previous.state().matchId,
              );
              rooms.set(joined.room, next);
              broadcast(joined.room);
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'notice',
                  message: error instanceof Error ? error.message : 'Configuração inválida.',
                }),
              );
            }
            return;
          }
          if (data.type === 'restart') {
            if (hosts.get(joined.room) !== joined.id) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Somente o anfitrião pode reiniciar a partida.',
                }),
              );
              return;
            }
            rooms.get(joined.room)?.restart();
            broadcast(joined.room);
            return;
          }
          const input = parseInput(data.input);
          if (data.type === 'input' && input) rooms.get(joined.room)?.input(joined.id, input);
          return;
        }
        if (authenticating) return;
        if (data.protocol !== PROTOCOL_VERSION)
          throw new Error('Versão incompatível. Atualize o jogo e o servidor.');
        if (data.type !== 'join' || typeof data.token !== 'string' || data.token.length > 4096)
          throw new Error('Conexão inválida.');
        if (data.create !== undefined && typeof data.create !== 'boolean')
          throw new Error('Escolha de sala inválida.');
        const options = joinOptions(data);
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
          do {
            room = randomBytes(3).toString('hex').toUpperCase();
          } while (rooms.has(room));
          match = new Match(options.config);
          match.add(id, false, options.team, options.name);
          for (let i = 0; i < options.config.bots; i++)
            match.add(`bot-${i}`, true, 'auto', `BOT ${i + 1}`);
          rooms.set(room, match);
          hosts.set(room, id);
          roomEpochs.set(room, 0);
        } else {
          if (typeof data.room !== 'string' || !/^[0-9A-F]{6}$/.test(data.room))
            throw new Error('Código de sala inválido.');
          room = data.room;
          const existing = rooms.get(room);
          if (!existing) throw new Error('Sala não encontrada.');
          match = existing;
          match.add(id, false, options.team, options.name);
        }
        clearTimeout(timeout);
        clients.set(ws, { id, room, last: Date.now(), count: 0, window: Date.now(), chatAt: 0 });
        ws.send(JSON.stringify(snapshot(room, id)));
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
    // Browsers answer protocol pings even when animation/input stops in a background
    // tab or during shader compilation. Stale gameplay input still expires in Match.
    ws.on('pong', () => {
      const client = clients.get(ws);
      if (client) client.last = Date.now();
    });
    ws.on('close', () => {
      connectionCount--;
      clearInterval(revalidate);
      clearTimeout(timeout);
      const c = clients.get(ws);
      if (!c) return;
      clients.delete(ws);
      const match = rooms.get(c.room);
      match?.actors.delete(c.id);
      if (match && ![...match.actors.values()].some((a) => !a.bot)) {
        rooms.delete(c.room);
        hosts.delete(c.room);
        roomEpochs.delete(c.room);
      } else if (match && hosts.get(c.room) === c.id) {
        hosts.set(c.room, [...match.actors.values()].find((actor) => !actor.bot)!.id);
        broadcast(c.room);
      }
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
        ws.send(JSON.stringify(snapshot(c.room, c.id)));
    }
  }, 50);
  const heartbeat = setInterval(() => {
    for (const [ws] of clients) if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 5000);
  return {
    http,
    wss,
    rooms,
    async close() {
      clearInterval(tick);
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
