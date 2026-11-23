# Changelog

## 0.5.0 — Catálogo de mapas, arsenal e apresentação

- Vinte mapas jogáveis: Complexo Ferro e Bairro Antigo preservados e 18 layouts novos, com temas industriais, urbanos, portuários, deserto, floresta, neve, laboratório e ruínas. Colisão, spawns, navegação e objetivo usam dados compartilhados.
- Menu de mapas com planta real, descrição, dimensões e navegação anterior/próximo. Seleção persistida de sete primárias e três secundárias, válida também no treino individual.
- Dez armas originais com modelos e atributos próprios: T-04, AR-47, S-9, DMR-14, SG-12, SR-8, L-60, P-09, P-45 e P-22. Cadência, recuo, dispersão, reserva, recarga, alcance, queda de dano e zoom dependem da arma.
- SG-12 com oito projéteis reais por cartucho e colisão por projétil; DMR/SR-8 com mira ampliada. Q/E preservam a identidade da arma e munição. Na bomba, B → 1 compra a primária selecionada.
- Bots usam armamentos variados e sequenciam armas semiautomáticas sem ficar presos a um gatilho antigo.
- Operadores com roupa texturizada, equipamento de proteção/comunicação, variação visual e transições articuladas com apoio dos pés; silhueta e recarga da arma remota correspondem ao inventário.
- Texturas e detalhes arquitetônicos por tema, estruturas e materiais originais; apresentação de movimento com balanço da arma, passos e resposta à aterrissagem.
- Protocolo 6 transporta catálogo e identidade de armas/loadout; frontend e servidor precisam ser atualizados juntos. Novos testes de catálogo/navegação, arsenal, colisão de projéteis e conservação do inventário; resultados efetivamente executados ficam no relatório de QA da entrega.

## 0.4.1 — Controles, inventário e ferramentas de sala

- C agacha, Z deita, Ctrl corre e Shift anda silenciosamente, com prioridade sobre a corrida.
- Botão direito mantém mira com aproximação suave, arma centralizada e redução da velocidade; F alterna lanterna real.
- Scroll percorre apenas equipamentos disponíveis. Slots 4/5 guardam HE independentes; 6 seleciona a bomba de quem a carrega.
- Q larga arma, HE ou bomba; E recolhe com distância/oclusão, preservando munição e evitando duplicação. Faca é o equipamento permanente.
- T/Y enviam chat real por sala/equipe; H configura mapa, modo, bots, dificuldade e limites pelo anfitrião online.
- Protocolo 5: atualizar frontend e servidor juntos. Objetivos não podem ser manipulados através de paredes.

## 0.4.0 — Mapas, equipes e polimento offline

- Segundo mapa real: Bairro Antigo, com praça, ruas, café/mercado e rotas interiores; seleção compartilhada entre renderer, física, navegação e servidor.
- TDM com pontos persistentes por equipe, proteção de aliados, reaparecimento e resultado; FFA e bomba preservados com limites configuráveis.
- Fácil/Normal/Difícil afetam percepção, reação, giro, cadência, erro de mira e controle do recuo; IA por estados, navegação por mapa e recuperação de bloqueios.
- Relógio fixo de 60 Hz e autoridade única nas partidas offline, interpolação de renderização e degraus baixos.
- Operadores facetados e quatro viewmodels originais, animações de postura/ação, áudio dedicado e mistura master/efeitos/música.
- Configuração persistida, perfil local, scoreboard TAB, notificações derivadas de mortes, resultado com vencedor e reinício.
- Opções de resolução, sombras e tela cheia; menus de perfil, créditos e servidor com ações reais.
- Protocolo 4, lista `/rooms` real, criação validada, reinício pelo anfitrião e transferência após desconexão.
- Novos testes de mapas, IA, relógio, transporte local, modelos, configurações e apresentação. Consultar relatório da entrega para resultados efetivamente executados.

## 0.3.0 — Beta visitante e rodadas

- Treino e bots locais acessíveis como visitante, sem depender de Supabase.
- Combate livre e bomba por equipes, preparação, plantio/desarme, resultado e nova partida.
- Faca, HE com colisão/oclusão e compra de equipamento; correções de troca de ferramenta e disparos indevidos.
- Navegação com obstáculos, personagens articulados e acabamento industrial original.
- Persistência local de ajustes/resumos e autenticação opcional no jogo local.
- Protocolo 3; projeto Supabase fornecido permaneceu com domínio indisponível, sem alegar correção de cadastro real.

## 0.2.0 — Classic Feel

- Velocidade horizontal com aceleração, atrito, counter-strafe e air-strafe; Shift passa a andar.
- Spray determinístico, punch de câmera separado da mira, deploy por arma e reserva finita.
- Um controlador de armas para navegador e servidor; comandos rápidos sequenciados.
- HUD compacto com radar Canvas 2D, cruz dinâmica/fixa, dinheiro, colete, munição e compra por teclado.
- Compras autorizadas por área/tempo/saldo, e preservação de munição nas recargas.
- Pool de marcas de bala, passos por distância e áudio com buffer de ruído compartilhado.
- Protocolo de salas 2 e mensagem explícita para versões incompatíveis.
- Diagnóstico, referência técnica, valores ajustáveis e integração em `CLASSIC-FEEL.md`.

## 0.1.0 — Primeira versão jogável

- TypeScript, Vite e Babylon.js, com lockfile e configuração de frontend para Vercel.
- Complexo Ferro: mapa industrial original com armazém acessível, pátio de carga, contêineres, cobertura e passagens baixas.
- Câmera FPS por mouse, WASD, corrida, agachamento, posição deitado, salto e colisões.
- Carabina procedural, seis alvos de treino, disparos com oclusão, recarga, áudio sintetizado e HUD de precisão.
- Menu principal, pausa, controles e ajustes locais de sensibilidade, FOV, volume e qualidade.
- Contratos de arquitetura para IA, campanha, multiplayer e autenticação; sem implementação dos serviços avançados.
- Testes unitários e funcionais de navegador, CI e documentação de execução/publicação.
- Exclusividade para computadores documentada; referência ao GDD 1.4 e arquivo original preservados.
