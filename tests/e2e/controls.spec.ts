import { expect, test } from '@playwright/test';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/core/settings';
import { syncCapturedMouse } from './actions';

test('desktop controls use C crouch, Ctrl run, F flashlight, right-button aim and equipment scroll', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ key, settings }) => localStorage.setItem(key, JSON.stringify(settings)),
    {
      key: SETTINGS_KEY,
      settings: { ...DEFAULT_SETTINGS, quality: 'low', shadows: 'off', renderScale: 0.5 },
    },
  );
  await page.route('**/*.supabase.co/**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);
  const hud = page.locator('#hud');

  await page.keyboard.press('c');
  await expect(page.locator('#stance-label')).toHaveText('AGACHADO');
  await page.keyboard.press('c');
  await expect(page.locator('#stance-label')).toHaveText('EM PÉ');
  await page.keyboard.press('z');
  await expect(page.locator('#stance-label')).toHaveText('DEITADO');
  await page.keyboard.press('z');
  await expect(page.locator('#stance-label')).toHaveText('EM PÉ');

  await page.keyboard.down('Control');
  await page.keyboard.down('w');
  await expect(hud).toHaveAttribute('data-sprinting', 'true');
  await expect(page.locator('#stance-label')).toHaveText('EM PÉ');
  await page.keyboard.down('Shift');
  await expect(hud).toHaveAttribute('data-sprinting', 'false');
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');

  await expect(hud).toHaveAttribute('data-flashlight', 'false');
  await page.keyboard.press('f');
  await expect(hud).toHaveAttribute('data-flashlight', 'true');
  await page.keyboard.press('f');
  await expect(hud).toHaveAttribute('data-flashlight', 'false');

  const normalFov = Number(await hud.getAttribute('data-fov'));
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveAttribute('data-aiming', 'true');
  await expect.poll(async () => Number(await hud.getAttribute('data-fov'))).toBeLessThan(normalFov);
  await page.mouse.up({ button: 'right' });
  await expect(hud).toHaveAttribute('data-aiming', 'false');

  await page.keyboard.press('1');
  await expect(hud).toHaveAttribute('data-equipment-slot', '1');
  await page.mouse.wheel(0, 120);
  await expect(hud).toHaveAttribute('data-equipment-slot', '2');
  await page.mouse.wheel(0, -120);
  await expect(hud).toHaveAttribute('data-equipment-slot', '1');
  await expect(hud).toHaveAttribute('data-deploying', 'false');
  await page.mouse.down();
  await page.mouse.up();
  await expect
    .poll(async () => Number(await page.locator('#ammo-count').textContent()))
    .toBeLessThan(30);
  const ammunitionBeforeDrop = await page.locator('#ammo-count').textContent();
  const reserveBeforeDrop = await page.locator('#reserve-count').textContent();
  await page.keyboard.press('q');
  await expect(hud).toHaveAttribute('data-tool', 'knife');
  await page.keyboard.press('1');
  await expect(hud).toHaveAttribute('data-tool', 'knife');
  await page.keyboard.press('e');
  await page.keyboard.press('1');
  await expect(hud).toHaveAttribute('data-equipment-slot', '1');
  await expect(hud).toHaveAttribute('data-equipped-owned', 'true');
  await expect(page.locator('#ammo-count')).toHaveText(ammunitionBeforeDrop!);
  await expect(page.locator('#reserve-count')).toHaveText(reserveBeforeDrop!);

  // B+6 purchases the second HE; selecting and throwing slot 5 must preserve slot 4.
  await page.keyboard.press('b');
  await expect(page.locator('#buy-panel')).toBeVisible();
  await page.keyboard.press('6');
  await expect(hud).toHaveAttribute('data-grenades', '2');
  await page.keyboard.press('b');
  await page.keyboard.press('5');
  await expect(hud).toHaveAttribute('data-equipment-slot', '5');
  await expect(hud).toHaveAttribute('data-equipped-owned', 'true');
  await expect(hud).toHaveAttribute('data-deploying', 'false');
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-grenades', '1');
  await page.keyboard.press('4');
  await expect(hud).toHaveAttribute('data-equipment-slot', '4');
  await expect(hud).toHaveAttribute('data-equipped-owned', 'true');
  await page.keyboard.press('3');
  await expect(hud).toHaveAttribute('data-tool', 'knife');
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveAttribute('data-aiming', 'false');
  await page.mouse.up({ button: 'right' });

  // Online-only keys must not create pretend chat or host controls in training.
  await page.keyboard.press('t');
  await page.keyboard.press('y');
  await page.keyboard.press('h');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game-canvas');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect(hud).toHaveAttribute('data-aiming', 'false');
  expect(errors).toEqual([]);
});

test('slot 6 equips the carried bomb and Q/E drop and recover it during an offline objective match', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ key, settings }) => localStorage.setItem(key, JSON.stringify(settings)),
    {
      key: SETTINGS_KEY,
      settings: { ...DEFAULT_SETTINGS, quality: 'low', shadows: 'off', renderScale: 0.5 },
    },
  );
  await page.route('**/*.supabase.co/**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#match-map').selectOption('industrial');
  await page.locator('#match-mode').selectOption('defuse');
  await page.locator('#room-bots').selectOption('0');
  await page.locator('#match-team').selectOption('alpha');
  await page.locator('#local-bots').click();
  await expect(page.locator('#hud')).toHaveAttribute('data-room', 'LOCAL');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);
  const hud = page.locator('#hud');
  await expect
    .poll(async () => Number(await hud.getAttribute('data-elapsed')))
    .toBeGreaterThan(0.1);
  await page.keyboard.press('6');
  await expect(hud).toHaveAttribute('data-equipment-slot', '6');
  await expect(hud).toHaveAttribute('data-tool', 'bomb');
  await expect(hud).toHaveAttribute('data-weapon-visible', 'true');
  await page.keyboard.press('q');
  await expect(hud).toHaveAttribute('data-tool', 'knife');
  const pickupStarted = Number(await hud.getAttribute('data-elapsed'));
  await page.keyboard.down('e');
  await expect
    .poll(async () => Number(await hud.getAttribute('data-elapsed')))
    .toBeGreaterThan(pickupStarted + 0.15);
  await page.keyboard.up('e');
  await page.keyboard.press('6');
  await expect(hud).toHaveAttribute('data-equipment-slot', '6');
  await expect(hud).toHaveAttribute('data-tool', 'bomb');
  await expect(hud).toHaveAttribute('data-weapon-visible', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  expect(errors).toEqual([]);
});
