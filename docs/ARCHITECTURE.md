# Arquitetura da primeira versão jogável

## Escopo

Alpha 0.1 entrega treino individual em navegador de computador. O planejamento GDD 1.4 permanece como referência; `GDD.md` foi preservado como recebido. Esta documentação registra somente as decisões desta implementação.

## Fluxo em execução

`main.ts` conecta a interface ao jogo e carrega o motor 3D sob demanda. `Game` possui cena, câmeras, sessão, entrada, arma e áudio. O menu usa uma câmera panorâmica do mesmo mapa jogável. A câmera FPS passa a ser ativa após a captura do ponteiro. Escape, perda de foco e troca de aba interrompem a simulação; o tempo de treino, a recarga e os alvos também param.

`world.ts` constrói o Complexo Ferro com primitivas Babylon.js e texturas originais geradas localmente, com semente fixa. O armazém A é acessível; a expedição B é um bloco de cenário fechado. O perímetro é fechado. Caixas de colisão acompanham a geometria sólida; sinalizações, faixas, arma e decoração não criam obstáculos. Há seis alvos sinalizados em laranja, com reaparecimento em quatro segundos. Raios de disparo respeitam a oclusão do cenário. Não há download de modelos, CDN ou fontes; Supabase é usado para autenticação e salvamento.

`physics.ts` é independente da renderização: corpo cinemático de base quadrada, coordenadas nos pés, gravidade e colisão AABB por eixo com subdivisão temporal em até 1/120 s. Normalização impede vantagem diagonal. Movimento relativo ao yaw funciona igualmente nas três posturas. A altura de colisão muda imediatamente, enquanto a câmera suaviza a transição. Teto bloqueia a mudança para postura mais alta; salto não funciona deitado e exige nova pressão após o salto anterior. A forma de colisão não pretende simular uma cápsula anatômica ou corpo deitado completo.

O passo por frame é limitado para evitar teletransporte após travamentos. Em máquinas muito lentas o tempo de simulação pode progredir mais lentamente que o relógio real. A opção de qualidade baixa ajuda máquinas com GPU limitada.

`settings.ts` valida configurações lidas do `localStorage` e mantém a experiência funcional quando esse armazenamento está bloqueado. O SDK Supabase mantém a sessão no navegador; senhas não são armazenadas pelo jogo.

## Próximas extensões

`src/features/contracts.ts` contém apenas contratos TypeScript, sem implementações artificiais:

- `GameMode` permite extrair modos de treino, campanha e multiplayer quando existirem requisitos concretos.
- `AIController` recebe snapshots observáveis; percepção, navegação e decisão ainda serão desenvolvidas.
- `CampaignMission` descreve mapa e objetivos, sem impor uma história ao GDD.
- `MultiplayerTransport` separa comunicação e ciclo de vida da renderização. O servidor local já valida movimento, disparos, acertos e saúde na arena; a versão ainda exige testes de carga e endurecimento antes de competição pública.
- `AuthProvider` separa a UI de um futuro provedor de contas. A implementação atual usa Supabase Auth em `src/auth/account.ts`; o login é obrigatório.

Os contratos permanecem como pontos de extensão. Salas locais usam a implementação concreta em `src/network/` e `server/`, enquanto treino individual e campanha têm escopos separados.

## Qualidade e distribuição

`npm test` executa testes unitários de movimento, gravidade, colisões, saltos, posturas e persistência validada de configurações. `npm run build` verifica tipos e empacota o frontend. `npm run test:e2e`, após build, verifica a aplicação de produção com Chromium, WebGL e entrada nativa. A CI executa as três verificações.

A Vercel publica somente `dist/`; `server/` contém um processo persistente separado para partidas e não uma função serverless Vercel. A criação do projeto e o deploy efetivo dependem da conta Vercel do proprietário. A compilação usa apenas URL e chave publicável. Jogar exige conta Supabase.

## Arena multiplayer local

`server/server.ts` autentica WebSockets, gerencia salas efêmeras e transmite estado a 20 Hz. `server/match.ts` simula movimento, bots e tiros. `src/network/arena.ts` compartilha colisões com a cena; `protocol.ts` valida entradas. O cliente envia intenção, nunca posições ou acertos. Há previsão local simples com correção direta por snapshots; não há interpolação avançada, compensação de latência nem reconexão com preservação de placar.

A arena é separada do Complexo Ferro de treino, para manter geometria e colisões iguais no servidor e navegador. Auth real exige acesso ao Supabase; testes injetam um verificador isolado. Consulte `server/README.md` para os comandos, limites e publicação futura.
