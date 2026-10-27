import { createMatchServer } from './server';
const port = Number(process.env.PORT || 3001);
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((x) => x.trim());
const server = createMatchServer(undefined, origins);
server.http.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`TACTICAL FPS match server listening on port ${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
