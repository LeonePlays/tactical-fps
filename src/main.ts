import './styles/main.css';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './core/settings';
import { renderView } from './ui/view';
import type { Game, GameSnapshot } from './game/game';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root is missing');
renderView(root);
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
let settings = loadSettings();
let game: Game | undefined;
let inSession = false;
let entering = false;
let previousFocus: HTMLElement | null = null;
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
    pause.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
  }
}

function updateHud(state: GameSnapshot): void {
  el('ammo-count').textContent = String(state.ammo).padStart(2, '0');
  el('hit-count').textContent = String(state.hits).padStart(2, '0');
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
    settingsMessage.textContent = 'Os ajustes são salvos neste navegador.';
  }
  overlay.hidden = false;
  (overlay.querySelector('button') as HTMLButtonElement)?.focus();
}
function closeDialog(kind: 'settings' | 'controls'): void {
  (kind === 'settings' ? settingsOverlay : controlsOverlay).hidden = true;
  previousFocus?.focus();
}

async function enterGame(fresh = false): Promise<void> {
  if (!game || entering) return;
  entering = true;
  const wasInSession = inSession;
  try {
    if (fresh) game.reset();
    inSession = true;
    await game.enter();
    el('pause-message').textContent = '';
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
      void enterGame(true);
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

async function boot(): Promise<void> {
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
  if (!event.persisted) game?.dispose();
});
