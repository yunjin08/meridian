import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { HandlerEvent, HandlerResponse } from '@netlify/functions'
import { unauthorized } from './http.ts'

const SESSION_COOKIE_NAME = 'dashboard_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12
const SCRYPT_KEYLEN = 64

type SessionPayload = {
  exp: number
  nonce: string
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

function encodeSession(payload: SessionPayload, secret: string): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

function decodeSession(token: string, secret: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = sign(encodedPayload, secret)
  const expectedBuffer = Buffer.from(expectedSignature)
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length) return null
  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload
    if (typeof payload.exp !== 'number' || typeof payload.nonce !== 'string') return null
    return payload
  } catch {
    return null
  }
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
  const token = encodeSession(payload, secret)
  const secureAttr = process.env['NODE_ENV'] === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly${secureAttr}; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`
}

export function clearSessionCookie(): string {
  const secureAttr = process.env['NODE_ENV'] === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly${secureAttr}; SameSite=Strict; Max-Age=0`
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
  return payload.exp > Math.floor(Date.now() / 1000)
}

export function requireAuth(event: HandlerEvent): HandlerResponse | null {
  return isAuthorized(event) ? null : unauthorized('unauthorized')
}
