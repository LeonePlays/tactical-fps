import type { ChatMessage } from '../network/connection';
import type { MatchState } from '../network/protocol';
import { normalizeMatchConfig, type MatchConfig } from '../game/match-config';
import './online-controls.css';

/** Room tools use real transport callbacks; no messages or players are simulated. */
export function mountOnlineControls(hooks: {
  pause: () => void;
  resume: () => void | Promise<void>;
  sendChat: (text: string, team: boolean) => void;
  configure: (config: Partial<MatchConfig>) => void;
}) {
  let state: MatchState | null = null;
  let channel = false;
  let panel: 'chat' | 'host' | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const root = document.createElement('div');
  root.id = 'online-tools';
  root.innerHTML = `
    <ol id="online-chat-log" aria-label="Mensagens da sala" aria-live="polite" hidden></ol>
    <p id="online-notice" role="status" hidden></p>
    <div id="online-chat-overlay" class="overlay" hidden>
      <form id="online-chat-form" class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="online-chat-title">
        <h2 id="online-chat-title">CHAT GLOBAL</h2>
        <label class="profile-name-label">Mensagem<input id="online-chat-input" maxlength="160" autocomplete="off" placeholder="Escreva para a sala" required></label>
        <div class="dialog-actions"><button type="button" class="button secondary" data-close-online>VOLTAR</button><button class="button primary" type="submit">ENVIAR</button></div>
        <p class="dialog-note">Enter envia · Esc volta à partida · até 160 caracteres</p>
      </form>
    </div>
    <div id="online-host-overlay" class="overlay" hidden>
      <form id="online-host-form" class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="online-host-title">
        <h2 id="online-host-title">CONFIGURAÇÕES DO ANFITRIÃO</h2>
        <label class="setting-row">Mapa<select name="map"><option value="industrial">Complexo Ferro</option><option value="old-quarter">Bairro Antigo</option></select></label>
        <label class="setting-row">Modo<select name="mode"><option value="deathmatch">Combate livre</option><option value="team-deathmatch">Combate em equipes</option><option value="defuse">Bomba</option></select></label>
        <label class="setting-row">Bots<input type="number" name="bots" min="0" max="4" required></label>
        <label class="setting-row">Dificuldade<select name="difficulty"><option value="easy">Fácil</option><option value="normal">Normal</option><option value="hard">Difícil</option></select></label>
        <label class="setting-row">Tempo (segundos)<input type="number" name="timeLimit" min="30" max="1800" required></label>
        <label class="setting-row">Limite de pontos/rodadas<input type="number" name="scoreLimit" min="1" max="100" required></label>
        <p class="dialog-note">Aplicar inicia outra partida para todos na mesma sala. O placar é zerado.</p>
        <div class="dialog-actions"><button type="button" class="button secondary" data-close-online>VOLTAR</button><button class="button primary" type="submit">APLICAR E REINICIAR</button></div>
      </form>
    </div>`;
  document.body.append(root);
  const element = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const log = element<HTMLOListElement>('online-chat-log');
  const chatOverlay = element('online-chat-overlay');
  const hostOverlay = element('online-host-overlay');
  const input = element<HTMLInputElement>('online-chat-input');
  const hostForm = element<HTMLFormElement>('online-host-form');
  const noticeElement = element('online-notice');
  const updateLog = () => {
    log.hidden = !state || !log.childElementCount || (!document.pointerLockElement && !panel);
  };
  const notice = (text: string) => {
    noticeElement.textContent = text;
    noticeElement.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      noticeElement.hidden = true;
    }, 4500);
  };
  const close = (resume: boolean) => {
    panel = null;
    chatOverlay.hidden = true;
    hostOverlay.hidden = true;
    if (resume && state)
      void Promise.resolve(hooks.resume()).catch(() =>
        notice('Clique em continuar para voltar à partida.'),
      );
    updateLog();
  };
  const open = (kind: 'chat' | 'host') => {
    panel = kind;
    hooks.pause();
    chatOverlay.hidden = kind !== 'chat';
    hostOverlay.hidden = kind !== 'host';
    updateLog();
    // Pointer-lock release also focuses the pause button; restore the intended input afterwards.
    setTimeout(() => {
      if (panel === kind)
        (kind === 'chat' ? input : hostForm.querySelector<HTMLSelectElement>('select'))?.focus();
    }, 0);
  };
  window.addEventListener(
    'keydown',
    (event) => {
      if (panel) {
        event.stopImmediatePropagation();
        if (event.code === 'Escape') {
          event.preventDefault();
          close(true);
        }
        return;
      }
      if (
        !state ||
        !document.pointerLockElement ||
        event.repeat ||
        !['KeyT', 'KeyY', 'KeyH'].includes(event.code)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'KeyH') {
        if (state.hostId !== state.self)
          return notice('Somente o anfitrião pode configurar a sala.');
        for (const [key, value] of Object.entries(state.config)) {
          const control = hostForm.elements.namedItem(key) as
            HTMLInputElement | HTMLSelectElement | null;
          if (control) control.value = String(value);
        }
        open('host');
        return;
      }
      channel = event.code === 'KeyY';
      if (channel && state.config.mode === 'deathmatch')
        return notice('Este modo não possui equipes. Use T para o chat global.');
      element('online-chat-title').textContent = channel ? 'CHAT DA EQUIPE' : 'CHAT GLOBAL';
      input.value = '';
      open('chat');
    },
    { capture: true, signal: abort.signal },
  );
  element<HTMLFormElement>('online-chat-form').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      if (!state || !input.value.trim()) return;
      hooks.sendChat(input.value.trim(), channel);
      close(true);
    },
    options,
  );
  hostForm.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      if (!state || state.hostId !== state.self) return close(false);
      const data = new FormData(hostForm);
      hooks.configure(
        normalizeMatchConfig({
          ...state.config,
          ...Object.fromEntries(data),
          bots: Number(data.get('bots')),
          timeLimit: Number(data.get('timeLimit')),
          scoreLimit: Number(data.get('scoreLimit')),
        }),
      );
      close(false);
    },
    options,
  );
  for (const button of root.querySelectorAll('[data-close-online]'))
    button.addEventListener('click', () => close(true), options);
  document.addEventListener(
    'pointerlockchange',
    () => {
      updateLog();
      if (!document.pointerLockElement && panel)
        (panel === 'chat' ? input : hostForm.querySelector<HTMLSelectElement>('select'))?.focus();
    },
    options,
  );
  return {
    setState(next: MatchState | null) {
      if (state?.room !== next?.room) log.replaceChildren();
      if (!next || (state && next.matchId !== state.matchId)) close(false);
      if (panel === 'host' && next?.hostId !== next?.self) close(false);
      state = next;
      updateLog();
    },
    receive(message: ChatMessage) {
      if (!state) return;
      const entry = document.createElement('li');
      entry.textContent = `${message.team ? '[EQUIPE]' : '[SALA]'} ${message.name}: ${message.text}`;
      log.append(entry);
      while (log.childElementCount > 6) log.firstElementChild?.remove();
      updateLog();
    },
    notice,
    dispose() {
      abort.abort();
      clearTimeout(noticeTimer);
      root.remove();
    },
  };
}
