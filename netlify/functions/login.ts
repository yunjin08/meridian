import type { Handler } from '@netlify/functions'
import { badRequest, internalError, methodNotAllowed, ok, preflight, unauthorized } from './utils/http.ts'
import { createSessionCookie, validatePassword } from './utils/auth.ts'

type LoginRequest = {
  password?: string
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  if (event.httpMethod !== 'POST') return methodNotAllowed()

  let body: LoginRequest
  try {
    body = JSON.parse(event.body ?? '{}') as LoginRequest
  } catch {
    return badRequest('Invalid JSON body')
  }

  const password = body.password?.trim()
  if (!password) return badRequest('password is required')
  if (!validatePassword(password)) return unauthorized('invalid_credentials')

  const cookie = createSessionCookie()
  if (!cookie) return internalError('auth_not_configured')

  return ok({ authenticated: true }, { 'Set-Cookie': cookie })
}
