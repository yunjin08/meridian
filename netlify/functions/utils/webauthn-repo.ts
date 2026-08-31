import { getSupabase, type WebAuthnCredentialRow } from './supabase-client.ts'
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

function fail(context: string, error: { message: string }): never {
  console.error(`[webauthn-repo] ${context}:`, error.message)
  throw new WebAuthnRepoError(error.message)
}

function toPasskey(row: WebAuthnCredentialRow): PasskeyCredential {
  return {
    credentialId: row.credential_id,
    deviceLabel: row.device_label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

function toStored(row: WebAuthnCredentialRow): StoredCredential {
  return {
    credentialId: row.credential_id,
    publicKey: Uint8Array.from(Buffer.from(row.public_key, 'base64url')),
    counter: Number(row.counter),
    transports: row.transports,
  }
}

export async function listCredentials(): Promise<PasskeyCredential[]> {
  const { data, error } = await getSupabase()
    .from('webauthn_credentials')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) fail('listCredentials', error)
  return (data ?? []).map(toPasskey)
}

/**
 * Credential ids and transports only. Registration passes these as
 * `excludeCredentials` so the same authenticator cannot be enrolled twice.
 */
export async function listCredentialDescriptors(): Promise<{ id: string; transports: string[] }[]> {
  const { data, error } = await getSupabase()
    .from('webauthn_credentials')
    .select('credential_id, transports')
  if (error) fail('listCredentialDescriptors', error)
  return (data ?? []).map((row) => ({ id: row.credential_id, transports: row.transports }))
}

export async function findCredential(credentialId: string): Promise<StoredCredential | null> {
  const { data, error } = await getSupabase()
    .from('webauthn_credentials')
    .select('*')
    .eq('credential_id', credentialId)
    .maybeSingle()
  if (error) fail('findCredential', error)
  return data === null ? null : toStored(data)
}

export async function insertCredential(input: {
  credentialId: string
  publicKey: Uint8Array
  counter: number
  transports: string[]
  deviceLabel: string
}): Promise<PasskeyCredential> {
  const { data, error } = await getSupabase()
    .from('webauthn_credentials')
    .insert({
      credential_id: input.credentialId,
      public_key: Buffer.from(input.publicKey).toString('base64url'),
      counter: input.counter,
      transports: input.transports,
      device_label: input.deviceLabel,
    })
    .select('*')
    .single()
  if (error) fail('insertCredential', error)
  return toPasskey(data)
}

export async function recordUse(credentialId: string, counter: number): Promise<void> {
  const { error } = await getSupabase()
    .from('webauthn_credentials')
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq('credential_id', credentialId)
  if (error) fail('recordUse', error)
}

export async function deleteCredential(credentialId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('webauthn_credentials')
    .delete()
    .eq('credential_id', credentialId)
    .select('credential_id')
  if (error) fail('deleteCredential', error)
  return (data ?? []).length > 0
}
