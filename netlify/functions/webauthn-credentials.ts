import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { requireAuth } from './utils/auth.ts'
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

export const handler: Handler = async (event) => {
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
      return badGateway('supabase_error', { msg: err.message })
    }
    console.error('[webauthn-credentials] unexpected error:', err)
    return internalError('internal_error')
  }
}
