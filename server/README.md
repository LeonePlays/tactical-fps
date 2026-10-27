# Servidor local de partidas

Requisitos: Node.js 22.12+ ou 24 LTS e npm. Execute os comandos a partir da raiz do repositório.

```bash
npm ci
npm run server
```

Em outro terminal:

```bash
npm run dev
```

Abra o frontend em `http://localhost:5173`, entre com uma conta Supabase válida e abra **SALAS COM JOGADORES E BOTS**. Use `ws://127.0.0.1:3001`, escolha 0–4 bots e clique em **CRIAR SALA**. Clique em **ENTRAR NA ARENA** para capturar o mouse. Compartilhe o código com outro navegador usando uma conta diferente. A conta só pode ocupar uma conexão por servidor. Para sair, volte ao menu e clique em **VOLTAR AO TREINO INDIVIDUAL**.

A arena usa o mesmo conjunto de colisões no cliente e servidor. Bots laranja e jogadores azuis participam de combate livre, sem equipes; todos podem se atingir. A sala suporta até oito participantes **incluindo bots**. O servidor controla movimento, tiro, munição, recarga, dano, mortes, eliminações e reaparecimento após três segundos. Pausar libera o mouse, mas a partida continua e você pode receber dano. O placar não é persistido entre salas. A reserva de munição é ilimitada nesta versão.

Os bots são simples: perseguem o adversário mais próximo e se deslocam lateralmente, com imprecisão e cadência reduzida. Não têm navegação tática, tomada de cobertura ou dificuldade selecionável. Os personagens são marcadores 3D provisórios, sem animações finais. Não há rodada, economia, bomba ou reconexão que preserve o placar.

## Configuração

| Variável do servidor       | Padrão / uso                                                                     |
| -------------------------- | -------------------------------------------------------------------------------- |
| `HOST`                     | `127.0.0.1`; use `0.0.0.0` para LAN/container                                    |
| `PORT`                     | `3001`                                                                           |
| `ALLOWED_ORIGINS`          | `http://localhost:5173,http://127.0.0.1:5173`; URLs exatas separadas por vírgula |
| `SUPABASE_URL`             | Projeto público configurado no código                                            |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável configurada no código; nunca exige service_role                 |

O frontend aceita `VITE_MATCH_SERVER_URL` no build; o endereço também pode ser informado no menu. Use `ws://` para desenvolvimento HTTP. O frontend publicado em HTTPS exige **wss://** e um servidor hospedado com TLS; ele não deve apontar para localhost do visitante.

Para dois computadores na mesma LAN, execute com `HOST=0.0.0.0`, adicione a origem exata do frontend em `ALLOWED_ORIGINS` e use o IP LAN do servidor no campo Servidor. Captura do mouse e recursos do navegador podem exigir HTTPS fora de localhost. Configure portas/firewall da sua rede.

## Autenticação e limites

O token é enviado no primeiro frame WebSocket, nunca na URL. O servidor verifica `/auth/v1/user` no Supabase e revalida a sessão a cada minuto. Falhas de verificação encerram a conexão. Atualização do token durante a conexão ainda não foi implementada: após expirar, entre na sala novamente com a sessão renovada pelo SDK. Não existe opção de autenticação falsa no comando `npm run server`.

Entradas são validadas e limitadas; posições e acertos declarados pelo cliente não são aceitos. Há limites de payload, frequência, 16 salas e 128 jogadores. Entradas antigas param o movimento; conexões sem mensagens são removidas. Quando o último humano sai, a sala e seus bots são apagados. Reiniciar o processo apaga todas as salas.

## Testar

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Testes de integração usam sockets reais e um verificador injetado **somente pelo código de teste**. O Playwright inicia um servidor isolado na porta 3002 com contas de teste, além do frontend de produção na porta 4173. Não inicie `tests/support/match-server.ts` como servidor público. Esses testes não comprovam o acesso real ao Supabase.

`GET /health` retorna JSON com o estado do processo. Verificar health não substitui um teste de sala entre dois clientes.

## Publicar depois

Hospede um processo Node persistente com suporte a WebSocket (VPS, container ou serviço equivalente). A pasta inclui um `Dockerfile` na raiz; ele não foi validado com Docker neste ambiente. Instale dependências incluindo `tsx` e execute `npm run server`. Configure `HOST=0.0.0.0`, a porta do provedor, as origens públicas exatas e TLS/WSS no proxy da hospedagem. Configure `VITE_MATCH_SERVER_URL=wss://seu-servidor` no frontend e refaça o build Vercel.

Um único processo mantém todas as salas em memória; não escale horizontalmente sem afinidade e coordenação de estado. Antes de abertura pública, validar carga, latência, segurança, expiração/reconexão, monitoramento e autenticação com contas reais. O servidor não foi publicado nesta entrega.

## Bots sem servidor

Para jogar sozinho, use **JOGAR COM BOTS NESTE COMPUTADOR** no menu. Esse modo simula a arena no navegador, pausa com ESC e não usa WebSocket. O servidor descrito acima é necessário para salas entre jogadores.
