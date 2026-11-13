import { syncCapturedMouse } from './actions';
import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';
test('optional login blocks input while open and logout returns to guest', async ({ page }) => {
  await accountFixture(page, false);
  await page.goto('/');
  await expect(page.locator('.account-overlay')).toBeHidden();
  await page.locator('#account-open').click();
  await expect(page.locator('.account-overlay')).toBeVisible();
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('#start-button').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('#hud')).toBeHidden();
  await page.getByLabel('Usuário / e-mail', { exact: true }).fill('test@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'ENTRAR', exact: true }).click();
  await expect(page.locator('.account-overlay')).toBeHidden();
  await page.getByRole('button', { name: 'SAIR DA CONTA' }).click();
  await expect(page.locator('.account-overlay')).toBeHidden();
  await expect(page.locator('#account-status')).toContainText('VISITANTE');
});
test('secondary weapon is semi automatic and magazines remain separate', async ({ page }) => {
  await accountFixture(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.locator('.hud-ammo .label')).toHaveText('PISTOLA P-09');
  await expect(page.locator('#hud')).toHaveAttribute('data-deploying', 'false');
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('#ammo-count')).toHaveText('11');
  await page.keyboard.press('1');
  await expect(page.locator('#ammo-count')).toHaveText('30');
  await page.keyboard.press('2');
  await expect(page.locator('#ammo-count')).toHaveText('11');
});

test('recovery link asks for a new password', async ({ page }) => {
  await accountFixture(page, false);
  await page.goto(
    '/#access_token=test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery',
  );
  await expect(page.getByRole('button', { name: 'SALVAR NOVA SENHA' })).toBeVisible();
  await page.getByLabel('Senha', { exact: true }).fill('new-test-password');
  const update = page.waitForRequest(
    (request) => request.url().endsWith('/user') && request.method() === 'PUT',
  );
  await page.getByRole('button', { name: 'SALVAR NOVA SENHA' }).click();
  expect((await update).postDataJSON().password).toBe('new-test-password');
  await expect(page.locator('.account-overlay')).toBeHidden();
});

test('signup has username rules, returns to login, and a later visit restores the session', async ({
  page,
}) => {
  await accountFixture(page, false);
  await page.goto('/');
  await page.locator('#account-open').click();
  await page.getByRole('button', { name: 'CADASTRAR', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.com');
  await page.getByLabel('Nome de usuário', { exact: true }).fill('test_player');
  await page.getByLabel('Senha', { exact: true }).fill('test-password');
  const signup = page.waitForRequest('**/signup*');
  await page.locator('#account-form button[type=submit]').click();
  expect((await signup).postDataJSON().data.username).toBe('test_player');
  await expect(page.locator('#account-title')).toHaveText('LOGAR');
  await expect(page.locator('#account-message')).toContainText('Conta criada');
  await expect(page.locator('.account-overlay')).toBeVisible();
  await page.getByLabel('Usuário / e-mail', { exact: true }).fill('test@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'ENTRAR', exact: true }).click();
  await expect(page.locator('.account-overlay')).toBeHidden();
  await page.reload();
  await expect(page.locator('.account-overlay')).toBeHidden();
});

for (const failure of [
  {
    code: 'weak_password',
    status: 422,
    message: 'Password should contain more characters',
    visible: 'senha mais forte',
  },
  {
    code: 'over_request_rate_limit',
    status: 429,
    message: 'Too many requests',
    visible: 'Muitas tentativas',
  },
  {
    code: 'unexpected_failure',
    status: 500,
    message: 'Error sending confirmation email',
    visible: 'falhou ao enviar',
  },
]) {
  test(`signup explains ${failure.code} and keeps the form available`, async ({ page }) => {
    await accountFixture(page, false);
    await page.route('**/auth/v1/signup*', (route) =>
      route.fulfill({
        status: failure.status,
        headers: {
          'x-supabase-api-version': '2024-01-01',
          'access-control-expose-headers': 'x-supabase-api-version',
        },
        json: { code: failure.code, error_code: failure.code, msg: failure.message },
      }),
    );
    await page.goto('/');
    await page.locator('#account-open').click();
    await page.getByRole('button', { name: 'CADASTRAR', exact: true }).click();
    await page.getByLabel('E-mail', { exact: true }).fill('test@example.com');
    await page.getByLabel('Nome de usuário', { exact: true }).fill('test_player');
    await page.getByLabel('Senha', { exact: true }).fill('test-password');
    await page.locator('#account-form button[type=submit]').click();
    await expect(page.locator('#account-message')).toContainText(failure.visible);
    await expect(page.locator('#account-message')).toContainText(
      `Código: ${failure.status === 500 ? 'email_delivery_error' : failure.code}`,
    );
    await expect(page.locator('#account-title')).toHaveText('CADASTRAR');
    await expect(page.locator('#account-form button[type=submit]')).toBeEnabled();
    await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('test@example.com');
  });
}

test('successful signup is not reported as failed when signing out the automatic session fails', async ({
  page,
}) => {
  await accountFixture(page, false);
  await page.route('**/auth/v1/logout*', (route) =>
    route.fulfill({
      status: 400,
      json: { code: 'unexpected_failure', msg: 'Test logout failure' },
    }),
  );
  await page.goto('/');
  await page.locator('#account-open').click();
  await page.getByRole('button', { name: 'CADASTRAR', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.com');
  await page.getByLabel('Nome de usuário', { exact: true }).fill('test_player');
  await page.getByLabel('Senha', { exact: true }).fill('test-password');
  await page.locator('#account-form button[type=submit]').click();
  await expect(page.locator('#account-message')).toContainText('Sua conta foi criada');
  await expect(page.locator('#account-title')).toHaveText('LOGAR');
  await expect(page.getByLabel('Usuário / e-mail', { exact: true })).toHaveValue(
    'test@example.com',
  );
});
