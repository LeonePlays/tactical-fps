import { expect, test, type Page } from '@playwright/test';
import { MAP_CATALOG } from '../../src/game/map-catalog';
import { GUNS, type WeaponId } from '../../src/game/ballistics';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/core/settings';
import { syncCapturedMouse } from './actions';

async function visitor(page: Page) {
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
  await expect(page.locator('.account-overlay')).toBeHidden();
}

async function enter(page: Page) {
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await syncCapturedMouse(page);
  await expect(page.locator('#hud')).toHaveAttribute('data-grounded', 'true');
}

async function leave(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'VOLTAR AO MENU', exact: true }).click();
  await expect(page.locator('#menu-shell')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#start-button')).toBeEnabled();
}

test('a visitor can enter, move and leave all twenty actual maps without a server', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await visitor(page);
  await expect(page.locator('#match-map option')).toHaveCount(20);
  await page.locator('#room-bots').selectOption('0');
  await page.locator('#match-mode').selectOption('deathmatch');
  const hud = page.locator('#hud');
  const screenshots: Readonly<Record<string, string>> = {
    dockyard: 'harbor',
    sandstone: 'desert',
    'pine-outpost': 'forest',
    'research-lab': 'laboratory',
  };
  for (const map of MAP_CATALOG) {
    await test.step(map.name, async () => {
      await page.locator('#match-map').selectOption(map.id);
      await expect(page.locator('#selected-map-name')).toHaveText(map.name);
      await page.locator('#local-bots').click();
      await expect(hud).toHaveAttribute('data-room', 'LOCAL');
      await expect(hud).toHaveAttribute('data-actors', '1');
      await enter(page);
      await expect(hud).toHaveAttribute('data-map', map.id);
      await expect(page.locator('.hud-top-left strong')).toHaveText(map.name);
      await expect(hud).toHaveAttribute('data-weapon-visible', 'true');
      const before = JSON.parse((await hud.getAttribute('data-position'))!) as {
        x: number;
        y: number;
        z: number;
      };
      const start = Number(await hud.getAttribute('data-elapsed'));
      await page.keyboard.down('w');
      await expect
        .poll(async () => Number(await hud.getAttribute('data-elapsed')))
        .toBeGreaterThan(start + 0.25);
      await page.keyboard.up('w');
      const after = JSON.parse((await hud.getAttribute('data-position'))!) as {
        x: number;
        y: number;
        z: number;
      };
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.1);
      expect(after.y).toBeGreaterThanOrEqual(-0.001);
      await expect(page.locator('#error-banner')).toBeHidden();
      if (screenshots[map.id])
        await page.screenshot({ path: `/tmp/tactical-05-${screenshots[map.id]}.png` });
      await leave(page);
      await expect(hud).not.toHaveAttribute('data-room');
    });
  }
  expect(errors).toEqual([]);
});

test('all ten selected firearms render and fire, with scope and identity preserved after sniper pickup', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await visitor(page);
  await expect(page.locator('#match-primary option')).toHaveCount(7);
  await expect(page.locator('#match-secondary option')).toHaveCount(3);
  const hud = page.locator('#hud');
  for (const id of Object.keys(GUNS) as WeaponId[]) {
    const gun = GUNS[id];
    await test.step(gun.name, async () => {
      await page.locator(`#match-${gun.slot}`).selectOption(id);
      await enter(page);
      await page.keyboard.press(gun.slot === 'primary' ? '1' : '2');
      await expect(hud).toHaveAttribute('data-weapon-id', id);
      await expect(page.locator('.hud-ammo .label')).toHaveText(gun.name);
      await expect(page.locator('#ammo-count')).toHaveText(String(gun.capacity).padStart(2, '0'));
      await expect(hud).toHaveAttribute('data-weapon-visible', 'true');
      await expect(hud).toHaveAttribute('data-deploying', 'false');
      if (id === 'sr8') {
        await page.mouse.down({ button: 'right' });
        await expect(hud).toHaveAttribute('data-scoped', 'true');
        await expect(page.locator('#scope-reticle')).toBeVisible();
        await expect.poll(async () => Number(await hud.getAttribute('data-fov'))).toBeLessThan(45);
        await page.screenshot({ path: '/tmp/tactical-05-sniper-scope.png' });
        await page.mouse.up({ button: 'right' });
        await expect(page.locator('#scope-reticle')).toBeHidden();
      }
      await page.mouse.down();
      await page.mouse.up();
      await expect
        .poll(async () => Number(await page.locator('#ammo-count').textContent()))
        .toBeLessThan(gun.capacity);
      if (id === 'sr8') {
        const ammo = await page.locator('#ammo-count').textContent();
        const reserve = await page.locator('#reserve-count').textContent();
        await page.keyboard.press('q');
        await expect(hud).toHaveAttribute('data-tool', 'knife');
        await page.keyboard.press('e');
        await page.keyboard.press('1');
        await expect(hud).toHaveAttribute('data-weapon-id', 'sr8');
        await expect(hud).toHaveAttribute('data-equipped-owned', 'true');
        await expect(page.locator('#ammo-count')).toHaveText(ammo!);
        await expect(page.locator('#reserve-count')).toHaveText(reserve!);
      }
      await leave(page);
    });
  }
  expect(errors).toEqual([]);
});

