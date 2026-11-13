import { expect, test } from '@playwright/test';
import { accountFixture } from './account-fixture';
import { openServers, syncCapturedMouse } from './actions';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/core/settings';

test('online chat hotkeys send real messages and host H changes the actual room map and bots', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(
    ({ key, settings }) => localStorage.setItem(key, JSON.stringify(settings)),
    {
      key: SETTINGS_KEY,
      settings: { ...DEFAULT_SETTINGS, quality: 'low', shadows: 'off', renderScale: 0.5 },
    },
  );
  await accountFixture(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('#room-bots').selectOption('0');
  await page.locator('#match-mode').selectOption('team-deathmatch');
  await openServers(page);
  await page.locator('#room-server').fill('ws://127.0.0.1:3002');
  await page.locator('#create-room').click();
  await expect(page.locator('#room-message')).toContainText('SALA');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);

  await page.keyboard.press('KeyT');
  await expect(page.locator('#online-chat-overlay')).toBeVisible();
  await expect(page.locator('#online-chat-input')).toBeFocused();
  await page.locator('#online-chat-input').fill('<b>Mensagem real</b>');
  await page.keyboard.press('Enter');
  await expect(page.locator('#online-chat-overlay')).toBeHidden();
  await syncCapturedMouse(page);
  await expect(page.locator('#online-chat-log')).toContainText('[SALA]');
  await expect(page.locator('#online-chat-log')).toContainText('<b>Mensagem real</b>');
  await expect(page.locator('#online-chat-log b')).toHaveCount(0);

  await page.keyboard.press('KeyY');
  await expect(page.locator('#online-chat-overlay')).toBeVisible();
  await expect(page.locator('#online-chat-title')).toHaveText('CHAT DA EQUIPE');
  await page.locator('#online-chat-input').fill('Equipe, pronta!');
  // The server enforces its real chat cooldown. Wait on wall time before the next send.
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await syncCapturedMouse(page);
  await expect(page.locator('#online-chat-log')).toContainText('[EQUIPE]');

  await page.keyboard.press('KeyH');
  await expect(page.locator('#online-host-overlay')).toBeVisible();
  await page.locator('#online-host-form [name="map"]').selectOption('old-quarter');
  await page.locator('#online-host-form [name="difficulty"]').selectOption('hard');
  await page.locator('#online-host-form [name="bots"]').fill('2');
  await page.getByRole('button', { name: 'APLICAR E REINICIAR', exact: true }).click();
  await expect(page.locator('#online-host-overlay')).toBeHidden();
  await expect(page.locator('#hud')).toHaveAttribute('data-map', 'old-quarter', { timeout: 30000 });
  await expect(page.locator('#hud')).toHaveAttribute('data-actors', '3');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);
  await expect(page.locator('.hud-top-left strong')).toHaveText('Bairro Antigo');
  await page.keyboard.press('KeyH');
  await expect(page.locator('#online-host-form [name="map"]')).toHaveValue('old-quarter');
  await expect(page.locator('#online-host-form [name="difficulty"]')).toHaveValue('hard');
  await page.keyboard.press('Escape');
  await syncCapturedMouse(page);
});
