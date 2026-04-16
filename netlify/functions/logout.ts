import type { Handler } from '@netlify/functions'
import { methodNotAllowed, ok, preflight } from './utils/http.ts'
import { clearSessionCookie } from './utils/auth.ts'

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  if (event.httpMethod !== 'POST') return methodNotAllowed()

  return ok({ authenticated: false }, { 'Set-Cookie': clearSessionCookie() })
}
