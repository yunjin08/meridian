import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import { createChallengeCookie, readChallengeCookie } from './auth.ts'

function eventWithCookie(cookie?: string): HandlerEvent {
  return {
    httpMethod: 'POST',
    queryStringParameters: {},
    headers: cookie === undefined ? {} : { cookie },
  } as unknown as HandlerEvent
}

/** The `name=value` pair from a Set-Cookie header, as a browser would send back. */
function cookiePair(setCookie: string | null): string {
  if (setCookie === null) throw new Error('challenge cookie not created')
  const [pair] = setCookie.split(';')
  if (pair === undefined) throw new Error('malformed cookie')
  return pair
}

describe('challenge cookie', () => {
  const original = { ...process.env }

  beforeEach(() => {
    process.env['AUTH_SESSION_SECRET'] = 'test-secret'
  })

  afterEach(() => {
    process.env = { ...original }
    vi.useRealTimers()
  })

  it('round trips the challenge it was given', () => {
    const challenge = 'Zm9vYmFyLWNoYWxsZW5nZQ'
    const event = eventWithCookie(cookiePair(createChallengeCookie(challenge)))
    expect(readChallengeCookie(event)).toBe(challenge)
  })

  it('returns null when no cookie is present', () => {
    expect(readChallengeCookie(eventWithCookie())).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const pair = cookiePair(createChallengeCookie('original-challenge'))
    const [name, token] = pair.split('=')
    const [, signature] = (token ?? '').split('.')
    const forgedPayload = Buffer.from(JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 120,
      challenge: 'attacker-challenge',
    }), 'utf8').toString('base64url')

    expect(readChallengeCookie(eventWithCookie(`${name}=${forgedPayload}.${signature}`))).toBeNull()
  })

  it('rejects a cookie signed with a different secret', () => {
    const pair = cookiePair(createChallengeCookie('original-challenge'))
    process.env['AUTH_SESSION_SECRET'] = 'a-different-secret'
    expect(readChallengeCookie(eventWithCookie(pair))).toBeNull()
  })

  it('rejects a challenge older than its two minute window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
    const pair = cookiePair(createChallengeCookie('original-challenge'))

    vi.setSystemTime(new Date('2026-09-01T00:01:59Z'))
    expect(readChallengeCookie(eventWithCookie(pair))).toBe('original-challenge')

    vi.setSystemTime(new Date('2026-09-01T00:02:01Z'))
    expect(readChallengeCookie(eventWithCookie(pair))).toBeNull()
  })

  it('is scoped to its own cookie name, not the session cookie', () => {
    const pair = cookiePair(createChallengeCookie('original-challenge'))
    expect(pair.startsWith('webauthn_challenge=')).toBe(true)
  })

  it('returns null when the signing secret is missing', () => {
    const pair = cookiePair(createChallengeCookie('original-challenge'))
    delete process.env['AUTH_SESSION_SECRET']
    expect(readChallengeCookie(eventWithCookie(pair))).toBeNull()
    expect(createChallengeCookie('another')).toBeNull()
  })
})
