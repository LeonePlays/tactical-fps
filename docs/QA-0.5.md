# Verificação da beta 0.5

Ampliação da beta 0.4.1 existente: 20 mapas originais, 10 armas, escolha de armamento e apresentação gráfica revisada. Stack, controles, autenticação opcional e GDD preservados.

## Validação local

- `npm test`: 278 testes aprovados em 27 arquivos.
- `npm run build`: TypeScript/Vite aprovados; produção em `dist/`.
- `npm run format:check` e `git diff --check`: aprovados.
- Navegador: Chromium `/usr/bin/chromium`, WebGL/SwiftShader, viewport 1440×900 e entrada nativa de teclado/mouse.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: 27 cenários aprovados em 9,2 minutos, sem falhas. Inclui contas com fixtures, visitante, os 20 mapas, as 10 armas, colisões, controles, bomba, partidas reais completas, resultados, revanche e dois navegadores na mesma sala.
- Após refinar o cálculo dos mapas normais, `npm test` e `npm run build` foram repetidos com sucesso; o TDM com gráficos altos foi executado novamente sobre esse build e aprovado em 1,1 minuto.

Os novos cenários de navegador abriram, moveram o jogador e saíram dos 20 mapas sem servidor ou conta. Percorreram as 10 armas no campo individual, verificando nome, modelo visível, munição e disparos; exercitaram luneta SR-8 e descarte/recuperação preservando identidade e munição. Um TDM de 30 segundos no Cais de Carga usou três bots, AR-47/P-45, gráficos altos, sombras e escala 0,8, terminando pelo relógio real, exibindo resultado e permitindo revanche com a configuração preservada.

As verificações de física/navegação cobrem os oito spawns por mapa, piso, colisões e rotas até objetivos/patrulhas. Simulações adicionais completam FFA/TDM nos 20 mapas, conferindo movimento dos bots, ausência de penetração em sólidos, resultado e reinício com o armamento escolhido. Os 20 layouts têm assinaturas geométricas distintas.

Testes do arsenal cobrem atributos, recuo/cadência, oito projéteis reais da SG-12, oclusão/dano por distância, recarga, compra e identidade dos itens. Testes de modelos/ambientes cobrem geometria finita, animações, apoio das botas, limites de batches e descarte de recursos.

## Revisão visual

Capturas reais permitiram identificar e corrigir texturas que não se repetiam e o modelo da arma obstruindo a luneta. Os materiais usam repetição explícita, filtragem, mapas normais calculados e iluminação ACES. A luneta esconde a arma em primeira pessoa enquanto ativa. Foram inspecionadas capturas de porto, deserto, floresta, laboratório, menu e armamento.

As capturas finais do menu e do Cais de Carga estão em `docs/screenshots/beta-05-*.png`.

Os testes funcionais de conta/rede usam qualidade reduzida no renderer por software; o cenário visual testa gráficos altos/sombras separadamente. Os padrões gráficos do produto permanecem independentes dessas fixtures.

## Limites

Não houve benchmark em GPU externa, teste de carga de servidor público ou validação de cadastro no Supabase externo. Fixtures de autenticação/token são exclusivas de QA. Partidas locais não dependem desses serviços. O protocolo agora é 6: atualizar servidor e frontend juntos.

Cenários, modelos, texturas e sons são originais/procedurais. Os testes cobrem os fluxos exercitados e não garantem ausência de bugs ou desempenho fixo em qualquer computador. CI e publicação remota são verificados separadamente dos testes locais.
