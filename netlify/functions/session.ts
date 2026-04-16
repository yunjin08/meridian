import type { Handler } from '@netlify/functions'
import { methodNotAllowed, ok, preflight } from './utils/http.ts'
import { isAuthorized } from './utils/auth.ts'

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  if (event.httpMethod !== 'GET') return methodNotAllowed()

  return ok({ authenticated: isAuthorized(event) })
}
