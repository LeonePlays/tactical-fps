import { describe, it, expect } from 'vitest';
import { authErrorMessage } from '../src/auth/errors';
describe('authentication failure diagnosis', () => {
  it.each([
    [{ code: 'weak_password' }, 'senha mais forte'],
    [{ code: 'email_address_invalid' }, 'endereço de e-mail'],
    [{ code: 'user_already_exists' }, 'já tem uma conta'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'Muitas tentativas'],
    [{ code: 'email_address_not_authorized' }, 'restringe o envio'],
    [{ code: 'signup_disabled' }, 'cadastro por e-mail está desativado'],
    [{ code: 'captcha_failed' }, 'antirrobô'],
    [{ code: 'unexpected_failure', message: 'Database error saving new user' }, 'falhou ao salvar'],
    [{ message: 'Error sending confirmation email' }, 'falhou ao enviar'],
    [{ message: 'Invalid API key', status: 401 }, 'chave pública'],
    [new TypeError('Failed to fetch'), 'conectar ao serviço'],
  ])(
    'explains the actual signup cause without guessing username duplication: %o',
    (error, expected) => {
      expect(authErrorMessage(error, 'signup')).toContain(expected);
      expect(authErrorMessage(error, 'signup')).not.toContain('O nome pode já estar em uso');
    },
  );
  it('keeps codes copyable without exposing raw server details or injecting markup', () => {
    const output = authErrorMessage(
      {
        code: '<script>token</script>',
        status: 503,
        message: 'secret smtp password: DO_NOT_RENDER',
      },
      'signup',
    );
    expect(output).toContain('http_503');
    expect(output).not.toContain('DO_NOT_RENDER');
    expect(output).not.toContain('<script>');
  });
  it('distinguishes password failure and unconfirmed email at login', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' }, 'login')).toContain(
      'senha incorretos',
    );
    expect(authErrorMessage({ code: 'email_not_confirmed' }, 'login')).toContain(
      'confirmação de e-mail',
    );
  });
});
