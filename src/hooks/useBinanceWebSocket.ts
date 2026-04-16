import { useEffect, useRef } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useChartStore } from '@/store/chartStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { useNavigationStore } from '@/store/navigationStore'
import {
  BINANCE_WS_BASE,
  DEFAULT_CRYPTO_SYMBOL,
  WS_MAX_RECONNECT_ATTEMPTS,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
  API_BASE,
} from '@/constants'
import type { WsCombinedMessage, WsTickerMessage, WsKlineMessage } from '@/types/websocket'
import type { Candle } from '@/types/candle'

function parseKlineToCandle(k: WsKlineMessage['k']): Candle {
  return {
    time: Math.floor(k.t / 1000),
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
  }
}

async function fetchTickerFallback(symbol: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/ticker?symbol=${symbol}`)
    if (!res.ok) return
    const data = await res.json() as {
      price: number
      priceChangePercent: number
      high24h: number
      low24h: number
      volume24h: number
    }
    usePriceStore.getState().setPrice(symbol, {
      price: data.price,
      changePercent: data.priceChangePercent,
      high24h: data.high24h,
      low24h: data.low24h,
      volume24h: data.volume24h,
    })
  } catch {
    // Silently ignore fallback failures
  }
}

export function useBinanceWebSocket() {
  const activeInterval = useChartStore((s) => s.activeInterval)
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const holdings = useCryptoHoldingsStore((s) => s.holdings)

  const activeIntervalRef = useRef(activeInterval)
  const activeSymbolRef = useRef(activeSymbol)
  const holdingsRef = useRef(holdings)

  useEffect(() => { activeIntervalRef.current = activeInterval }, [activeInterval])
  useEffect(() => { activeSymbolRef.current = activeSymbol }, [activeSymbol])
  useEffect(() => { holdingsRef.current = holdings }, [holdings])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentKlineStreamRef = useRef<string>('')
  const subscribedTickersRef = useRef<Set<string>>(new Set())
  const isMountedRef = useRef(true)

  const { setConnectionStatus, setReconnectAttempts, setPrice } = usePriceStore.getState()
  const { updateLastCandle, appendCandle } = useChartStore.getState()

  function symbolToStream(symbol: string): string {
    return symbol.toLowerCase() + '@ticker'
  }

  function handleTickerMessage(stream: string, msg: WsTickerMessage) {
    // Derive symbol from stream name: "ethusdt@ticker" → "ETHUSDT"
    const symbol = stream.split('@')[0]?.toUpperCase() ?? DEFAULT_CRYPTO_SYMBOL
    setPrice(symbol, {
      price: parseFloat(msg.c),
      changePercent: parseFloat(msg.P),
      high24h: parseFloat(msg.h),
      low24h: parseFloat(msg.l),
      volume24h: parseFloat(msg.q),
    })
  }

  function handleKlineMessage(msg: WsKlineMessage) {
    const candle = parseKlineToCandle(msg.k)
    if (msg.k.x) {
      appendCandle(candle)
    } else {
      updateLastCandle(candle)
    }
  }

  function handleMessage(event: MessageEvent<string>) {
    try {
      const combined = JSON.parse(event.data) as WsCombinedMessage
      const { stream, data } = combined
      if (stream.endsWith('@ticker')) {
        handleTickerMessage(stream, data as WsTickerMessage)
      } else if (stream.includes('@kline_')) {
        handleKlineMessage(data as WsKlineMessage)
      }
    } catch {
      // Malformed message — ignore
    }
  }

  function startFallbackPolling() {
    if (fallbackIntervalRef.current !== null) return
    fallbackIntervalRef.current = setInterval(() => {
      void fetchTickerFallback(activeSymbolRef.current)
    }, 5000)
    void fetchTickerFallback(activeSymbolRef.current)
  }

  function stopFallbackPolling() {
    if (fallbackIntervalRef.current !== null) {
      clearInterval(fallbackIntervalRef.current)
      fallbackIntervalRef.current = null
    }
  }

  function connect() {
    if (!isMountedRef.current) return

    const interval = activeIntervalRef.current
    const symbol = activeSymbolRef.current
    const currentHoldings = holdingsRef.current

    // Build ticker streams for all held assets + at least the active symbol
    const tickerSymbols = new Set<string>([symbol])
    for (const h of currentHoldings) {
      if (h.symbol !== 'USDT') tickerSymbols.add(h.symbol)
    }

    const tickerStreams = [...tickerSymbols].map(symbolToStream)
    const klineStream = `${symbol.toLowerCase()}@kline_${interval}`
    currentKlineStreamRef.current = klineStream
    subscribedTickersRef.current = new Set(tickerStreams)

    const streams = [...tickerStreams, klineStream].join('/')
    const url = `${BINANCE_WS_BASE}?streams=${streams}`

    setConnectionStatus('connecting')

    const ws = new WebSocket(url)
    wsRef.current = ws

    wsConnectTimeoutRef.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('[ws] connection timeout — starting fallback polling')
        startFallbackPolling()
      }
    }, 5000)

    ws.onopen = () => {
      if (wsConnectTimeoutRef.current !== null) clearTimeout(wsConnectTimeoutRef.current)
      stopFallbackPolling()
      setConnectionStatus('connected')
      reconnectAttemptsRef.current = 0
      setReconnectAttempts(0)
    }

    ws.onmessage = handleMessage

    ws.onerror = () => {
      // onclose always fires after onerror — handle there
    }

    ws.onclose = () => {
      if (!isMountedRef.current) return
      setConnectionStatus('disconnected')

      const attempts = reconnectAttemptsRef.current
      if (attempts >= WS_MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus('failed')
        startFallbackPolling()
        return
      }

      const delay = Math.min(
        WS_RECONNECT_BASE_DELAY_MS * Math.pow(2, attempts),
        WS_RECONNECT_MAX_DELAY_MS
      )
      setConnectionStatus('reconnecting')
      reconnectAttemptsRef.current += 1
      setReconnectAttempts(reconnectAttemptsRef.current)
      reconnectTimerRef.current = setTimeout(connect, delay)
    }
  }

  function cleanup() {
    isMountedRef.current = false
    if (wsConnectTimeoutRef.current !== null) clearTimeout(wsConnectTimeoutRef.current)
    if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current)
    stopFallbackPolling()
    if (wsRef.current !== null) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
  }

  // Initial connection
  useEffect(() => {
    isMountedRef.current = true
    connect()
    return cleanup
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Switch kline stream when active symbol or timeframe changes
  useEffect(() => {
    const ws = wsRef.current
    if (ws === null || ws.readyState !== WebSocket.OPEN) return

    const newKline = `${activeSymbol.toLowerCase()}@kline_${activeInterval}`
    if (newKline === currentKlineStreamRef.current) return

    ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: [currentKlineStreamRef.current], id: 1 }))
    ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [newKline], id: 2 }))
    currentKlineStreamRef.current = newKline
  }, [activeSymbol, activeInterval])

  // Subscribe to ticker streams for newly added holdings
  useEffect(() => {
    const ws = wsRef.current
    if (ws === null || ws.readyState !== WebSocket.OPEN) return

    const desired = new Set<string>()
    desired.add(symbolToStream(activeSymbol))
    for (const h of holdings) {
      if (h.symbol !== 'USDT') desired.add(symbolToStream(h.symbol))
    }

    const current = subscribedTickersRef.current
    const toSubscribe = [...desired].filter((s) => !current.has(s))
    const toUnsubscribe = [...current].filter((s) => !desired.has(s))

    if (toSubscribe.length > 0) {
      ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: toSubscribe, id: 3 }))
      toSubscribe.forEach((s) => current.add(s))
    }
    if (toUnsubscribe.length > 0) {
      ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: toUnsubscribe, id: 4 }))
      toUnsubscribe.forEach((s) => current.delete(s))
    }
  }, [holdings, activeSymbol])
}
