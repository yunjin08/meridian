import type { HandlerEvent, HandlerResponse } from '@netlify/functions'
import { internalError } from './http.ts'

/**
 * Netlify injects AI Gateway credentials only into the Functions 2.0 runtime
 * (default export taking a Request), not into classic `handler` functions.
 * Rather than rewrite auth and the response helpers, the AI functions keep
 * their event-based bodies and cross the boundary through these two adapters.
 */
export async function toHandlerEvent(req: Request): Promise<HandlerEvent> {
  const url = new URL(req.url)
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  const queryStringParameters: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    queryStringParameters[key] = value
  })
  const body = req.method === 'GET' || req.method === 'HEAD' ? null : await req.text()

  return {
    rawUrl: req.url,
    rawQuery: url.search.replace(/^\?/, ''),
    path: url.pathname,
    httpMethod: req.method,
    headers,
    multiValueHeaders: {},
    queryStringParameters,
    multiValueQueryStringParameters: {},
    body,
    isBase64Encoded: false,
  }
}

export function toResponse(res: HandlerResponse): Response {
  const headers = new Headers()
  for (const [k, v] of Object.entries(res.headers ?? {})) headers.set(k, String(v))
  for (const [k, values] of Object.entries(res.multiValueHeaders ?? {})) {
    for (const v of values) headers.append(k, String(v))
  }
  const status = res.statusCode
  const body = status === 204 || status === 304 ? null : (res.body ?? null)
  return new Response(body, { status, headers })
}

type EventHandler = (event: HandlerEvent) => Promise<HandlerResponse>

/**
 * Wrap an event-based handler as a Functions 2.0 default export. An uncaught
 * throw would otherwise surface as the platform's opaque 502, so it is turned
 * into the same structured JSON error every handler already returns. The
 * dashboard has one owner behind auth, so the error message is safe to show.
 */
export function asV2(handle: EventHandler): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return toResponse(await handle(await toHandlerEvent(req)))
    } catch (err) {
      console.error('[v2] unhandled error:', err)
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      return toResponse(internalError(`unhandled: ${message}`))
    }
  }
}
