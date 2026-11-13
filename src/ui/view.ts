const crosshair =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/></svg>';
const gear =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3h3l2 3 3-1 1-3 3-1 2-3-2-2 1-3-2-3h-3l-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
const keyboard =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2M7 16h10"/></svg>';
const arrow =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const mark =
  '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 8h30v7H24v19h-8V15H5z" fill="currentColor"/><path d="M29 22h6v12h-6z" fill="currentColor"/></svg>';

export function renderView(root: HTMLElement): void {
  root.innerHTML = `
    <canvas id="game-canvas" aria-label="Campo de treino 3D do TACTICAL FPS" tabindex="-1"></canvas>
    <div class="scene-vignette" aria-hidden="true"></div>
    <div id="menu-shell">
      <aside class="sidebar" aria-label="Navegação principal">
        <a href="#" class="brand-icon" aria-label="TACTICAL FPS — início" data-action="home">${mark}</a>
        <div class="side-items">
          <button class="side-button selected" data-action="play-tab" aria-label="Jogar" title="Jogar">${crosshair}<span>JOGAR</span></button>
          <button class="side-button" data-action="settings" aria-label="Configurações" title="Configurações">${gear}<span>AJUSTES</span></button>
          <button class="side-button" data-action="controls" aria-label="Controles" title="Controles">${keyboard}<span>TECLAS</span></button>
        </div>
        <div class="sidebar-bottom"><span class="vertical-word">PREPARE. ADAPT. EXECUTE.</span><span class="small-square"></span></div>
      </aside>
      <div class="menu-content">
        <header class="topbar">
          <a href="#" class="wordmark" data-action="home">TACTICAL<span>FPS</span><small>INDEPENDENT TACTICAL EXPERIENCE</small></a>
          <div class="topbar-right"><span class="status-dot"></span> SESSÃO LOCAL <span class="version">BETA 0.4</span></div>
        </header>
        <nav class="tabs" aria-label="Menu">
          <button class="active" data-action="play-tab">JOGAR <span>01</span></button>
          <button data-action="settings">CONFIGURAÇÕES</button>
          <button data-action="controls">CONTROLES</button><button data-action="profile">PERFIL</button><button data-action="credits">CRÉDITOS</button><button data-action="fullscreen">TELA CHEIA</button>
        </nav>
        <main class="hero">
          <div class="eyebrow"><span class="tiny-line"></span> BETA JOGÁVEL <span class="tag">SEM CADASTRO PARA TREINO E BOTS</span></div>
          <h1>TACTICAL<br><em>FPS.</em></h1>
          <p class="hero-description">Precisão. Movimento. Decisão.<br>Escolha o terreno e entre na partida.</p>
          <div class="operation-info"><span class="operation-number">04</span><div><span class="label">MAPA SELECIONADO</span><strong id="selected-map-name">COMPLEXO FERRO</strong><span id="selected-map-description" class="subtle">Pátio industrial · corredores e cobertura de carga</span></div></div>
          <div class="mode-line"><span class="status-dot"></span><span>PARTIDAS LOCAIS DISPONÍVEIS</span><span class="mode-divider">/</span><span>SEM CADASTRO</span></div>
          <button id="quick-play" class="button primary start-button" data-action="quick-play">JOGAR AGORA · BOTS</button><button id="start-button" class="button secondary training-button" data-action="start" disabled><span id="start-label">PREPARANDO CAMPO</span>${arrow}</button>
          <p id="start-help" class="start-help" role="status">Carregando o motor 3D…</p>
        </main>
        <section class="map-card" aria-label="Informações do campo de treino">
          <div class="map-card-top"><span class="label">RECONHECIMENTO DO TERRENO</span>${crosshair}</div>
          <div class="map-diagram" aria-hidden="true"><div class="map-grid"></div><span class="map-block a"></span><span class="map-block b"></span><span class="map-block c"></span><span class="map-block d"></span><span class="map-path"></span><span class="map-you"></span><span class="map-north">N ↑</span></div>
          <div class="map-card-bottom"><span><b>02</b> MAPAS</span><span><b>03</b> MODOS</span><span class="map-live">OFFLINE</span></div>
        </section>
        <footer class="menu-footer"><div><span class="footer-label">TACTICAL FPS · BETA</span><span>Conteúdo original. Jogue com teclado e mouse.</span></div><div class="desktop-badge">${keyboard} EXCLUSIVO PARA COMPUTADOR</div></footer>
      </div>
    </div>
    <div id="hud" hidden aria-label="Dados da sessão">
      <canvas id="radar" width="144" height="144" aria-label="Radar local: terreno e contatos visíveis próximos"></canvas>
      <div class="hud-top-left"><span class="label">TREINO LIVRE</span><strong>COMPLEXO FERRO</strong><span class="hud-session">TEMPO <span id="session-time">00:00</span></span></div>
      <div class="compass"><b id="bearing">000°</b></div>
      <div class="hud-score"><span class="label">ALVOS ATINGIDOS</span><strong id="hit-count">00</strong><small>PRECISÃO <span id="accuracy">—</span></small></div>
      <div id="objective-banner" hidden></div><div id="team-score" hidden><span id="team-alpha-score">ALPHA 0</span><b id="match-clock">03:00</b><span id="team-bravo-score">0 BRAVO</span></div><ol id="killfeed" aria-live="polite"></ol><div id="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div id="hit-marker" hidden aria-hidden="true">×</div>
      <div id="training-tip" class="training-tip">WASD correr · SHIFT andar · B comprar · R recarregar</div>
      <div class="hud-bottom-left"><div class="health-icon">+</div><strong><span id="health-count">100</span><small>VIDA</small></strong><span class="armor-icon">◇</span><strong><span id="armor-count">0</span><small>COLETE</small></strong><div class="stance-indicator"><b id="stance-label">EM PÉ</b><span id="movement-label">PRONTO</span></div></div>
      <div id="money-count" aria-label="Dinheiro">$16000</div>
      <div class="hud-bottom-center"><span>B <b>COMPRAR</b></span><span>1 / 2 <b>ARMAS</b></span><span>3 / 4 <b>FACA / HE</b></span><span>TAB <b>PLACAR</b></span><span>ESC <b>PAUSAR</b></span></div>
      <div class="hud-ammo"><span class="label">CARABINA T-04</span><div><strong id="ammo-count">30</strong><span>/ <b id="reserve-count">90</b></span></div><small id="reload-label">R · RECARREGAR</small></div>
      <div class="hud-coordinates"><span id="coordinates">X 0 / Z -22</span><span id="fps-counter" hidden></span></div>
      <aside id="buy-panel" hidden role="dialog" aria-modal="true" aria-labelledby="buy-title"><h2 id="buy-title">COMPRAR EQUIPAMENTO</h2><p>Use as teclas 1–6 · B para fechar</p><ol><li>Carabina T-04 <b>$2700</b></li><li>Pistola P-09 <b>$500</b></li><li>Munição primária (30) <b>$60</b></li><li>Munição secundária (12) <b>$25</b></li><li>Colete <b>$650</b></li><li>Granada HE <b>$300</b></li></ol><p id="buy-zone"></p><p id="buy-message" role="status"></p></aside>
    </div>
    <div id="scoreboard" hidden aria-label="Placar da partida"><section><header><h2>PLACAR</h2><span id="scoreboard-summary"></span></header><table><thead><tr><th>JOGADOR</th><th>EQUIPE</th><th>ELIM.</th><th>MORTES</th><th>ESTADO</th></tr></thead><tbody id="scoreboard-body"></tbody></table><p>Mantenha TAB pressionado · ESC libera o mouse</p></section></div>
    <div id="result-overlay" class="overlay" hidden><section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="result-title"><span class="eyebrow">TACTICAL FPS / RESULTADO</span><h2 id="result-title">PARTIDA ENCERRADA</h2><p id="result-description"></p><p id="result-score"></p><button id="rematch" class="button primary">JOGAR NOVAMENTE</button><button id="result-home" class="button secondary">VOLTAR AO MENU</button></section></div>
    <div id="pause-overlay" class="overlay" hidden>
      <section class="pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <span class="eyebrow">TACTICAL FPS / TREINO LIVRE</span><h2 id="pause-title">RESPIRE.<br><em>REORGANIZE.</em></h2><p>A sessão está pausada.</p>
        <button class="button primary" data-action="resume">CONTINUAR ${arrow}</button>
        <button class="button secondary" data-action="settings">CONFIGURAÇÕES ${gear}</button>
        <button class="button secondary" data-action="controls">CONTROLES ${keyboard}</button>
        <button class="button text-button" data-action="restart">REINICIAR TREINO</button>
        <button class="button text-button" data-action="leave">VOLTAR AO MENU</button>
        <p id="pause-message" role="status"></p>
      </section>
    </div>
    <div id="settings-overlay" class="overlay" hidden>
      <section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="dialog-heading"><div><span class="eyebrow">AJUSTE SUA EXPERIÊNCIA</span><h2 id="settings-title">CONFIGURAÇÕES</h2></div><button class="close-button" data-action="close-settings" aria-label="Fechar configurações">×</button></div>
        <form id="settings-form">
          <label class="setting-row"><span>Sensibilidade do mouse<small>Velocidade de rotação da câmera</small></span><div class="slider-control"><input name="sensitivity" aria-label="Sensibilidade do mouse" type="range" min="0.2" max="3" step="0.1"><output id="sensitivity-value"></output></div></label>
          <label class="setting-row"><span>Campo de visão<small>Ângulo horizontal da câmera</small></span><div class="slider-control"><input name="fov" aria-label="Campo de visão" type="range" min="65" max="110" step="1"><output id="fov-value"></output></div></label>
          <label class="setting-row"><span>Volume geral<small>Controle mestre do áudio</small></span><div class="slider-control"><input name="volume" aria-label="Volume geral" type="range" min="0" max="1" step="0.05"><output id="volume-value"></output></div></label>
          <label class="setting-row"><span>Volume dos efeitos<small>Disparos, passos e recarga</small></span><div class="slider-control"><input name="effectsVolume" aria-label="Volume dos efeitos" type="range" min="0" max="1" step="0.05"><output id="effectsVolume-value"></output></div></label>
          <label class="setting-row"><span>Volume da música<small>Ambiente do menu</small></span><div class="slider-control"><input name="musicVolume" aria-label="Volume da música" type="range" min="0" max="1" step="0.05"><output id="musicVolume-value"></output></div></label>
          <label class="setting-row"><span>Qualidade gráfica<small>Baixa reduz a resolução; ajuste sombras separadamente</small></span><select name="quality" aria-label="Qualidade gráfica"><option value="high">ALTA</option><option value="low">BAIXA</option></select></label>
          <label class="setting-row"><span>Escala de resolução<small>Reduza para melhorar o desempenho</small></span><div class="slider-control"><input name="renderScale" aria-label="Escala de resolução" type="range" min="0.5" max="1.5" step="0.1"><output id="renderScale-value"></output></div></label>
          <label class="setting-row"><span>Sombras</span><select name="shadows" aria-label="Sombras"><option value="off">DESATIVADAS</option><option value="low">BAIXAS</option><option value="high">ALTAS</option></select></label>
          <label class="setting-row"><span>Inverter eixo vertical</span><input name="invertY" type="checkbox" role="switch"></label>
          <label class="setting-row"><span>Mira dinâmica<small>Desative para uma cruz de tamanho fixo</small></span><input name="dynamicCrosshair" type="checkbox" role="switch"></label><label class="setting-row"><span>Mostrar FPS</span><input name="showFps" type="checkbox" role="switch"></label>
          <div class="dialog-actions"><button type="button" class="button text-button" data-action="defaults">RESTAURAR PADRÃO</button><button type="submit" class="button primary">SALVAR AJUSTES ${arrow}</button></div>
          <p id="settings-message" class="dialog-note" role="status">Os ajustes são salvos neste navegador.</p>
        </form>
      </section>
    </div>
    <div id="controls-overlay" class="overlay" hidden>
      <section class="dialog-panel controls-panel" role="dialog" aria-modal="true" aria-labelledby="controls-title">
        <div class="dialog-heading"><div><span class="eyebrow">CONHEÇA SEU EQUIPAMENTO</span><h2 id="controls-title">CONTROLES</h2></div><button class="close-button" data-action="close-controls" aria-label="Fechar controles">×</button></div>
        <div class="controls-grid">
          <div><span class="key-group"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><b>MOVIMENTAR</b></div>
          <div><span class="key-group"><kbd>MOUSE</kbd></span><b>OLHAR / MIRAR</b></div>
          <div><span class="key-group"><kbd>SHIFT</kbd> + <kbd>W</kbd></span><b>ANDAR SILENCIOSAMENTE</b></div>
          <div><span class="key-group"><kbd>CTRL</kbd></span><b>AGACHAR / LEVANTAR</b></div>
          <div><span class="key-group"><kbd>Z</kbd></span><b>DEITAR / LEVANTAR</b></div>
          <div><span class="key-group"><kbd>ESPAÇO</kbd></span><b>SALTAR</b></div>
          <div><span class="key-group"><kbd>CLIQUE ESQUERDO</kbd></span><b>DISPARAR</b></div>
          <div><span class="key-group"><kbd>R</kbd></span><b>RECARREGAR</b></div><div><span class="key-group"><kbd>1</kbd> / <kbd>2</kbd></span><b>PRIMÁRIA / SECUNDÁRIA</b></div><div><span class="key-group"><kbd>3</kbd> / <kbd>4</kbd></span><b>FACA / GRANADA</b></div><div><span class="key-group"><kbd>E</kbd></span><b>PLANTAR / DESARMAR BOMBA</b></div><div><span class="key-group"><kbd>B</kbd></span><b>COMPRAR (TECLAS 1–6)</b></div>
          <div><span class="key-group"><kbd>ESC</kbd></span><b>LIBERAR MOUSE / PAUSAR</b></div>
        </div>
        <p class="control-note">Clique em iniciar para capturar o mouse. Use <kbd>ESC</kbd> para liberá-lo. Agachar e deitar são alternáveis; o teto precisa estar livre para levantar. Não é possível saltar deitado.</p>
        <button class="button primary" data-action="close-controls">ENTENDIDO ${arrow}</button>
      </section>
    </div>
    <div id="profile-overlay" class="overlay" hidden><section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div class="dialog-heading"><div><span class="eyebrow">DADOS NESTE NAVEGADOR</span><h2 id="profile-title">PERFIL LOCAL</h2></div><button class="close-button" data-action="close-profile" aria-label="Fechar perfil">×</button></div><form id="profile-form"><label class="profile-name-label">Nome do jogador<input id="player-name" name="name" maxlength="20" autocomplete="nickname" required placeholder="Visitante"></label><p class="dialog-note">Até 20 caracteres. Este perfil local não cria uma conta online.</p><h3>ÚLTIMA PARTIDA</h3><p id="profile-result">Nenhuma partida concluída neste navegador.</p><button class="button primary" type="submit">SALVAR PERFIL</button><p id="profile-message" role="status"></p></form></section></div>
    <div id="credits-overlay" class="overlay" hidden><section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="credits-title"><div class="dialog-heading"><div><span class="eyebrow">CONTEÚDO ORIGINAL PARA WEB</span><h2 id="credits-title">CRÉDITOS</h2></div><button class="close-button" data-action="close-credits" aria-label="Fechar créditos">×</button></div><p>TACTICAL FPS · projeto independente de LeonePlays.</p><p>Mapas, modelos, texturas e efeitos sonoros procedurais criados para este projeto. Nenhum recurso do Counter-Strike é distribuído com o jogo.</p><p>Motor 3D: Babylon.js · Apache-2.0. TypeScript · Apache-2.0. Vite · MIT. Supabase JS · MIT. As licenças completas estão nas dependências do projeto.</p><p>Inspirado na precisão e no ritmo dos jogos táticos clássicos.</p><button class="button primary" data-action="close-credits">VOLTAR</button></section></div>
    <div id="servers-overlay" class="overlay" hidden><section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="servers-title"><div class="dialog-heading"><div><span class="eyebrow">MULTIPLAYER / SERVIDOR PRÓPRIO</span><h2 id="servers-title">ENCONTRAR SERVIDORES</h2></div><button class="close-button" data-action="close-servers" aria-label="Fechar servidores">×</button></div><p>Informe um servidor de partidas iniciado. O frontend na Vercel não hospeda as partidas. Salas online exigem conexão ao servidor e uma conta.</p><label class="profile-name-label">Endereço do servidor<input id="room-server" aria-label="Servidor de partidas" value="ws://127.0.0.1:3001" maxlength="200"></label><div class="server-actions"><button id="find-rooms" class="button secondary">ATUALIZAR SALAS</button><button id="create-room" class="button primary">CRIAR SALA ONLINE</button></div><div id="server-rooms" role="status">A lista será consultada diretamente no servidor informado.</div><label class="profile-name-label">Código da sala<input id="room-code" maxlength="6" placeholder="ABC123"></label><button id="join-room" class="button secondary">ENTRAR NA SALA</button><button id="disconnect-room" class="button text-button">VOLTAR AO TREINO INDIVIDUAL</button><p id="server-message" role="status"></p></section></div>
    <div id="error-banner" role="alert" hidden></div>
    <div class="desktop-only"><span class="brand-icon">${mark}</span><h2>O CAMPO ESPERA<br>NO COMPUTADOR.</h2><p>TACTICAL FPS exige navegador de computador, teclado, mouse e WebGL. Abra em uma tela maior para jogar.</p></div>
  `;
}
