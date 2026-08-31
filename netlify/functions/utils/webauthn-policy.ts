// The pure policy decisions passkey sign-in makes: which origin a credential is
// bound to, how a device is labelled, and when a signature counter is stale.
// Kept free of I/O so each rule is testable on its own.
//
// A passkey is bound to an origin, so production and localhost hold separate
// registrations. Both values are configuration rather than derived from the
// request, because trusting a request header here would let a caller nominate
// the origin its own credential is checked against.

export const RP_NAME = 'Meridian'

export type WebAuthnConfig = {
  rpID: string
  origin: string
}

export class WebAuthnConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebAuthnConfigError'
  }
}

export function getWebAuthnConfig(): WebAuthnConfig {
  const rpID = process.env['WEBAUTHN_RP_ID']
  const origin = process.env['WEBAUTHN_ORIGIN']
  if (!rpID || !origin) {
    throw new WebAuthnConfigError('WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN must be set')
  }
  return { rpID, origin }
}

/**
 * A readable name for the Passkeys list, derived from the user agent so
 * registration never has to stop and ask. Deliberately coarse: it labels a
 * row, it does not identify a device.
 */
export function deviceLabelFromUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown device'

  const platform =
    /iPhone/.test(userAgent) ? 'iPhone'
    : /iPad/.test(userAgent) ? 'iPad'
    : /Macintosh|Mac OS X/.test(userAgent) ? 'macOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Android/.test(userAgent) ? 'Android'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'Unknown device'

  // Order matters: Chrome and Edge both carry "Safari" in their UA string, and
  // Edge carries "Chrome", so the most specific token has to win.
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : null

  return browser === null ? platform : `${platform}, ${browser}`
}

/**
 * The signature counter is a replay guard: a genuine authenticator increments
 * it on every use, so a counter that fails to advance means the assertion was
 * captured and replayed.
 *
 * Apple's platform authenticator never implements it and reports 0 every time.
 * A stored 0 therefore means "this authenticator does not count", not "it has
 * never been used", and enforcing the rule against it would lock out every Mac
 * and iPhone. The guard applies only once an authenticator has proven it counts.
 */
export function isCounterAcceptable(storedCounter: number, incomingCounter: number): boolean {
  if (storedCounter === 0 && incomingCounter === 0) return true
  return incomingCounter > storedCounter
}
