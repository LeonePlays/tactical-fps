import { normalizeMatchConfig, type MatchConfig } from '../game/match-config';
import { getMap } from '../game/maps';
import { MAP_CATALOG, mapInfo } from '../game/map-catalog';
import { GUNS, type WeaponId } from '../game/ballistics';
import { drawMapPreview, THEME_NAMES, WEAPON_KINDS } from './content-menu';
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
  lobby.innerHTML = `<div class="setup-heading"><span class="label">CRIAR PARTIDA</span><span>20 MAPAS · 10 ARMAS</span></div>
    <div class="match-fields">
      <label>Mapa<select id="match-map"></select></label>
      <section class="mission-preview" aria-label="Reconhecimento do mapa selecionado"><canvas id="map-preview" width="224" height="128" aria-label="Planta real do mapa, posições iniciais e objetivo A"></canvas><div><span id="map-theme" class="map-theme"></span><p id="map-description"></p><span id="map-dimensions"></span><div class="map-stepper"><button type="button" id="previous-map" aria-label="Mapa anterior">←</button><span id="map-index"></span><button type="button" id="next-map" aria-label="Próximo mapa">→</button></div></div></section>
      <label>Modo<select id="match-mode"><option value="deathmatch">Combate livre · FFA</option><option value="team-deathmatch">Combate em equipes · TDM</option><option value="defuse">Bomba · plantar / desarmar</option></select></label>
      <label>Bots<select id="room-bots"><option>0</option><option>1</option><option>2</option><option selected>3</option><option>4</option></select></label>
      <label>Dificuldade<select id="match-difficulty"><option value="easy">Fácil</option><option value="normal">Normal</option><option value="hard">Difícil</option></select></label>
      <label>Equipe<select id="match-team"><option value="auto">Automática</option><option value="alpha">Alpha</option><option value="bravo">Bravo</option></select></label>
      <label><span id="match-time-label">Duração (segundos)</span><input id="match-time" aria-label="Duração em segundos" type="number" min="30" max="1800" step="10"></label>
      <label><span id="match-score-label">Eliminações para vencer</span><input id="match-score" aria-label="Pontuação para vencer" type="number" min="1" max="100" step="1"></label>
    </div>
    <fieldset class="loadout-fields"><legend>SEU ARMAMENTO</legend><label>Arma primária<select id="match-primary" aria-label="Arma primária"></select><small id="primary-stats"></small></label><label>Arma secundária<select id="match-secondary" aria-label="Arma secundária"></select><small id="secondary-stats"></small></label><p>FFA e equipes: equipado ao nascer. Bomba: compre a primária com B → 1. A seleção também vale no treino individual.</p></fieldset>
    <p id="match-summary" class="setup-summary"></p>
    <div class="match-actions"><button id="local-bots" class="button primary">CRIAR PARTIDA OFFLINE</button><button class="button secondary" data-action="servers">ENCONTRAR SERVIDORES</button><p id="room-message" class="setup-message" role="status">Sem cadastro. A partida é executada neste computador.</p></div>`;
  parent.append(lobby);
  const select = (id: string) =>
    document.getElementById(id) as HTMLSelectElement | HTMLInputElement;
  const mapSelect = select('match-map') as HTMLSelectElement;
  for (const map of MAP_CATALOG)
    mapSelect.add(new Option(`${map.name} · ${THEME_NAMES[map.theme] ?? map.theme}`, map.id));
  for (const slot of ['primary', 'secondary'] as const) {
    const weaponSelect = select(`match-${slot}`) as HTMLSelectElement;
    for (const [id, gun] of Object.entries(GUNS))
      if (gun.slot === slot) weaponSelect.add(new Option(gun.name, id));
  }
  let config = loadLocalData(PREFERENCES_KEY, parsePreferences);
  const update = () => {
    const bomb = config.mode === 'defuse';
    const map = getMap(config.map);
    const info = mapInfo(config.map);
    document.getElementById('match-time-label')!.textContent = bomb
      ? 'Tempo por rodada (s)'
      : 'Duração da partida (s)';
    document.getElementById('match-score-label')!.textContent = bomb
      ? 'Rodadas para vencer'
      : 'Eliminações para vencer';
    select('match-team').disabled = config.mode === 'deathmatch';
    document.getElementById('match-summary')!.textContent =
      `${map.name} · ${MODE_NAMES[config.mode]} · ${config.bots} bots · ${config.timeLimit}s · ${config.scoreLimit} ${bomb ? 'rodadas' : 'eliminações'}`;
    const name = document.getElementById('selected-map-name');
    if (name) name.textContent = map.name;
    const detail = document.getElementById('selected-map-description');
    if (detail) detail.textContent = info.description;
    document.querySelector('.map-card')?.setAttribute('data-map', config.map);
    document.getElementById('map-theme')!.textContent = THEME_NAMES[info.theme] ?? info.theme;
    document.getElementById('map-description')!.textContent = info.description;
    document.getElementById('map-dimensions')!.textContent =
      `${Math.round(map.bounds.maxX - map.bounds.minX)} × ${Math.round(map.bounds.maxZ - map.bounds.minZ)} m · 8 posições iniciais`;
    document.getElementById('map-index')!.textContent =
      `${MAP_CATALOG.findIndex((entry) => entry.id === config.map) + 1} / ${MAP_CATALOG.length}`;
    drawMapPreview(document.getElementById('map-preview') as HTMLCanvasElement, map);
    for (const [slot, id] of [
      ['primary', config.primary ?? 't04'],
      ['secondary', config.secondary ?? 'p09'],
    ] as const) {
      const gun = GUNS[id];
      document.getElementById(`${slot}-stats`)!.textContent =
        `${WEAPON_KINDS[gun.kind]} · dano ${gun.damage}${gun.pellets > 1 ? ` × ${gun.pellets}` : ''} · ${gun.capacity} no carregador · ${Math.round(60 / gun.interval)} disparos/min · $${gun.price}`;
    }
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
      'match-primary': config.primary ?? 't04',
      'match-secondary': config.secondary ?? 'p09',
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
      primary: select('match-primary').value as WeaponId,
      secondary: select('match-secondary').value as WeaponId,
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
  const stepMap = (step: number) => {
    const index = MAP_CATALOG.findIndex((map) => map.id === config.map);
    config.map = MAP_CATALOG[(index + step + MAP_CATALOG.length) % MAP_CATALOG.length].id;
    saveLocalData(PREFERENCES_KEY, config);
    write();
  };
  document.getElementById('previous-map')!.addEventListener('click', () => stepMap(-1));
  document.getElementById('next-map')!.addEventListener('click', () => stepMap(1));
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
