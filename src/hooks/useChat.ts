import { useState, useCallback, useEffect } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useBalanceStore } from '@/store/balanceStore'
import { useChartStore } from '@/store/chartStore'
import { useAlertStore } from '@/store/alertStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { useNavigationStore } from '@/store/navigationStore'
import { useTaxStore } from '@/store/taxStore'
import { lastValue } from '@/lib/formatters'
import { summarisePortfolio } from '@/lib/portfolioSummary'
import { summarisePnl } from '@/lib/pnlSummary'
import { actionableDeadline, summarisePeriods, todayIso } from '@/lib/tax'
import { loadChatHistory, saveChatHistory } from '@/lib/chatHistory'
import { useCryptoPnlStore } from '@/store/cryptoPnlStore'
import type { AlertCondition } from '@/types/alert'
import type { TaxPeriod } from '@/types/tax'
import type { ChatMessage, DashboardContext, ChatApiResponse, AppliedTool, ChatPnlContext, ChatPortfolioContext, ChatTaxContext, ChatStreamEvent } from '@/types/chat'

// Enough recent entries for the model to reference by id without dumping a
// whole year of receipts into every turn; period summaries below are never capped.
const TAX_ENTRY_ROW_LIMIT = 10

// Enough rows for the model to name the biggest winners and losers without
// pushing every dust holding into the prompt.
const PNL_ROW_LIMIT = 8

function buildPortfolioContext(): ChatPortfolioContext | null {
  const balance = useBalanceStore.getState().balance
  const cryptoHoldings = useCryptoHoldingsStore.getState().holdings
  const prices = usePriceStore.getState().prices
  const stocks = usePortfolioStore.getState().stocks
  const quotes = useStockQuoteStore.getState().quotes
  const { positions, account, fetchedAt } = useStockPositionsStore.getState()
  if (!balance && cryptoHoldings.length === 0 && stocks.length === 0) return null

  const summary = summarisePortfolio({
    balance, cryptoHoldings, prices, stocks, quotes, positions, account, positionsFetchedAt: fetchedAt,
  })
  return {
    total: summary.total,
    totalCurrency: summary.totalCurrency,
    isMixedCurrency: summary.isMixedCurrency,
    change24hUsd: summary.change24hUsd,
    change24hPercent: summary.change24hPercent,
    classes: (['crypto', 'stock', 'reit'] as const).map((assetClass) => {
      const c = summary.classes[assetClass]
      return { assetClass, value: c.value, currency: c.currency, change24hPercent: c.change24hPercent, holdingCount: c.holdingCount }
    }),
  }
}

function buildPnlContext(): ChatPnlContext | null {
  const cryptoPnl = useCryptoPnlStore.getState().data
  const { positions, account } = useStockPositionsStore.getState()
  const stocks = usePortfolioStore.getState().stocks
  const pnl = summarisePnl({ cryptoPnl, positions, account, stocks })
  if (pnl.total === null) return null

  return {
    total: pnl.total,
    totalCurrency: pnl.totalCurrency,
    crypto: pnl.crypto
      ? {
          net: pnl.crypto.net,
          netSpent: pnl.crypto.netSpent,
          currentValue: pnl.crypto.currentValue,
          netPercent: pnl.crypto.netPercent,
          warnings: pnl.crypto.warnings,
          assets: pnl.crypto.assets.slice(0, PNL_ROW_LIMIT).map((a) => ({
            asset: a.asset, netSpent: a.netSpent, currentValue: a.currentValue, net: a.net, netPercent: a.netPercent,
          })),
        }
      : null,
    equities: pnl.equities
      ? {
          currency: pnl.equities.currency,
          unrealized: pnl.equities.unrealized,
          realized: pnl.equities.realized,
          net: pnl.equities.net,
          positions: [...pnl.equities.stocks.positions, ...pnl.equities.reits.positions]
            .sort((a, b) => Math.abs(b.unrealized) - Math.abs(a.unrealized))
            .slice(0, PNL_ROW_LIMIT)
            .map((p) => ({
              ticker: p.ticker, assetClass: p.assetClass, currentValue: p.currentValue, totalCost: p.totalCost,
              unrealized: p.unrealized, unrealizedPercent: p.unrealizedPercent,
            })),
        }
      : null,
    history: {
      daysAboveWater: pnl.history.daysAboveWater,
      daysBelowWater: pnl.history.daysBelowWater,
      lastCrossedOn: pnl.history.lastCrossedOn,
    },
  }
}

