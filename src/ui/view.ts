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
          <div class="topbar-right"><span class="status-dot"></span> SESSÃO LOCAL <span class="version">ALPHA 0.1</span></div>
        </header>
        <nav class="tabs" aria-label="Menu">
          <button class="active" data-action="play-tab">JOGAR <span>01</span></button>
          <button data-action="settings">CONFIGURAÇÕES</button>
          <button data-action="controls">CONTROLES</button>
        </nav>
        <main class="hero">
          <div class="eyebrow"><span class="tiny-line"></span> PRIMEIRA OPERAÇÃO <span class="tag">TREINO LIVRE</span></div>
          <h1>CADA MOVIMENTO<br>FAZ A <em>DIFERENÇA.</em></h1>
          <p class="hero-description">Entre no complexo. Conheça o terreno.<br>Domine o próximo movimento.</p>
          <div class="operation-info"><span class="operation-number">04</span><div><span class="label">ÁREA DE OPERAÇÃO</span><strong>COMPLEXO FERRO</strong><span class="subtle">Zona industrial · Campo de treino</span></div></div>
          <div class="mode-line"><span class="status-dot"></span><span>EXPLORAÇÃO + PRÁTICA DE MIRA</span><span class="mode-divider">/</span><span>1 JOGADOR</span></div>
          <button id="start-button" class="button primary start-button" data-action="start" disabled><span id="start-label">PREPARANDO CAMPO</span>${arrow}</button>
          <p id="start-help" class="start-help" role="status">Carregando o motor 3D…</p>
        </main>
        <section class="map-card" aria-label="Informações do campo de treino">
          <div class="map-card-top"><span class="label">RECONHECIMENTO DO TERRENO</span>${crosshair}</div>
          <div class="map-diagram" aria-hidden="true"><div class="map-grid"></div><span class="map-block a"></span><span class="map-block b"></span><span class="map-block c"></span><span class="map-block d"></span><span class="map-path"></span><span class="map-you"></span><span class="map-north">N ↑</span></div>
          <div class="map-card-bottom"><span><b>06</b> ALVOS</span><span><b>360°</b> EXPLORAÇÃO</span><span class="map-live">LOCAL</span></div>
        </section>
        <footer class="menu-footer"><div><span class="footer-label">EM DESENVOLVIMENTO</span><span>Um passo de cada vez. Cada detalhe importa.</span></div><div class="desktop-badge">${keyboard} EXCLUSIVO PARA COMPUTADOR</div></footer>
      </div>
    </div>
    <div id="hud" hidden aria-label="Dados da sessão">
      <div class="hud-top-left"><span class="label">TREINO LIVRE</span><strong>COMPLEXO FERRO</strong><span class="hud-session"><i></i> SESSÃO LOCAL <span id="session-time">00:00</span></span></div>
      <div class="compass"><span>NO</span><span>N</span><b id="bearing">000°</b><span>NE</span><span>L</span></div>
      <div class="hud-score"><span class="label">ALVOS ATINGIDOS</span><strong id="hit-count">00</strong><small>PRECISÃO <span id="accuracy">—</span></small></div>
      <div id="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div>
      <div id="hit-marker" hidden aria-hidden="true">×</div>
      <div id="training-tip" class="training-tip">SEU TREINO, SEU RITMO <span>Explore o complexo e acerte os alvos laranja. Eles retornam após 4 segundos.</span></div>
      <div class="hud-bottom-left"><div class="health-icon">+</div><strong>100<small>SAÚDE</small></strong><div class="hud-divider"></div><div class="stance-indicator"><b id="stance-label">EM PÉ</b><span id="movement-label">PRONTO</span></div></div>
      <div class="hud-bottom-center"><span>CTRL <b>AGACHAR</b></span><span>Z <b>DEITAR</b></span><span>ESC <b>PAUSAR</b></span></div>
      <div class="hud-ammo"><span class="label">CARABINA T-04</span><div><strong id="ammo-count">30</strong><span>/ 30</span></div><small id="reload-label">R · RECARREGAR <span>∞ RESERVA</span></small></div>
      <div class="hud-coordinates"><span id="coordinates">X 0 / Z -22</span><span id="fps-counter" hidden></span></div>
    </div>
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
          <label class="setting-row"><span>Volume dos efeitos<small>Disparos, recarga e acertos</small></span><div class="slider-control"><input name="volume" aria-label="Volume dos efeitos" type="range" min="0" max="1" step="0.05"><output id="volume-value"></output></div></label>
          <label class="setting-row"><span>Qualidade gráfica<small>Baixa desativa sombras e reduz a resolução</small></span><select name="quality" aria-label="Qualidade gráfica"><option value="high">ALTA</option><option value="low">BAIXA</option></select></label>
          <label class="setting-row"><span>Inverter eixo vertical</span><input name="invertY" type="checkbox" role="switch"></label>
          <label class="setting-row"><span>Mostrar FPS</span><input name="showFps" type="checkbox" role="switch"></label>
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
          <div><span class="key-group"><kbd>SHIFT</kbd> + <kbd>W</kbd></span><b>CORRER</b></div>
          <div><span class="key-group"><kbd>CTRL</kbd></span><b>AGACHAR / LEVANTAR</b></div>
          <div><span class="key-group"><kbd>Z</kbd></span><b>DEITAR / LEVANTAR</b></div>
          <div><span class="key-group"><kbd>ESPAÇO</kbd></span><b>SALTAR</b></div>
          <div><span class="key-group"><kbd>CLIQUE ESQUERDO</kbd></span><b>DISPARAR</b></div>
          <div><span class="key-group"><kbd>R</kbd></span><b>RECARREGAR</b></div>
          <div><span class="key-group"><kbd>ESC</kbd></span><b>LIBERAR MOUSE / PAUSAR</b></div>
        </div>
        <p class="control-note">Clique em iniciar para capturar o mouse. Use <kbd>ESC</kbd> para liberá-lo. Agachar e deitar são alternáveis; o teto precisa estar livre para levantar. Não é possível saltar deitado.</p>
        <button class="button primary" data-action="close-controls">ENTENDIDO ${arrow}</button>
      </section>
    </div>
    <div id="error-banner" role="alert" hidden></div>
    <div class="desktop-only"><span class="brand-icon">${mark}</span><h2>O CAMPO ESPERA<br>NO COMPUTADOR.</h2><p>TACTICAL FPS exige navegador de computador, teclado, mouse e WebGL. Abra em uma tela maior para jogar.</p></div>
  `;
}
