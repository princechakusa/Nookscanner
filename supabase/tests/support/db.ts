/**
 * Test harness: boots PGlite, applies the Supabase shim and every migration in order, and
 * provides helpers to run SQL as a specific authenticated user (RLS enforced) or as anon.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const supabaseDir = fileURLToPath(new URL('../../', import.meta.url));

export function migrationFiles(): string[] {
  return readdirSync(`${supabaseDir}migrations`)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(readFileSync(`${supabaseDir}tests/support/supabase-shim.sql`, 'utf8'));
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(`${supabaseDir}migrations/${file}`, 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return db;
}

let userCounter = 0;

/** Creates an auth user (as superuser, like Supabase Auth would) and returns its id. */
export async function createUser(db: PGlite, label: string): Promise<string> {
  userCounter += 1;
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${label}-${userCounter}@example.test`,
    JSON.stringify({ full_name: label }),
  ]);
  return id;
}

type Role = 'authenticated' | 'anon' | 'service_role';

/**
 * Runs fn inside a transaction with the given database role and JWT claims, exactly how
 * PostgREST executes API requests. The transaction is committed on success.
 */
export async function asRole<T>(
  db: PGlite,
  role: Role,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = userId ? { sub: userId, role } : { role };
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

export const asUser = <T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>) =>
  asRole(db, 'authenticated', userId, fn);

export const asAnon = <T>(db: PGlite, fn: (tx: Transaction) => Promise<T>) =>
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
