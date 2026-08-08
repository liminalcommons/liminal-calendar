/**
 * Regression test for the failure mode that took production analytics down:
 * a single failing DDL statement used to abort every statement after it, so
 * tables declared later in migrate.ts (analytics_events among them) were
 * silently never created — while the caller only console.error'd the reject.
 */

const mockSqlEnd = jest.fn().mockResolvedValue(undefined);

// Statements whose SQL contains any of these markers reject, simulating a
// UNIQUE constraint colliding with pre-existing duplicate rows.
let failingMarkers: string[] = [];
let executed: string[] = [];

jest.mock('postgres', () => {
  return jest.fn(() => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join(' ? ');
      executed.push(text);
      const marker = failingMarkers.find((m) => text.includes(m));
      if (marker) {
        return Promise.reject(new Error(`duplicate key value violates "${marker}"`));
      }
      void values;
      return Promise.resolve([]);
    };
    sql.end = mockSqlEnd;
    return sql;
  });
});

import { runMigrations } from '../../lib/db/migrate';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  executed = [];
  failingMarkers = [];
  process.env = { ...ORIGINAL_ENV, DATABASE_URL: 'postgres://test/test' };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('runMigrations — statement independence', () => {
  it('reports success with no failures when every statement applies', async () => {
    const result = await runMigrations();
    expect(result.success).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.message).toBe('Migrations complete');
  });

  it('still creates analytics_events when an earlier UNIQUE statement fails', async () => {
    // events_booking_owner_starts_unique is declared BEFORE analytics_events
    // and is exactly the kind of statement that throws against live data.
    failingMarkers = ['events_booking_owner_starts_unique'];

    const result = await runMigrations();

    // The run completes and reports the failure rather than throwing.
    expect(result.success).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].statement).toContain('events_booking_owner_starts_unique');
    expect(result.message).toBe('Migrations completed with 1 failed statement(s)');

    // The critical assertion: the later table was still attempted.
    expect(executed.some((s) => s.includes('CREATE TABLE IF NOT EXISTS analytics_events'))).toBe(true);
  });

  it('records every failure and keeps going across multiple bad statements', async () => {
    failingMarkers = [
      'members_handle_key',
      'members_clerk_id_key',
      'members_logto_id_unique',
      'members_feed_token_key',
      'events_booking_owner_starts_unique',
    ];

    const result = await runMigrations();

    expect(result.success).toBe(false);
    expect(result.failures).toHaveLength(failingMarkers.length);
    for (const f of result.failures) {
      expect(f.error).toMatch(/duplicate key value/);
    }
    // Schema work after all five failures still ran.
    expect(executed.some((s) => s.includes('CREATE TABLE IF NOT EXISTS analytics_events'))).toBe(true);
    expect(executed.some((s) => s.includes('analytics_events_created_idx'))).toBe(true);
    expect(executed.some((s) => s.includes('DROP CONSTRAINT IF EXISTS chk_members_identity'))).toBe(true);
  });

  it('truncates and collapses whitespace in the reported statement', async () => {
    failingMarkers = ['CREATE TABLE IF NOT EXISTS analytics_events'];
    const result = await runMigrations();
    const [failure] = result.failures;
    expect(failure.statement).not.toMatch(/\n/);
    expect(failure.statement.length).toBeLessThanOrEqual(160);
  });

  it('closes the connection even when statements fail', async () => {
    failingMarkers = ['members_handle_key'];
    await runMigrations();
    expect(mockSqlEnd).toHaveBeenCalled();
  });
});

describe('runMigrations — ledger', () => {
  it('creates migration_runs before anything else, so a partial run is still recorded', async () => {
    await runMigrations();
    const createIdx = executed.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS migration_runs'));
    const eventsIdx = executed.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS events'));
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeLessThan(eventsIdx);
  });

  it('records the run with its trigger, target and failure count', async () => {
    failingMarkers = ['members_clerk_id_key'];
    const result = await runMigrations('admin');

    const insert = executed.find((s) => s.includes('INSERT INTO migration_runs'));
    expect(insert).toBeDefined();
    expect(result.failures).toHaveLength(1);
    // Target is reported without credentials.
    expect(result.target).toBe('test:5432/test');
    expect(result.targetSource).toBe('DATABASE_URL');
  });

  it('a failed ledger write never changes the migration outcome', async () => {
    // Recording the run must not be able to report a successful schema as failed.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    failingMarkers = ['INSERT INTO migration_runs'];
    const result = await runMigrations();
    expect(result.success).toBe(true);
    expect(result.failures).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not record run'),
      expect.any(String),
    );
    errSpy.mockRestore();
  });
});