function formatCondition(condition: AlertCondition): string {
  switch (condition.type) {
    case 'price_above':   return `price above $${condition.threshold.toLocaleString()}`
    case 'price_below':   return `price below $${condition.threshold.toLocaleString()}`
    case 'price_crosses': return `price crosses $${condition.threshold.toLocaleString()}`
    case 'rsi_above':     return `RSI above ${condition.threshold}`
    case 'rsi_below':     return `RSI below ${condition.threshold}`
    case 'macd_crossover':  return 'MACD crossover (bullish)'
    case 'macd_crossunder': return 'MACD crossunder (bearish)'
  }
}

function buildTaxContext(): ChatTaxContext | null {
  const { selectedYear, entries, filings } = useTaxStore.getState()
  if (entries.length === 0 && filings.length === 0) return null

  const today = todayIso()
  const periods = summarisePeriods(entries, filings, selectedYear, today).map((p) => ({
    taxYear: p.taxYear,
    period: p.period,
    deadline: p.deadline,
    status: p.status,
    grossPhp: p.grossPhp,
    taxDuePhp: p.taxDuePhp,
    filing: p.filing,
  }))

  const actionable = actionableDeadline(entries, filings, today)

  return {
    selectedYear,
    recentEntries: entries.slice(0, TAX_ENTRY_ROW_LIMIT).map((e) => ({
      id: e.id, receivedOn: e.receivedOn, source: e.source, amountPhp: e.amountPhp, note: e.note,
    })),
    periods,
    nextActionable: actionable
      ? { taxYear: actionable.taxYear, period: actionable.period, deadline: actionable.deadline, taxDuePhp: actionable.taxDuePhp }
      : null,
  }
}

function buildContext(): DashboardContext {
  const priceState = usePriceStore.getState()
  const balance = useBalanceStore.getState()
  const chart = useChartStore.getState()
  const alertState = useAlertStore.getState()
  const cryptoHoldings = useCryptoHoldingsStore.getState().holdings
  const portfolio = usePortfolioStore.getState().stocks
  const stockQuotes = useStockQuoteStore.getState().quotes
  const stockPositions = useStockPositionsStore.getState()
  const activeSymbol = useNavigationStore.getState().activeSymbol

  const activePrice = priceState.prices[activeSymbol]

  const candles = chart.candles
  const lastCandle = candles.length > 0 ? (candles[candles.length - 1] ?? null) : null
  const indicators = chart.indicators

  const macd = indicators
    ? (() => {
        const line = lastValue(indicators.macd.macdLine)
        const signal = lastValue(indicators.macd.signalLine)
        const histogram = lastValue(indicators.macd.histogram)
        if (line == null || signal == null || histogram == null) return null
        return { line, signal, histogram }
      })()
    : null

  const bb = indicators
    ? (() => {
        const upper = lastValue(indicators.bollingerBands.upper)
        const middle = lastValue(indicators.bollingerBands.middle)
        const lower = lastValue(indicators.bollingerBands.lower)
        if (upper == null || middle == null || lower == null) return null
        return { upper, middle, lower }
      })()
    : null

  return {
    activeSymbol,
    price: {
      price: activePrice?.price ?? null,
      changePercent: activePrice?.changePercent ?? null,
      high24h: activePrice?.high24h ?? null,
      low24h: activePrice?.low24h ?? null,
      connectionStatus: priceState.connectionStatus,
    },
    cryptoHoldings: cryptoHoldings.map((h) => {
      const p = priceState.prices[h.symbol]
      return {
        asset: h.asset,
        symbol: h.symbol,
        free: h.free,
        usdtValue: h.usdtValue,
        price: p?.price ?? null,
        changePercent: p?.changePercent ?? null,
      }
    }),
    totalCryptoUsdt: balance.balance?.totalUsdtValue ?? null,
    stockHoldings: portfolio.map((h) => ({
      ...h,
      quote: stockQuotes[h.ticker] ?? null,
      position: stockPositions.positions[h.ticker] ?? null,
    })),
    stockAccount: stockPositions.account,
    chart: {
      timeframe: chart.activeInterval,
      lastCandle,
      rsi: indicators ? lastValue(indicators.rsi) : null,
      macd,
      bb,
    },
    alerts: alertState.alerts.map((a) => ({
      id: a.id,
      label: a.label,
      symbol: a.symbol,
      condition: formatCondition(a.condition),
      conditionType: a.condition.type,
      threshold: 'threshold' in a.condition ? a.condition.threshold : null,
      active: a.active,
      triggered: a.triggered,
      triggeredAt: a.triggeredAt,
    })),
    portfolio: buildPortfolioContext(),
    pnl: buildPnlContext(),
    tax: buildTaxContext(),
  }
}

