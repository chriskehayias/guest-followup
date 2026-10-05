// Vercel serverless function for /api/guests. The handlers live in server/guestsApi.ts
// so the Vite dev server can mount the same code (see vite.config.ts).

export { GET, POST } from '../server/guestsApi.js';
