import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { API_BASE } from '@/constants'
import type { PasskeyCredential } from '@/types/webauthn'

/** Thrown for a server-side refusal, carrying the machine-readable error code. */
export class PasskeyError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PasskeyError'
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config: RequestInit = { credentials: 'include', ...init }
  if (init.body !== undefined) {
    config.headers = { 'Content-Type': 'application/json' }
  }

  const res = await fetch(`${API_BASE}${path}`, config)
  if (!res.ok) {
    let code = `http_${res.status}`
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; msg?: string }
      code = body.error ?? code
      message = body.msg ?? body.error ?? message
    } catch {
      // non-JSON error body, keep the status message
    }
    throw new PasskeyError(code, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function isWebAuthnSupported(): boolean {
  return browserSupportsWebAuthn()
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  try {
    return await platformAuthenticatorIsAvailable()
  } catch {
    return false
  }
}

/**
 * True when the user dismissed the OS sheet rather than failing it. That is a
 * choice, not an error, so callers fall back quietly instead of showing a
 * failure message.
 */
export function isUserCancellation(error: unknown): boolean {
  return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')
}

export async function signInWithPasskey(): Promise<void> {
  const { options } = await request<{ options: PublicKeyCredentialRequestOptionsJSON }>('/webauthn-login')
  const assertion = await startAuthentication({ optionsJSON: options })
  await request<{ authenticated: boolean }>('/webauthn-login', {
    method: 'POST',
    body: JSON.stringify(assertion),
  })
}

export async function registerPasskey(): Promise<PasskeyCredential> {
  const { options } = await request<{ options: PublicKeyCredentialCreationOptionsJSON }>('/webauthn-register')
  const attestation = await startRegistration({ optionsJSON: options })
  const body = await request<{ credential: PasskeyCredential }>('/webauthn-register', {
    method: 'POST',
    body: JSON.stringify(attestation),
  })
  return body.credential
}

export async function fetchPasskeys(): Promise<PasskeyCredential[]> {
  const body = await request<{ credentials: PasskeyCredential[] }>('/webauthn-credentials')
  return body.credentials
}

export async function deletePasskey(credentialId: string): Promise<void> {
  await request<undefined>(`/webauthn-credentials?id=${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
  })
}
