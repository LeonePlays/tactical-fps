import type { Page } from '@playwright/test';
export async function accountFixture(page: Page, authenticated = true) {
  const user = {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    aud: 'authenticated',
    email: 'test@example.com',
    created_at: new Date().toISOString(),
    app_metadata: { provider: 'email' },
    user_metadata: {} as Record<string, unknown>,
  };
  const session = {
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
  if (authenticated)
    await page.addInitScript((session) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('sb-rrxwarhfizeuhowqpzle-auth-token', JSON.stringify(session));
        sessionStorage.setItem('seeded', 'yes');
      }
    }, session);
  await page.route('**/auth/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/user')) {
      if (route.request().method() === 'PUT')
        Object.assign(user.user_metadata, route.request().postDataJSON().data || {});
      await route.fulfill({ json: user });
    } else if (path.endsWith('/token')) await route.fulfill({ json: { ...session, user } });
    else await route.fulfill({ json: {} });
  });
}
