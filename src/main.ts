import type { MatchMode } from './game/rounds';
import { localPractice } from './network/local';
import type { MatchState } from './network/protocol';
import { connectRoom } from './network/connection';
import { ClassicHud } from './ui/classic-hud';
import { mountAccount } from './auth/account';
import './styles/main.css';
import './styles/classic.css';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './core/settings';
import { renderView } from './ui/view';
import type { Game, GameSnapshot } from './game/game';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root is missing');
renderView(root);
const buildBadge = document.createElement('span');
buildBadge.className = 'build-badge';
buildBadge.textContent = 'TACTICAL FPS · BETA 0.3 · VISITANTE';
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
const classicHud = new ClassicHud(hud);
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
lobby.innerHTML = `<button id="local-bots" class="button primary">JOGAR COM BOTS NESTE COMPUTADOR</button><label>Modo <select id="match-mode"><option value="deathmatch">Combate livre · 3 min</option><option value="defuse">Bomba · equipes / melhor de 5</option></select></label><label>Bots <select id="room-bots"><option>0</option><option>1</option><option>2</option><option selected>3</option><option>4</option></select></label><details><summary>MULTIPLAYER · SERVIDOR PRÓPRIO</summary><p>Inicie o servidor local para criar uma sala. Cada jogador precisa de uma conta.</p><label>Servidor <input id="room-server" aria-label="Servidor de partidas" value="ws://127.0.0.1:3001" maxlength="200"></label><button id="create-room" class="button secondary">CRIAR SALA</button><label>Código <input id="room-code" maxlength="6" placeholder="ABC123"></label><button id="join-room" class="button secondary">ENTRAR NA SALA</button><button id="disconnect-room" class="button text-button">VOLTAR AO TREINO INDIVIDUAL</button><p id="room-message" role="status"></p></details>`;
document.querySelector('.hero')!.append(lobby);
el<HTMLInputElement>('room-server').value =
  import.meta.env.VITE_MATCH_SERVER_URL || 'ws://127.0.0.1:3001';
