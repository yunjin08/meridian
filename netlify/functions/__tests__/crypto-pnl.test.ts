import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import type { BinanceFiatPaymentsResponse, BinanceMyTrade } from '../../../src/types/binance.ts'
import type { CryptoPnlResponse } from '../../../src/types/pnl.ts'

vi.mock('../utils/auth.ts', () => ({
  requireAuth: vi.fn(() => null),
}))

vi.mock('../utils/binance-client.ts', () => {
  class BinanceError extends Error {
    constructor(public readonly code: number, message: string) {
      super(message)
    }
  }
  return { BinanceError, binanceFetch: vi.fn() }
})

vi.mock('../utils/binance-holdings.ts', () => ({
  fetchAssetTotals: vi.fn(),
  fetchPriceMap: vi.fn(),
  getAssetUsdtPrice: vi.fn((asset: string, priceMap: Map<string, number>) => priceMap.get(`${asset}USDT`) ?? null),
}))

import { requireAuth } from '../utils/auth.ts'
import { binanceFetch, BinanceError } from '../utils/binance-client.ts'
import { fetchAssetTotals, fetchPriceMap } from '../utils/binance-holdings.ts'
import { handler } from '../crypto-pnl.ts'

const NOW = 1_760_000_000_000

function trade(symbol: string, isBuyer: boolean, qty: string, quoteQty: string): BinanceMyTrade {
  return {
    symbol, id: 1, orderId: 1, price: '0', qty, quoteQty, commission: '0', commissionAsset: 'BNB',
    time: NOW - 1_000, isBuyer, isMaker: false,
  }
}

function fiatResponse(rows: BinanceFiatPaymentsResponse['data']): BinanceFiatPaymentsResponse {
  return { code: '000000', message: 'success', data: rows, total: rows?.length ?? 0, success: true }
}

function makeEvent(overrides: Partial<HandlerEvent>): HandlerEvent {
  return { httpMethod: 'GET', headers: {}, queryStringParameters: {}, body: null, ...overrides } as unknown as HandlerEvent
}

async function call(overrides: Partial<HandlerEvent> = {}) {
  const res = await handler(makeEvent(overrides), {} as never)
  if (res === undefined) throw new Error('handler returned nothing')
  return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as unknown) : null }
}

beforeEach(() => {
  vi.mocked(requireAuth).mockReturnValue(null)
  vi.mocked(binanceFetch).mockReset()
  vi.mocked(fetchAssetTotals).mockReset()
  vi.mocked(fetchPriceMap).mockReset()
})

describe('crypto-pnl handler', () => {
  it('answers preflight and guards auth', async () => {
    expect((await call({ httpMethod: 'OPTIONS' })).status).toBe(204)
    vi.mocked(requireAuth).mockReturnValue({ statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) })
    expect((await call()).status).toBe(401)
  })

  it('builds per-asset P&L from fills and fiat orders for held, non-dust assets', async () => {
    vi.mocked(fetchAssetTotals).mockResolvedValue(new Map([
      ['ETH', { free: 0.1, locked: 0 }],
      ['USDT', { free: 500, locked: 0 }],       // quote currency, skipped
      ['DUST', { free: 1, locked: 0 }],         // worth $0.10, skipped
      ['NOPAIR', { free: 3, locked: 0 }],       // no USDT pair on Binance
    ]))
    vi.mocked(fetchPriceMap).mockResolvedValue(new Map([['ETHUSDT', 2_000], ['DUSTUSDT', 0.1], ['NOPAIRUSDT', 10]]))

    vi.mocked(binanceFetch).mockImplementation(async (path: string, params: Record<string, string | number> = {}) => {
      if (path === '/api/v3/myTrades') {
        if (params['symbol'] === 'ETHUSDT') return [trade('ETHUSDT', true, '0.1', '150')] as never
        throw new BinanceError(-1121, 'Invalid symbol.')
      }
      if (path === '/sapi/v1/fiat/payments') {
        // Only the most recent BUY window carries orders; every other window is empty.
        const isBuy = params['transactionType'] === '0'
        const isLatest = params['endTime'] === NOW
        if (isBuy && isLatest) {
          return fiatResponse([
            { orderNo: 'a', sourceAmount: '5600', fiatCurrency: 'PHP', obtainAmount: '100', cryptoCurrency: 'USDT', totalFee: '0', price: '56', status: 'Completed', createTime: NOW - 5_000, updateTime: NOW },
            { orderNo: 'b', sourceAmount: '2800', fiatCurrency: 'PHP', obtainAmount: '1', cryptoCurrency: 'NOPAIR', totalFee: '0', price: '2800', status: 'Completed', createTime: NOW - 4_000, updateTime: NOW },
            { orderNo: 'c', sourceAmount: '999', fiatCurrency: 'PHP', obtainAmount: '9', cryptoCurrency: 'USDT', totalFee: '0', price: '111', status: 'Failed', createTime: NOW - 3_000, updateTime: NOW },
          ]) as never
        }
        return fiatResponse([]) as never
      }
      throw new Error(`unexpected path ${path}`)
    })

    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const res = await call()
    vi.useRealTimers()

    expect(res.status).toBe(200)
    const body = res.body as CryptoPnlResponse
    expect(body.assets.map((a) => a.asset)).toEqual(['ETH', 'NOPAIR'])

    const eth = body.assets[0]
    expect(eth?.spentUsdt).toBe(150)
    expect(eth?.currentValueUsdt).toBeCloseTo(200)
    expect(eth?.netUsdt).toBeCloseTo(50)

    const nopair = body.assets[1]
    expect(nopair?.boughtQty).toBe(1)                       // from the fiat order
    expect(nopair?.spentUsdt).toBeCloseTo(2_800 * (100 / 5_600))  // PHP cost through the USDT rate
    expect(nopair?.untrackedQty).toBeCloseTo(2)             // held 3, history explains 1

    expect(body.funding).toEqual([{ currency: 'PHP', totalIn: 8_400, totalOut: 0, usdtBought: 100, usdtSold: 0 }])
    expect(body.totals.hasUntracked).toBe(true)
    expect(body.totals.netUsdt).toBeCloseTo(50 + (30 - 50))
    expect(body.warnings).toEqual([])
    expect(body.fetchedAt).toBe(NOW)
  })

  it('degrades to spot-only P&L with a warning when fiat history fails', async () => {
    vi.mocked(fetchAssetTotals).mockResolvedValue(new Map([['ETH', { free: 0.1, locked: 0 }]]))
    vi.mocked(fetchPriceMap).mockResolvedValue(new Map([['ETHUSDT', 2_000]]))
    vi.mocked(binanceFetch).mockImplementation(async (path: string) => {
      if (path === '/api/v3/myTrades') return [trade('ETHUSDT', true, '0.1', '150')] as never
      throw new BinanceError(-1000, 'System busy')
    })

    const res = await call()
    expect(res.status).toBe(200)
    const body = res.body as CryptoPnlResponse
    expect(body.assets[0]?.netUsdt).toBeCloseTo(50)
    expect(body.funding).toEqual([])
    expect(body.warnings).toHaveLength(1)
    expect(body.warnings[0]).toMatch(/Fiat purchase history unavailable/)
  })

  it('maps Binance failures to 502', async () => {
    vi.mocked(fetchAssetTotals).mockRejectedValue(new BinanceError(-2015, 'Invalid API-key'))
    vi.mocked(fetchPriceMap).mockResolvedValue(new Map())
    vi.mocked(binanceFetch).mockResolvedValue(fiatResponse([]) as never)
    const res = await call()
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'binance_error', code: -2015, msg: 'Invalid API-key' })
  })
})
