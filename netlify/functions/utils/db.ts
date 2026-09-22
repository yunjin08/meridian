import { getDatabase } from '@netlify/database'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import * as schema from '../../../db/schema.ts'

export { schema }

// getDatabase() picks the driver for the current context: a raw `pg.Pool`
// locally (netlify dev's local proxy speaks plain Postgres wire protocol, not
// Neon's HTTP protocol) and a Neon `Pool` in the deployed Lambda. Both extend
// the same drizzle-orm PgDatabase base, so callers use one shared query API
// regardless of which one is live.
type Db = ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzleNeon<typeof schema>>

let instance: Db | null = null

// Connect lazily on first query, not at module load — a cold Netlify Function
// evaluates this module before any request arrives, and getDatabase() throws
// if the database isn't reachable yet in that moment.
export function getDb(): Db {
  if (instance) return instance
  const connection = getDatabase()
  instance =
    connection.driver === 'server'
      ? drizzlePg({ client: connection.pool, schema })
      : drizzleNeon({ client: connection.pool, schema })
  return instance
}
