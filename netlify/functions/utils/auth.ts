import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { HandlerEvent, HandlerResponse } from '@netlify/functions'
import { unauthorized } from './http.ts'

const SESSION_COOKIE_NAME = 'dashboard_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12
const SCRYPT_KEYLEN = 64

// The WebAuthn challenge issued in step one has to come back verbatim in step
// two. Signing it into a short-lived cookie keeps that round trip stateless, so
// passkeys need no table beyond the credentials themselves.
const CHALLENGE_COOKIE_NAME = 'webauthn_challenge'
const CHALLENGE_TTL_SECONDS = 120

type SessionPayload = {
  exp: number
  nonce: string
}

type ChallengePayload = {
  exp: number
  challenge: string
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function getCookieValue(event: HandlerEvent, name: string): string | null {
  const cookieHeader = event.headers['cookie'] ?? event.headers['Cookie']
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';')
  for (const rawCookie of cookies) {
    const [rawName, ...rawValue] = rawCookie.trim().split('=')
    if (rawName === name) return rawValue.join('=')
  }
  return null
}

function parsePasswordHash(rawHash: string): { salt: string; hashHex: string } | null {
  const [salt, hashHex] = rawHash.split(':')
  if (!salt || !hashHex) return null
  return { salt, hashHex }
}

function hashPassword(password: string, salt: string): Buffer {
  return scryptSync(password, salt, SCRYPT_KEYLEN)
}

export function validatePassword(password: string): boolean {
  const configuredHash = process.env['AUTH_PASSWORD_HASH']
  if (!configuredHash) {
    console.error('[auth] AUTH_PASSWORD_HASH env var is missing')
    return false
  }

  const parsed = parsePasswordHash(configuredHash)
  if (!parsed) {
    console.error('[auth] AUTH_PASSWORD_HASH must be formatted as "salt:hash"')
    return false
  }

  const expectedHash = Buffer.from(parsed.hashHex, 'hex')
  const candidateHash = hashPassword(password, parsed.salt)
  if (expectedHash.length !== candidateHash.length) return false
  return timingSafeEqual(expectedHash, candidateHash)
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function encodeToken(payload: object, secret: string): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

/**
 * Verifies the signature and returns the raw payload. Callers narrow the shape
 * themselves, because a valid signature only proves we minted the token, not
 * that it holds the fields this particular caller wants.
 */
function decodeToken(token: string, secret: string): unknown {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = sign(encodedPayload, secret)
  const expectedBuffer = Buffer.from(expectedSignature)
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length) return null
  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) return null

  try {
    return JSON.parse(base64UrlDecode(encodedPayload)) as unknown
  } catch {
    return null
  }
}

function isUnexpired(payload: { exp: number }): boolean {
  return payload.exp > Math.floor(Date.now() / 1000)
}

function decodeSession(token: string, secret: string): SessionPayload | null {
  const payload = decodeToken(token, secret) as SessionPayload | null
  if (payload === null) return null
  if (typeof payload.exp !== 'number' || typeof payload.nonce !== 'string') return null
  return payload
}

function decodeChallenge(token: string, secret: string): ChallengePayload | null {
  const payload = decodeToken(token, secret) as ChallengePayload | null
  if (payload === null) return null
  if (typeof payload.exp !== 'number' || typeof payload.challenge !== 'string') return null
  return payload
}

function secureAttribute(): string {
  return process.env['NODE_ENV'] === 'production' ? '; Secure' : ''
}

function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly${secureAttribute()}; SameSite=Strict; Max-Age=${maxAgeSeconds}`
}

export function createSessionCookie(): string | null {
  const secret = process.env['AUTH_SESSION_SECRET']
  if (!secret) {
    console.error('[auth] AUTH_SESSION_SECRET env var is missing')
    return null
  }

  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: randomBytes(16).toString('hex'),
  }
  return cookie(SESSION_COOKIE_NAME, encodeToken(payload, secret), SESSION_TTL_SECONDS)
}

export function clearSessionCookie(): string {
  return cookie(SESSION_COOKIE_NAME, '', 0)
}

export function createChallengeCookie(challenge: string): string | null {
  const secret = process.env['AUTH_SESSION_SECRET']
  if (!secret) {
    console.error('[auth] AUTH_SESSION_SECRET env var is missing')
    return null
  }

  const payload: ChallengePayload = {
    exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS,
    challenge,
  }
  return cookie(CHALLENGE_COOKIE_NAME, encodeToken(payload, secret), CHALLENGE_TTL_SECONDS)
}

export function clearChallengeCookie(): string {
  return cookie(CHALLENGE_COOKIE_NAME, '', 0)
}

/** The challenge this browser was issued, or null if absent, forged or stale. */
export function readChallengeCookie(event: HandlerEvent): string | null {
  const secret = process.env['AUTH_SESSION_SECRET']
  if (!secret) {
    console.error('[auth] AUTH_SESSION_SECRET env var is missing')
    return null
  }

  const token = getCookieValue(event, CHALLENGE_COOKIE_NAME)
  if (!token) return null

  const payload = decodeChallenge(token, secret)
  if (payload === null || !isUnexpired(payload)) return null
  return payload.challenge
}

export function isAuthorized(event: HandlerEvent): boolean {
  const secret = process.env['AUTH_SESSION_SECRET']
  if (!secret) {
    console.error('[auth] AUTH_SESSION_SECRET env var is missing')
    return false
  }

  const token = getCookieValue(event, SESSION_COOKIE_NAME)
  if (!token) return false

  const payload = decodeSession(token, secret)
  if (!payload) return false
  return isUnexpired(payload)
}

export function requireAuth(event: HandlerEvent): HandlerResponse | null {
  return isAuthorized(event) ? null : unauthorized('unauthorized')
}

// The landing page renders before login and shows live BTC market data. That
// data is public on Binance, carries nothing from the owner's account, and is
// limited to one symbol so an anonymous visitor cannot fan out requests.
export const PUBLIC_MARKET_SYMBOL = 'BTCUSDT'

export function isPublicMarketRequest(event: HandlerEvent): boolean {
  const symbol = (event.queryStringParameters?.['symbol'] ?? PUBLIC_MARKET_SYMBOL).toUpperCase()
  return symbol === PUBLIC_MARKET_SYMBOL
}

export function requireAuthUnlessPublicMarketData(event: HandlerEvent): HandlerResponse | null {
  if (isAuthorized(event)) return null
  return isPublicMarketRequest(event) ? null : unauthorized('unauthorized')
}
