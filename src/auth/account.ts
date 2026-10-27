import { createClient, type User } from '@supabase/supabase-js';
import { parseSettings, type Settings } from '../core/settings';
const client = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://rrxwarhfizeuhowqpzle.supabase.co',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_zUcg_k51ypxP6FMCmNXJFw_EOjXkTNf',
);
export function mountAccount(change: (user: User | null, settings?: Settings) => void) {
  const shell = document.createElement('div');
  shell.className = 'overlay account-overlay';
  shell.innerHTML = `<section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="account-title"><h2 id="account-title">LOGAR</h2><nav aria-label="Acesso à conta"><button class="button text-button" type="button" data-mode="login">LOGAR</button><button class="button text-button" type="button" data-mode="signup">CADASTRAR</button></nav><form id="account-form"><label id="identifier-row"><span id="identifier-label">Usuário / e-mail</span><input name="identifier" type="text" autocomplete="username" required maxlength="254" aria-labelledby="identifier-label"><small id="username-hint" hidden>3–20 caracteres: letras, números e _. Sem espaços.</small></label><label id="email-row">E-mail<input name="email" type="email" autocomplete="email" maxlength="254"></label><label>Senha<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button class="button primary" type="submit">ENTRAR</button><button class="button text-button" type="button" data-mode="reset">ESQUECI A SENHA</button><p id="account-message" role="status"></p><small>Sua sessão fica salva neste navegador. Em computador compartilhado, saia da conta ao terminar.</small></form></section>`;
  document.body.append(shell);
  const form = shell.querySelector('form')!;
  const identifier = form.elements.namedItem('identifier') as HTMLInputElement;
  let registering = false;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  const message = shell.querySelector('#account-message')!;
  const submit = form.querySelector('button')!;
  const status = document.createElement('p');
  status.id = 'account-status';
  status.setAttribute('role', 'status');
  const logout = document.createElement('button');
  logout.className = 'button text-button';
  logout.textContent = 'SAIR DA CONTA';
  logout.hidden = true;
  document.querySelector('.topbar-right')!.replaceChildren(status, logout);
  let user: User | null = null;
  let mode = 'login';
  let busy = false;
  let queue = Promise.resolve();
  const setMode = (next: string) => {
    mode = next;
    message.textContent = '';
    if (next === 'signup' || next === 'reset') form.prepend(email.parentElement!);
    email.required = next === 'signup' || next === 'reset';
    email.parentElement!.hidden = !email.required;
    identifier.required = next === 'login' || next === 'signup';
    identifier.parentElement!.hidden = !identifier.required;
    identifier.pattern = next === 'signup' ? '[a-zA-Z0-9_]{3,20}' : '.*';
    shell.querySelector('#identifier-label')!.textContent =
      next === 'signup' ? 'Nome de usuário' : 'Usuário / e-mail';
    shell.querySelector('#username-hint')!.toggleAttribute('hidden', next !== 'signup');
    shell.querySelector('#account-title')!.textContent =
      { login: 'LOGAR', signup: 'CADASTRAR', reset: 'RECUPERAR SENHA', update: 'NOVA SENHA' }[
        next
      ] || 'LOGAR';
    password.required = next !== 'reset';
    password.parentElement!.hidden = next === 'reset';
    password.minLength = next === 'signup' || next === 'update' ? 8 : 1;
    password.autocomplete = next === 'login' ? 'current-password' : 'new-password';
    submit.textContent =
      { login: 'ENTRAR', signup: 'CADASTRAR', reset: 'ENVIAR LINK', update: 'SALVAR NOVA SENHA' }[
        next
      ] || 'ENTRAR';
  };
  const apply = (next: User | null) => {
    if (registering) return;
    const changed = user?.id !== next?.id;
    user = next;
    shell.hidden = !!user && mode !== 'update';
    logout.hidden = !user;
    status.textContent = user ? 'CONECTADO À CONTA' : 'LOGIN OBRIGATÓRIO';
    if (changed || !user)
      change(
        user,
        user?.user_metadata.settings
          ? parseSettings(JSON.stringify(user.user_metadata.settings))
          : undefined,
      );
  };
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setMode('update');
    apply(session?.user || null);
  });
  void client.auth
    .getUser()
    .then(({ data, error }) => apply(error ? null : data.user))
    .catch(() => apply(null));
  shell.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-mode]');
    if (button && !busy) setMode(button.dataset.mode!);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    submit.disabled = true;
    message.textContent = 'Aguarde…';
    try {
      const redirectTo = location.origin + location.pathname;
      if (mode === 'signup') {
        registering = true;
        const { data, error } = await client.auth.signUp({
          email: email.value.trim(),
          password: password.value,
          options: {
            data: { username: identifier.value.trim().toLowerCase() },
            emailRedirectTo: redirectTo,
          },
        });
        if (error) throw error;
        if (data.session) {
          const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
          if (signOutError) throw signOutError;
        }
        registering = false;
        apply(null);
        setMode('login');
        message.textContent = data.session
          ? 'Conta criada. Entre com seu usuário ou e-mail e senha.'
          : 'Cadastro recebido, mas a confirmação de e-mail ainda está ativada no serviço. O administrador precisa desativá-la.';
      } else if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email.value.trim(), {
          redirectTo,
        });
        if (error) throw error;
        message.textContent =
          'Se o e-mail estiver cadastrado, você receberá um link de recuperação.';
      } else if (mode === 'update') {
        const { error } = await client.auth.updateUser({ password: password.value });
        if (error) throw error;
        setMode('login');
        shell.hidden = !!user;
      } else if (identifier.value.includes('@')) {
        const { error } = await client.auth.signInWithPassword({
          email: identifier.value.trim(),
          password: password.value,
        });
        if (error) throw error;
      } else {
        const { data, error } = await client.functions.invoke('username-login', {
          body: { username: identifier.value.trim().toLowerCase(), password: password.value },
        });
        if (error || !data?.access_token || !data?.refresh_token) throw new Error('USERNAME_LOGIN');
        const { error: sessionError } = await client.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) throw sessionError;
      }
      password.value = '';
    } catch (error) {
      message.textContent =
        error instanceof Error && error.message === 'USERNAME_LOGIN'
          ? 'Não foi possível entrar por usuário. Confira os dados ou tente seu e-mail.'
          : 'Não foi possível concluir. Confira os dados e sua conexão. O nome pode já estar em uso; aguarde se tentou várias vezes.';
    } finally {
      registering = false;
      busy = false;
      submit.disabled = false;
    }
  });
  logout.onclick = async () => {
    logout.disabled = true;
    await queue;
    const { error } = await client.auth.signOut({ scope: 'local' });
    logout.disabled = false;
    if (error) status.textContent = 'Falha ao sair. Tente novamente.';
    else {
      setMode('login');
      apply(null);
    }
  };
  shell.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const nodes = [...shell.querySelectorAll<HTMLElement>('input, button')].filter(
      (node) => node.getClientRects().length && !(node as HTMLButtonElement).disabled,
    );
    const first = nodes[0],
      last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  setMode('login');
  return {
    async token() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token || null;
    },
    get canPlay() {
      return !!user && mode !== 'update';
    },
    save(data: Record<string, unknown>) {
      const owner = user?.id;
      if (!owner) return;
      queue = queue.then(async () => {
        if (user?.id !== owner) return;
        status.textContent = 'SALVANDO…';
        try {
          const { error } = await client.auth.updateUser({ data });
          if (error) throw error;
          status.textContent = 'DADOS SALVOS NA CONTA';
        } catch {
          status.textContent = 'FALHA AO SALVAR ONLINE. Tente novamente.';
        }
      });
    },
  };
}