async function applyOneTool(
  tool: AppliedTool,
  alertStore: ReturnType<typeof useAlertStore.getState>,
  taxStore: ReturnType<typeof useTaxStore.getState>,
  portfolioStore: ReturnType<typeof usePortfolioStore.getState>
): Promise<void> {
  switch (tool.name) {
    // Alert and tax tools now execute server-side (see chat.ts) — the
    // mutation is already done by the time this runs. `result` is the real
    // outcome; this just syncs the local store from it, no network call. A
    // missing result means this tab predates that change (stale bundle); a
    // present-but-failed result is already explained in the assistant's
    // reply text, so there's nothing to surface again here.
    case 'add_alert':
    case 'edit_alert':
    case 'toggle_alert': {
      const result = tool.result
      if (result === undefined) throw new Error(`no result for ${tool.name} — this tab may be running an older build`)
      if (result.ok && 'alert' in result) alertStore.applySyncedAlert(result.alert)
      break
    }
    case 'remove_alert': {
      const result = tool.result
      if (result === undefined) throw new Error(`no result for ${tool.name} — this tab may be running an older build`)
      if (result.ok) alertStore.applySyncedRemoval((tool.input as { id: string }).id)
      break
    }
    case 'add_tax_entry':
    case 'edit_tax_entry': {
      const result = tool.result
      if (result === undefined) throw new Error(`no result for ${tool.name} — this tab may be running an older build`)
      if (result.ok && 'entry' in result) taxStore.applySyncedEntry(result.entry)
      break
    }
    case 'remove_tax_entry': {
      const result = tool.result
      if (result === undefined) throw new Error(`no result for ${tool.name} — this tab may be running an older build`)
      if (result.ok) taxStore.applySyncedEntryRemoval((tool.input as { id: string }).id)
      break
    }
    case 'mark_tax_filed': {
      const result = tool.result
      if (result === undefined) throw new Error(`no result for ${tool.name} — this tab may be running an older build`)
      if (result.ok && 'filing' in result) taxStore.applySyncedFiling(result.filing)
      break
    }
    case 'unmark_tax_filed': {
      const result = tool.result
      if (result === undefined) throw new Error(`no result for ${tool.name} — this tab may be running an older build`)
      if (result.ok) {
        const { taxYear, period } = tool.input as { taxYear: number; period: TaxPeriod }
        taxStore.applySyncedFilingRemoval(taxYear, period)
      }
      break
    }
    case 'add_symbol': {
      const { ticker, assetClass } = tool.input as { ticker: string; assetClass: 'stock' | 'reit' }
      portfolioStore.addStock({ ticker: ticker.toUpperCase(), assetClass })
      break
    }
    case 'remove_symbol': {
      const { ticker } = tool.input as { ticker: string }
      portfolioStore.removeStock(ticker.toUpperCase())
      break
    }
    default:
      throw new Error(`unrecognized tool "${tool.name}" — this tab may be running an older build`)
  }
}

