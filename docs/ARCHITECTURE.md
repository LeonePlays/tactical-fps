# Arquitetura — beta 0.5

## Fonte e escopo

A base preservada é TypeScript/Vite/Babylon.js. Na inspeção desta entrega, a principal acessível era `tactical-fps`; as branches `main` e `opencode-*` citadas no pedido não apareceram. O planejamento GDD 1.4 e `GDD.md` permanecem como recebidos. Não há importação de um deployment compilado para substituir a fonte.

Treino e partidas offline funcionam como visitante. Contas são opcionais no jogo local; salas entre jogadores usam autenticação real e processo WebSocket separado.

## Simulação e renderização

`main.ts` conecta o ciclo de vida da interface a `Game`, que possui cena, câmeras, entrada e feedback. A carga do motor é sob demanda. O menu usa uma câmera panorâmica; a câmera FPS requer captura do ponteiro após clique. Escape, perda de foco e troca de aba liberam a entrada e pausam o jogo local. Uma sala online continua no servidor durante a pausa.

`core/fixed-step.ts` acumula tempo e executa passos de **1/60 s**, com recuperação limitada após travamentos longos. `network/local.ts` não mantém um segundo relógio: `Game` envia entrada e chama seu transporte local a cada passo. A mesma `Match` determina física, tiro, inventário, dano e regras. Isso evita a antiga correção concorrente de uma simulação local a 20 Hz. Renderização interpola posições; a câmera suaviza altura e pequenas correções remotas sem alterar os volumes físicos.

`physics.ts` é independente de Babylon: coordenadas nos pés, AABB por eixo e subdivisão temporal, gravidade, aceleração, atrito e controle aéreo. WASD movimenta, Ctrl corre e Shift tem prioridade para andar silenciosamente. C e Z alternam agachar/deitar após verificar o teto. Saltos exigem nova pressão e não funcionam deitado. Degraus de até 0,30 m podem ser transpostos sem salto, desde que haja espaço. O corpo cinemático não é uma cápsula anatômica completa. A apresentação utiliza deslocamento percorrido para passos/balanço do armamento, suaviza mudanças de postura e acrescenta resposta breve à aterrissagem sem sacudir a colisão física.

## Mapas compartilhados

`game/map-catalog.ts` define os 20 IDs, nomes, descrições e temas sem dependência do motor. `game/maps.ts` exporta blocos físicos, sólidos, oito spawns, limites, área da bomba e patrulhas de todas as arenas. `map-layouts.ts` contém os 18 novos layouts; Complexo Ferro e Bairro Antigo permanecem preservados. `Match`, navegação e renderer consomem esses mesmos dados; o menu desenha a planta a partir dos volumes reais.

- Complexo Ferro: arena industrial de 32 × 32 m, nove volumes físicos.
- Bairro Antigo: 48 × 48 m, 36 volumes físicos e dois interiores atravessáveis, café e mercado.
- Novas arenas: oito temas de catálogo, com layouts de carga portuária, instalações industriais, ruas, forte, deserto, floresta, neve e laboratório. As definições têm geometrias e rotas diferentes, em vez de trocar apenas a cor do mesmo campo.

`world.ts` preserva o treino industrial e a arena industrial; `urban-world.ts` constrói Bairro Antigo. `catalog-world.ts` renderiza as novas definições com materiais/texturas por tema e interpretação dos nomes semânticos de edifícios, contêineres, barris, pilares e coberturas. Detalhes decorativos ficam dentro dos volumes ou fora da área física; não devem introduzir obstáculos ausentes na autoridade. Texturas, fachadas, props e horizonte são originais gerados em código. Geometrias estáticas são agrupadas por material/picking, materiais são compartilhados e sombras estáticas não precisam ser recalculadas a cada frame. Apenas o mapa ativo mantém recursos de cena; o catálogo de colisão continua independente de Babylon.

## IA, personagens e equipamento

`navigation.ts` mantém grafo de visibilidade por mapa, com folga para o corpo, rotas pelos interiores e recuperação de bloqueios. Percepção usa alcance, FOV e linha de visão. A memória retém a última posição observada, sem acompanhar inimigos ocultos. A máquina de estados oferece patrulha, investigação, perseguição, combate, recuo, reagrupamento e objetivo. Os perfis Fácil/Normal/Difícil alteram reação, percepção, mira, cadência e controle parcial do recuo. Coordenação usa posições conhecidas dos aliados.

`actors.ts` produz operadores articulados com roupa texturizada, variação de aparência, colete/equipamentos, capacete, óculos e comunicação. Materiais identificam a equipe, e a animação deriva de movimento, postura e ações confirmadas. Os pés usam uma solução de duas articulações para reduzir deslizamento e flutuação nas transições. Geometria é agrupada por osso/material. A arma remota adapta silhueta/acessórios e tempo de recarga ao identificador real do inventário. `weapon.ts`, `equipment-view.ts` e `bomb-view.ts` geram as vistas de primeira pessoa e seus pivôs de animação. As dez armas variam cano, corpo, coronha, carregador e acessórios por classe. Nenhum modelo externo é baixado. O botão direito interpola posição de mira e FOV conforme o fator de aproximação da arma; DMR/SR-8 apresentam retículo óptico. F controla uma lanterna presa à câmera.

