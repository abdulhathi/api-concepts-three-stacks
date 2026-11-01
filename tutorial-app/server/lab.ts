// The dev server's two jobs for the practice labs:
//   1. Proxy /stack/<id>/… to the three Bookshop API servers, so lab requests are same-origin.
//   2. A webhook inbox at /lab/inbox/<box>: the API delivers webhooks here and the lab shows them.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ProxyOptions } from 'vite';

export const STACK_PORTS = { python: 8001, node: 8002, dotnet: 8003 } as const;

const SET = 'x-lab-set-';

/** /stack/<id> → the server on its port. The browser's own Origin, Referer and cookies are dropped, and
 *  X-Lab-Set-<name> becomes <name>: that is how a step sends Origin or Access-Control-Request-Method. */
export function stackProxies(): Record<string, ProxyOptions> {
  return Object.fromEntries(
    Object.entries(STACK_PORTS).map(([id, port]) => {
      const prefix = `/stack/${id}`;
      const options: ProxyOptions = {
        target: `http://127.0.0.1:${port}`,
        changeOrigin: true,
        rewrite: (p) => p.slice(prefix.length) || '/',
        configure: (proxy) => {
          proxy.on('proxyReq', (out, incoming) => {
            for (const h of ['origin', 'referer', 'cookie']) out.removeHeader(h);
            for (const [name, value] of Object.entries(incoming.headers)) {
              if (!name.startsWith(SET) || value === undefined) continue;
              out.removeHeader(name);
              out.setHeader(name.slice(SET.length), value);
            }
          });
          // A stopped server: answer 502 with a plain message instead of an empty error.
          proxy.on('error', (_err, _req, res) => {
            const r = res as ServerResponse;
            if (!r.headersSent && typeof r.writeHead === 'function') {
              r.writeHead(502, { 'Content-Type': 'text/plain' });
              r.end(`The ${id} server on port ${port} is not running.`);
            }
          });
        },
      };
      return [prefix, options];
    }),
  );
}

export type Delivery = {
  n: number;
  at: string;
  /** What the inbox answered: 200, or 500 while it is told to fail. */
  answered: number;
  headers: Record<string, string>;
  body: string;
};

const MAX_PER_BOX = 100;
const MAX_BODY = 64 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

/** POST /lab/inbox/<box>[?fail=N] records a delivery (answering 500 to the first N attempts of each event),
 *  GET lists them, DELETE empties the box. Kept in memory until the dev server stops. */
export function inboxPlugin(): Plugin {
  const boxes = new Map<string, Delivery[]>();
  const attempts = new Map<string, number>();
  return {
    name: 'lab-inbox',
    configureServer(server) {
      server.middlewares.use('/lab/inbox', (req, res) => {
        void (async () => {
          const url = new URL(req.url ?? '/', 'http://lab');
          const box = url.pathname.replace(/^\/+|\/+$/g, '');
          if (!/^[a-z0-9-]{1,40}$/.test(box)) return json(res, 404, { error: 'Use /lab/inbox/<box>, lowercase letters, digits and dashes.' });
          const list = boxes.get(box) ?? [];
          if (req.method === 'GET') return json(res, 200, { data: list });
          if (req.method === 'DELETE') {
            boxes.delete(box);
            for (const k of [...attempts.keys()]) if (k.startsWith(`${box} `)) attempts.delete(k);
            return json(res, 200, { data: [] });
          }
          if (req.method !== 'POST') return json(res, 405, { error: 'POST, GET or DELETE' });
          const body = await readBody(req);
          const headers = Object.fromEntries(
            Object.entries(req.headers)
              .filter(([k]) => k.startsWith('webhook-') || k === 'content-type' || k === 'user-agent')
              .map(([k, v]) => [k, String(v)]),
          );
          const event = `${box} ${headers['webhook-id'] ?? ''}`;
          const tries = (attempts.get(event) ?? 0) + 1;
          attempts.set(event, tries);
          const fail = Math.min(10, Math.max(0, Number(url.searchParams.get('fail') ?? 0) || 0));
          const answered = tries <= fail ? 500 : 200;
          list.push({ n: list.length + 1, at: new Date().toISOString(), answered, headers, body });
          boxes.set(box, list.slice(-MAX_PER_BOX));
          json(res, answered, answered === 200 ? { received: true } : { error: `failing on purpose: attempt ${tries} of ${fail}` });
        })().catch(() => json(res, 500, { error: 'inbox error' }));
      });
    },
  };
}
