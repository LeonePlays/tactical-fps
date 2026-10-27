import { localPractice } from './network/local';
import type { MatchState } from './network/protocol';
import { connectRoom } from './network/connection';
import { WEAPONS } from './game/ballistics';
import { mountAccount } from './auth/account';
import './styles/main.css';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './core/settings';
import { renderView } from './ui/view';
import type { Game, GameSnapshot } from './game/game';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root is missing');
renderView(root);
const buildBadge = document.createElement('span');
buildBadge.className = 'build-badge';
buildBadge.textContent = 'BETA · CONTAS + BOTS LOCAIS · 27/10';
document.querySelector('.menu-footer')!.append(buildBadge);
const el = <T extends HTMLElement = HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Required interface element is missing: ${id}`);
  return node as T;
};
const canvas = el<HTMLCanvasElement>('game-canvas');
const menu = el('menu-shell');
const hud = el('hud');
const pause = el('pause-overlay');
const settingsOverlay = el('settings-overlay');
const controlsOverlay = el('controls-overlay');
const form = el<HTMLFormElement>('settings-form');
const startButton = el<HTMLButtonElement>('start-button');
const startLabel = el('start-label');
const startHelp = el('start-help');
const settingsMessage = el('settings-message');
let roomConnection: ReturnType<typeof connectRoom> | undefined;
let connecting = false;
let roomReady = false;
let currentRoom = '';
let localMode = false;
let latestRoom: MatchState | undefined;
const lobby = document.createElement('section');
lobby.className = 'local-lobby';
lobby.innerHTML = `<button id="local-bots" class="button primary">JOGAR COM BOTS NESTE COMPUTADOR</button><details><summary>SALAS COM JOGADORES E BOTS</summary><p>Inicie o servidor local para criar uma sala. Cada jogador precisa de uma conta.</p><label>Servidor <input id="room-server" aria-label="Servidor de partidas" value="ws://127.0.0.1:3001" maxlength="200"></label><label>Bots <select id="room-bots"><option>0</option><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><button id="create-room" class="button secondary">CRIAR SALA</button><label>Código <input id="room-code" maxlength="6" placeholder="ABC123"></label><button id="join-room" class="button secondary">ENTRAR NA SALA</button><button id="disconnect-room" class="button text-button">VOLTAR AO TREINO INDIVIDUAL</button><p id="room-message" role="status"></p></details>`;
document.querySelector('.hero')!.append(lobby);
el<HTMLInputElement>('room-server').value =
  import.meta.env.VITE_MATCH_SERVER_URL || 'ws://127.0.0.1:3001';
let settings = loadSettings();
let game: Game | undefined;
let inSession = false;
let entering = false;
let previousFocus: HTMLElement | null = null;
let latestSnapshot: GameSnapshot | undefined;
const account = mountAccount((user, cloudSettings) => {
  settings = cloudSettings || { ...DEFAULT_SETTINGS };
  game?.applySettings(settings);
  if (!user) {
    roomConnection?.close();
    roomConnection = undefined;
    connecting = false;
    if (roomReady) {
      roomReady = false;
      game?.dispose();
      game = undefined;
      void boot();
    }
    inSession = false;
    game?.showMenu();
    hud.hidden = true;
    pause.hidden = true;
    menu.hidden = false;
    settingsOverlay.hidden = true;
    controlsOverlay.hidden = true;
  }
});
function saveTraining() {
  if (!roomReady && inSession && latestSnapshot) {
    const { hits, shots, elapsed } = latestSnapshot;
    account.save({ last_training: { hits, shots, elapsed, savedAt: new Date().toISOString() } });
  }
}
let tipTimer: ReturnType<typeof setTimeout> | undefined;

function announceError(message: string): void {
  el('error-banner').textContent = message;
  el('error-banner').hidden = false;
}
function closeError(): void {
  el('error-banner').hidden = true;
}

function onLockChange(locked: boolean): void {
  if (locked) inSession = true;
  hud.hidden = !locked;
  menu.hidden = inSession;
  pause.hidden = locked || !inSession;
  if (locked) {
    closeError();
    settingsOverlay.hidden = true;
    controlsOverlay.hidden = true;
    el('training-tip').hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      el('training-tip').hidden = true;
    }, 6500);
  } else if (inSession) {
    saveTraining();
    pause.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
  }
}

function updateHud(state: GameSnapshot): void {
  latestSnapshot = state;
  document.querySelector('.hud-ammo .label')!.textContent = WEAPONS[state.weapon].name;
  document.querySelector('.hud-ammo div > span')!.textContent =
    `/ ${WEAPONS[state.weapon].capacity}`;
  el('ammo-count').textContent = String(state.ammo).padStart(2, '0');
  const own = roomReady ? latestRoom?.actors.find((a) => a.id === latestRoom?.self) : undefined;
  document.querySelector('.hud-score .label')!.textContent = roomReady
    ? 'ELIMINAÇÕES'
    : 'ALVOS ATINGIDOS';
  el('hit-count').textContent = String(own?.kills ?? state.hits).padStart(2, '0');
  el('accuracy').textContent = state.shots
    ? `${Math.round((state.hits / state.shots) * 100)}%`
    : '—';
  el('session-time').textContent = `${Math.floor(state.elapsed / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(state.elapsed % 60)
    .toString()
    .padStart(2, '0')}`;
  el('stance-label').textContent = { standing: 'EM PÉ', crouching: 'AGACHADO', prone: 'DEITADO' }[
    state.stance
  ];
  el('movement-label').textContent = state.sprinting
    ? 'CORRENDO'
    : !state.grounded
      ? 'NO AR'
      : 'EM OPERAÇÃO';
  el('reload-label').textContent = state.reloading ? 'RECARREGANDO…' : 'R · RECARREGAR / ∞ RESERVA';
  const bearing = ((((state.yaw * 180) / Math.PI) % 360) + 360) % 360;
  el('bearing').textContent = `${Math.round(bearing).toString().padStart(3, '0')}°`;
  el('coordinates').textContent =
    `X ${state.position.x.toFixed(1)} / Z ${state.position.z.toFixed(1)}`;
  el('fps-counter').textContent = `${state.fps} FPS`;
  el('fps-counter').hidden = !settings.showFps;
  el('hit-marker').hidden = !state.hit;
  // Read-only observability for browser regression tests and developer inspection.
  hud.dataset.elapsed = String(state.elapsed);
  hud.dataset.position = JSON.stringify(state.position);
  hud.dataset.stance = state.stance;
  hud.dataset.grounded = String(state.grounded);
}

function fillSettings(value: Settings): void {
  for (const key of ['sensitivity', 'fov', 'volume', 'quality'] as const) {
    (form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement).value = String(
      value[key],
    );
  }
  for (const key of ['invertY', 'showFps'] as const)
    (form.elements.namedItem(key) as HTMLInputElement).checked = value[key];
  updateOutputs();
}
function updateOutputs(): void {
  el('sensitivity-value').textContent =
    `${Number((form.elements.namedItem('sensitivity') as HTMLInputElement).value).toFixed(1)}×`;
  el('fov-value').textContent = `${(form.elements.namedItem('fov') as HTMLInputElement).value}°`;
  el('volume-value').textContent =
    `${Math.round(Number((form.elements.namedItem('volume') as HTMLInputElement).value) * 100)}%`;
}
function openDialog(kind: 'settings' | 'controls'): void {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = kind === 'settings' ? settingsOverlay : controlsOverlay;
  if (kind === 'settings') {
    fillSettings(settings);
    settingsMessage.textContent = 'Ajustes salvos na conta; confira o status no menu.';
  }
  overlay.hidden = false;
  (overlay.querySelector('button') as HTMLButtonElement)?.focus();
}
function closeDialog(kind: 'settings' | 'controls'): void {
  (kind === 'settings' ? settingsOverlay : controlsOverlay).hidden = true;
  previousFocus?.focus();
}

async function enterGame(fresh = false): Promise<void> {
  if (!game || entering || !account.canPlay) return;
  entering = true;
  const wasInSession = inSession;
  try {
    if (fresh && !roomReady) {
      saveTraining();
      game.reset();
    }
    inSession = true;
    await game.enter();
    el('pause-message').textContent =
      roomReady && !localMode ? 'A partida continua online durante a pausa.' : '';
  } catch {
    inSession = wasInSession;
    onLockChange(false);
    announceError(
      'Não foi possível capturar o mouse. Clique novamente em iniciar ou continuar. Use um navegador de computador com WebGL em HTTPS ou localhost e permita o bloqueio do ponteiro.',
    );
  } finally {
    entering = false;
  }
}

root.addEventListener('click', (event) => {
  const target =
    event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
  if (!target) return;
  event.preventDefault();
  switch (target.dataset.action) {
    case 'start':
      void enterGame(true);
      break;
    case 'resume':
      void enterGame();
      break;
    case 'restart':
      void enterGame(!roomReady);
      break;
    case 'settings':
      openDialog('settings');
      break;
    case 'controls':
      openDialog('controls');
      break;
    case 'close-settings':
      closeDialog('settings');
      break;
    case 'close-controls':
      closeDialog('controls');
      break;
    case 'defaults':
      fillSettings({ ...DEFAULT_SETTINGS });
      break;
    case 'home':
    case 'play-tab':
      settingsOverlay.hidden = true;
      controlsOverlay.hidden = true;
      startButton.focus();
      break;
    case 'leave':
      saveTraining();
      inSession = false;
      game?.showMenu();
      hud.hidden = true;
      pause.hidden = true;
      menu.hidden = false;
      closeError();
      startButton.focus();
      break;
  }
});
form.addEventListener('input', updateOutputs);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  settings = {
    sensitivity: Number(input('sensitivity').value),
    fov: Number(input('fov').value),
    volume: Number(input('volume').value),
    quality: input('quality').value === 'low' ? 'low' : 'high',
    invertY: input('invertY').checked,
    showFps: input('showFps').checked,
  };
  game?.applySettings(settings);
  account.save({ settings });
  if (saveSettings(settings)) {
    closeDialog('settings');
    startHelp.textContent = 'Ajustes salvos. Teclado + mouse · ESC para pausar';
  } else {
    settingsMessage.textContent =
      'Ajustes aplicados nesta sessão. O navegador bloqueou o armazenamento local.';
  }
});

// Keep keyboard focus in the topmost open dialog, including the pause menu.
document.addEventListener('keydown', (event) => {
  const overlay = !controlsOverlay.hidden
    ? controlsOverlay
    : !settingsOverlay.hidden
      ? settingsOverlay
      : !pause.hidden
        ? pause
        : null;
  if (!overlay) return;
  if (event.key === 'Escape') {
    if (overlay === settingsOverlay) closeDialog('settings');
    else if (overlay === controlsOverlay) closeDialog('controls');
    return;
  }
  if (event.key !== 'Tab') return;
  const nodes = [
    ...overlay.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input, select, [tabindex="0"]',
    ),
  ];
  const first = nodes[0];
  const last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});

async function joinRoom(create: boolean, local = false) {
  if (!account.canPlay || connecting || roomConnection) return;
  connecting = true;
  localMode = local;
  el('room-message').textContent = 'Conectando…';
  try {
    const token = await account.token();
    if (!token) throw new Error('Entre novamente na conta.');
    const { Game: GameClass } = await import('./game/game');
    const options = {
      url: el<HTMLInputElement>('room-server').value,
      token,
      create,
      bots: Number(el<HTMLSelectElement>('room-bots').value),
      room: el<HTMLInputElement>('room-code').value.trim().toUpperCase(),
      state: (state: MatchState) => {
        if (!roomReady) {
          game?.dispose();
          game = new GameClass(
            canvas,
            settings,
            {
              onLockChange,
              onSnapshot: updateHud,
              onInput: (input) => roomConnection?.send(input),
            },
            true,
          );
          startButton.disabled = true;
          const roomGame = game;
          void roomGame
            .ready()
            .then(() => {
              if (game === roomGame) startButton.disabled = false;
            })
            .catch(() => {
              el('room-message').textContent =
                'Não foi possível preparar a arena 3D. Volte ao treino e tente novamente.';
            });
          roomReady = true;
          currentRoom = state.room;
          startLabel.textContent = 'ENTRAR NA ARENA';
          el('pause-message').textContent = local
            ? 'Treino com bots pausado.'
            : 'A partida continua online durante a pausa.';
        }
        connecting = false;
        latestRoom = state;
        hud.dataset.room = state.room;
        hud.dataset.actors = String(state.actors.length);
        game?.applyMatch(state);
        const own = state.actors.find((a) => a.id === state.self);
        el('room-message').textContent = local
          ? `TREINO COM ${state.actors.filter((a) => a.bot).length} BOTS · neste computador, sem servidor de salas.`
          : `SALA ${state.room} · ${state.actors.filter((a) => !a.bot).length} jogadores · ${state.actors.filter((a) => a.bot).length} bots. Compartilhe o código.`;
        document.querySelector('.health-icon + strong')!.firstChild!.textContent = String(
          own?.health || 0,
        );
        el('training-tip').textContent =
          own?.health === 0
            ? 'ELIMINADO — REAPARECIMENTO EM 3 SEGUNDOS'
            : `SALA ${currentRoom} · ${own?.kills || 0} eliminações / ${own?.deaths || 0} mortes · laranja: bots, azul: jogadores`;
        document.querySelector('.hud-top-left strong')!.textContent = `ARENA / ${state.room}`;
        document.querySelector('.hud-top-left .label')!.textContent = 'COMBATE LIVRE';
        if (own?.health === 0) el('training-tip').hidden = false;
      },
      closed: (message: string) => {
        connecting = false;
        game?.pause();
        inSession = false;
        hud.hidden = true;
        pause.hidden = true;
        menu.hidden = false;
        el('room-message').textContent = message;
        startButton.disabled = true;
      },
    };
    roomConnection = local ? localPractice(options.bots, options.state) : connectRoom(options);
  } catch (error) {
    connecting = false;
    el('room-message').textContent = error instanceof Error ? error.message : 'Falha ao conectar.';
  }
}
el('local-bots').addEventListener('click', () => void joinRoom(true, true));
el('create-room').addEventListener('click', () => void joinRoom(true));
el('join-room').addEventListener('click', () => void joinRoom(false));
el('disconnect-room').addEventListener('click', () => {
  roomConnection?.close();
  roomConnection = undefined;
  roomReady = false;
  connecting = false;
  inSession = false;
  game?.dispose();
  game = undefined;
  hud.hidden = true;
  pause.hidden = true;
  menu.hidden = false;
  startButton.disabled = true;
  latestRoom = undefined;
  delete hud.dataset.room;
  delete hud.dataset.actors;
  document.querySelector('.health-icon + strong')!.firstChild!.textContent = '100';
  el('room-message').textContent = 'Desconectado.';
  void boot();
});

async function boot(): Promise<void> {
  document.querySelector('.hud-top-left strong')!.textContent = 'COMPLEXO FERRO';
  document.querySelector('.hud-top-left .label')!.textContent = 'TREINO LIVRE';
  el('training-tip').textContent =
    'Explore o complexo e acerte os alvos laranja. Eles retornam após 4 segundos.';
  try {
    const { Game: GameClass } = await import('./game/game');
    game = new GameClass(canvas, settings, { onLockChange, onSnapshot: updateHud });
    await game.ready();
    startLabel.textContent = 'INICIAR TREINO';
    startHelp.textContent = 'Teclado + mouse · Clique para capturar o ponteiro';
    startButton.disabled = false;
  } catch (error) {
    startLabel.textContent = 'CAMPO INDISPONÍVEL';
    startHelp.textContent = 'Não foi possível iniciar o motor 3D.';
    announceError(
      'O motor 3D não iniciou. Verifique a conexão e a disponibilidade de WebGL/aceleração gráfica no navegador e recarregue a página.',
    );
    console.error('TACTICAL FPS initialization failed:', error);
    game?.dispose();
  }
}
void boot();
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    roomConnection?.close();
    game?.dispose();
  }
});
