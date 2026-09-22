import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaxFiling } from '../../../src/types/tax.ts'

vi.mock('../utils/auth.ts', () => ({
  requireAuth: vi.fn(() => null),
}))

vi.mock('../utils/tax-repo.ts', () => {
  class TaxRepoError extends Error {}
  return {
    TaxRepoError,
    listFilings: vi.fn(),
    upsertFiling: vi.fn(),
    deleteFiling: vi.fn(),
  }
})

import { requireAuth } from '../utils/auth.ts'
import * as repo from '../utils/tax-repo.ts'
import handler from '../tax-filings.ts'

const filing: TaxFiling = { taxYear: 2026, period: 'Q1', filedOn: '2026-05-10', amountPaidPhp: 4000 }

interface CallOptions {
  method?: string
  query?: Record<string, string>
  body?: string
}

function makeRequest({ method = 'GET', query = {}, body }: CallOptions): Request {
  const url = new URL('http://localhost/api/tax-filings')
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return new Request(url, { method, body: method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? undefined : body })
}

async function call(options: CallOptions) {
  const res = await handler(makeRequest(options))
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null }
}

beforeEach(() => {
  vi.mocked(requireAuth).mockReturnValue(null)
  vi.mocked(repo.listFilings).mockReset()
  vi.mocked(repo.upsertFiling).mockReset()
  vi.mocked(repo.deleteFiling).mockReset()
})

describe('tax-filings handler', () => {
  it('answers preflight and guards auth and methods', async () => {
    expect((await call({ method: 'OPTIONS' })).status).toBe(204)
    expect((await call({ method: 'POST' })).status).toBe(405)
    vi.mocked(requireAuth).mockReturnValue({ statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) })
    expect((await call({ method: 'GET' })).status).toBe(401)
  })

  it('lists filings, optionally by year', async () => {
    vi.mocked(repo.listFilings).mockResolvedValue([filing])
    const res = await call({ method: 'GET', query: { year: '2026' } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ filings: [filing] })
    expect(repo.listFilings).toHaveBeenLastCalledWith(2026)
  })

  it('upserts a filing', async () => {
    vi.mocked(repo.upsertFiling).mockResolvedValue(filing)
    const res = await call({ method: 'PUT', body: JSON.stringify(filing) })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ filing })
    expect(repo.upsertFiling).toHaveBeenCalledWith(filing)
  })

  it('rejects an invalid filing body', async () => {
    const res = await call({ method: 'PUT', body: JSON.stringify({ ...filing, period: 'Q4' }) })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'period must be one of Q1, Q2, Q3, ANNUAL' })
  })

  it('deletes a filing by year and period', async () => {
    vi.mocked(repo.deleteFiling).mockResolvedValue(true)
    expect((await call({ method: 'DELETE', query: { year: '2026', period: 'Q1' } })).status).toBe(204)
    expect(repo.deleteFiling).toHaveBeenCalledWith(2026, 'Q1')

    vi.mocked(repo.deleteFiling).mockResolvedValue(false)
    expect((await call({ method: 'DELETE', query: { year: '2026', period: 'Q1' } })).status).toBe(404)

    expect((await call({ method: 'DELETE', query: { period: 'Q1' } })).status).toBe(400)
    expect((await call({ method: 'DELETE', query: { year: '2026' } })).status).toBe(400)
  })

  it('maps repository failures to 502', async () => {
    vi.mocked(repo.listFilings).mockRejectedValue(new repo.TaxRepoError('timeout'))
    const res = await call({ method: 'GET' })
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'database_error', msg: 'timeout' })
  })
})
