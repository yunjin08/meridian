import type { HandlerResponse } from '@netlify/functions'

export const STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  METHOD_NOT_ALLOWED: 405,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
} as const

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
} as const

export function corsHeaders(): typeof CORS_HEADERS {
  return CORS_HEADERS
}

export function preflight(): HandlerResponse {
  return { statusCode: STATUS.NO_CONTENT, headers: corsHeaders(), body: '' }
}

function withHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  return extraHeaders === undefined ? { ...corsHeaders() } : { ...corsHeaders(), ...extraHeaders }
}

export function ok(body: unknown, extraHeaders?: Record<string, string>): HandlerResponse {
  return { statusCode: STATUS.OK, headers: withHeaders(extraHeaders), body: JSON.stringify(body) }
}

/**
 * Set-Cookie is the one header a response may legitimately repeat, and a plain
 * header record cannot hold two of them. Netlify merges multiValueHeaders with
 * headers, so the CORS and content-type headers still apply.
 */
export function okWithCookies(body: unknown, cookies: string[]): HandlerResponse {
  return {
    statusCode: STATUS.OK,
    headers: corsHeaders(),
    multiValueHeaders: { 'Set-Cookie': cookies },
    body: JSON.stringify(body),
  }
}

export function created(body: unknown, extraHeaders?: Record<string, string>): HandlerResponse {
  return { statusCode: STATUS.CREATED, headers: withHeaders(extraHeaders), body: JSON.stringify(body) }
}

export function noContent(): HandlerResponse {
  return { statusCode: STATUS.NO_CONTENT, headers: corsHeaders(), body: '' }
}

export function notFound(error = 'not_found'): HandlerResponse {
  return { statusCode: STATUS.NOT_FOUND, headers: corsHeaders(), body: JSON.stringify({ error }) }
}

export function badRequest(error: string, extraHeaders?: Record<string, string>): HandlerResponse {
  return { statusCode: STATUS.BAD_REQUEST, headers: withHeaders(extraHeaders), body: JSON.stringify({ error }) }
}

export function unauthorized(error = 'unauthorized', extraHeaders?: Record<string, string>): HandlerResponse {
  return { statusCode: STATUS.UNAUTHORIZED, headers: withHeaders(extraHeaders), body: JSON.stringify({ error }) }
}

export function methodNotAllowed(): HandlerResponse {
  return {
    statusCode: STATUS.METHOD_NOT_ALLOWED,
    headers: corsHeaders(),
    body: JSON.stringify({ error: 'Method not allowed' }),
  }
}

export function internalError(error: string): HandlerResponse {
  return { statusCode: STATUS.INTERNAL_ERROR, headers: corsHeaders(), body: JSON.stringify({ error }) }
}

export function badGateway(error: string, details?: { code?: number; msg?: string }): HandlerResponse {
  return {
    statusCode: STATUS.BAD_GATEWAY,
    headers: corsHeaders(),
    body: JSON.stringify({ error, ...details }),
  }
}
