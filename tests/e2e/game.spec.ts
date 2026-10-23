import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40_000 });
});

const position = (page: Page) =>
  page
    .locator('#hud')
    .getAttribute('data-position')
    .then((value) => JSON.parse(value!) as { x: number; y: number; z: number });
async function hold(page: Page, key: string, milliseconds = 650) {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
}
async function start(page: Page) {
  await page.locator('#start-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game-canvas');
}

test('settings persist, controls are documented, and desktop identity is correct', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page).toHaveTitle('TACTICAL FPS');
  await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();
  await page.getByRole('slider', { name: 'Campo de visão', exact: true }).fill('100');
  await page.getByRole('combobox', { name: 'Qualidade gráfica' }).selectOption('low');
  await page.getByRole('switch', { name: 'Mostrar FPS' }).check();
  await page.getByRole('button', { name: 'SALVAR AJUSTES' }).click();
  await expect(page.locator('#settings-overlay')).toBeHidden();
  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40_000 });
  await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();
  await expect(page.getByRole('slider', { name: 'Campo de visão', exact: true })).toHaveValue(
    '100',
  );
  await expect(page.getByRole('combobox', { name: 'Qualidade gráfica' })).toHaveValue('low');
  await page.getByRole('button', { name: 'Fechar configurações' }).click();
  await page.getByRole('button', { name: 'Controles', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'CONTROLES', exact: true })).toBeVisible();
  await expect(page.locator('.controls-grid')).toContainText('DEITAR / LEVANTAR');
  await page.keyboard.press('Escape');
  await expect(page.locator('#controls-overlay')).toBeHidden();
  expect(errors).toEqual([]);
});

test('WebGL scene is playable: pointer lock, targets, WASD, sprint, stances, jump, pause and reset', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  // The centre lane has a target in front of the spawn. Shoot using native input.
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#ammo-count')).toHaveText('29');
  await expect(page.locator('#hit-count')).toHaveText('01');
  await page.keyboard.press('r');
  await expect(page.locator('#reload-label')).toHaveText('RECARREGANDO…');
  await expect(page.locator('#ammo-count')).toHaveText('30');
  const before = await position(page);
  await hold(page, 'w');
  const walked = await position(page);
  expect(walked.z).toBeGreaterThan(before.z + 0.6);
  await page.keyboard.down('Shift');
  await hold(page, 'w');
  await page.keyboard.up('Shift');
  const sprinted = await position(page);
  expect(sprinted.z - walked.z).toBeGreaterThan(walked.z - before.z);
  await hold(page, 'd', 450);
  expect((await position(page)).x).toBeGreaterThan(sprinted.x + 0.4);
  await page.keyboard.press('Control');
  await expect(page.locator('#stance-label')).toHaveText('AGACHADO');
  await page.keyboard.press('z');
  await expect(page.locator('#stance-label')).toHaveText('DEITADO');
  await page.keyboard.press('z');
  await expect(page.locator('#stance-label')).toHaveText('EM PÉ');
  await page.keyboard.down('Space');
  await expect.poll(async () => (await position(page)).y).toBeGreaterThan(0.1);
  await page.keyboard.up('Space');
  await expect(page.locator('#hud')).toHaveAttribute('data-grounded', 'true');
  const originalBearing = await page.locator('#bearing').textContent();
  await page.mouse.move(900, 450);
  await expect(page.locator('#bearing')).not.toHaveText(originalBearing!);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  const pausedAt = await position(page);
  await hold(page, 'w', 350);
  expect(await position(page)).toEqual(pausedAt);
  await page.getByRole('button', { name: 'CONTINUAR', exact: true }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'REINICIAR TREINO' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  expect((await position(page)).z).toBeCloseTo(-22, 1);
  await expect(page.locator('#hit-count')).toHaveText('00');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'VOLTAR AO MENU' }).click();
  await expect(page.locator('#menu-shell')).toBeVisible();
  expect(errors).toEqual([]);
});

test('map geometry blocks forward movement at the south gate', async ({ page }) => {
  await start(page);
  await page.keyboard.down('s');
  await expect.poll(async () => (await position(page)).z, { timeout: 25_000 }).toBeLessThan(-29.8);
  await page.keyboard.up('s');
  const stopped = await position(page);
  await hold(page, 's', 700);
  const blocked = await position(page);
  expect(blocked.z).toBeCloseTo(stopped.z, 1);
  expect(blocked.z).toBeGreaterThan(-30.1);
  expect(blocked.z).toBeLessThan(-29);
});
