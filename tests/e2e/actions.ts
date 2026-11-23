import { expect, type Page } from '@playwright/test';

/** Servers are a real connection dialog, separate from offline match configuration. */
export async function openServers(page: Page): Promise<void> {
  if (!(await page.locator('#servers-overlay').isVisible()))
    await page.locator('[data-action="servers"]').first().click();
  await expect(page.locator('#servers-overlay')).toBeVisible();
}

/** Align Playwright's absolute cursor with the browser's captured centre before native clicks. */
export async function syncCapturedMouse(page: Page): Promise<void> {
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game-canvas');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Desktop viewport is required');
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
}
