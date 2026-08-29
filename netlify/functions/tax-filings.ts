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
import { deleteFiling, listFilings, SupabaseRepoError, upsertFiling } from './utils/tax-repo.ts'
import { parseFilingInput, parseJsonBody, parsePeriodParam, parseYearParam } from './utils/tax-validation.ts'

async function handleGet(event: HandlerEvent): Promise<HandlerResponse> {
  const year = parseYearParam(event.queryStringParameters?.['year'])
  if (!year.ok) return badRequest(year.error)
  const filings = await listFilings(year.value)
  return ok({ filings })
}

async function handlePut(event: HandlerEvent): Promise<HandlerResponse> {
  const json = parseJsonBody(event.body)
  if (!json.ok) return badRequest(json.error)
  const input = parseFilingInput(json.value)
  if (!input.ok) return badRequest(input.error)
  const filing = await upsertFiling(input.value)
  return ok({ filing })
}

async function handleDelete(event: HandlerEvent): Promise<HandlerResponse> {
  const year = parseYearParam(event.queryStringParameters?.['year'])
  if (!year.ok) return badRequest(year.error)
  if (year.value === null) return badRequest('year is required')
  const period = parsePeriodParam(event.queryStringParameters?.['period'])
  if (!period.ok) return badRequest(period.error)
  const removed = await deleteFiling(year.value, period.value)
  return removed ? noContent() : notFound()
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    switch (event.httpMethod) {
      case 'GET':    return await handleGet(event)
      case 'PUT':    return await handlePut(event)
      case 'DELETE': return await handleDelete(event)
      default:       return methodNotAllowed()
    }
  } catch (err) {
    if (err instanceof SupabaseRepoError) {
      return badGateway('supabase_error', { msg: err.message })
    }
    console.error('[tax-filings] unexpected error:', err)
    return internalError('internal_error')
  }
}
