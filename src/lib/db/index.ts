import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

let _db: PostgresJsDatabase<typeof schema> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sql: any = null;

function envUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.calender_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.calender_POSTGRES_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set (checked DATABASE_URL, calender_DATABASE_URL, POSTGRES_URL, calender_POSTGRES_URL)',
    );
  }
  return url;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    _sql = postgres(envUrl(), {
      // Self-hosted Postgres reachable over the public internet (chora-node).
      // `require` enables TLS without strict CA validation — the host cert is
      // typically self-signed or a Cloudflare-origin cert that node doesn't
      // trust by default. Password + TLS gives us encryption-in-transit plus
      // authentication; CA-strict verification is a future hardening step.
      ssl: 'require',
      // Serverless: one connection per function invocation. Cold-start cost
      // is paid once per cold container; subsequent invocations on the same
      // container reuse the connection. Higher values risk leaking
      // connections under cold-start bursts.
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
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
