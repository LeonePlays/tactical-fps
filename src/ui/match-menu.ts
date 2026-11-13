import { normalizeMatchConfig, type MatchConfig } from '../game/match-config';
import { getMap } from '../game/maps';
import {
  MODE_NAMES,
  PREFERENCES_KEY,
  loadLocalData,
  parsePreferences,
  saveLocalData,
} from './session';

/** The selected configuration is passed unchanged to the authoritative match. */
export function mountMatchMenu(parent: HTMLElement) {
  const lobby = document.createElement('section');
  lobby.className = 'local-lobby';
  lobby.setAttribute('aria-label', 'Configurar partida');
  lobby.innerHTML = `<div class="setup-heading"><span class="label">CRIAR PARTIDA</span><span>JOGADORES + BOTS</span></div>
    <div class="match-fields">
      <label>Mapa<select id="match-map"><option value="industrial">Complexo Ferro · industrial</option><option value="old-quarter">Bairro Antigo · urbano</option></select></label>
      <label>Modo<select id="match-mode"><option value="deathmatch">Combate livre · FFA</option><option value="team-deathmatch">Combate em equipes · TDM</option><option value="defuse">Bomba · plantar / desarmar</option></select></label>
      <label>Bots<select id="room-bots"><option>0</option><option>1</option><option>2</option><option selected>3</option><option>4</option></select></label>
      <label>Dificuldade<select id="match-difficulty"><option value="easy">Fácil</option><option value="normal">Normal</option><option value="hard">Difícil</option></select></label>
      <label>Equipe<select id="match-team"><option value="auto">Automática</option><option value="alpha">Alpha</option><option value="bravo">Bravo</option></select></label>
      <label><span id="match-time-label">Duração (segundos)</span><input id="match-time" aria-label="Duração em segundos" type="number" min="30" max="1800" step="10"></label>
      <label><span id="match-score-label">Eliminações para vencer</span><input id="match-score" aria-label="Pontuação para vencer" type="number" min="1" max="100" step="1"></label>
    </div>
    <p id="match-summary" class="setup-summary"></p>
    <button id="local-bots" class="button primary">CRIAR PARTIDA OFFLINE</button>
    <button class="button secondary" data-action="servers">ENCONTRAR SERVIDORES</button>
    <p id="room-message" class="setup-message" role="status">Sem cadastro. A partida é executada neste computador.</p>`;
  parent.append(lobby);
  const select = (id: string) =>
    document.getElementById(id) as HTMLSelectElement | HTMLInputElement;
  let config = loadLocalData(PREFERENCES_KEY, parsePreferences);
  const update = () => {
    const bomb = config.mode === 'defuse';
    document.getElementById('match-time-label')!.textContent = bomb
      ? 'Tempo por rodada (s)'
      : 'Duração da partida (s)';
    document.getElementById('match-score-label')!.textContent = bomb
      ? 'Rodadas para vencer'
      : 'Eliminações para vencer';
    select('match-team').disabled = config.mode === 'deathmatch';
    document.getElementById('match-summary')!.textContent =
      `${getMap(config.map).name} · ${MODE_NAMES[config.mode]} · ${config.bots} bots · ${config.timeLimit}s · ${config.scoreLimit} ${bomb ? 'rodadas' : 'eliminações'}`;
    const name = document.getElementById('selected-map-name');
    if (name) name.textContent = getMap(config.map).name;
    const detail = document.getElementById('selected-map-description');
    if (detail)
      detail.textContent =
        config.map === 'industrial'
          ? 'Pátio industrial · corredores e cobertura de carga'
          : 'Ruas, praça, café e mercado · interiores acessíveis';
    document.querySelector('.map-card')?.setAttribute('data-map', config.map);
  };
  const write = () => {
    for (const [id, value] of Object.entries({
      'match-map': config.map,
      'match-mode': config.mode,
      'room-bots': config.bots,
      'match-difficulty': config.difficulty,
      'match-team': config.team,
      'match-time': config.timeLimit,
      'match-score': config.scoreLimit,
    }))
      select(id).value = String(value);
    update();
  };
  const read = () =>
    normalizeMatchConfig({
      map: select('match-map').value,
      mode: select('match-mode').value,
      bots: Number(select('room-bots').value),
      difficulty: select('match-difficulty').value,
      team: select('match-team').value,
      timeLimit: Number(select('match-time').value),
      scoreLimit: Number(select('match-score').value),
    });
  lobby.addEventListener('change', (event) => {
    const previousMode = config.mode;
    config = read();
    if ((event.target as HTMLElement).id === 'match-mode' && previousMode !== config.mode) {
      config.timeLimit = config.mode === 'defuse' ? 90 : 180;
      config.scoreLimit = config.mode === 'defuse' ? 3 : 10;
    }
    saveLocalData(PREFERENCES_KEY, config);
    write();
  });
  write();
  return {
    getConfig() {
      config = read();
      saveLocalData(PREFERENCES_KEY, config);
      return { ...config };
    },
    setConfig(next: MatchConfig) {
      config = normalizeMatchConfig(next);
      write();
    },
  };
}