test('a high-quality dockyard TDM with bots reaches a real result and preserves the selected loadout on rematch', async ({
  page,
}) => {
  test.setTimeout(100_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ key, settings }) => localStorage.setItem(key, JSON.stringify(settings)),
    {
      key: SETTINGS_KEY,
      settings: { ...DEFAULT_SETTINGS, quality: 'high', renderScale: 0.8, shadows: 'low' },
    },
  );
  await page.route('**/*.supabase.co/**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#match-map').selectOption('dockyard');
  await page.locator('#match-mode').selectOption('team-deathmatch');
  await page.locator('#room-bots').selectOption('3');
  await page.locator('#match-difficulty').selectOption('easy');
  await page.locator('#match-team').selectOption('alpha');
  await page.locator('#match-primary').selectOption('ar47');
  await page.locator('#match-secondary').selectOption('p45');
  await page.locator('#match-time').fill('30');
  await page.locator('#match-score').fill('100');
  await page.locator('#match-summary').click();
  await page.screenshot({ path: '/tmp/tactical-05-menu.png' });
  await page.locator('#local-bots').click();
  const hud = page.locator('#hud');
  await expect(hud).toHaveAttribute('data-actors', '4');
  await enter(page);
  await expect(hud).toHaveAttribute('data-map', 'dockyard');
  await expect(hud).toHaveAttribute('data-weapon-id', 'ar47');
  await expect(hud).toHaveAttribute('data-shadows', 'true');
  expect(Number(await hud.getAttribute('data-render-scale'))).toBeCloseTo(0.8, 2);
  await expect(page.locator('#team-score')).toBeVisible();
  await page.keyboard.down('Tab');
  await expect(page.locator('#scoreboard-body tr')).toHaveCount(4);
  await expect(page.locator('.scoreboard-self')).toContainText('ALPHA');
  await page.keyboard.up('Tab');
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await hud.getAttribute('data-elapsed'))).toBeGreaterThan(3);
  await page.keyboard.up('w');
  await page.mouse.down();
  await page.mouse.up();
  await page.screenshot({ path: '/tmp/tactical-05-high-gameplay.png' });
  await expect(page.locator('#match-clock')).not.toHaveText('00:30');
  // Real fixed-step match time only: no state fixtures, fake clock or injected result.
  await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 65000 });
  await expect(page.locator('#result-title')).toHaveText(/VENCEU|EMPATE/);
  await expect(page.locator('#result-description')).toContainText('Tempo');
  await expect(page.locator('#result-score')).toContainText('BOT');
  await expect(page.locator('#result-score')).toContainText('Visitante');
  await page.locator('#rematch').click();
  await expect(page.locator('#result-overlay')).toBeHidden();
  await enter(page);
  await expect(hud).toHaveAttribute('data-map', 'dockyard');
  await expect(hud).toHaveAttribute('data-actors', '4');
  await expect(hud).toHaveAttribute('data-weapon-id', 'ar47');
  await expect(page.locator('#ammo-count')).toHaveText('30');
  await page.keyboard.press('2');
  await expect(hud).toHaveAttribute('data-weapon-id', 'p45');
  await expect(page.locator('#ammo-count')).toHaveText('07');
  await leave(page);
  await expect(page.locator('#match-map')).toHaveValue('dockyard');
  await expect(page.locator('#match-difficulty')).toHaveValue('easy');
  await expect(page.locator('#match-primary')).toHaveValue('ar47');
  await expect(page.locator('#match-secondary')).toHaveValue('p45');
  expect(errors).toEqual([]);
});
