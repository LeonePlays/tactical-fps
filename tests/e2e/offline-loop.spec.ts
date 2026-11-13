import { syncCapturedMouse } from './actions';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../src/core/settings';

async function enter(page: Page) {
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game-canvas');
}

for (const mode of ['deathmatch', 'team-deathmatch'] as const) {
  test(`a fresh visitor completes a real ${mode} match, restarts and retains preferences`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*.supabase.co/**', (route) => route.abort());
    await page.addInitScript(
      (settings) => localStorage.setItem('tactical-fps.settings.v1', JSON.stringify(settings)),
      {
        ...DEFAULT_SETTINGS,
        quality: 'low',
        shadows: 'off',
        renderScale: 0.6,
      },
    );
    await page.goto('/');
    await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
    await expect(page.locator('.account-overlay')).toBeHidden();
    await page.locator('[data-action="profile"]').first().click();
    await page.locator('#player-name').fill('QA Visitor');
    await page.getByRole('button', { name: 'SALVAR PERFIL', exact: true }).click();
    await expect(page.locator('#profile-message')).toContainText('salvo');
    await page.getByRole('button', { name: 'Fechar perfil', exact: true }).click();
    const map = mode === 'deathmatch' ? 'old-quarter' : 'industrial';
    await page.locator('#match-map').selectOption(map);
    await page.locator('#match-mode').selectOption(mode);
    await page.locator('#match-difficulty').selectOption('hard');
    if (mode === 'team-deathmatch') await page.locator('#match-team').selectOption('bravo');
    await page.locator('#match-time').fill('30');
    await page.locator('#match-score').fill('100');
    await page.locator('#match-summary').click();
    await page.locator('#local-bots').click();
    await expect(page.locator('#hud')).toHaveAttribute('data-actors', '4');
    await enter(page);
    await expect(page.locator('#hud')).toHaveAttribute('data-map', map);
    await expect(page.locator('#hud')).toHaveAttribute('data-shadows', 'false');
    expect(Number(await page.locator('#hud').getAttribute('data-render-scale'))).toBeCloseTo(
      0.42,
      2,
    );
    await page.keyboard.down('Tab');
    await expect(page.locator('#scoreboard')).toBeVisible();
    await expect(page.locator('#scoreboard-body tr')).toHaveCount(4);
    await expect(page.locator('.scoreboard-self')).toContainText('QA Visitor');
    if (mode === 'team-deathmatch')
      await expect(page.locator('.scoreboard-self')).toContainText('BRAVO');
    await page.keyboard.up('Tab');
    await expect(page.locator('#scoreboard')).toBeHidden();
    await page.mouse.down();
    await page.mouse.up();
    await expect
      .poll(async () => Number(await page.locator('#ammo-count').textContent()))
      .toBeLessThan(30);
    // No state fixture or accelerated clock: the real offline simulation reaches its timer.
    await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 65000 });
    await expect(page.locator('#result-title')).toHaveText(/VENCEU|EMPATE/);
    await expect(page.locator('#result-score')).toContainText('QA Visitor');
    await expect(page.locator('#result-score')).toContainText('BOT');
    await expect(page.locator('#pause-overlay')).toBeHidden();
    await page.locator('#rematch').click();
    await expect(page.locator('#result-overlay')).toBeHidden();
    await enter(page);
    await expect(page.locator('#ammo-count')).toHaveText('30');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'VOLTAR AO MENU', exact: true }).click();
    await expect(page.locator('#hud')).not.toHaveAttribute('data-room');
    await page.reload();
    await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
    await expect(page.locator('#match-map')).toHaveValue(map);
    await expect(page.locator('#match-mode')).toHaveValue(mode);
    await expect(page.locator('#match-difficulty')).toHaveValue('hard');
    await expect(page.locator('#match-time')).toHaveValue('30');
    await page.locator('[data-action="profile"]').first().click();
    await expect(page.locator('#player-name')).toHaveValue('QA Visitor');
    await expect(page.locator('#profile-result')).toContainText('QA Visitor');
    expect(errors).toEqual([]);
  });
}
