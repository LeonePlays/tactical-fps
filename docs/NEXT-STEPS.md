# TACTICAL FPS — estado da beta 0.4

## Implementado

- Visitante inicia treino e partidas offline sem conta ou Supabase.
- Dois mapas efetivos: Complexo Ferro e Bairro Antigo, com física, spawns, rotas e objetivos próprios.
- FFA, TDM e bomba com regras distintas, limites configuráveis, pontuação, vencedor, resultado e reinício.
- Fácil/Normal/Difícil alteram IA; navegação por mapa, FOV/LOS, memória, estados e recuperação de bloqueios.
- Simulação offline única a 60 Hz, posturas, degraus baixos, física e tiro compartilhados com o servidor.
- Operadores facetados articulados e carabina/pistola/faca/HE com animações e feedback original.
- Perfil local, configuração persistida, TAB, notificações reais, áudio separado, resolução, sombras e tela cheia.
- Controles: C agacha, Z deita, Ctrl corre, Shift anda silenciosamente, botão direito mira e F controla lanterna.
- Seleção de equipamento por 1–6 e scroll; dois slots de HE; Q larga e E recupera equipamento com munição preservada.
- Servidor Node/WebSocket com protocolo 5, lista `/rooms` real, entradas validadas, chat global/equipe T/Y e reinício/reconfiguração pelo anfitrião em H.

## Dependências externas

O último diagnóstico registrado do domínio Supabase fornecido era **NXDOMAIN**, confirmado em 10/11/2026. Cadastro/login reais exigem restaurar o projeto ou configurar URL/chave publicável de projeto ativo. Desativar Confirm email, aplicar migração de usernames e publicar username-login conforme `supabase/README.md`. SMTP é necessário para recuperação. Fixtures de conta não comprovam o serviço real; o jogo offline permanece independente.

O servidor multiplayer está preparado para execução local e publicação posterior. Exige conta válida, processo persistente e TLS/WSS quando o frontend usa HTTPS; ver `server/README.md`. O frontend Vercel não executa esse processo. Publicar código não comprova hospedagem nem acesso público: validar o endereço compartilhado e o deployment correspondente.

## Planejamento posterior

Campanha narrativa e missões, mapa de porto, matchmaking público, ranking com resultados validados pelo servidor, chat de voz, compensação avançada de latência e reconexão com placar. Validar carga e autenticação real antes de hospedar competição pública. Ampliar animações, áudio e detalhes de arte conforme testes dos jogadores, sem copiar assets proprietários de jogos de referência.

Preservar GDD 1.4. Metadados editáveis de usuário não devem servir como ranking competitivo. Não há promessa de ausência absoluta de bugs ou medição de 60 FPS em hardware não testado. O relatório final deve distinguir testes executados, pendentes e limitações externas.