`WeaponController` concentra as regras de armas compartilhadas; `ballistics.ts` exporta `GUNS`, `WeaponId` e os atributos das dez armas. `WeaponSlot` permanece primária/secundária; cada entrada de inventário pode trazer `weaponId`, com T-04/P-09 como padrões para estados antigos. Cadência, modo automático/semiautomático, capacidade, reserva, recarga, implantação, dano, alcance, queda por distância, dispersão, recuo e zoom derivam da especificação selecionada. Um disparo retorna `directions`: a SG-12 resolve oito projéteis independentes com oclusão, mas gasta somente um cartucho e registra precisão por disparo. Bots variam o arsenal e sequenciam tentativas semiautomáticas de acordo com reação e cadência da arma.

`equipment.ts` controla inventário, dois slots independentes de HE, golpe curto, lançamento, ricochetes, detonação e oclusão. Q remove o equipamento selecionado e E recupera itens próximos com linha de visão; identificador, munição e reserva acompanham armas largadas. A faca permanece no inventário. As teclas 1–6 e o scroll selecionam equipamento; a bomba exige posse no modo de objetivo. `ImpactPool` limita impactos a 64 meshes. Áudio é sintetizado originalmente, reutiliza buffer de ruído e libera nós após playback; mistura master/efeitos/música e feedback remoto por distância/panorama.

## Regras e configuração

`match-config.ts` centraliza opções validadas. O navegador normaliza preferências locais; o servidor rejeita configurações malformadas. Mapa, modo, bots, dificuldade, equipe, duração, limite e IDs de primária/secundária entram na configuração efetiva transmitida no snapshot. O loadout humano é restaurado ao reaparecer ou reiniciar. FFA/TDM concedem as duas armas; bomba concede a secundária e B → 1 compra a primária configurada pelo preço real. O treino individual aplica a mesma seleção pelo ciclo de vida de `Game.configureLoadout`.

`RoundController` distingue FFA, TDM e bomba. FFA usa pontos individuais; TDM registra pontos de equipe no momento da eliminação, preservando-os após desconexão. Ambos reaparecem em três segundos e terminam por tempo/pontos. Bomba tem preparação, plantio/desarme, pavio, placar de rodadas e ausência de reaparecimento durante a rodada. Seu objetivo usa a posição definida pelo mapa. `matchId` muda no reinício para limpar a apresentação e reinicializar a sessão sem confundir nova partida com a rodada anterior.

## Interface, persistência e distribuição

`ui/match-menu.ts` monta configuração persistida, opções de armamento e navegação entre os 20 mapas; `ui/content-menu.ts` desenha a planta e traduz temas/classes. `ui/session.ts` apresenta nomes, placar, resultado e notificações derivados de dados reais. TAB mostra o scoreboard. Perfil, créditos, servidores, pausa, configurações e resultado têm ações próprias. Preferências locais incluem áudio separado, resolução, sombras, sensibilidade e FOV. O SDK Supabase persiste sessão; senhas não são armazenadas pelo jogo. Ajustes/resumos visitantes não migram entre computadores e não são ranking competitivo.

`server/server.ts` transmite snapshots a 20 Hz, verifica tokens, valida intenções e administra salas efêmeras. Protocolo **6** inclui catálogo de mapas, loadout, identidade de armas no inventário/itens largados, nomes, equipe, `matchId` e anfitrião. `/rooms` lista salas reais do processo, com CORS restrito às origens configuradas; não há diretório público fictício. Reinício e reconfiguração são reservados ao anfitrião, com transferência para outro humano conectado. `ui/online-controls.ts` abre chat global/equipe em T/Y e ajustes do anfitrião em H, somente em sala online. Mensagens são limitadas e distribuídas pelo servidor de acordo com sala/equipe; a interface usa texto, sem inserir HTML. Reconfiguração inicia uma nova partida, conserva os participantes humanos e consome contadores antigos para evitar repetir tiros, compras ou descartes. Ping/pong WebSocket verifica conexões mesmo quando a renderização está pausada; intenções de movimento continuam expirando separadamente. Não há compensação avançada de latência nem reconexão com preservação de placar.

A Vercel publica apenas `dist/`. Servidor persistente/TLS/WSS e Supabase ativo são dependências separadas do multiplayer. O último diagnóstico registrado do domínio Supabase fornecido era NXDOMAIN; isso não bloqueia treino/bots.

`npm test`, `npm run build` e Playwright cobrem os módulos e fluxos descritos. Resultados de cada execução devem vir do relatório real da entrega; presença de um teste não comprova aprovação. Não foi estabelecida uma medição de 60 FPS em hardware de referência. Campanha, matchmaking, ranking e chat de voz permanecem no planejamento; cenários portuários já fazem parte do catálogo jogável.
