import type { HandlerResponse } from '@netlify/functions'

export const STATUS = {
  OK: 200,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  METHOD_NOT_ALLOWED: 405,
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

export function ok(body: unknown): HandlerResponse {
  return { statusCode: STATUS.OK, headers: corsHeaders(), body: JSON.stringify(body) }
}

export function badRequest(error: string): HandlerResponse {
  return { statusCode: STATUS.BAD_REQUEST, headers: corsHeaders(), body: JSON.stringify({ error }) }
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
