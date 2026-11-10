# TACTICAL FPS — estado da beta 0.3

## Entregue

- Visitante joga treino e partidas locais sem conta e sem Supabase.
- Combate livre, três bots por padrão, resultado, reinício e retorno ao menu.
- Bomba por equipes, preparação, plantio/desarme e melhor de cinco.
- Movimento com aceleração/atrito, air-strafe, agachamento/deitado e colisões.
- Carabina/pistola, recuo, munição finita, faca, HE e compra de equipamento.
- Bots com reação, linha de visão e navegação; humanoides com posturas e caminhada.
- Frontend Vercel e servidor autoritativo local com protocolo 3, jogadores e bots juntos.
- Persistência de ajustes/resumos no navegador; contas reais têm armazenamento separado.

## Dependências externas

O domínio Supabase fornecido retorna NXDOMAIN, confirmado em 10/11/2026. Restaurar o projeto ou configurar URL/chave publicável de projeto ativo. Desativar Confirm email, aplicar migração de usernames e publicar username-login conforme `supabase/README.md`. SMTP só é necessário para recuperação. Testes simulados de contas não comprovam o serviço real. O jogo local permanece disponível.

O servidor multiplayer foi preparado para executar localmente e publicar depois, conforme solicitado; ver `server/README.md`. Precisa de conta válida, processo persistente e TLS/WSS para frontend HTTPS. Bots individuais não exigem esse servidor.

## Planejamento posterior

Campanha narrativa, mapas urbano/porto, assets/animações finais, escolha de equipe/dificuldade, matchmaking, ranking validado no servidor, chat/voz, compensação de latência e reconexão com placar. Validar carga antes de hospedar competição pública.

Preservar GDD 1.4. Metadados editáveis de usuário não devem ser usados como ranking competitivo.
