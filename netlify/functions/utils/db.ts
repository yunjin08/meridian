import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import * as schema from '../../../db/schema.ts'

export { schema }

// Both extend the same drizzle-orm PgDatabase base, so callers use one
// shared query API regardless of which one is live.
type Db = ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzleNeon<typeof schema>>

let instance: Db | null = null

// @netlify/database's own getDatabase()/getConnectionString() read through a
// scoped `globalThis.Netlify.env` accessor that, in practice, didn't include
// NETLIFY_DB_URL for a function added in a deploy after the database was
// first connected — every existing function saw it, a brand-new one didn't.
// Reading process.env directly is the same fix vitalwatch's Netlify Database
// integration uses, and doesn't depend on that scoping working correctly.
function getConnectionString(): string {
  const url = process.env['NETLIFY_DB_URL'] ?? process.env['NETLIFY_DATABASE_URL']
  if (!url) throw new Error('NETLIFY_DB_URL is not set')
  return url
}

// Connect lazily on first query, not at module load — a cold Netlify Function
// evaluates this module before any request arrives, and the env var isn't
// guaranteed to be readable yet in that moment.
export function getDb(): Db {
  if (instance) return instance
  const url = getConnectionString()
  // NETLIFY_DEV is set by `netlify dev`, whose local proxy speaks plain
  // Postgres wire protocol, not Neon's WebSocket protocol.
  instance =
    process.env['NETLIFY_DEV'] === 'true'
      ? drizzlePg(url, { schema })
      : drizzleNeon(url, { schema })
  return instance
}
