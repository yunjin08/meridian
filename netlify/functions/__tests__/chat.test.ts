import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import type { ChatApiResponse, DashboardContext } from '../../../src/types/chat.ts'

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
  },
}))

vi.mock('../utils/auth.ts', () => ({
  requireAuth: vi.fn(() => null),
}))

vi.mock('../utils/chat-tools.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/chat-tools.ts')>()
  return { ...actual, executeReadTool: vi.fn() }
})

import { executeReadTool } from '../utils/chat-tools.ts'
import { handleEvent as handler } from '../chat.ts'

const context = {
  activeSymbol: 'BTCUSDT',
  price: { price: 78_000, changePercent: 1, high24h: 79_000, low24h: 77_000, connectionStatus: 'connected' },
  cryptoHoldings: [],
  totalCryptoUsdt: null,
  stockHoldings: [],
  stockAccount: null,
  chart: { timeframe: '1h', lastCandle: null, rsi: null, macd: null, bb: null },
  alerts: [],
} satisfies DashboardContext

function event(body: unknown): HandlerEvent {
  return { httpMethod: 'POST', body: JSON.stringify(body), headers: {} } as unknown as HandlerEvent
}

function ask(text: string) {
  return event({ messages: [{ role: 'user', content: text }], context })
}

const endTurn = (text: string) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text }],
})

const toolUse = (calls: Array<{ id: string; name: string; input: unknown }>) => ({
  stop_reason: 'tool_use',
  content: calls.map((c) => ({ type: 'tool_use', ...c })),
})

beforeEach(() => {
  createMock.mockReset()
  vi.mocked(executeReadTool).mockReset()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test')
})

describe('chat handler tool loop', () => {
  it('executes a read tool, feeds the result back, and reports the lookup', async () => {
    vi.mocked(executeReadTool).mockResolvedValue({
      content: 'US macro snapshot: Fed funds 4.33%',
      lookup: { name: 'get_macro_snapshot', summary: 'US macro snapshot' },
    })
    createMock
      .mockResolvedValueOnce(toolUse([{ id: 't1', name: 'get_macro_snapshot', input: {} }]))
      .mockResolvedValueOnce(endTurn('The Fed funds rate is 4.33%.'))

    const res = await handler(ask('what is the fed funds rate'))
    const body = JSON.parse(res?.body ?? '{}') as ChatApiResponse

    expect(res?.statusCode).toBe(200)
    expect(body.reply).toBe('The Fed funds rate is 4.33%.')
    expect(body.lookups).toEqual([{ name: 'get_macro_snapshot', summary: 'US macro snapshot' }])
    expect(body.appliedTools).toEqual([])

    // The second model call must carry the real tool result, not "Applied".
    const secondCall = createMock.mock.calls[1]?.[0] as { messages: Array<{ role: string; content: unknown }> }
    const toolResultTurn = secondCall.messages.at(-1)
    expect(toolResultTurn?.role).toBe('user')
    expect(JSON.stringify(toolResultTurn?.content)).toContain('Fed funds 4.33%')
  })

  it('records write tools for the browser without executing them', async () => {
    createMock
      .mockResolvedValueOnce(
        toolUse([{ id: 't1', name: 'add_alert', input: { label: 'x', symbol: 'BTCUSDT', condition: { type: 'price_below', threshold: 70_000 } } }])
      )
      .mockResolvedValueOnce(endTurn('Alert created.'))

    const res = await handler(ask('alert me under 70k'))
    const body = JSON.parse(res?.body ?? '{}') as ChatApiResponse

    expect(body.appliedTools).toHaveLength(1)
    expect(body.appliedTools[0]?.name).toBe('add_alert')
    expect(body.lookups).toEqual([])
    expect(executeReadTool).not.toHaveBeenCalled()
  })

  it('handles a lookup followed by a write in one conversation turn', async () => {
    vi.mocked(executeReadTool).mockResolvedValue({
      content: 'ETHUSDT 4h: Bollinger lower $4,000',
      lookup: { name: 'get_candles', summary: 'ETHUSDT 4h, 100 candles' },
    })
    createMock
      .mockResolvedValueOnce(toolUse([{ id: 't1', name: 'get_candles', input: { symbol: 'ETHUSDT', interval: '4h' } }]))
      .mockResolvedValueOnce(
        toolUse([{ id: 't2', name: 'add_alert', input: { label: 'ETH BB', symbol: 'ETHUSDT', condition: { type: 'price_below', threshold: 4_000 } } }])
      )
      .mockResolvedValueOnce(endTurn('Set an alert at the 4h lower band, $4,000.'))

    const res = await handler(ask('alert me if ETH drops under the 4h lower band'))
    const body = JSON.parse(res?.body ?? '{}') as ChatApiResponse

    expect(body.lookups.map((l) => l.name)).toEqual(['get_candles'])
    expect(body.appliedTools.map((t) => t.name)).toEqual(['add_alert'])
    expect(createMock).toHaveBeenCalledTimes(3)
  })

  it('stops at the iteration cap and still returns a reply', async () => {
    vi.mocked(executeReadTool).mockResolvedValue({
      content: 'data',
      lookup: { name: 'get_crypto_market', summary: 'crypto market, BTCUSDT funding' },
    })
    createMock.mockResolvedValue(toolUse([{ id: 't', name: 'get_crypto_market', input: {} }]))

    const res = await handler(ask('loop forever'))
    const body = JSON.parse(res?.body ?? '{}') as ChatApiResponse

    expect(createMock).toHaveBeenCalledTimes(5)
    expect(body.reply).toBe('Could not complete the request.')
    expect(body.lookups).toHaveLength(5)
  })
})
