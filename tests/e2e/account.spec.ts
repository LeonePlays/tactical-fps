import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';
test('login gates training and logout removes access', async ({ page }) => {
  await accountFixture(page, false);
  await page.goto('/');
  await expect(page.locator('.account-overlay')).toBeVisible();
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('#start-button').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('#hud')).toBeHidden();
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'ENTRAR', exact: true }).click();
  await expect(page.locator('.account-overlay')).toBeHidden();
  await page.getByRole('button', { name: 'SAIR DA CONTA' }).click();
  await expect(page.locator('.account-overlay')).toBeVisible();
});
test('secondary weapon is semi automatic and magazines remain separate', async ({ page }) => {
  await accountFixture(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('#start-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.locator('.hud-ammo .label')).toHaveText('PISTOLA P-09');
  await page.waitForTimeout(300);
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
