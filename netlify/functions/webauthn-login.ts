import type { Config, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server'
import {
  clearChallengeCookie,
  createChallengeCookie,
  createSessionCookie,
  readChallengeCookie,
} from './utils/auth.ts'
import {
  badGateway,
  badRequest,
  internalError,
  methodNotAllowed,
  ok,
  okWithCookies,
  preflight,
  unauthorized,
} from './utils/http.ts'
import { getWebAuthnConfig, isCounterAcceptable, WebAuthnConfigError } from './utils/webauthn-policy.ts'
import { findCredential, recordUse, WebAuthnRepoError } from './utils/webauthn-repo.ts'
import { asV2 } from './utils/v2.ts'

async function handleGet(): Promise<HandlerResponse> {
  const { rpID } = getWebAuthnConfig()

  const options = await generateAuthenticationOptions({
    rpID,
    // Empty, so the browser offers whichever passkey it holds for this origin.
    // That is what removes the need for a username field anywhere in the UI.
    allowCredentials: [],
    userVerification: 'required',
  })

  const cookie = createChallengeCookie(options.challenge)
  if (!cookie) return internalError('auth_not_configured')
  return ok({ options }, { 'Set-Cookie': cookie })
}

async function handlePost(event: HandlerEvent): Promise<HandlerResponse> {
  const expectedChallenge = readChallengeCookie(event)
  if (expectedChallenge === null) {
    return badRequest('challenge_expired', { 'Set-Cookie': clearChallengeCookie() })
  }

  let response: AuthenticationResponseJSON
  try {
    response = JSON.parse(event.body ?? 'null') as AuthenticationResponseJSON
  } catch {
    return badRequest('Invalid JSON body')
  }
  if (response === null || typeof response !== 'object' || typeof response.id !== 'string') {
    return badRequest('authentication response is required')
  }

  const stored = await findCredential(response.id)
  // A credential the server has no row for was revoked, or belongs to another
  // origin. The client clears its local hint and falls back to the passphrase.
  if (stored === null) return unauthorized('unknown_credential', { 'Set-Cookie': clearChallengeCookie() })

  const { rpID, origin } = getWebAuthnConfig()

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: stored.publicKey,
        counter: stored.counter,
        transports: stored.transports as AuthenticatorTransportFuture[],
      },
    })
  } catch (err) {
    console.error('[webauthn-login] verification failed:', err)
    return unauthorized('invalid_credentials', { 'Set-Cookie': clearChallengeCookie() })
  }

  if (!verification.verified) {
    return unauthorized('invalid_credentials', { 'Set-Cookie': clearChallengeCookie() })
  }

  const { newCounter } = verification.authenticationInfo
  if (!isCounterAcceptable(stored.counter, newCounter)) {
    console.error('[webauthn-login] counter regression for', stored.credentialId)
    return unauthorized('invalid_credentials', { 'Set-Cookie': clearChallengeCookie() })
  }

  await recordUse(stored.credentialId, newCounter)

  const sessionCookie = createSessionCookie()
  if (!sessionCookie) return internalError('auth_not_configured')

  return okWithCookies({ authenticated: true }, [sessionCookie, clearChallengeCookie()])
}

async function handleEvent(event: HandlerEvent): Promise<HandlerResponse> {
  if (event.httpMethod === 'OPTIONS') return preflight()

  try {
    switch (event.httpMethod) {
      case 'GET':  return await handleGet()
      case 'POST': return await handlePost(event)
      default:     return methodNotAllowed()
    }
  } catch (err) {
    if (err instanceof WebAuthnConfigError) {
      console.error('[webauthn-login]', err.message)
      return internalError('webauthn_not_configured')
    }
    if (err instanceof WebAuthnRepoError) {
      return badGateway('database_error', { msg: err.message })
    }
    console.error('[webauthn-login] unexpected error:', err)
    return internalError('internal_error')
  }
}

// Functions 2.0 entry point: Netlify Database only injects NETLIFY_DB_URL
// into this runtime, never into a classic handler export — same platform
// limitation as the AI Gateway credentials (see CLAUDE.md rule 12).
export default asV2(handleEvent)

export const config: Config = { path: '/api/webauthn-login' }
