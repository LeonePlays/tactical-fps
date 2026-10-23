# Desenvolvimento

Use Node.js 22.12+ ou 24 LTS e `npm ci`. Execute `npm run dev` para desenvolver e `npm run format` para padronizar os arquivos e verifique `npm test`, `npm run build` e `npm run test:e2e` (com Chromium instalado) antes de abrir uma pull request.

Mantenha o nome **TACTICAL FPS**, o foco em navegadores de computador e o planejamento do GDD 1.4. Preserve as áreas `src`, `server`, `public/assets`, `docs` e `tests`. Implemente somente o escopo da tarefa: os contratos futuros não exigem implementar IA, campanha, rede ou autenticação na Alpha.

Arte e sons adicionados devem ser originais ou ter licença compatível e atribuição documentada. Não use mapas, sons, texturas ou modelos de outros jogos sem autorização. Nunca registre credenciais ou arquivos `.env` no Git.

A física pode ser validada sem GPU nos testes unitários. Mudanças de câmera, entrada, alvos e renderização também exigem validação real de navegador. Um build bem-sucedido, sozinho, não demonstra jogabilidade.
