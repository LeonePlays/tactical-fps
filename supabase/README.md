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
