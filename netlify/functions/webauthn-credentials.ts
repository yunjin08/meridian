import type { Config, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { requireAuth } from './utils/auth.ts'
import { asV2 } from './utils/v2.ts'
import {
  badGateway,
  badRequest,
  internalError,
  methodNotAllowed,
  noContent,
  notFound,
  ok,
  preflight,
} from './utils/http.ts'
import { deleteCredential, listCredentials, WebAuthnRepoError } from './utils/webauthn-repo.ts'

async function handleGet(): Promise<HandlerResponse> {
  return ok({ credentials: await listCredentials() })
}

async function handleDelete(event: HandlerEvent): Promise<HandlerResponse> {
  const id = event.queryStringParameters?.['id']
  if (id === undefined || id.trim() === '') return badRequest('id is required')

  return (await deleteCredential(id)) ? noContent() : notFound()
}

async function handleEvent(event: HandlerEvent): Promise<HandlerResponse> {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    switch (event.httpMethod) {
      case 'GET':    return await handleGet()
      case 'DELETE': return await handleDelete(event)
      default:       return methodNotAllowed()
    }
  } catch (err) {
    if (err instanceof WebAuthnRepoError) {
      return badGateway('database_error', { msg: err.message })
    }
    console.error('[webauthn-credentials] unexpected error:', err)
    return internalError('internal_error')
  }
}

// Functions 2.0 entry point: Netlify Database only injects NETLIFY_DB_URL
// into this runtime, never into a classic handler export — same platform
// limitation as the AI Gateway credentials (see CLAUDE.md rule 12).
export default asV2(handleEvent)

export const config: Config = { path: '/api/webauthn-credentials' }
