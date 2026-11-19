/**
 * Database test harness with two targets (ADR-013):
 * - default `pglite`: boots in-process Postgres, applies the Supabase shim and every migration.
 * - `DB_TEST_TARGET=stack`: connects to the local Supabase stack (`supabase start`, migrations
 *   applied by `supabase db reset`) so the same suites run on real Supabase Postgres, auth and
 *   storage schemas. URL from DB_TEST_URL (default: local stack on port 56522, local-only creds).
 * Helpers run SQL as an authenticated user (RLS enforced) or as anon, the way PostgREST does.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const supabaseDir = fileURLToPath(new URL('../../', import.meta.url));

export interface QueryResult<T> {
  rows: T[];
  affectedRows?: number;
}

export interface TestTx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<unknown>;
}

export interface TestDb extends TestTx {
  transaction<T>(fn: (tx: TestTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const dbTarget = process.env.DB_TEST_TARGET === 'stack' ? 'stack' : 'pglite';

export function migrationFiles(): string[] {
  return readdirSync(`${supabaseDir}migrations`)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function createPgliteDb(): Promise<TestDb> {
  const db = await PGlite.create();
  await db.exec(readFileSync(`${supabaseDir}tests/support/supabase-shim.sql`, 'utf8'));
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(`${supabaseDir}migrations/${file}`, 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return db as unknown as TestDb;
}

function wrapClient(client: pg.PoolClient | pg.Pool): TestTx {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const res = await client.query(sql, params);
      return { rows: res.rows as T[], affectedRows: res.rowCount ?? 0 };
    },
    exec: (sql: string) => client.query(sql),
  };
}

async function createStackDb(): Promise<TestDb> {
  const pool = new pg.Pool({
    connectionString:
      process.env.DB_TEST_URL ?? 'postgresql://postgres:postgres@127.0.0.1:56522/postgres',
    max: 2,
  });
  return {
    ...wrapClient(pool),
    async transaction<T>(fn: (tx: TestTx) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrapClient(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export function createTestDb(): Promise<TestDb> {
  return dbTarget === 'stack' ? createStackDb() : createPgliteDb();
}

/** Run-unique suffix so suites can run repeatedly against a persistent stack database. */
export const runId = Math.random().toString(36).slice(2, 8);

let userCounter = 0;

/** Creates an auth user (as superuser, like Supabase Auth would) and returns its id. */
export async function createUser(db: TestDb, label: string): Promise<string> {
  userCounter += 1;
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${label.toLowerCase()}-${userCounter}-${runId}@example.test`,
    JSON.stringify({ full_name: label }),
  ]);
  return id;
}

/** Org slug unique per run (slugs are globally unique). */
export const slug = (base: string) => `${base}-${runId}`;

type Role = 'authenticated' | 'anon' | 'service_role';

/**
 * Runs fn inside a transaction with the given database role and JWT claims, exactly how
 * PostgREST executes API requests. The transaction is committed on success.
 */
export async function asRole<T>(
  db: TestDb,
  role: Role,
  userId: string | null,
  fn: (tx: TestTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = userId ? { sub: userId, role } : { role };
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

export const asUser = <T>(db: TestDb, userId: string, fn: (tx: TestTx) => Promise<T>) =>
  asRole(db, 'authenticated', userId, fn);

export const asAnon = <T>(db: TestDb, fn: (tx: TestTx) => Promise<T>) =>
  asRole(db, 'anon', null, fn);

/** Resolves to the error message if the promise rejects, otherwise throws. */
export async function expectError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('Expected the operation to fail, but it succeeded');
}
