import {
  describeDatabaseTarget,
  resolveAppDatabaseUrl,
  resolveMigrationDatabaseUrl,
  sameDatabase,
} from '../../lib/db/url';

const ORIGINAL_ENV = process.env;

const VPS = 'postgres://app:secret@db.chora.example:5432/calendar?sslmode=require';
const STALE_SUPABASE = 'postgres://postgres:othersecret@db.abcdefg.supabase.co:5432/postgres';
const VPS_DIRECT = 'postgres://app:secret@db.chora.example:5432/calendar';

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  for (const k of [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'calender_DATABASE_URL',
    'calender_POSTGRES_URL',
  ]) {
    delete process.env[k];
  }
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  (console.error as jest.Mock).mockRestore?.();
});

describe('describeDatabaseTarget', () => {
  it('reports host:port/database and never credentials', () => {
    const described = describeDatabaseTarget(VPS);
    expect(described).toBe('db.chora.example:5432/calendar');
    expect(described).not.toContain('secret');
    expect(described).not.toContain('app:');
  });

  it('defaults a missing port', () => {
    expect(describeDatabaseTarget('postgres://u:p@host/mydb')).toBe('host:5432/mydb');
  });

  it('degrades safely on an unparseable string', () => {
    expect(describeDatabaseTarget('not a url')).toBe('(unparseable connection string)');
  });
});

describe('sameDatabase', () => {
  it('ignores credentials and query params', () => {
    expect(sameDatabase(VPS, VPS_DIRECT)).toBe(true);
  });

  it('distinguishes different hosts', () => {
    expect(sameDatabase(VPS, STALE_SUPABASE)).toBe(false);
  });

  it('distinguishes different databases on the same host', () => {
    expect(sameDatabase('postgres://u:p@h:5432/a', 'postgres://u:p@h:5432/b')).toBe(false);
  });

  it('is false when either side is unparseable', () => {
    expect(sameDatabase(VPS, 'garbage')).toBe(false);
  });
});

describe('resolveAppDatabaseUrl', () => {
  it('prefers DATABASE_URL and reports its source', () => {
    process.env.DATABASE_URL = VPS;
    process.env.POSTGRES_URL = STALE_SUPABASE;
    expect(resolveAppDatabaseUrl()).toEqual({ url: VPS, source: 'DATABASE_URL' });
  });

  it('falls back through the legacy vars', () => {
    process.env.calender_POSTGRES_URL = VPS;
    expect(resolveAppDatabaseUrl().source).toBe('calender_POSTGRES_URL');
  });

  it('throws when nothing is configured', () => {
    expect(() => resolveAppDatabaseUrl()).toThrow(/No Postgres URL found/);
  });

  it('never considers POSTGRES_URL_NON_POOLING', () => {
    process.env.POSTGRES_URL_NON_POOLING = STALE_SUPABASE;
    expect(() => resolveAppDatabaseUrl()).toThrow(/No Postgres URL found/);
  });
});

describe('resolveMigrationDatabaseUrl', () => {
  it('uses the app URL when no non-pooling URL is set', () => {
    process.env.DATABASE_URL = VPS;
    const target = resolveMigrationDatabaseUrl();
    expect(target.url).toBe(VPS);
    expect(target.ignoredNonPooling).toBeUndefined();
  });

  it('prefers the non-pooling URL when it names the same database', () => {
    process.env.DATABASE_URL = VPS;
    process.env.POSTGRES_URL_NON_POOLING = VPS_DIRECT;
    const target = resolveMigrationDatabaseUrl();
    expect(target.url).toBe(VPS_DIRECT);
    expect(target.source).toBe('POSTGRES_URL_NON_POOLING');
    expect(target.ignoredNonPooling).toBeUndefined();
  });

  it('IGNORES a non-pooling URL pointing at a different database', () => {
    // The production failure: a leftover Supabase integration variable made
    // migrations create tables where nothing reads, so every run reported
    // success while the app still saw no analytics_events.
    process.env.DATABASE_URL = VPS;
    process.env.POSTGRES_URL_NON_POOLING = STALE_SUPABASE;

    const target = resolveMigrationDatabaseUrl();

    expect(target.url).toBe(VPS);
    expect(target.source).toBe('DATABASE_URL');
    expect(target.ignoredNonPooling).toBeDefined();
    expect(target.ignoredNonPooling!.target).toBe('db.abcdefg.supabase.co:5432/postgres');
    expect(target.ignoredNonPooling!.reason).toMatch(/different database/);
  });

  it('does not leak credentials in the warning', () => {
    process.env.DATABASE_URL = VPS;
    process.env.POSTGRES_URL_NON_POOLING = STALE_SUPABASE;
    const reason = resolveMigrationDatabaseUrl().ignoredNonPooling!.reason;
    expect(reason).not.toContain('othersecret');
    expect(reason).not.toContain('secret');
  });

  it('ignores an unparseable non-pooling URL rather than migrating blind', () => {
    process.env.DATABASE_URL = VPS;
    process.env.POSTGRES_URL_NON_POOLING = 'garbage';
    expect(resolveMigrationDatabaseUrl().url).toBe(VPS);
  });
});
