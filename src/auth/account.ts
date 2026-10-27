import { createClient, type User } from '@supabase/supabase-js';
import { parseSettings, type Settings } from '../core/settings';
const client = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://rrxwarhfizeuhowqpzle.supabase.co',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_zUcg_k51ypxP6FMCmNXJFw_EOjXkTNf',
);
export function mountAccount(change: (user: User | null, settings?: Settings) => void) {
  const shell = document.createElement('div');
  shell.className = 'overlay account-overlay';
  shell.innerHTML = `<section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="account-title"><h2 id="account-title">SUA CONTA TACTICAL FPS</h2><p>Entre para jogar e salvar seus ajustes e o último treino.</p><form id="account-form"><label>E-mail<input name="email" type="email" autocomplete="email" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="button primary" type="submit">ENTRAR</button><button class="button secondary" type="button" data-mode="signup">CRIAR CONTA</button><button class="button text-button" type="button" data-mode="reset">ESQUECI A SENHA</button><button class="button text-button" type="button" data-mode="login">VOLTAR AO LOGIN</button><p id="account-message" role="status"></p><small>Seu e-mail, ajustes e último resultado ficam no Supabase. Em computador compartilhado, saia da conta ao terminar.</small></form></section>`;
  document.body.append(shell);
  const form = shell.querySelector('form')!;
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
    email.required = next !== 'update';
    email.parentElement!.hidden = next === 'update';
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
  form.addEventListener('click', (event) => {
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
      const response =
        mode === 'signup'
          ? await client.auth.signUp({
              email: email.value.trim(),
              password: password.value,
              options: { emailRedirectTo: redirectTo },
            })
          : mode === 'reset'
            ? await client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo })
            : mode === 'update'
              ? await client.auth.updateUser({ password: password.value })
              : await client.auth.signInWithPassword({
                  email: email.value.trim(),
                  password: password.value,
                });
      if (response.error) throw response.error;
      message.textContent =
        mode === 'signup'
          ? 'Confira seu e-mail para confirmar o cadastro e depois entre.'
          : mode === 'reset'
            ? 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.'
            : '';
      if (mode === 'update') {
        setMode('login');
        shell.hidden = !!user;
      }
      password.value = '';
    } catch {
      message.textContent =
        'Não foi possível concluir. Confira os dados, a confirmação do e-mail e sua conexão. Aguarde se tentou várias vezes.';
    } finally {
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