// Parse and apply tool calls returned by the backend to local stores. Each
// tool is applied independently and failures are collected rather than
// thrown — the model's reply already claims these succeeded (it has no way
// to know otherwise), so a silently-swallowed failure would leave the user
// believing something happened that didn't. An unmatched tool name is the
// same failure mode: it means this tab's JS predates a tool the server
// already knows about, which a stale cached bundle can produce.
async function applyToolResults(toolCalls: AppliedTool[]): Promise<string[]> {
  const alertStore = useAlertStore.getState()
  const taxStore = useTaxStore.getState()
  const portfolioStore = usePortfolioStore.getState()
  const failures: string[] = []

  for (const tool of toolCalls) {
    try {
      await applyOneTool(tool, alertStore, taxStore, portfolioStore)
    } catch (err) {
      console.error(`[useChat] failed to apply ${tool.name}:`, err)
      failures.push(tool.name)
    }
  }
  return failures
}

class StreamError extends Error {}

/**
 * Consume the NDJSON event stream from /api/chat, pushing partial text and
 * status into the draft as it arrives. Resolves with the final result the
 * `done` event carries, so the caller treats streamed and buffered replies
 * the same way.
 */
async function readStream(
  body: ReadableStream<Uint8Array>,
  setDraft: (d: ChatDraft) => void
): Promise<ChatApiResponse> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let status: string | null = 'Thinking'
  let result: ChatApiResponse | null = null

  const handle = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as ChatStreamEvent
    switch (event.type) {
      case 'delta':
        text += event.text
        status = null
        setDraft({ text, status })
        break
      case 'status':
        status = event.text
        setDraft({ text, status })
        break
      case 'lookup':
      case 'applied':
        break
      case 'done':
        result = event.result
        break
      case 'error':
        throw new StreamError(event.error)
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl = buffer.indexOf('\n')
    while (nl >= 0) {
      handle(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf('\n')
    }
  }
  if (buffer.trim()) handle(buffer)
  if (!result) throw new StreamError('The reply ended before it was complete')
  return result
}

/** Text the assistant has written so far this turn, and what it is doing. */
export interface ChatDraft {
  text: string
  status: string | null
}

export function useChat() {
  // Per-browser, like alerts and the watchlist: a reload keeps the conversation.
  const [messages, setMessages] = useState<ChatMessage[]>(loadChatHistory)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ChatDraft | null>(null)

  useEffect(() => {
    saveChatHistory(messages)
  }, [messages])

  // A failed turn stays in the history as a marker. Without it the model sees
  // an unanswered request on the next turn and has claimed to have done the work.
  const recordFailure = useCallback((detail: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', content: detail, timestamp: Date.now(), failed: true },
    ])
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }

      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.failed ? `[System note: the previous request failed (${m.content}). No tools ran and nothing was changed.]` : m.content,
      }))

      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setError(null)

      const context = buildContext()
      setDraft({ text: '', status: 'Thinking' })

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
          credentials: 'include',
          body: JSON.stringify({ messages: history, context }),
        })

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; msg?: string }
          const detail = body.msg ? `${body.error ?? 'Request failed'}: ${body.msg}` : (body.error ?? 'Request failed')
          setError(detail)
          recordFailure(detail)
          return
        }

        const result = res.headers.get('content-type')?.includes('application/x-ndjson') && res.body
          ? await readStream(res.body, setDraft)
          : ((await res.json()) as ChatApiResponse)

        const failedTools = result.appliedTools.length > 0 ? await applyToolResults(result.appliedTools) : []

        const failureNote = failedTools.length > 0
          ? `\n\n(This device could not apply: ${failedTools.join(', ')}. Try refreshing the page and asking again.)`
          : ''
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.reply + failureNote,
          timestamp: Date.now(),
          ...(result.lookups.length > 0 ? { lookups: result.lookups } : {}),
        }
        setMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        const detail = err instanceof StreamError ? err.message : 'Network error, check your connection'
        setError(detail)
        recordFailure(detail)
      } finally {
        setDraft(null)
        setIsLoading(false)
      }
    },
    [messages, recordFailure]
  )

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, isLoading, error, draft, sendMessage, clearHistory }
}
