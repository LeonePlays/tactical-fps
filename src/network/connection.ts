import type { MatchInput, MatchState } from './protocol';
export function connectRoom(options: {
  url: string;
  token: string;
  create: boolean;
  bots: number;
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
        token: options.token,
        create: options.create,
        bots: options.bots,
        room: options.room,
      }),
    );
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'error') {
        message = String(data.message);
        options.closed(message);
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
    close() {
      intentional = true;
      clearTimeout(timeout);
      ws.close();
    },
  };
}
