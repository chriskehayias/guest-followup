import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv } from 'vite';
import type { Connect, Plugin } from 'vite';
import { setDatabaseUrl } from './server/db.ts';
import { GET, POST } from './server/guestsApi.ts';

type Handler = (request: Request) => Promise<Response>;

/** Same routes Vercel serves from api/. */
const ROUTES: Record<string, Record<string, Handler>> = {
  '/api/guests': { GET, POST },
};

export default defineConfig(({ mode }) => {
  // Vite reruns this on every restart, including after .env.local is edited, so read the
  // URL fresh and hand it to the server code. Never copy it into process.env: loadEnv
  // prefers process.env over the files and would keep returning the old value.
  // No VITE_ prefix, so it never reaches the browser bundle.
  setDatabaseUrl(loadEnv(mode, process.cwd(), 'DATABASE_URL').DATABASE_URL);
  return { plugins: [apiRoutes()] };
});

/** Serves ROUTES from `npm run dev` and `npm run preview`. */
function apiRoutes(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const route = ROUTES[(req.url ?? '').split('?')[0]];
    if (!route) return next();
    const handler = route[req.method ?? 'GET'];
    if (!handler) {
      res.statusCode = 405;
      res.setHeader('Allow', Object.keys(route).join(', '));
      res.end();
      return;
    }
    toRequest(req)
      .then(handler)
      .then((response) => send(res, response))
      .catch(next);
  };
  return {
    name: 'api-routes',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key.startsWith(':')) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(new URL(req.url ?? '/', 'http://localhost'), {
    method: req.method,
    headers,
    body: hasBody ? body : undefined,
  });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
