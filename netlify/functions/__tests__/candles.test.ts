import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import type { BinanceKlineArray } from '../../../src/types/binance.ts'
import type { CandlesResponse } from '../../../src/types/candle.ts'

vi.mock('../utils/auth.ts', () => ({
  isAuthorized: vi.fn(() => true),
  isPublicMarketRequest: vi.fn(() => false),
}))

vi.mock('../utils/binance-client.ts', () => {
  class BinanceError extends Error {
    constructor(public readonly code: number, message: string) {
      super(message)
    }
  }
  return { BinanceError, binancePublicFetch: vi.fn() }
})

import { binancePublicFetch, BinanceError } from '../utils/binance-client.ts'
import { handler } from '../candles.ts'

function kline(openTimeMs: number, close: number): BinanceKlineArray {
  return [
    openTimeMs, '100', '110', '90', String(close), '5', openTimeMs + 3_599_999,
    '500', 10, '2', '200', '0',
  ] as unknown as BinanceKlineArray
}

function event(params: Record<string, string>): HandlerEvent {
  return { httpMethod: 'GET', queryStringParameters: params, headers: {} } as unknown as HandlerEvent
}

beforeEach(() => {
  vi.mocked(binancePublicFetch).mockReset()
})

describe('GET /api/candles', () => {
  it('returns ascending candles with indicators through the shared kline module', async () => {
    // Out of order on purpose: the module must sort by open time.
    vi.mocked(binancePublicFetch).mockResolvedValue([kline(2_000_000, 102), kline(1_000_000, 101)])

    const res = await handler(event({ symbol: 'ethusdt', interval: '1h', limit: '50' }), {} as never)
    const body = JSON.parse(res?.body ?? '{}') as CandlesResponse

    expect(res?.statusCode).toBe(200)
    expect(binancePublicFetch).toHaveBeenCalledWith('/api/v3/klines', { symbol: 'ETHUSDT', interval: '1h', limit: 50 })
    expect(body.candles.map((c) => c.time)).toEqual([1_000, 2_000])
    expect(body.candles[1]?.close).toBe(102)
    expect(body.indicators.rsi).toHaveLength(2)
    expect(body.interval).toBe('1h')
  })

  it('rejects an unknown interval before calling Binance', async () => {
    const res = await handler(event({ interval: '7h' }), {} as never)
    expect(res?.statusCode).toBe(400)
    expect(binancePublicFetch).not.toHaveBeenCalled()
  })

  it('maps a Binance error to a 502 with its code', async () => {
    vi.mocked(binancePublicFetch).mockRejectedValue(new BinanceError(-1121, 'Invalid symbol.'))
    const res = await handler(event({ symbol: 'FOO' }), {} as never)
    expect(res?.statusCode).toBe(502)
    expect(JSON.parse(res?.body ?? '{}')).toMatchObject({ error: 'binance_error', code: -1121 })
  })

  it('treats an empty kline list as an upstream failure', async () => {
    vi.mocked(binancePublicFetch).mockResolvedValue([])
    const res = await handler(event({}), {} as never)
    expect(res?.statusCode).toBe(502)
  })
})
