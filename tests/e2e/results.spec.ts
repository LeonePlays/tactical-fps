import { expect, test } from '@playwright/test';
import { Match } from '../../src/game/match';
import { PROTOCOL_VERSION } from '../../src/network/protocol';
import { accountFixture } from './account-fixture';

test('a completed server match shows the result and returns to playable training', async ({
  page,
}) => {
  await accountFixture(page);
  // Deterministic transport fixture exercises the production result screen without a 3-minute wait.
  const match = new Match();
  const self = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  match.add(self);
  match.add('bot-result', true);
  await page.routeWebSocket('ws://match.test/', (socket) => {
    const send = () =>
      socket.send(
        JSON.stringify({
          protocol: PROTOCOL_VERSION,
          type: 'state',
          room: 'ABC123',
          self,
          actors: match.snapshot(),
          ...match.state(),
        }),
      );
    socket.onMessage((raw) => {
      const data = JSON.parse(String(raw));
      if (data.type === 'join') send();
      else if (data.type === 'input' && data.input.fireSequence > 0) {
        match.actors.get(self)!.kills = 10;
        for (let i = 0; i < 105; i++) match.step(0.05);
        send();
      }
    });
  });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await page.locator('.local-lobby summary').click();
  await page.locator('#room-server').fill('ws://match.test/');
  await page.locator('#create-room').click();
  await expect(page.locator('#hud')).toHaveAttribute('data-room', 'ABC123');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#result-overlay')).toBeVisible();
  await expect(page.locator('#result-score')).toContainText('VOCÊ: 10 eliminações');
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('#menu-shell')).toBeHidden();
  await expect(page.locator('#rematch')).toBeHidden();
  await page.locator('#result-home').click();
  await expect(page.locator('#result-overlay')).toBeHidden();
  await expect(page.locator('#start-label')).toHaveText('INICIAR TREINO');
  await page.locator('#start-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#hud')).not.toHaveAttribute('data-room');
});
