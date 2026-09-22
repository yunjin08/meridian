import { desc, eq } from 'drizzle-orm'
import { getDb, schema } from './db.ts'
import type { PasskeyCredential } from '../../../src/types/webauthn.ts'

export class WebAuthnRepoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebAuthnRepoError'
  }
}

/**
 * A stored credential in the shape SimpleWebAuthn verifies against. The key is
 * `Uint8Array<ArrayBuffer>` rather than plain `Uint8Array` because that is the
 * narrowed type the library's `WebAuthnCredential` requires.
 */
export type StoredCredential = {
  credentialId: string
  publicKey: Uint8Array<ArrayBuffer>
  counter: number
  transports: string[]
}

type CredentialRow = typeof schema.webauthnCredentials.$inferSelect

async function run<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[webauthn-repo] ${context}:`, message)
    throw new WebAuthnRepoError(message)
  }
}

function toPasskey(row: CredentialRow): PasskeyCredential {
  return {
    credentialId: row.credentialId,
    deviceLabel: row.deviceLabel,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }
}

function toStored(row: CredentialRow): StoredCredential {
  return {
    credentialId: row.credentialId,
    publicKey: Uint8Array.from(Buffer.from(row.publicKey, 'base64url')),
    counter: row.counter,
    transports: row.transports,
  }
}

export async function listCredentials(): Promise<PasskeyCredential[]> {
  return run('listCredentials', async () => {
    const rows = await getDb().select().from(schema.webauthnCredentials).orderBy(desc(schema.webauthnCredentials.createdAt))
    return rows.map(toPasskey)
  })
}

/**
 * Credential ids and transports only. Registration passes these as
 * `excludeCredentials` so the same authenticator cannot be enrolled twice.
 */
export async function listCredentialDescriptors(): Promise<{ id: string; transports: string[] }[]> {
  return run('listCredentialDescriptors', async () => {
    const rows = await getDb()
      .select({ credentialId: schema.webauthnCredentials.credentialId, transports: schema.webauthnCredentials.transports })
      .from(schema.webauthnCredentials)
    return rows.map((row) => ({ id: row.credentialId, transports: row.transports }))
  })
}

export async function findCredential(credentialId: string): Promise<StoredCredential | null> {
  return run('findCredential', async () => {
    const [row] = await getDb().select().from(schema.webauthnCredentials).where(eq(schema.webauthnCredentials.credentialId, credentialId))
    return row === undefined ? null : toStored(row)
  })
}

export async function insertCredential(input: {
  credentialId: string
  publicKey: Uint8Array
  counter: number
  transports: string[]
  deviceLabel: string
}): Promise<PasskeyCredential> {
  return run('insertCredential', async () => {
    const [row] = await getDb()
      .insert(schema.webauthnCredentials)
      .values({
        credentialId: input.credentialId,
        publicKey: Buffer.from(input.publicKey).toString('base64url'),
        counter: input.counter,
        transports: input.transports,
        deviceLabel: input.deviceLabel,
      })
      .returning()
    if (!row) throw new Error('insert returned no row')
    return toPasskey(row)
  })
}

export async function recordUse(credentialId: string, counter: number): Promise<void> {
  await run('recordUse', async () => {
    await getDb()
      .update(schema.webauthnCredentials)
      .set({ counter, lastUsedAt: new Date().toISOString() })
      .where(eq(schema.webauthnCredentials.credentialId, credentialId))
  })
}

export async function deleteCredential(credentialId: string): Promise<boolean> {
  return run('deleteCredential', async () => {
    const rows = await getDb()
      .delete(schema.webauthnCredentials)
      .where(eq(schema.webauthnCredentials.credentialId, credentialId))
      .returning({ credentialId: schema.webauthnCredentials.credentialId })
    return rows.length > 0
  })
}
