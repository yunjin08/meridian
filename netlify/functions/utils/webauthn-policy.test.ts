import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deviceLabelFromUserAgent,
  getWebAuthnConfig,
  isCounterAcceptable,
  WebAuthnConfigError,
} from './webauthn-policy.ts'

describe('getWebAuthnConfig', () => {
  const original = { ...process.env }

  beforeEach(() => {
    delete process.env['WEBAUTHN_RP_ID']
    delete process.env['WEBAUTHN_ORIGIN']
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it('returns the configured relying party and origin', () => {
    process.env['WEBAUTHN_RP_ID'] = 'meridian.example'
    process.env['WEBAUTHN_ORIGIN'] = 'https://meridian.example'
    expect(getWebAuthnConfig()).toEqual({ rpID: 'meridian.example', origin: 'https://meridian.example' })
  })

  it('throws when either value is missing', () => {
    expect(() => getWebAuthnConfig()).toThrow(WebAuthnConfigError)
    process.env['WEBAUTHN_RP_ID'] = 'meridian.example'
    expect(() => getWebAuthnConfig()).toThrow(WebAuthnConfigError)
  })
})

describe('deviceLabelFromUserAgent', () => {
  it('names the platform and browser for a Mac running Safari', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    expect(deviceLabelFromUserAgent(ua)).toBe('macOS, Safari')
  })

  it('picks Chrome over Safari, which Chrome also claims to be', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(deviceLabelFromUserAgent(ua)).toBe('macOS, Chrome')
  })

  it('picks Edge over Chrome, which Edge also claims to be', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    expect(deviceLabelFromUserAgent(ua)).toBe('Windows, Edge')
  })

  it('recognises an iPhone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(deviceLabelFromUserAgent(ua)).toBe('iPhone, Safari')
  })

  it('falls back when the user agent is absent or unrecognised', () => {
    expect(deviceLabelFromUserAgent(undefined)).toBe('Unknown device')
    expect(deviceLabelFromUserAgent('curl/8.4.0')).toBe('Unknown device')
  })
})

describe('isCounterAcceptable', () => {
  it('accepts an advancing counter', () => {
    expect(isCounterAcceptable(4, 5)).toBe(true)
  })

  it('rejects a repeated or rewound counter, which signals a replay', () => {
    expect(isCounterAcceptable(5, 5)).toBe(false)
    expect(isCounterAcceptable(5, 4)).toBe(false)
  })

  it('accepts a permanent zero, which is how Apple authenticators report', () => {
    expect(isCounterAcceptable(0, 0)).toBe(true)
  })

  it('still enforces the rule once an authenticator has proven it counts', () => {
    expect(isCounterAcceptable(1, 0)).toBe(false)
  })
})
