// Shapes crossing the /api/webauthn-* boundary. Functions import these
// type-only, which rule 10 permits because types are erased before bundling.

/** A registered device, as shown in the Passkeys panel. */
export interface PasskeyCredential {
  credentialId: string
  deviceLabel: string
  createdAt: string
  lastUsedAt: string | null
}

/**
 * The browser's own registration/authentication payloads are passed through
 * untouched to SimpleWebAuthn, which owns their schema. Typing them again here
 * would duplicate a definition we do not control.
 */
export type WebAuthnResponsePayload = Record<string, unknown>