let settings = loadSettings();
let game: Game | undefined;
let inSession = false;
let entering = false;
let previousFocus: HTMLElement | null = null;
let latestSnapshot: GameSnapshot | undefined;
let accountId: string | undefined;
let gameGeneration = 0;
const account = mountAccount((user, cloudSettings) => {
  settings = cloudSettings || loadSettings();
  game?.applySettings(settings);
  const previousAccount = accountId;
  accountId = user?.id;
  // Local practice stays available across authentication changes.
  if (previousAccount && previousAccount !== accountId && !localMode && roomConnection)
    disconnectRoom();
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
  if (!el('result-overlay').hidden) {
    hud.hidden = true;
    pause.hidden = true;
    menu.hidden = true;
    return;
  }
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
  const own = roomReady ? latestRoom?.actors.find((a) => a.id === latestRoom?.self) : undefined;
  classicHud.update(state, settings.showFps, own?.kills, settings.dynamicCrosshair);
  const round = latestRoom?.rounds;
  if (roomReady && round) {
    const sec = Math.ceil(round.remaining);
    el('session-time').textContent = `${Math.floor(sec / 60)
      .toString()
      .padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;
    const progress = round.interaction;
    el('objective-banner').textContent =
      round.mode === 'defuse'
        ? `${round.scores.alpha} : ${round.scores.bravo} · RODADA ${round.round} · ${round.phase === 'freeze' ? 'PREPARE-SE' : round.phase === 'round-over' ? round.reason : round.bomb?.status === 'planted' ? 'BOMBA ATIVA · DEFENDA OU DESARME' : own?.team === 'alpha' ? 'ALPHA · E para plantar na área A' : 'BRAVO · impeça o plantio / E para desarmar'}${progress ? ` · ${progress.action === 'plant' ? 'PLANTANDO' : 'DESARMANDO'} ${Math.round((progress.progress / progress.duration) * 100)}%` : ''}`
        : `COMBATE LIVRE · primeiro a 10 eliminações / 3 minutos`;
    el('objective-banner').hidden = false;
  } else el('objective-banner').hidden = true;
}

function fillSettings(value: Settings): void {
  for (const key of ['sensitivity', 'fov', 'volume', 'quality'] as const) {
    (form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement).value = String(
      value[key],
    );
  }
  for (const key of ['invertY', 'showFps', 'dynamicCrosshair'] as const)
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
    settingsMessage.textContent = account.isGuest
      ? 'Ajustes salvos somente neste navegador.'
      : 'Ajustes salvos na conta; confira o status no menu.';
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
    case 'quick-play':
      if (roomReady) void enterGame();
      else void joinRoom(true, true);
      break;
    case 'start':
      void enterGame(true);
      break;
    case 'resume':
      void enterGame();
      break;
    case 'restart':
      if (roomReady && localMode) {
        disconnectRoom(false);
        void joinRoom(true, true);
      } else void enterGame(!roomReady);
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
    dynamicCrosshair: input('dynamicCrosshair').checked,
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
  const accountDialog = document.querySelector<HTMLElement>('.account-overlay:not([hidden])');
  const overlay =
    accountDialog ||
    (!el('result-overlay').hidden
      ? el('result-overlay')
      : !controlsOverlay.hidden
        ? controlsOverlay
        : !settingsOverlay.hidden
          ? settingsOverlay
          : !pause.hidden
            ? pause
            : null);
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
  startButton.disabled = true;
  el<HTMLButtonElement>('quick-play').disabled = true;
  el<HTMLButtonElement>('local-bots').disabled = true;
  el('quick-play').textContent = 'PREPARANDO ARENA…';
  localMode = local;
  el('room-message').textContent = 'Conectando…';
  try {
    const token = local ? '' : await account.token();
    if (!local && !token) {
      account.showLogin(
        'Salas entre jogadores exigem uma conta e um servidor. Você pode jogar com bots como visitante.',
      );
      connecting = false;
      startButton.disabled = !game;
      el<HTMLButtonElement>('quick-play').disabled = false;
      el<HTMLButtonElement>('local-bots').disabled = false;
      el('quick-play').textContent = 'JOGAR AGORA · BOTS';
      return;
    }
    const { Game: GameClass } = await import('./game/game');
    const options = {
      url: el<HTMLInputElement>('room-server').value,
      token: token || '',
      create,
      bots: Number(el<HTMLSelectElement>('room-bots').value),
      mode: el<HTMLSelectElement>('match-mode').value as MatchMode,
      room: el<HTMLInputElement>('room-code').value.trim().toUpperCase(),
      state: (state: MatchState) => {
        if (!roomReady) {
          gameGeneration++;
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
          el<HTMLButtonElement>('quick-play').disabled = true;
          const roomGame = game;
          void roomGame
            .ready()
            .then(() => {
              if (game === roomGame) {
                startButton.disabled = false;
                el<HTMLButtonElement>('quick-play').disabled = false;
                el<HTMLButtonElement>('local-bots').disabled = false;
                el('local-bots').textContent = 'NOVA PARTIDA · BOTS';
                el('quick-play').textContent = 'ENTRAR NA PARTIDA';
                startHelp.textContent =
                  'Partida pronta. Clique em ENTRAR NA PARTIDA para capturar o mouse.';
              }
            })
            .catch(() => {
              if (game !== roomGame) return;
              disconnectRoom();
              announceError(
                'Não foi possível preparar a arena 3D. Tente novamente ou use qualidade baixa.',
              );
            });
          const restartButton = pause.querySelector<HTMLButtonElement>('[data-action="restart"]')!;
          restartButton.hidden = !local;
          restartButton.textContent = 'REINICIAR PARTIDA';
          roomReady = true;
          currentRoom = state.room;
          startLabel.textContent = 'ENTRAR NA ARENA';
          el('pause-message').textContent = local
            ? 'Treino com bots pausado.'
            : 'A partida continua online durante a pausa.';
        }
        connecting = false;
        latestRoom = state;
        if (state.rounds.phase === 'match-over' && el('result-overlay').hidden) {
          el('result-overlay').hidden = false;
          game?.pause();
          inSession = false;
          hud.hidden = true;
          pause.hidden = true;
          menu.hidden = true;
          el('result-overlay').hidden = false;
          el('result-title').textContent =
            state.rounds.mode === 'defuse'
              ? `EQUIPE ${state.rounds.winner === 'alpha' ? 'ALPHA' : 'BRAVO'} VENCEU`
              : 'PARTIDA ENCERRADA';
          el('result-description').textContent = state.rounds.reason;
          el('result-score').textContent = state.actors
            .map(
              (a) =>
                `${a.id === state.self ? 'VOCÊ' : a.bot ? 'BOT' : 'JOGADOR'}: ${a.kills} eliminações / ${a.deaths} mortes`,
            )
            .join(' · ');
          el('rematch').hidden = !local;
          account.save({
            last_match: {
              mode: state.rounds.mode,
              scores: state.rounds.scores,
              kills: state.actors.find((a) => a.id === state.self)?.kills || 0,
              savedAt: new Date().toISOString(),
            },
          });
          el('result-home').focus();
        }
        hud.dataset.room = state.room;
        hud.dataset.actors = String(state.actors.length);
        game?.applyMatch(state);
        const own = state.actors.find((a) => a.id === state.self);
        el('room-message').textContent = local
          ? `TREINO COM ${state.actors.filter((a) => a.bot).length} BOTS · neste computador, sem servidor de salas.`
          : `SALA ${state.room} · ${state.actors.filter((a) => !a.bot).length} jogadores · ${state.actors.filter((a) => a.bot).length} bots. Compartilhe o código.`;
        el('training-tip').textContent =
          own?.health === 0
            ? state.rounds.mode === 'defuse'
              ? 'ELIMINADO · AGUARDE A PRÓXIMA RODADA'
              : 'ELIMINADO · REAPARECIMENTO EM 3 SEGUNDOS'
            : `SALA ${currentRoom} · ${own?.kills || 0} eliminações / ${own?.deaths || 0} mortes · B compra · 1/2 armas · 3 faca · 4 granada`;
        document.querySelector('.hud-top-left strong')!.textContent = `ARENA / ${state.room}`;
        document.querySelector('.hud-top-left .label')!.textContent =
          state.rounds.mode === 'defuse'
            ? `BOMBA · EQUIPE ${own?.team === 'alpha' ? 'ALPHA' : 'BRAVO'}`
            : 'COMBATE LIVRE';
        if (own?.health === 0) el('training-tip').hidden = false;
      },
      closed: (message: string) => {
        disconnectRoom();
        announceError(message);
        el('room-message').textContent = message;
      },
    };
    roomConnection = local
      ? localPractice(options.bots, options.state, options.mode)
      : connectRoom(options);
  } catch (error) {
    connecting = false;
    startButton.disabled = !game;
    el<HTMLButtonElement>('quick-play').disabled = false;
    el<HTMLButtonElement>('local-bots').disabled = false;
    el('quick-play').textContent = 'JOGAR AGORA · BOTS';
    el('room-message').textContent = error instanceof Error ? error.message : 'Falha ao conectar.';
  }
}
el('local-bots').addEventListener('click', () => {
  if (roomReady) disconnectRoom(false);
  void joinRoom(true, true);
});
el('create-room').addEventListener('click', () => void joinRoom(true));
el('join-room').addEventListener('click', () => void joinRoom(false));
function disconnectRoom(reboot = true) {
  gameGeneration++;
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
  el('health-count').textContent = '100';
  el('room-message').textContent = 'Desconectado.';
  el('result-overlay').hidden = true;
  el('quick-play').textContent = 'JOGAR AGORA · BOTS';
  el('local-bots').textContent = 'JOGAR COM BOTS NESTE COMPUTADOR';
  el<HTMLButtonElement>('local-bots').disabled = false;
  el<HTMLButtonElement>('quick-play').disabled = false;
  if (reboot) void boot();
}
el('disconnect-room').addEventListener('click', () => disconnectRoom());
el('rematch').addEventListener('click', () => {
  disconnectRoom(false);
  void joinRoom(true, true);
});
el('result-home').addEventListener('click', () => disconnectRoom());

async function boot(): Promise<void> {
  const generation = ++gameGeneration;
  const restartButton = pause.querySelector<HTMLButtonElement>('[data-action="restart"]')!;
  restartButton.hidden = false;
  restartButton.textContent = 'REINICIAR TREINO';
  document.querySelector('.hud-top-left strong')!.textContent = 'COMPLEXO FERRO';
  document.querySelector('.hud-top-left .label')!.textContent = 'TREINO LIVRE';
  el('training-tip').textContent =
    'Explore o complexo e acerte os alvos laranja. Eles retornam após 4 segundos.';
  try {
    const { Game: GameClass } = await import('./game/game');
    if (generation !== gameGeneration) return;
    const trainingGame = new GameClass(canvas, settings, { onLockChange, onSnapshot: updateHud });
    game = trainingGame;
    await trainingGame.ready();
    if (game !== trainingGame || generation !== gameGeneration) return;
    startLabel.textContent = 'INICIAR TREINO';
    startHelp.textContent = 'Teclado + mouse · Clique para capturar o ponteiro';
    startButton.disabled = false;
    el<HTMLButtonElement>('quick-play').disabled = false;
  } catch (error) {
    if (generation !== gameGeneration) return;
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
