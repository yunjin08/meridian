import { describe, expect, it } from 'vitest'
import { asV2, toHandlerEvent, toResponse } from './v2.ts'
import { ok, okWithCookies, preflight, unauthorized } from './http.ts'

describe('toHandlerEvent', () => {
  it('lowercases headers, parses the query and reads a POST body', async () => {
    const req = new Request('https://x.test/api/chat?symbol=ethusdt&limit=5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'dashboard_session=abc' },
      body: '{"a":1}',
    })
    const event = await toHandlerEvent(req)
    expect(event.httpMethod).toBe('POST')
    expect(event.path).toBe('/api/chat')
    expect(event.headers['cookie']).toBe('dashboard_session=abc')
    expect(event.headers['content-type']).toBe('application/json')
    expect(event.queryStringParameters).toEqual({ symbol: 'ethusdt', limit: '5' })
    expect(event.body).toBe('{"a":1}')
  })

  it('leaves the body null on GET', async () => {
    const event = await toHandlerEvent(new Request('https://x.test/api/health'))
    expect(event.body).toBeNull()
    expect(event.queryStringParameters).toEqual({})
  })
})

describe('toResponse', () => {
  it('carries status, headers and body across', async () => {
    const res = toResponse(unauthorized('nope'))
    expect(res.status).toBe(401)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toEqual({ error: 'nope' })
  })

  it('sends an empty body for 204', async () => {
    const res = toResponse(preflight())
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })

  it('repeats Set-Cookie from multiValueHeaders', () => {
    const res = toResponse(okWithCookies({ ok: true }, ['a=1; Path=/', 'b=2; Path=/']))
    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })
})

describe('asV2', () => {
  it('turns an uncaught throw into a structured 500 instead of a platform 502', async () => {
    const fn = asV2(async () => { throw new TypeError('boom') })
    const res = await fn(new Request('https://x.test/api/thing'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'unhandled: TypeError: boom' })
  })

  it('threads a Request through an event handler', async () => {
    const fn = asV2(async (event) => ok({ method: event.httpMethod, q: event.queryStringParameters?.['x'] }))
    const res = await fn(new Request('https://x.test/api/thing?x=1', { method: 'POST', body: '' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ method: 'POST', q: '1' })
  })
})
