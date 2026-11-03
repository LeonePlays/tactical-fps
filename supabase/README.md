# Configurar as contas solicitadas

## 1. Cadastro sem confirmação de e-mail

No painel do projeto `rrxwarhfizeuhowqpzle`, abra **Authentication → Sign In / Providers → Email** e desative **Confirm email**. Salve. Esse ajuste não pode ser alterado pela chave publicável usada no frontend.

Novos cadastros retornam à tela de login. Usuários antigos ainda não confirmados podem precisar de confirmação administrativa em Authentication → Users antes de entrar; desligar a opção não deve ser presumido como confirmação retroativa.

## 2. Nomes de usuário únicos

Execute `migrations/202610270001_usernames.sql` no SQL Editor. A regra é de 3–20 caracteres: letras minúsculas, números e sublinhado. A interface normaliza para minúsculas. O índice impede duplicatas no servidor; não apenas no navegador. Contas existentes sem username continuam usando e-mail.

Se houver duplicatas de username preexistentes, resolva-as antes de instalar o índice. A migração não remove contas nem dados.

## 3. Login por nome de usuário

Publique a Edge Function `username-login`. Com a CLI Supabase autenticada:

```bash
supabase functions deploy username-login --project-ref rrxwarhfizeuhowqpzle
```

A configuração `verify_jwt = false` em `config.toml` permite iniciar login sem sessão prévia. A função verifica a senha no Supabase Auth antes de retornar tokens. O serviço usa variáveis administrativas fornecidas pelo próprio runtime Supabase; **nenhuma chave service_role vai para o frontend**. A consulta de e-mail por username está restrita à função administrativa e não pode ser chamada por usuários anônimos ou autenticados.

Sem a migração/função, o login por e-mail funciona, mas o login por username não está operacional. Esses arquivos foram preparados, não aplicados remotamente neste ambiente. A função precisa de validação real após publicação; o build Vite não compila Deno e os testes do frontend simulam Auth.

## 4. Validação

Cadastre uma conta com username novo, confirme que a interface volta para LOGAR sem pedir e-mail de confirmação e entre primeiro pelo e-mail, depois pelo username. Verifique rejeição de username duplicado, senha errada e nome inválido. Reabra o site e confirme a sessão persistente. O Chrome/Google Password Manager pode oferecer salvar a senha; isso depende das preferências do navegador e não é login com Google.

Recuperação de senha continua dependendo de SMTP e de Site URL/Redirect URLs corretos. Cadastro sem confirmação não precisa enviar e-mail; recuperação precisa.

## Diagnosticar cadastro recusado

Antes de alterar confirmação de e-mail, valide a **Project URL atual** no painel e se o projeto está ativo. Um domínio de projeto que retorna `NXDOMAIN` no DNS não alcança Auth: trocar senha ou nome de usuário não corrige esse caso. Restaure um projeto pausado ou atualize `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` na Vercel com os dados do projeto ativo e refaça o deploy. Nunca use secret key ou service_role no frontend.

A interface agora traduz erros conhecidos e mostra um código curto, sem exibir tokens ou detalhes privados do servidor:

- `network_error`: serviço inalcançável; conferir URL, estado do projeto e conexão.
- `weak_password` / `email_address_invalid`: corrigir o campo informado.
- `email_address_not_authorized` / `email_delivery_error`: revisar confirmação de e-mail/SMTP.
- `signup_disabled` / `email_provider_disabled`: habilitar cadastro e o provedor Email.
- `unexpected_failure` com falha no banco: conferir Auth Logs e o gatilho/índice de usernames.
- `over_request_rate_limit` / HTTP 429: aguardar; não repetir o cadastro continuamente.

Se `signUp` já criou a conta mas falhou apenas ao encerrar a sessão automática, a interface informa que a conta foi criada e retorna ao login; não apresenta essa falha de limpeza como cadastro recusado.
