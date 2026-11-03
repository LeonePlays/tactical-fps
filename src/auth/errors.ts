export type AuthOperation = 'login' | 'signup' | 'reset' | 'update';
/** Translate only known, public error codes. Never render a raw response/token/SMTP detail. */
export function authErrorMessage(error: unknown, operation: AuthOperation): string {
  const details =
    error && typeof error === 'object'
      ? (error as { code?: unknown; status?: unknown; message?: unknown; name?: unknown })
      : {};
  const rawCode = typeof details.code === 'string' ? details.code : '';
  const code = /^[a-z0-9_]{1,64}$/.test(rawCode) ? rawCode : '';
  const message = typeof details.message === 'string' ? details.message.toLowerCase() : '';
  const status = typeof details.status === 'number' ? details.status : 0;
  let reason: string;
  let diagnostic = code || (status ? `http_${status}` : 'unknown_error');
  if (code === 'invalid_credentials') reason = 'Usuário/e-mail ou senha incorretos.';
  else if (code === 'user_already_exists' || code === 'email_exists')
    reason = 'Este e-mail já tem uma conta. Use Logar ou recupere sua senha.';
  else if (code === 'weak_password')
    reason =
      'Use uma senha mais forte, com pelo menos 8 caracteres. Combine letras, números e símbolos.';
  else if (
    code === 'email_address_invalid' ||
    (code === 'validation_failed' && message.includes('email'))
  )
    reason = 'O serviço não aceita esse endereço de e-mail. Confira o endereço informado.';
  else if (code === 'email_not_confirmed')
    reason =
      'A confirmação de e-mail continua ativa neste projeto. O administrador precisa desativar essa exigência para permitir o login sem confirmação.';
  else if (code === 'email_address_not_authorized')
    reason =
      'O projeto ainda restringe o envio de e-mails. O administrador precisa desativar a confirmação de e-mail ou configurar o envio.';
  else if (code === 'over_email_send_rate_limit')
    reason =
      'O limite de envio de e-mails foi atingido. Aguarde alguns minutos; o administrador precisa revisar a confirmação de e-mail.';
  else if (
    code === 'over_request_rate_limit' ||
    code === 'over_sms_send_rate_limit' ||
    status === 429
  )
    reason = 'Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.';
  else if (code === 'signup_disabled' || code === 'email_provider_disabled')
    reason =
      'O cadastro por e-mail está desativado no serviço. O administrador precisa habilitá-lo.';
  else if (code === 'captcha_failed' || code === 'captcha_required')
    reason =
      'O serviço exige uma verificação antirrobô que ainda não está configurada no jogo. O administrador precisa ajustar essa configuração.';
  else if (
    message.includes('invalid api key') ||
    message.includes('invalid apikey') ||
    message.includes('no api key')
  ) {
    reason =
      'A chave pública do serviço de contas está inválida. O administrador precisa atualizar a configuração do jogo.';
    diagnostic = 'invalid_api_key';
  } else if (message.includes('database error') || message.includes('error saving new user')) {
    reason =
      'O serviço falhou ao salvar a conta no banco. O administrador precisa verificar o cadastro nos Auth Logs do Supabase.';
    diagnostic = code || 'signup_database_error';
  } else if (
    message.includes('sending confirmation email') ||
    message.includes('sending recovery email')
  ) {
    reason =
      'O serviço falhou ao enviar o e-mail. O administrador precisa revisar o envio e desativar a confirmação obrigatória para novos cadastros.';
    diagnostic = code || 'email_delivery_error';
  } else if (
    details.name === 'AuthRetryableFetchError' ||
    details.name === 'TypeError' ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed')
  ) {
    reason = 'Não foi possível conectar ao serviço de contas. Confira a conexão e tente novamente.';
    diagnostic = 'network_error';
  } else if (message === 'username_login') {
    reason = 'Não foi possível entrar por usuário. Confira os dados ou tente seu e-mail.';
    diagnostic = 'username_login_unavailable';
  } else if (status >= 500)
    reason = 'O serviço de contas está indisponível. Tente novamente mais tarde.';
  else
    reason =
      operation === 'signup'
        ? 'O serviço recusou o cadastro. Confira os dados informados ou envie o código abaixo ao administrador.'
        : 'Não foi possível concluir o acesso. Confira os dados ou envie o código abaixo ao administrador.';
  return `${reason} Código: ${diagnostic}.`;
}
