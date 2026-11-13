# Verificação da beta 0.4

Validação local em 13/11/2026, Chromium de computador com WebGL/SwiftShader, viewport 1440×900 e entrada nativa de teclado/mouse.

- `npm run format:check`: aprovado.
- `npm test`: 160 testes aprovados em 20 arquivos, sem falhas.
- `npm run build`: TypeScript e Vite aprovados; frontend gerado em `dist/`.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: 21 cenários aprovados, incluindo partidas offline FFA/TDM completas pelo cronômetro real, resultado, revanche e persistência.
- As regressões de controle, colisão e impactos foram executadas novamente após ajustar a captura inicial e sincronizar o cursor automatizado. O teste de tiro considera a cadência automática real e limita acertos ao número de disparos, pois down/up nativo pode atravessar vários frames.

Os cenários visitantes não usam sessão ou autenticação simulada e bloqueiam o Supabase. Verificam os três modos, dois mapas com spawns distintos, quatro equipamentos, compra, movimento, postura, salto, pausa, saída, configurações do renderer, perfil e reabertura. Testes de salas usam dois navegadores, sockets reais e a lista `/rooms` do servidor isolado; falha de conexão não impede voltar aos bots.

A suíte de lógica cobre percepção/dificuldade, navegação nos interiores e objetivos dos dois mapas, recuperação de bloqueios, proteção de aliados, pontuação persistente por equipe, bomba, respawn, reinício, inventário, protocolo, modelos, posturas e movimento em diferentes frequências. Capturas em `docs/screenshots/beta-04-*.jpg` são da aplicação em execução.

## Limites da evidência

Auth e verificação de token são simulados somente nas suítes de contas/salas. Isso não comprova cadastro real no projeto Supabase, cujo último diagnóstico foi NXDOMAIN. O cenário `results.spec.ts` usa um transporte determinístico; os dois cenários `offline-loop.spec.ts` fecham partidas reais sem acelerar o relógio nem injetar resultados.

Não houve benchmark em GPU de computador externo; 60 Hz é o passo da simulação, não garantia de 60 FPS. A opção baixa, escala de resolução e sombras permitem reduzir custo. Não houve teste de carga de multiplayer público, nem validação de cadastro externo, campanha ou reconexão com placar. Não se promete ausência absoluta de bugs. CI e deploy remoto devem ser consultados separadamente da aprovação local.
