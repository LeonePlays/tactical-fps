import { normalizeMatchConfig, playerName, type MatchConfig } from './game/match-config';
import { getMap } from './game/maps';
import { localPractice } from './network/local';
import type { MatchState } from './network/protocol';
import { connectRoom } from './network/connection';
import { ClassicHud } from './ui/classic-hud';
import { mountAccount } from './auth/account';
import './styles/main.css';
import './styles/classic.css';
import './styles/menu.css';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './core/settings';
import { renderView } from './ui/view';
import { mountMatchMenu } from './ui/match-menu';
import { mountOnlineControls } from './ui/online-controls';
import {
  PROFILE_KEY,
  MODE_NAMES,
  KillfeedTracker,
  actorName,
  clock,
  loadLocalData,
  matchResult,
  orderedActors,
  parseProfile,
  saveLocalData,
} from './ui/session';
import type { MatchInput } from './network/protocol';
import type { Game, GameSnapshot } from './game/game';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root is missing');
renderView(root);
const buildBadge = document.createElement('span');
buildBadge.className = 'build-badge';
buildBadge.textContent = 'TACTICAL FPS · BETA 0.4.1';
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
let roomConnection:
  | {
      send(input: MatchInput): void;
      close(): void;
      step?(dt: number): void;
      restart?(): void;
      chat?(text: string, team: boolean): void;
      configure?(config: Partial<MatchConfig>): void;
    }
  | undefined;
let connecting = false;
let roomReady = false;
let currentRoom = '';
let localMode = false;
let latestRoom: MatchState | undefined;
let lastConfig: MatchConfig | undefined;
let scoreboardSignature = '';
let connectionGeneration = 0;
const matchMenu = mountMatchMenu(document.querySelector('.menu-content')!);
let profile = loadLocalData(PROFILE_KEY, parseProfile);
const killfeed = new KillfeedTracker();
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
type DialogKind = 'settings' | 'controls' | 'profile' | 'credits' | 'servers';
const dialogKinds: DialogKind[] = ['settings', 'controls', 'profile', 'credits', 'servers'];
const account = mountAccount((user, cloudSettings) => {
  settings = cloudSettings || loadSettings();
  game?.applySettings(settings);
  const previousAccount = accountId;
  accountId = user?.id;
  // Local practice stays available across authentication changes.
  if (previousAccount && previousAccount !== accountId && !localMode && roomConnection)
    disconnectRoom();
});
const onlineControls = mountOnlineControls({
  pause: () => game?.pause(),
  resume: () => game?.enter(),
  sendChat: (text, team) => roomConnection?.chat?.(text, team),
  configure: (config) => roomConnection?.configure?.(config),
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
    for (const kind of dialogKinds) el(`${kind}-overlay`).hidden = true;
    el('training-tip').hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      el('training-tip').hidden = true;
    }, 6500);
  } else if (inSession) {
    el('scoreboard').hidden = true;
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
    el('session-time').textContent = clock(round.remaining);
    el('match-clock').textContent = clock(round.remaining);
    el('team-score').hidden = round.mode === 'deathmatch';
    el('team-alpha-score').textContent = `ALPHA ${round.scores.alpha}`;
    el('team-bravo-score').textContent = `${round.scores.bravo} BRAVO`;
    const progress = round.interaction;
    el('objective-banner').textContent =
      round.mode === 'defuse'
        ? `${round.scores.alpha} : ${round.scores.bravo} · RODADA ${round.round} · ${round.phase === 'freeze' ? 'PREPARE-SE' : round.phase === 'round-over' ? round.reason : round.bomb?.status === 'planted' ? 'BOMBA ATIVA · DEFENDA OU DESARME' : own?.team === 'alpha' ? 'ALPHA · E para plantar na área A' : 'BRAVO · impeça o plantio / E para desarmar'}${progress ? ` · ${progress.action === 'plant' ? 'PLANTANDO' : 'DESARMANDO'} ${Math.round((progress.progress / progress.duration) * 100)}%` : ''}`
        : round.mode === 'team-deathmatch'
          ? `COMBATE EM EQUIPES · ${latestRoom?.config.scoreLimit ?? 10} eliminações para vencer · ${own?.team.toUpperCase()}`
          : `COMBATE LIVRE · ${latestRoom?.config.scoreLimit ?? 10} eliminações para vencer`;
    el('objective-banner').hidden = false;
  } else {
    el('objective-banner').hidden = true;
    el('team-score').hidden = true;
  }
}

