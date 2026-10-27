// Supabase Edge Function; administrative key exists only in the server runtime.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
Deno.serve(async (request) => {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return respond({ error: 'Invalid request' }, 400);
    const { username, password } = JSON.parse(raw);
    if (
      typeof username !== 'string' ||
      !/^[a-z0-9_]{3,20}$/.test(username) ||
      typeof password !== 'string' ||
      password.length > 128
    )
      return respond({ error: 'Invalid credentials' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!,
      admin = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lookup = await fetch(`${url}/rest/v1/rpc/tactical_login_email`, {
      method: 'POST',
      headers: {
        apikey: admin,
        Authorization: `Bearer ${admin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requested_username: username }),
      signal: AbortSignal.timeout(5000),
    });
    if (!lookup.ok) return respond({ error: 'Login unavailable' }, 503);
    const email = await lookup.json();
    // Auth issues the session and enforces password/rate limits. Never return the email lookup.
    const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: typeof email === 'string' ? email : 'unknown@invalid.example',
        password,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!login.ok)
      return respond({ error: 'Invalid credentials' }, login.status === 429 ? 429 : 401);
    const session = await login.json();
    return respond({ access_token: session.access_token, refresh_token: session.refresh_token });
  } catch {
    return respond({ error: 'Login unavailable' }, 503);
  }
});
