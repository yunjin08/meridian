import { useEffect, useRef } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useChartStore } from '@/store/chartStore'
import {
  BINANCE_WS_BASE,
  SYMBOL_LOWER,
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

/** Try WebSocket; fall back to polling /api/ticker if WS fails to connect within 5s */
async function fetchTickerFallback(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/ticker?symbol=BTCUSDT`)
    if (!res.ok) return
    const data = await res.json() as {
      price: number
      priceChangePercent: number
      high24h: number
      low24h: number
      volume24h: number
    }
    usePriceStore.getState().setPrice(
      data.price,
      data.priceChangePercent,
      data.high24h,
      data.low24h,
      data.volume24h
    )
  } catch {
    // Silently ignore fallback failures
  }
}

export function useBinanceWebSocket() {
  const activeInterval = useChartStore((s) => s.activeInterval)
  const activeIntervalRef = useRef(activeInterval)

  // Track active interval changes without triggering WS reconnect
  useEffect(() => {
    activeIntervalRef.current = activeInterval
  }, [activeInterval])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentKlineStreamRef = useRef<string>(`${SYMBOL_LOWER}@kline_${activeInterval}`)
  const isMountedRef = useRef(true)

  const { setConnectionStatus, setReconnectAttempts, setPrice } = usePriceStore.getState()
  const { updateLastCandle, appendCandle } = useChartStore.getState()

  function handleTickerMessage(msg: WsTickerMessage) {
    setPrice(
      parseFloat(msg.c),
      parseFloat(msg.P),
      parseFloat(msg.h),
      parseFloat(msg.l),
      parseFloat(msg.q)
    )
  }

  function handleKlineMessage(msg: WsKlineMessage) {
    const candle = parseKlineToCandle(msg.k)
    if (msg.k.x) {
      // Kline is closed — append as a new completed candle
      appendCandle(candle)
    } else {
      // Kline is still forming — update the last candle
      updateLastCandle(candle)
    }
  }

  function handleMessage(event: MessageEvent<string>) {
    try {
      const combined = JSON.parse(event.data) as WsCombinedMessage
      const { stream, data } = combined

      if (stream.endsWith('@ticker')) {
        handleTickerMessage(data as WsTickerMessage)
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
      void fetchTickerFallback()
    }, 5000)
    void fetchTickerFallback() // Immediate first call
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
    const klineStream = `${SYMBOL_LOWER}@kline_${interval}`
    currentKlineStreamRef.current = klineStream

    const streams = `${SYMBOL_LOWER}@ticker/${klineStream}`
    const url = `${BINANCE_WS_BASE}?streams=${streams}`

    setConnectionStatus('connecting')

    const ws = new WebSocket(url)
    wsRef.current = ws

    // If WS doesn't connect within 5 seconds, start fallback polling
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
      console.log(`[ws] reconnecting in ${delay}ms (attempt ${attempts + 1})`)
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
      wsRef.current.onclose = null  // prevent reconnect on intentional close
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

  // Subscribe/unsubscribe kline stream on timeframe change (no full reconnect)
  useEffect(() => {
    const ws = wsRef.current
    if (ws === null || ws.readyState !== WebSocket.OPEN) return

    const newStream = `${SYMBOL_LOWER}@kline_${activeInterval}`
    if (newStream === currentKlineStreamRef.current) return

    // Unsubscribe old stream, subscribe new one
    ws.send(JSON.stringify({
      method: 'UNSUBSCRIBE',
      params: [currentKlineStreamRef.current],
      id: 1,
    }))
    ws.send(JSON.stringify({
      method: 'SUBSCRIBE',
      params: [newStream],
      id: 2,
    }))
    currentKlineStreamRef.current = newStream
  }, [activeInterval])
}