function fillSettings(value: Settings): void {
  for (const key of [
    'sensitivity',
    'fov',
    'volume',
    'effectsVolume',
    'musicVolume',
    'renderScale',
    'quality',
    'shadows',
  ] as const) {
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
  for (const key of ['effectsVolume', 'musicVolume', 'renderScale'])
    el(`${key}-value`).textContent =
      `${Math.round(Number((form.elements.namedItem(key) as HTMLInputElement).value) * 100)}%`;
}
function openDialog(kind: DialogKind): void {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = el(`${kind}-overlay`);
  for (const other of dialogKinds) if (other !== kind) el(`${other}-overlay`).hidden = true;
  if (kind === 'settings') {
    fillSettings(settings);
    settingsMessage.textContent = account.isGuest
      ? 'Ajustes salvos somente neste navegador.'
      : 'Ajustes salvos na conta; confira o status no menu.';
  }
  if (kind === 'profile') {
    el<HTMLInputElement>('player-name').value = profile.name;
    el('profile-result').textContent = profile.lastResult
      ? `${profile.lastResult.title} · ${profile.lastResult.detail} · ${new Date(profile.lastResult.playedAt).toLocaleDateString('pt-BR')}`
      : 'Nenhuma partida concluída neste navegador.';
  }
  overlay.hidden = false;
  (overlay.querySelector('button') as HTMLButtonElement)?.focus();
}
function closeDialog(kind: DialogKind): void {
  el(`${kind}-overlay`).hidden = true;
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
      if (
        roomReady &&
        localMode &&
        JSON.stringify(latestRoom?.config) !== JSON.stringify(matchMenu.getConfig())
      ) {
        disconnectRoom(false);
        void joinRoom(true, true);
      } else if (roomReady) void enterGame();
      else void joinRoom(true, true);
      break;
    case 'start':
      void enterGame(true);
      break;
    case 'resume':
      void enterGame();
      break;
    case 'restart':
      if (
        roomReady &&
        roomConnection?.restart &&
        (localMode || latestRoom?.hostId === latestRoom?.self)
      ) {
        game?.pause();
        roomConnection.restart();
      } else if (roomReady && localMode) {
        disconnectRoom(false);
        void joinRoom(true, true);
      } else void enterGame(!roomReady);
      break;
    case 'settings':
      openDialog('settings');
      break;
    case 'profile':
    case 'credits':
    case 'servers':
      openDialog(target.dataset.action);
      break;
    case 'fullscreen':
      if (!document.fullscreenEnabled) {
        announceError(
          'Este navegador não disponibilizou tela cheia. Use a tecla F11 no computador.',
        );
        break;
      }
      void (
        document.fullscreenElement
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen()
      ).catch(() =>
        announceError('O navegador não permitiu tela cheia. Use o botão novamente ou a tecla F11.'),
      );
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
    case 'close-profile':
      closeDialog('profile');
      break;
    case 'close-credits':
      closeDialog('credits');
      break;
    case 'close-servers':
      closeDialog('servers');
      break;
    case 'defaults':
      fillSettings({ ...DEFAULT_SETTINGS });
      break;
    case 'home':
    case 'play-tab':
      for (const kind of dialogKinds) el(`${kind}-overlay`).hidden = true;
      startButton.focus();
      break;
    case 'leave':
      saveTraining();
      if (roomReady || roomConnection) {
        disconnectRoom();
        break;
      }
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
    effectsVolume: Number(input('effectsVolume').value),
    musicVolume: Number(input('musicVolume').value),
    renderScale: Number(input('renderScale').value),
    shadows: input('shadows').value as Settings['shadows'],
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
el<HTMLFormElement>('profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  profile.name = playerName(el<HTMLInputElement>('player-name').value);
  el<HTMLInputElement>('player-name').value = profile.name;
  el('profile-message').textContent = saveLocalData(PROFILE_KEY, profile)
    ? 'Perfil salvo neste navegador. O nome será usado nas próximas partidas.'
    : 'Nome aplicado nesta sessão. O navegador bloqueou o armazenamento local.';
});

// Keep keyboard focus in the topmost open dialog, including the pause menu.
document.addEventListener('keydown', (event) => {
  const accountDialog = document.querySelector<HTMLElement>('.account-overlay:not([hidden])');
  const openKind = [...dialogKinds].reverse().find((kind) => !el(`${kind}-overlay`).hidden);
  const overlay =
    accountDialog ||
    (openKind
      ? el(`${openKind}-overlay`)
      : !el('result-overlay').hidden
        ? el('result-overlay')
        : !pause.hidden
          ? pause
          : null);
  if (!overlay) return;
  if (event.key === 'Escape') {
    if (openKind && !accountDialog) closeDialog(openKind);
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
  const generation = ++connectionGeneration;
  const config = matchMenu.getConfig();
  lastConfig = config;
  connecting = true;
  startButton.disabled = true;
  el<HTMLButtonElement>('quick-play').disabled = true;
  el<HTMLButtonElement>('local-bots').disabled = true;
  el('quick-play').textContent = 'PREPARANDO ARENA…';
  localMode = local;
  el('room-message').textContent = 'Conectando…';
  try {
    const token = local ? '' : await account.token();
    if (generation !== connectionGeneration) return;
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
    if (generation !== connectionGeneration) return;
    const options = {
      url: el<HTMLInputElement>('room-server').value,
      token: token || '',
      create,
      bots: config.bots,
      mode: config.mode,
      config,
      name: profile.name,
      room: el<HTMLInputElement>('room-code').value.trim().toUpperCase(),
      message: onlineControls.receive,
      notice: onlineControls.notice,
      state: (state: MatchState) => {
        if (generation !== connectionGeneration) return;
        if (latestRoom && state.matchId !== latestRoom.matchId) {
          game?.pause();
          el('result-overlay').hidden = true;
          el('scoreboard').hidden = true;
          killfeed.clear();
          el('killfeed').replaceChildren();
          inSession = false;
          hud.hidden = true;
          pause.hidden = true;
          menu.hidden = false;
          startButton.disabled = false;
          el<HTMLButtonElement>('quick-play').disabled = false;
          el('quick-play').textContent = 'ENTRAR NA PARTIDA';
          startHelp.textContent = 'Nova partida pronta. Clique em ENTRAR NA PARTIDA para jogar.';
        }
        if (latestRoom && state.config.map !== latestRoom.config.map) roomReady = false;
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
              onTick: (dt) => {
                if (local) roomConnection?.step?.(dt);
              },
              onScoreboard: (visible) => {
                el('scoreboard').hidden = !visible || !inSession || !latestRoom;
              },
            },
            true,
            state.config.map,
            local,
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
          restartButton.hidden = !local && state.hostId !== state.self;
          restartButton.textContent = 'REINICIAR PARTIDA';
          roomReady = true;
          for (const kind of dialogKinds) el(`${kind}-overlay`).hidden = true;
          currentRoom = state.room;
          startLabel.textContent = 'ENTRAR NA ARENA';
          el('pause-message').textContent = local
            ? 'Treino com bots pausado.'
            : 'A partida continua online durante a pausa.';
        }
        connecting = false;
        latestRoom = state;
        onlineControls.setState(local ? null : state);
        pause.querySelector<HTMLButtonElement>('[data-action="restart"]')!.hidden =
          !local && state.hostId !== state.self;
        updateScoreboard(state);
        for (const message of killfeed.update(state.actors)) {
          const entry = document.createElement('li');
          entry.textContent = message;
          el('killfeed').append(entry);
          while (el('killfeed').childElementCount > 4) el('killfeed').firstElementChild?.remove();
          setTimeout(() => entry.remove(), 6000);
        }
        if (state.rounds.phase === 'match-over' && el('result-overlay').hidden) {
          el('result-overlay').hidden = false;
          game?.pause();
          inSession = false;
          hud.hidden = true;
          pause.hidden = true;
          menu.hidden = true;
          el('result-overlay').hidden = false;
          const result = matchResult(state);
          el('result-title').textContent = result.title;
          el('result-description').textContent = state.rounds.reason;
          el('result-score').textContent = result.detail;
          el('scoreboard').hidden = true;
          profile.lastResult = { ...result, playedAt: new Date().toISOString() };
          saveLocalData(PROFILE_KEY, profile);
          el('rematch').hidden = !local && state.hostId !== state.self;
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
        document.querySelector('.hud-top-left strong')!.textContent = getMap(state.config.map).name;
        document.querySelector('.hud-top-left .label')!.textContent =
          state.rounds.mode === 'defuse'
            ? `BOMBA · EQUIPE ${own?.team === 'alpha' ? 'ALPHA' : 'BRAVO'}`
            : `${MODE_NAMES[state.rounds.mode]}${state.rounds.mode === 'team-deathmatch' ? ` · ${own?.team.toUpperCase()}` : ''}`;
        if (own?.health === 0) el('training-tip').hidden = false;
      },
      closed: (message: string) => {
        if (generation !== connectionGeneration) return;
        disconnectRoom();
        announceError(message);
        el('room-message').textContent = message;
      },
    };
    roomConnection = local
      ? localPractice(options.bots, options.state, options.config, options.name)
      : connectRoom(options);
  } catch (error) {
    if (generation !== connectionGeneration) return;
    connecting = false;
    startButton.disabled = !game;
    el<HTMLButtonElement>('quick-play').disabled = false;
    el<HTMLButtonElement>('local-bots').disabled = false;
    el('quick-play').textContent = 'JOGAR AGORA · BOTS';
    el('room-message').textContent = error instanceof Error ? error.message : 'Falha ao conectar.';
    el('server-message').textContent = el('room-message').textContent;
  }
}
el('local-bots').addEventListener('click', () => {
  if (roomReady) disconnectRoom(false);
  void joinRoom(true, true);
});
el('create-room').addEventListener('click', () => void joinRoom(true));
el('join-room').addEventListener('click', () => void joinRoom(false));
function disconnectRoom(reboot = true) {
  onlineControls.setState(null);
  connectionGeneration++;
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
  scoreboardSignature = '';
  killfeed.clear();
  el('killfeed').replaceChildren();
  el('scoreboard').hidden = true;
  el('team-score').hidden = true;
  for (const kind of dialogKinds) el(`${kind}-overlay`).hidden = true;
  delete hud.dataset.room;
  delete hud.dataset.actors;
  el('health-count').textContent = '100';
  el('room-message').textContent = 'Desconectado.';
  el('result-overlay').hidden = true;
  el('quick-play').textContent = 'JOGAR AGORA · BOTS';
  el('local-bots').textContent = 'CRIAR PARTIDA OFFLINE';
  el<HTMLButtonElement>('local-bots').disabled = false;
  el<HTMLButtonElement>('quick-play').disabled = false;
  if (reboot) void boot();
}
el('disconnect-room').addEventListener('click', () => disconnectRoom());
el('rematch').addEventListener('click', () => {
  if (roomConnection?.restart && (localMode || latestRoom?.hostId === latestRoom?.self)) {
    roomConnection.restart();
    return;
  }
  if (lastConfig) matchMenu.setConfig(normalizeMatchConfig(lastConfig));
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

function updateScoreboard(state: MatchState): void {
  const signature = `${state.matchId}:${state.config.map}:${state.rounds.mode}:${clock(state.rounds.remaining)}:${state.actors.map((actor) => `${actor.id}:${actor.name}:${actor.team}:${actor.kills}:${actor.deaths}:${actor.health > 0}`).join('|')}`;
  if (signature === scoreboardSignature) return;
  scoreboardSignature = signature;
  el('scoreboard-summary').textContent =
    `${getMap(state.config.map).name} · ${MODE_NAMES[state.rounds.mode]} · ${clock(state.rounds.remaining)}`;
  const fragment = document.createDocumentFragment();
  for (const actor of orderedActors(state.actors)) {
    const row = document.createElement('tr');
    if (actor.id === state.self) row.className = 'scoreboard-self';
    for (const value of [
      `${actorName(actor, state.self)}${actor.bot ? ' [BOT]' : actor.id === state.self ? ' [VOCÊ]' : ''}`,
      state.rounds.mode === 'deathmatch' ? '—' : actor.team.toUpperCase(),
      String(actor.kills),
      String(actor.deaths),
      actor.health > 0 ? 'VIVO' : 'ELIMINADO',
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    fragment.append(row);
  }
  el('scoreboard-body').replaceChildren(fragment);
}

let roomListController: AbortController | undefined;
el('find-rooms').addEventListener('click', () => {
  roomListController?.abort();
  roomListController = new AbortController();
  const controller = roomListController;
  const button = el<HTMLButtonElement>('find-rooms');
  button.disabled = true;
  el('server-rooms').textContent = 'Consultando servidor…';
  const timeout = setTimeout(() => controller.abort(), 8000);
  void (async () => {
    try {
      const url = new URL(el<HTMLInputElement>('room-server').value);
      if (
        !['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error('Informe um endereço válido de servidor WS ou WSS.');
      url.protocol = url.protocol === 'wss:' || url.protocol === 'https:' ? 'https:' : 'http:';
      url.pathname = '/rooms';
      url.search = '';
      url.hash = '';
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`Servidor respondeu HTTP ${response.status}.`);
      const payload: unknown = await response.json();
      const rooms = Array.isArray(payload)
        ? payload
        : payload &&
            typeof payload === 'object' &&
            'rooms' in payload &&
            Array.isArray(payload.rooms)
          ? payload.rooms
          : null;
      if (!rooms) throw new Error('Este servidor não fornece uma lista de salas compatível.');
      el('server-rooms').replaceChildren();
      if (!rooms.length)
        el('server-rooms').textContent =
          'Nenhuma sala aberta. Você pode criar uma usando a configuração selecionada.';
      for (const room of rooms.slice(0, 30)) {
        if (!room || typeof room !== 'object') continue;
        const code = String(room.code ?? room.room ?? room.id ?? '').slice(0, 6);
        if (!/^[A-Z0-9]{1,6}$/i.test(code)) continue;
        const entry = document.createElement('button');
        entry.className = 'server-room';
        const configuration = normalizeMatchConfig(room.config ?? room);
        const count = Array.isArray(room.players)
          ? room.players.length
          : typeof room.players === 'number'
            ? room.players
            : '?';
        entry.textContent = `${code} · ${getMap(configuration.map).name} · ${MODE_NAMES[configuration.mode]} · ${count} jogadores`;
        entry.addEventListener('click', () => {
          el<HTMLInputElement>('room-code').value = code.toUpperCase();
        });
        el('server-rooms').append(entry);
      }
    } catch (error) {
      if (roomListController !== controller) return;
      el('server-rooms').textContent =
        error instanceof Error && error.name !== 'AbortError'
          ? `${error.message} Confira se o servidor está iniciado e permite acesso deste site.`
          : 'O servidor não respondeu. Confira o endereço e se ele está iniciado.';
    } finally {
      clearTimeout(timeout);
      if (roomListController === controller) button.disabled = false;
    }
  })();
});
void boot();
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    roomConnection?.close();
    game?.dispose();
  }
});
