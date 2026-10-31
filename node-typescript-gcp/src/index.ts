import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app, webhooks } = createApp(config);

const server = app.listen(config.port, () => {
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level: 'info', message: `Bookshop API listening on :${config.port}` })}\n`,
  );
});

// Cloud Run sends SIGTERM before stopping an instance: stop accepting work, let deliveries finish.
function shutdown(): void {
  server.close(() => {
    void webhooks.idle().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 9000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
