# Servidor de partidas — beta 0.4 / protocolo 4

**Treino e bots offline não precisam deste servidor nem de conta.** No menu, configure a partida e use **CRIAR PARTIDA OFFLINE**. Este documento trata de salas reais entre jogadores, que exigem autenticação Supabase e um processo Node/WebSocket separado.

## Executar

Node.js 22.12+ ou 24 LTS e npm. A partir da raiz:

```bash
npm ci
npm run server
```

Em outro terminal:

```bash
npm run dev
```

Abra o frontend do Vite, escolha mapa, modo, bots, dificuldade e limites e entre com conta válida. Em **ENCONTRAR SERVIDORES**, informe `ws://127.0.0.1:3001`, consulte **ATUALIZAR SALAS** ou use **CRIAR SALA ONLINE**. A lista vem diretamente do processo informado. Também é possível informar o código para entrar. Quando a arena estiver pronta, clique em **ENTRAR NA PARTIDA** para capturar o mouse.

Uma conta ocupa no máximo uma conexão por servidor. A sala comporta até oito participantes incluindo zero a quatro bots. Sair pelo menu desconecta o jogador. O anfitrião pode reiniciar a sala; quando sai, a função passa a outro humano conectado. Quando o último humano sai, a sala e os bots são removidos. Reiniciar o processo apaga todas as salas.

## Regras compartilhadas

Complexo Ferro e Bairro Antigo usam as mesmas definições de colisão, spawn, navegação e área de bomba no navegador e no servidor. FFA disputa pontos individuais; TDM mantém pontos por equipe mesmo após desconexões; bomba disputa vitórias de rodada. Alpha usa azul e Bravo tons de ferrugem nos modos de equipe. Aliados não causam dano entre si nesses modos; explosões próprias podem ferir quem as lançou.

FFA/TDM começam com carabina e pistola, reaparecem após três segundos e terminam por tempo/pontos. Bomba começa com pistola para humanos, permite compra e não reaparece dentro da rodada. Configuração aceita `deathmatch`, `team-deathmatch` ou `defuse`, mapa, dificuldade, 0–4 bots, preferência de equipe, tempo de 30–1800 s e limite de 1–100. Na bomba, tempo significa duração por rodada e limite significa vitórias; defaults de 90 s/3 vitórias. A preferência de equipe respeita balanceamento e vagas disponíveis.

O servidor controla movimento, disparos, munição, compra, dano, mortes, pontos e regras. O cliente envia intenções, nunca posições ou acertos declarados. A reserva é finita; saldo, área de compra, colete e inventário são validados. Bots usam navegação por mapa e dificuldades reais. Pausar libera o mouse, mas a sala continua e o jogador pode receber dano.

## Configuração

| Variável                   | Padrão / uso                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `HOST`                     | `127.0.0.1`; `0.0.0.0` para LAN/container                                           |
| `PORT`                     | `3001`                                                                              |
| `ALLOWED_ORIGINS`          | `http://localhost:5173,http://127.0.0.1:5173`; origens exatas separadas por vírgula |
| `SUPABASE_URL`             | Projeto configurado no código; substituir por projeto ativo                         |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável, sem necessidade de `service_role`                                 |

O frontend aceita `VITE_MATCH_SERVER_URL` no build e endereço manual no menu. Use `ws://` no desenvolvimento HTTP; frontend HTTPS exige **wss://**. Um frontend público não deve apontar para localhost do visitante. Para LAN, exponha `HOST=0.0.0.0`, permita a origem exata do frontend, use o IP LAN e configure portas/firewall. Captura do mouse pode exigir HTTPS fora de localhost.

## Endpoints e autenticação

- `GET /health`: estado do processo e versão do protocolo.
- `GET /rooms`: `{ protocol, rooms: [{ code, mode, map, difficulty, players, bots, capacity, phase }] }`. Lista somente salas reais em memória, sem tokens nem IDs de conta; CORS aceita apenas origens configuradas.
- WebSocket: primeiro frame envia token, criação/entrada, nome, configuração e preferência. O token não vai na URL. Reinício é um comando autorizado somente ao anfitrião.

O servidor consulta `/auth/v1/user` e revalida a conta a cada minuto. Atualização do token durante a conexão ainda não está implementada; após expirar, entre novamente com sessão renovada pelo SDK. Limites de payload/frequência, 16 salas e 128 jogadores são aplicados. Entradas antigas deixam de mover/interagir; conexões sem mensagens são removidas.

O último diagnóstico registrado do projeto Supabase fornecido era NXDOMAIN. Isso impede contas reais até restaurar/substituir o projeto; veja `supabase/README.md`. Não existe opção de autenticação falsa em `npm run server`.

## Verificar

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Testes de servidor usam WebSockets reais com verificador injetado somente pelo teste. Playwright inicia servidor isolado na porta 3002 e frontend de produção na 4173. Não exponha `tests/support/match-server.ts` publicamente. Fixtures não comprovam acesso real ao Supabase. Um `/health` bem-sucedido não substitui criar uma sala, conectar dois clientes, sincronizar estados e testar desconexão.

## Publicar depois

Use processo Node persistente com suporte WebSocket, como VPS/container, e TLS/WSS em proxy. Instale dependências incluindo `tsx`, configure host, porta do provedor, origens públicas e Supabase ativo e execute `npm run server`. O Dockerfile está preparado, mas não há validação Docker nesta entrega. Configure `VITE_MATCH_SERVER_URL=wss://seu-servidor` e refaça o build do frontend.

Um processo mantém estado em memória; não escale horizontalmente sem afinidade/coordenação. Hospedagem pública, teste de carga, refinamento de latência, reconexão com placar e monitoramento continuam pendentes. Vercel estática publica apenas o frontend.

Atualize frontend e servidor juntos: handshake, snapshots e `/health` usam **protocolo 4**. Versões incompatíveis são rejeitadas. A origem das regras está em `src/game/`, com tipos e validação em `src/network/protocol.ts`.
