// Neon over HTTP: one fetch per query or batch, which suits serverless functions.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';

// Hosts like Vercel set DATABASE_URL in the environment. The Vite dev and preview
// servers read it from .env.local / .env and pass it in (see vite.config.ts).
let databaseUrl = process.env.DATABASE_URL;
let db: NeonHttpDatabase | undefined;

export function setDatabaseUrl(url: string | undefined): void {
  databaseUrl = url;
  db = undefined;
}

/** Created on first use so the app still starts (and tests still run) without DATABASE_URL. */
export function getDb(): NeonHttpDatabase {
  if (db) return db;
  if (!databaseUrl) throw new MissingDatabaseUrlError();
  db = drizzle({ client: neon(databaseUrl) });
  return db;
}

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.');
    this.name = 'MissingDatabaseUrlError';
  }
}
