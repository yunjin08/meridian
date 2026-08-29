import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import {
  createSessionCookie,
  isPublicMarketRequest,
  requireAuthUnlessPublicMarketData,
} from './auth.ts'

function makeEvent(query: Record<string, string>, cookie?: string): HandlerEvent {
  return {
    httpMethod: 'GET',
    queryStringParameters: query,
    headers: cookie === undefined ? {} : { cookie },
  } as unknown as HandlerEvent
}

function sessionCookieHeader(): string {
  const setCookie = createSessionCookie()
  if (setCookie === null) throw new Error('session cookie not created')
  const [pair] = setCookie.split(';')
  if (pair === undefined) throw new Error('malformed cookie')
  return pair
}

describe('isPublicMarketRequest', () => {
  it('treats BTCUSDT as public regardless of case', () => {
    expect(isPublicMarketRequest(makeEvent({ symbol: 'BTCUSDT' }))).toBe(true)
    expect(isPublicMarketRequest(makeEvent({ symbol: 'btcusdt' }))).toBe(true)
  })

  it('defaults to the public symbol when none is given', () => {
    expect(isPublicMarketRequest(makeEvent({}))).toBe(true)
  })

  it('rejects every other symbol', () => {
    expect(isPublicMarketRequest(makeEvent({ symbol: 'ETHUSDT' }))).toBe(false)
    expect(isPublicMarketRequest(makeEvent({ symbol: 'BTCUSDT,ETHUSDT' }))).toBe(false)
  })
})

describe('requireAuthUnlessPublicMarketData', () => {
  const previousSecret = process.env['AUTH_SESSION_SECRET']

  beforeEach(() => {
    process.env['AUTH_SESSION_SECRET'] = 'test-secret'
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env['AUTH_SESSION_SECRET']
    else process.env['AUTH_SESSION_SECRET'] = previousSecret
  })

  it('allows anonymous BTCUSDT requests', () => {
    expect(requireAuthUnlessPublicMarketData(makeEvent({ symbol: 'BTCUSDT' }))).toBeNull()
  })

  it('returns 401 for anonymous requests on other symbols', () => {
    const response = requireAuthUnlessPublicMarketData(makeEvent({ symbol: 'ETHUSDT' }))
    expect(response?.statusCode).toBe(401)
  })

  it('allows any symbol with a valid session cookie', () => {
    const cookie = sessionCookieHeader()
    expect(requireAuthUnlessPublicMarketData(makeEvent({ symbol: 'ETHUSDT' }, cookie))).toBeNull()
  })

  it('returns 401 for a tampered session cookie on a private symbol', () => {
    const cookie = sessionCookieHeader().replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))
    const response = requireAuthUnlessPublicMarketData(makeEvent({ symbol: 'ETHUSDT' }, cookie))
    expect(response?.statusCode).toBe(401)
  })
})
