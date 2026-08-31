import { describe, expect, it } from 'vitest'
import { shouldAutoPrompt } from '@/lib/passkeyPreference'

const capable = {
  browserSupportsWebAuthn: true,
  platformAuthenticatorAvailable: true,
  registeredOnThisBrowser: true,
}

describe('shouldAutoPrompt', () => {
  it('fires when the browser can do it and has done it before', () => {
    expect(shouldAutoPrompt(capable)).toBe(true)
  })

  it('stays quiet on a browser that has never registered', () => {
    expect(shouldAutoPrompt({ ...capable, registeredOnThisBrowser: false })).toBe(false)
  })

  it('stays quiet without a platform authenticator', () => {
    expect(shouldAutoPrompt({ ...capable, platformAuthenticatorAvailable: false })).toBe(false)
  })

  it('stays quiet where WebAuthn is unsupported', () => {
    expect(shouldAutoPrompt({ ...capable, browserSupportsWebAuthn: false })).toBe(false)
  })
})
