import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';
test('two browsers share an arena with bots and can return to individual training', async ({
  browser,
  page,
}) => {
  test.setTimeout(90000);
  await accountFixture(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('.local-lobby summary').click();
  await page.locator('#room-server').fill('ws://127.0.0.1:3002');
  await page.locator('#create-room').click();
  await expect(page.locator('#room-message')).toContainText('SALA');
  const room = (await page.locator('#hud').getAttribute('data-room'))!;
  await expect(page.locator('#hud')).toHaveAttribute('data-actors', '3');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const other = await context.newPage();
    await accountFixture(other, true, 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
    await other.goto('/');
    await expect(other.locator('#start-button')).toBeEnabled({ timeout: 40000 });
    await other.locator('.local-lobby summary').click();
    await other.locator('#room-server').fill('ws://127.0.0.1:3002');
    await other.locator('#room-code').fill(room);
    await other.locator('#join-room').click();
    await expect(other.locator('#hud')).toHaveAttribute('data-room', room);
    await expect(page.locator('#hud')).toHaveAttribute('data-actors', '4');
    await other.locator('#start-button').click();
    await expect(other.locator('#hud')).toBeVisible();
    await expect(other.locator('.hud-top-left strong')).toContainText(room);
    await other.screenshot({ path: '/tmp/tactical-arena.png' });
    await other.keyboard.press('Escape');
    await other.getByRole('button', { name: 'VOLTAR AO MENU', exact: true }).click();
    await other.locator('#disconnect-room').click();
    await expect(other.locator('#start-label')).toHaveText('INICIAR TREINO');
    await expect(page.locator('#hud')).toHaveAttribute('data-actors', '3');
  } finally {
    await context.close();
  }
  await page.locator('#disconnect-room').click();
});
