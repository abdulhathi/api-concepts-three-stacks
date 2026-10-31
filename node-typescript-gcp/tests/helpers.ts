import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import supertest from 'supertest';
import { afterEach } from 'vitest';
import { createApp, type AppOverrides, type BookshopApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';

const SECRETS: Record<string, string> = {
  reader: 'reader-secret',
  writer: 'writer-secret',
  partner: 'partner-secret',
  admin: 'admin-secret',
  free: 'free-secret',
};

export interface TestServer extends BookshopApp {
  config: Config;
  server: Server;
  baseUrl: string;
  /** supertest agent bound to the running server. */
  api: ReturnType<typeof supertest>;
  /** Gets a token through the real OAuth endpoint. */
  token(clientId: keyof typeof SECRETS | string, scope?: string): Promise<string>;
  /** `Authorization` header value for a demo client. */
  bearer(clientId: string): Promise<{ Authorization: string }>;
}

const running: Server[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

/** Boots a fresh app (fresh in-memory state) on an ephemeral port. Servers are closed after each test. */
export async function startServer(
  env: Record<string, string> = {},
  overrides: AppOverrides = {},
): Promise<TestServer> {
  const config = loadConfig({ ...env });
  const built = createApp(config, { logSink: () => undefined, ...overrides });
  const server = await new Promise<Server>((resolve) => {
    const listening = built.app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  running.push(server);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = supertest(baseUrl);

  const token = async (clientId: string, scope?: string) => {
    const form = new URLSearchParams({ grant_type: 'client_credentials', ...(scope ? { scope } : {}) });
    const response = await api
      .post('/oauth/token')
      .auth(clientId, SECRETS[clientId] ?? 'x')
      .type('form')
      .send(form.toString());
    return response.body.access_token as string;
  };
  return {
    ...built,
    config,
    server,
    baseUrl,
    api,
    token,
    bearer: async (clientId) => ({ Authorization: `Bearer ${await token(clientId)}` }),
  };
}

/** A fake receiver for webhook deliveries; fails the first `failFirst` requests with HTTP 500. */
export async function startReceiver(failFirst = 0) {
  const { createServer } = await import('node:http');
  const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.statusCode = received.length <= failFirst ? 500 : 204;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  running.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, received };
}
