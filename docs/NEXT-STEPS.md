# Próximas entregas do TACTICAL FPS

## Entrega atual

- Supabase Auth: cadastro, login, recuperação e logout; treino exige conta.
- Configurações e resumo do último treino salvos nos metadados da conta.
- Carabina automática e pistola semiautomática, carregadores separados, troca 1/2.
- Recuo de câmera, dispersão por postura/movimento/rajada, clarão e áudio sintetizado em camadas.
- Modelos de armas continuam procedurais; avaliação visual e sonora pelo jogador continua necessária.

## Dependências externas pendentes

- Desativar Confirm email, aplicar a migração de usernames e publicar username-login; ver `supabase/README.md`. SMTP é necessário para recuperar senha, não para cadastrar sem confirmação.
- Tornar o endereço Vercel público; validar em janela anônima.
- Validar autenticação com e-mail real: testes automatizados usam interceptação da API.
- Bots individuais já rodam no navegador; publicar depois o servidor para salas entre jogadores, conforme `server/README.md`. A Vercel estática não executa esse processo.
- Confirmar CI e deployment pelo GitHub/Vercel; a rede do ambiente retornou 403 nas consultas HTTP/API. O push Git funcionou.

## Escopo ainda não implementado

- Faca, granadas, equipamentos e bomba.
- Regras por equipes e rodadas; dano, morte e reaparecimento já existem na arena local.
- Melhorar bots: hoje perseguem, deslocam-se lateralmente e disparam; faltam navegação e decisões táticas.
- Publicação das salas; criação/entrada por código e jogadores/bots juntos já funcionam localmente.
- Melhorar previsão/interpolação e reconexão; servidor local autoritativo e testes entre dois clientes foram adicionados.
- Melhorias adicionais na postura deitado e assets/animações finais.

Preservar o GDD 1.4. Histórico competitivo deverá usar banco com RLS e resultados validados pelo servidor; metadados editáveis do usuário não são adequados para ranking.
