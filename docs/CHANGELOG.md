# Changelog

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
