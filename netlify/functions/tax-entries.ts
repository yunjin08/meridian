import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { requireAuth } from './utils/auth.ts'
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
import { deleteEntry, insertEntry, listEntries, SupabaseRepoError, updateEntry } from './utils/tax-repo.ts'
import { parseEntryInput, parseJsonBody, parseUuidParam, parseYearParam } from './utils/tax-validation.ts'

async function handleGet(event: HandlerEvent): Promise<HandlerResponse> {
  const year = parseYearParam(event.queryStringParameters?.['year'])
  if (!year.ok) return badRequest(year.error)
  const entries = await listEntries(year.value)
  return ok({ entries })
}

async function handlePost(event: HandlerEvent): Promise<HandlerResponse> {
  const json = parseJsonBody(event.body)
  if (!json.ok) return badRequest(json.error)
  const input = parseEntryInput(json.value)
  if (!input.ok) return badRequest(input.error)
  const entry = await insertEntry(input.value)
  return created({ entry })
}

async function handlePut(event: HandlerEvent): Promise<HandlerResponse> {
  const id = parseUuidParam(event.queryStringParameters?.['id'])
  if (!id.ok) return badRequest(id.error)
  const json = parseJsonBody(event.body)
  if (!json.ok) return badRequest(json.error)
  const input = parseEntryInput(json.value)
  if (!input.ok) return badRequest(input.error)
  const entry = await updateEntry(id.value, input.value)
  if (entry === null) return notFound()
  return ok({ entry })
}

async function handleDelete(event: HandlerEvent): Promise<HandlerResponse> {
  const id = parseUuidParam(event.queryStringParameters?.['id'])
  if (!id.ok) return badRequest(id.error)
  const removed = await deleteEntry(id.value)
  return removed ? noContent() : notFound()
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    switch (event.httpMethod) {
      case 'GET':    return await handleGet(event)
      case 'POST':   return await handlePost(event)
      case 'PUT':    return await handlePut(event)
      case 'DELETE': return await handleDelete(event)
      default:       return methodNotAllowed()
    }
  } catch (err) {
    if (err instanceof SupabaseRepoError) {
      return badGateway('supabase_error', { msg: err.message })
    }
    console.error('[tax-entries] unexpected error:', err)
    return internalError('internal_error')
  }
}
