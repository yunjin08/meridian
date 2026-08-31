import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { clearChallengeCookie, createChallengeCookie, readChallengeCookie, requireAuth } from './utils/auth.ts'
import {
  badGateway,
  badRequest,
  created,
  internalError,
  methodNotAllowed,
  ok,
  preflight,
} from './utils/http.ts'
import { deviceLabelFromUserAgent, getWebAuthnConfig, RP_NAME, WebAuthnConfigError } from './utils/webauthn-policy.ts'
import { insertCredential, listCredentialDescriptors, WebAuthnRepoError } from './utils/webauthn-repo.ts'

// Registering is a re-enrolment of the one owner, not the creation of a user,
// so the WebAuthn user handle is a fixed identity rather than a per-row id.
const OWNER_USER_NAME = 'owner'

async function handleGet(): Promise<HandlerResponse> {
  const { rpID } = getWebAuthnConfig()
  const existing = await listCredentialDescriptors()

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: OWNER_USER_NAME,
    attestationType: 'none',
    excludeCredentials: existing.map((credential) => ({
      id: credential.id,
      transports: credential.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      // Forces an actual biometric or PIN rather than mere user presence, which
      // is what makes this Touch ID and not just a click.
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
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

  let response: RegistrationResponseJSON
  try {
    response = JSON.parse(event.body ?? 'null') as RegistrationResponseJSON
  } catch {
    return badRequest('Invalid JSON body')
  }
  if (response === null || typeof response !== 'object') return badRequest('registration response is required')

  const { rpID, origin } = getWebAuthnConfig()

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch (err) {
    console.error('[webauthn-register] verification failed:', err)
    return badRequest('registration_failed', { 'Set-Cookie': clearChallengeCookie() })
  }

  if (!verification.verified) {
    return badRequest('registration_failed', { 'Set-Cookie': clearChallengeCookie() })
  }

  const { credential } = verification.registrationInfo
  const passkey = await insertCredential({
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceLabel: deviceLabelFromUserAgent(event.headers['user-agent'] ?? event.headers['User-Agent']),
  })

  return created({ credential: passkey }, { 'Set-Cookie': clearChallengeCookie() })
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()

  // Enrolling a device is an owner action: you prove who you are with the
  // passphrase first, then add a faster way back in.
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    switch (event.httpMethod) {
      case 'GET':  return await handleGet()
      case 'POST': return await handlePost(event)
      default:     return methodNotAllowed()
    }
  } catch (err) {
    if (err instanceof WebAuthnConfigError) {
      console.error('[webauthn-register]', err.message)
      return internalError('webauthn_not_configured')
    }
    if (err instanceof WebAuthnRepoError) {
      return badGateway('supabase_error', { msg: err.message })
    }
    console.error('[webauthn-register] unexpected error:', err)
    return internalError('internal_error')
  }
}
