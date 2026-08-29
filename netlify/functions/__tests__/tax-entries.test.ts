import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import type { TaxIncomeEntry } from '../../../src/types/tax.ts'

vi.mock('../utils/auth.ts', () => ({
  requireAuth: vi.fn(() => null),
}))

vi.mock('../utils/tax-repo.ts', () => {
  class SupabaseRepoError extends Error {}
  return {
    SupabaseRepoError,
    listEntries: vi.fn(),
    insertEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  }
})

import { requireAuth } from '../utils/auth.ts'
import * as repo from '../utils/tax-repo.ts'
import { handler } from '../tax-entries.ts'

const entry: TaxIncomeEntry = {
  id: '6f1c2a3e-4b5d-4c6e-8f7a-9b0c1d2e3f4a',
  receivedOn: '2026-03-05',
  source: 'Acme',
  amountPhp: 1500.5,
  note: null,
  createdAt: '2026-03-05T00:00:00Z',
  updatedAt: '2026-03-05T00:00:00Z',
}

function makeEvent(overrides: Partial<HandlerEvent>): HandlerEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {},
    body: null,
    ...overrides,
  } as unknown as HandlerEvent
}

async function call(overrides: Partial<HandlerEvent>) {
  const res = await handler(makeEvent(overrides), {} as never)
  if (res === undefined) throw new Error('handler returned nothing')
  return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as unknown) : null }
}

beforeEach(() => {
  vi.mocked(requireAuth).mockReturnValue(null)
  vi.mocked(repo.listEntries).mockReset()
  vi.mocked(repo.insertEntry).mockReset()
  vi.mocked(repo.updateEntry).mockReset()
  vi.mocked(repo.deleteEntry).mockReset()
})

describe('tax-entries handler', () => {
  it('answers preflight', async () => {
    expect((await call({ httpMethod: 'OPTIONS' })).status).toBe(204)
  })

  it('rejects unauthenticated requests', async () => {
    vi.mocked(requireAuth).mockReturnValue({ statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) })
    expect((await call({ httpMethod: 'GET' })).status).toBe(401)
  })

  it('rejects unsupported methods', async () => {
    expect((await call({ httpMethod: 'PATCH' })).status).toBe(405)
  })

  it('lists entries, optionally by year', async () => {
    vi.mocked(repo.listEntries).mockResolvedValue([entry])
    const all = await call({ httpMethod: 'GET' })
    expect(all.status).toBe(200)
    expect(all.body).toEqual({ entries: [entry] })
    expect(repo.listEntries).toHaveBeenLastCalledWith(null)

    await call({ httpMethod: 'GET', queryStringParameters: { year: '2026' } })
    expect(repo.listEntries).toHaveBeenLastCalledWith(2026)

    const bad = await call({ httpMethod: 'GET', queryStringParameters: { year: 'abc' } })
    expect(bad.status).toBe(400)
  })

  it('creates an entry', async () => {
    vi.mocked(repo.insertEntry).mockResolvedValue(entry)
    const res = await call({
      httpMethod: 'POST',
      body: JSON.stringify({ receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1500.5 }),
    })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ entry })
    expect(repo.insertEntry).toHaveBeenCalledWith({ receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1500.5, note: null })
  })

  it('rejects an invalid create body with the validation message', async () => {
    const res = await call({ httpMethod: 'POST', body: JSON.stringify({ receivedOn: 'nope', source: 'Acme', amountPhp: 1 }) })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'receivedOn must be a valid YYYY-MM-DD date' })
    expect(repo.insertEntry).not.toHaveBeenCalled()
  })

  it('updates an entry and reports missing ids', async () => {
    vi.mocked(repo.updateEntry).mockResolvedValue(entry)
    const ok = await call({
      httpMethod: 'PUT',
      queryStringParameters: { id: entry.id },
      body: JSON.stringify({ receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1500.5 }),
    })
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ entry })

    vi.mocked(repo.updateEntry).mockResolvedValue(null)
    const missing = await call({
      httpMethod: 'PUT',
      queryStringParameters: { id: entry.id },
      body: JSON.stringify({ receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1 }),
    })
    expect(missing.status).toBe(404)

    const badId = await call({ httpMethod: 'PUT', queryStringParameters: { id: '1' }, body: '{}' })
    expect(badId.status).toBe(400)
  })

  it('deletes an entry', async () => {
    vi.mocked(repo.deleteEntry).mockResolvedValue(true)
    expect((await call({ httpMethod: 'DELETE', queryStringParameters: { id: entry.id } })).status).toBe(204)

    vi.mocked(repo.deleteEntry).mockResolvedValue(false)
    expect((await call({ httpMethod: 'DELETE', queryStringParameters: { id: entry.id } })).status).toBe(404)
  })

  it('maps repository failures to 502', async () => {
    vi.mocked(repo.listEntries).mockRejectedValue(new repo.SupabaseRepoError('connection refused'))
    const res = await call({ httpMethod: 'GET' })
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'supabase_error', msg: 'connection refused' })
  })
})
