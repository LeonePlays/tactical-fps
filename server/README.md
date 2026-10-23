# Backend futuro

Esta primeira versão executa integralmente no navegador. Não há servidor, endpoint de autenticação ou banco de dados para iniciar.

A pasta está preservada para serviços futuros. Os contratos de integração estão em `src/features/contracts.ts`. Antes de implementar multiplayer, será necessário definir um protocolo versionado, simulação autoritativa, validação de entrada, limites de frequência e autenticação. Não coloque segredos no frontend Vite.
