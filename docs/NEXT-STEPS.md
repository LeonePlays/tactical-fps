# Próximas entregas do TACTICAL FPS

## Entrega atual

- Supabase Auth: cadastro, login, recuperação e logout; treino exige conta.
- Configurações e resumo do último treino salvos nos metadados da conta.
- Carabina automática e pistola semiautomática, carregadores separados, troca 1/2.
- Recuo de câmera, dispersão por postura/movimento/rajada, clarão e áudio sintetizado em camadas.
- Modelos de armas continuam procedurais; avaliação visual e sonora pelo jogador continua necessária.

## Dependências externas pendentes

- Configurar SMTP e URLs de confirmação/recuperação no Supabase.
- Tornar o endereço Vercel público; validar em janela anônima.
- Validar autenticação com e-mail real: testes automatizados usam interceptação da API.
- Definir hospedagem do servidor de partidas. A Vercel estática não executa esse servidor.
- Confirmar CI e deployment pelo GitHub/Vercel; a rede do ambiente retornou 403 nas consultas HTTP/API. O push Git funcionou.

## Escopo ainda não implementado

- Faca, granadas, equipamentos e bomba.
- Dano, morte, reaparecimento e regras de partida.
- Bots com percepção, navegação e combate.
- Criação/entrada de salas, jogadores e bots juntos.
- Servidor autoritativo, reconexão, sincronização e validação entre dois clientes.
- Melhorias adicionais na postura deitado e assets/animações finais.

Preservar o GDD 1.4. Histórico competitivo deverá usar banco com RLS e resultados validados pelo servidor; metadados editáveis do usuário não são adequados para ranking.
