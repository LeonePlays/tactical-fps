// Test process only: production entrypoint server/index.ts always verifies Supabase.
import { createMatchServer } from '../../server/server';
const server = createMatchServer(
  async (token) => (token.startsWith('test-token-') ? token.slice('test-token-'.length) : null),
  ['http://127.0.0.1:4173'],
);
server.http.listen(3002, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
