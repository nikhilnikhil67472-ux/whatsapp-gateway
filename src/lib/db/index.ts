import { createPostgresAdapter } from './adapters/postgres-adapter';
import sqliteAdapter, { initDb as initSqliteDb } from './adapters/sqlite-adapter';
import type { DbAdapter } from './types';

const provider = process.env.DB_PROVIDER?.trim().toLowerCase() || 'sqlite';

function selectAdapter(): DbAdapter {
  if (provider === 'sqlite') return sqliteAdapter;
  if (provider === 'postgres') return createPostgresAdapter();
  throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
}

export const db: DbAdapter = selectAdapter();

export function initDb() {
  if (provider === 'postgres') throw new Error('Not implemented yet');
  if (provider !== 'sqlite') throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  initSqliteDb();
}

export type { DbAdapter } from './types';
