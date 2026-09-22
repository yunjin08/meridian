import type { Config, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { requireAuth } from './utils/auth.ts'
import { asV2 } from './utils/v2.ts'
import {
  badGateway,
  badRequest,
  created,
  internalError,
  methodNotAllowed,
  noContent,
  notFound,
  ok,
  preflight,
} from './utils/http.ts'
import {
  clearTriggered,
  deleteAlert,
  insertAlert,
  listAlerts,
  setActive,
  updateAlert,
  AlertRepoError,
} from './utils/alert-repo.ts'
import { parseAlertInput, parseJsonBody, parsePatchInput, parseUuidParam } from './utils/alert-validation.ts'

async function handleGet(): Promise<HandlerResponse> {
  const alerts = await listAlerts()
  return ok({ alerts })
}

async function handlePost(event: HandlerEvent): Promise<HandlerResponse> {
  const json = parseJsonBody(event.body)
  if (!json.ok) return badRequest(json.error)
  const input = parseAlertInput(json.value)
  if (!input.ok) return badRequest(input.error)
  const alert = await insertAlert(input.value)
  return created({ alert })
}

async function handlePut(event: HandlerEvent): Promise<HandlerResponse> {
  const id = parseUuidParam(event.queryStringParameters?.['id'])
  if (!id.ok) return badRequest(id.error)
  const json = parseJsonBody(event.body)
  if (!json.ok) return badRequest(json.error)
  const patch = parsePatchInput(json.value)
  if (!patch.ok) return badRequest(patch.error)

  const alert =
    'reset' in patch.value
      ? await clearTriggered(id.value)
      : 'edit' in patch.value
        ? await updateAlert(id.value, patch.value.edit)
        : await setActive(id.value, patch.value.active)
  if (alert === null) return notFound()
  return ok({ alert })
}

async function handleDelete(event: HandlerEvent): Promise<HandlerResponse> {
  const id = parseUuidParam(event.queryStringParameters?.['id'])
  if (!id.ok) return badRequest(id.error)
  const removed = await deleteAlert(id.value)
  return removed ? noContent() : notFound()
}

async function handleEvent(event: HandlerEvent): Promise<HandlerResponse> {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    switch (event.httpMethod) {
      case 'GET':    return await handleGet()
      case 'POST':   return await handlePost(event)
      case 'PUT':    return await handlePut(event)
      case 'DELETE': return await handleDelete(event)
      default:       return methodNotAllowed()
    }
  } catch (err) {
    if (err instanceof AlertRepoError) {
      return badGateway('database_error', { msg: err.message })
    }
    console.error('[alerts] unexpected error:', err)
    return internalError('internal_error')
  }
}

// Functions 2.0 entry point: Netlify Database only injects NETLIFY_DB_URL
// into this runtime, never into a classic handler export — same platform
// limitation as the AI Gateway credentials (see CLAUDE.md rule 12).
export default asV2(handleEvent)

export const config: Config = { path: '/api/alerts' }
