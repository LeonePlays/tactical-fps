import { expect, test, type Page } from '@playwright/test';

const hud = (page: Page) => page.locator('#hud');
const position = async (page: Page) =>
  JSON.parse((await hud(page).getAttribute('data-position'))!) as { x: number; z: number };

async function enter(page: Page) {
  await page.locator('#start-button').click();
  await expect(hud(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game-canvas');
}

async function leave(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'VOLTAR AO MENU', exact: true }).click();
  await expect(page.locator('#menu-shell')).toBeVisible();
  await expect(hud(page)).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  // A fresh browser context has no seeded session or mocked authentication.
  // Training and local bots must also work when the account service is unavailable.
  await page.route('**/*.supabase.co/**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('.account-overlay')).toBeHidden();
  await expect(page.locator('#account-status')).toContainText('VISITANTE');
});

test('a new visitor can move, use all equipment, return and retain browser settings', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page).toHaveTitle('TACTICAL FPS');
  await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();
  await page.getByRole('slider', { name: 'Campo de visão', exact: true }).fill('100');
  await page.getByRole('combobox', { name: 'Qualidade gráfica' }).selectOption('low');
  await page.getByRole('switch', { name: 'Mira dinâmica' }).uncheck();
  await page.getByRole('button', { name: 'SALVAR AJUSTES' }).click();
  await expect(page.locator('#settings-overlay')).toBeHidden();

  await enter(page);
  const before = await position(page);
  const started = Number(await hud(page).getAttribute('data-elapsed'));
  await page.keyboard.down('w');
  await expect
    .poll(async () => Number(await hud(page).getAttribute('data-elapsed')))
    .toBeGreaterThan(started + 0.4);
  await page.keyboard.up('w');
  expect((await position(page)).z).toBeGreaterThan(before.z + 0.5);
  await page.keyboard.press('Control');
  await expect(page.locator('#stance-label')).toHaveText('AGACHADO');
  await page.keyboard.press('z');
  await expect(page.locator('#stance-label')).toHaveText('DEITADO');
  await page.keyboard.press('z');
  await expect(page.locator('#stance-label')).toHaveText('EM PÉ');

  for (const [key, label] of [
    ['2', 'PISTOLA P-09'],
    ['1', 'CARABINA T-04'],
    ['3', 'FACA DE COMBATE'],
    ['4', 'GRANADA HE'],
  ]) {
    await page.keyboard.press(key!);
    await expect(page.locator('.hud-ammo .label')).toHaveText(label!);
    await expect(hud(page)).toHaveAttribute('data-weapon-visible', 'true');
  }
  await expect(hud(page)).toHaveAttribute('data-deploying', 'false');
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud(page)).toHaveAttribute('data-grenades', '0');
  await page.keyboard.press('1');
  await expect(hud(page)).toHaveAttribute('data-deploying', 'false');
  await page.mouse.down();
  await page.mouse.up();
  await expect
    .poll(async () => Number(await page.locator('#ammo-count').textContent()))
    .toBeLessThan(30);
  await leave(page);

  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('.account-overlay')).toBeHidden();
  await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();
  await expect(page.getByRole('slider', { name: 'Campo de visão', exact: true })).toHaveValue(
    '100',
  );
  await expect(page.getByRole('combobox', { name: 'Qualidade gráfica' })).toHaveValue('low');
  await expect(page.getByRole('switch', { name: 'Mira dinâmica' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Fechar configurações' }).click();
  await enter(page);
  await expect(hud(page)).toHaveAttribute('data-tool', 'firearm');
  await expect(page.locator('#error-banner')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a visitor can create both local match modes with three bots and leave each arena', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('#room-bots')).toHaveValue('3');
  await expect(page.locator('#match-mode')).toHaveValue('deathmatch');

  for (const [mode, objective] of [
    ['deathmatch', 'COMBATE LIVRE'],
    ['defuse', 'RODADA 1'],
  ]) {
    await page.locator('#match-mode').selectOption(mode!);
    await page.locator('#local-bots').click();
    await expect(hud(page)).toHaveAttribute('data-room', 'LOCAL');
    await expect(hud(page)).toHaveAttribute('data-actors', '4');
    await expect(page.locator('#start-button')).toBeEnabled();
    await enter(page);
    await expect(page.locator('#objective-banner')).toBeVisible();
    await expect(page.locator('#objective-banner')).toContainText(objective!);
    await expect(hud(page)).toHaveAttribute('data-weapon-visible', 'true');
    await expect(page.locator('.account-overlay')).toBeHidden();
    await leave(page);
    await page.locator('.local-lobby summary').click();
    await page.locator('#disconnect-room').click();
    await expect(hud(page)).not.toHaveAttribute('data-room');
    await expect(page.locator('#start-button')).toBeEnabled();
    // The multiplayer disclosure stays open after disconnecting.
    await page.locator('.local-lobby summary').click();
  }
  await enter(page);
  await expect(hud(page)).not.toHaveAttribute('data-room');
  await expect(page.locator('#error-banner')).toBeHidden();
  expect(errors).toEqual([]);
});
