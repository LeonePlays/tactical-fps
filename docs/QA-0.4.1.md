# Verificação da beta 0.4.1 — controles

Validação local em 13/11/2026, Chromium de computador (`/usr/bin/chromium`), WebGL/SwiftShader e teclado/mouse nativos do Playwright.

- `npm test`: 171 testes de lógica/integração aprovados em 22 arquivos.
- `npm run build`: TypeScript e Vite aprovados; produção gerada em `dist/`.
- `npm run format:check` e `git diff --check`: aprovados.
- Playwright: 13 cenários distintos aprovados em duas execuções (8 e 6 casos, com o controle geral repetido). Cobrem HUD, compra, recarga, impactos, movimento, colisão, configurações, visitante, mapas/modos, controles novos, bomba, chat, anfitrião e salas com dois navegadores.

## Controles exercitados

O cenário de controles verifica C/Z, corrida em pé com Ctrl, prioridade do Shift, F, aproximação da mira pelo botão direito, scroll, restrição de mira na faca, Q/E preservando munição, compra da segunda HE e uso independente do slot 5. Teclas de chat/anfitrião não abrem ferramentas fictícias no treino offline. Outro cenário cria uma partida real de bomba com Alpha, equipa o dispositivo em 6, larga com Q, recupera com E e equipa novamente.

O cenário online usa uma sala WebSocket real no servidor de testes: T envia texto literal à sala, Y à equipe e H altera mapa, dificuldade e quantidade de bots, carrega Bairro Antigo e permite entrar na nova partida. Testes de servidor verificam isolamento entre salas/equipes, limites de mensagem, autoridade do anfitrião e ausência de repetição de comandos antigos após configurar a sala.

Testes de inventário verificam conservação de munição, descarte sem duplicação, implantação ao recolher, distância e oclusão de paredes, dois slots HE, bomba sem disparo de arma oculta e recuperação da bomba durante a preparação. O movimento compartilhado confirma que Ctrl aumenta a velocidade e que Shift/mira limitam a velocidade.

## Correções encontradas nos testes

A primeira tentativa de Playwright não iniciou porque o navegador padrão não estava instalado; a execução utilizou o Chromium existente. O primeiro teste online sofreu um bloqueio longo da renderização por software e expirou a conexão por ausência de inputs. O servidor agora usa ping/pong WebSocket para verificar a conexão independentemente da renderização; os comandos de movimento continuam expirando em 300 ms. O cenário foi repetido com qualidade baixa e aprovado.

## Limites

Autenticação e verificação do token são fixtures somente nos testes online; isso não valida o cadastro externo do Supabase. Salas públicas continuam exigindo hospedagem do servidor e autenticação disponível. Atualizar frontend e servidor juntos para o protocolo 5. Chat T/Y e painel H só funcionam em uma sala online conectada. Os dois slots de granada são HE; a faca permanece como equipamento permanente. Não houve benchmark em GPU externa, teste de carga público nem promessa de ausência absoluta de bugs. O resultado local não implica aprovação automática do CI remoto.
