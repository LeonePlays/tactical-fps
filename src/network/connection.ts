import type { MatchConfig, MatchMode, TeamPreference } from '../game/match-config';
import { PROTOCOL_VERSION, type MatchInput, type MatchState } from './protocol';
export function connectRoom(options: {
  url: string;
  token: string;
  create: boolean;
  bots: number;
  mode?: MatchMode;
  config?: Partial<MatchConfig>;
  name?: string;
  team?: TeamPreference;
  room: string;
  state: (state: MatchState) => void;
  closed: (message: string) => void;
}) {
  const url = new URL(options.url);
  if (
    !['ws:', 'wss:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Endereço de servidor inválido.');
  if (location.protocol === 'https:' && url.protocol !== 'wss:')
    throw new Error('Em HTTPS, use um servidor WSS.');
  const ws = new WebSocket(url);
  let message = 'Conexão encerrada. Volte ao treino ou conecte novamente.';
  let intentional = false;
  const timeout = setTimeout(() => {
    message = 'Servidor não respondeu.';
    ws.close();
  }, 10000);
  ws.onopen = () =>
    ws.send(
      JSON.stringify({
        type: 'join',
        protocol: PROTOCOL_VERSION,
        token: options.token,
        create: options.create,
        ...(options.config
          ? { config: options.config }
          : { bots: options.bots, mode: options.mode ?? 'deathmatch' }),
        name: options.name,
        team: options.team,
        room: options.room,
      }),
    );
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'state' && data.protocol !== PROTOCOL_VERSION) {
        message = 'Servidor desatualizado. Atualize o frontend e o servidor juntos.';
        ws.close();
        return;
      }
      if (data.type === 'error') {
        message = String(data.message);
        ws.close();
      } else if (
        data.type === 'state' &&
        typeof data.room === 'string' &&
        typeof data.self === 'string' &&
        Array.isArray(data.actors)
      ) {
        clearTimeout(timeout);
        options.state(data);
      }
    } catch {
      message = 'Resposta inválida do servidor.';
      ws.close();
    }
  };
  ws.onclose = () => {
    clearTimeout(timeout);
    if (!intentional) options.closed(message);
  };
  ws.onerror = () => {
    message = 'Não foi possível conectar ao servidor. Confira o endereço e se ele está iniciado.';
  };
  return {
    send(input: MatchInput) {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 16384)
        ws.send(JSON.stringify({ type: 'input', input }));
    },
    restart() {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 16384)
        ws.send(JSON.stringify({ type: 'restart' }));
    },
    close() {
      intentional = true;
      clearTimeout(timeout);
      ws.close();
    },
  };
}
