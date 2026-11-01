import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { inboxPlugin, stackProxies } from './server/lab';
import { wordsPlugin } from './server/words';

export default defineConfig({
  plugins: [
    react(),
    // Select-a-word popup: translate (MyMemory) and explain (Claude), served by the dev server.
    wordsPlugin({ header: 'x-api-concepts-lab' }),
    // Webhook deliveries from the API land at /lab/inbox/<box>, for the webhooks practice lab.
    inboxPlugin(),
  ],
  // Relative asset paths, so the build works from any folder or a GitHub Pages subpath.
  base: './',
  server: {
    // Practice requests: /stack/python → :8001, /stack/node → :8002, /stack/dotnet → :8003.
    proxy: stackProxies(),
    // Vite's own CORS handler answers every OPTIONS request itself; the CORS lab needs the API's real preflight answer.
    cors: false,
    // The concept guides and the code they show live in the folder above (APIConcepts/).
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
  },
  // Videos, guides and code files load on demand; the main bundle holds the course outline and the player.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 20_000,
  },
});
