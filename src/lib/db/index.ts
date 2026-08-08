import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { resolveAppDatabaseUrl } from './url';

let _db: PostgresJsDatabase<typeof schema> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sql: any = null;

// Resolution lives in ./url so migrations resolve identically — see the note
// there on how a diverging non-pooling URL silently split writes from reads.
function envUrl(): string {
  return resolveAppDatabaseUrl().url;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    _sql = postgres(envUrl(), {
      ssl: 'require',
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      // Supabase's POSTGRES_URL is pgbouncer in transaction mode, which
      // does not support prepared statements. Disabling `prepare` is safe
      // for direct connections too (postgres-js just skips the cache).
      prepare: false,
    });
    _db = drizzle(_sql, { schema });
  }
  return _db;
}

// Convenience export — lazy, only connects on first use
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop];
  },
});
