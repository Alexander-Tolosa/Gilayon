import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import { count } from 'drizzle-orm'
import * as schema from '../../db/schema'

/*
  One database handle for the whole server. With DATABASE_URL it talks to PostgreSQL (the clinic
  server PC). Without it, it falls back to PGlite, an embedded real PostgreSQL, so `npm run dev`
  and the tests work with nothing installed. PGLITE_DIR=memory:// keeps it in memory.
*/
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type Q = Db | Tx

const MIGRATIONS = './db/migrations'

const g = globalThis as unknown as { __himsogDb?: Promise<Db> }

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL
  if (url) {
    const db = drizzlePg(postgres(url, { max: 10 }), { schema }) as unknown as Db
    await migratePg(db as never, { migrationsFolder: MIGRATIONS })
    return db
  }
  const dir = process.env.PGLITE_DIR ?? './.data/pglite'
  const client = new PGlite(dir)
  const db = drizzlePglite(client, { schema }) as unknown as Db
  await migratePglite(db as never, { migrationsFolder: MIGRATIONS })
  // The embedded database is for demos and development: fill an empty one with the synthetic clinic.
  // (Never done on a real DATABASE_URL, where an empty database means "not set up yet".)
  if (process.env.HIMSOG_AUTO_SEED !== '0' && process.env.PGLITE_DIR !== 'memory://') {
    const [{ n }] = await db.select({ n: count() }).from(schema.staff)
    if (n === 0) await (await import('../../db/seed')).seed(db)
  }
  return db
}

export function getDb(): Promise<Db> {
  return (g.__himsogDb ??= open())
}

/** For tests: drop the cached handle so the next call opens a fresh database. */
export function resetDbHandle() {
  g.__himsogDb = undefined
}
