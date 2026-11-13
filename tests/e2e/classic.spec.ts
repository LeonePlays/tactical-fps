import { syncCapturedMouse } from './actions';
import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';
test('classic HUD has a radar, finite reserves, purchase feedback, deploy delay and wall impacts', async ({
  page,
}) => {
  test.setTimeout(90000);
  await accountFixture(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#reserve-count')).toHaveText('90');
  await expect(page.locator('#money-count')).toHaveText('$16000');
  await expect(page.locator('#radar')).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.locator('#buy-panel')).toBeVisible();
  await page.keyboard.press('Digit5');
  await expect(page.locator('#money-count')).toHaveText('$15350');
  await expect(page.locator('#armor-count')).toHaveText('100');
  await page.keyboard.press('b');
  await expect(page.locator('#buy-panel')).toBeHidden();
  await expect(page.locator('#hud')).toHaveAttribute('data-grounded', 'true');
  await page.mouse.down();
  await page.mouse.up();
  // Hosted runners may hold the automatic trigger for multiple simulation frames.
  const remaining = Number(await page.locator('#ammo-count').textContent());
  expect(remaining).toBeGreaterThanOrEqual(0);
  expect(remaining).toBeLessThan(30);
  await page.keyboard.press('r');
  await expect(page.locator('#reload-label')).toHaveText('RECARREGANDO…');
  await expect(page.locator('#ammo-count')).toHaveText('30');
  await expect(page.locator('#reserve-count')).toHaveText(String(60 + remaining));
  await page.keyboard.press('2');
  await expect(page.locator('#hud')).toHaveAttribute('data-deploying', 'true');
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#ammo-count')).toHaveText('12');
  await expect(page.locator('#hud')).toHaveAttribute('data-deploying', 'false');
  // Look down at the industrial floor using native pointer-lock input.
  await page.mouse.move(720, 850, { steps: 6 });
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#ammo-count')).toHaveText('11');
  await expect
    .poll(async () => Number(await page.locator('#hud').getAttribute('data-impacts')))
    .toBeGreaterThan(0);
  await page.screenshot({ path: '/tmp/tactical-classic-hud.png' });
});

test('a locally simulated arena authorizes purchases and equips the bought carbine', async ({
  page,
}) => {
  await accountFixture(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('#match-mode').selectOption('defuse');
  await page.locator('#room-bots').selectOption('0');
  await page.locator('#local-bots').click();
  await expect(page.locator('#hud')).toHaveAttribute('data-room', 'LOCAL');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#ammo-count')).toHaveText('12');
  await expect(page.locator('#money-count')).toHaveText('$4000');
  await page.keyboard.press('b');
  await page.keyboard.press('1');
  await expect(page.locator('#buy-message')).toHaveText('Compra efetuada.');
  await expect(page.locator('#money-count')).toHaveText('$1300');
  await page.keyboard.press('b');
  await page.keyboard.press('1');
  await expect(page.locator('.hud-ammo .label')).toHaveText('CARABINA T-04');
  await expect(page.locator('#reserve-count')).toHaveText('90');
});
