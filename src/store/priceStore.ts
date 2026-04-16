import { create } from 'zustand'
import type { WsConnectionStatus } from '@/types/websocket'

export interface SymbolPrice {
  price: number
  changePercent: number
  high24h: number
  low24h: number
  volume24h: number
  lastTickAt: number
}

interface PriceState {
  prices: Record<string, SymbolPrice>  // keyed by symbol e.g. "BTCUSDT"
  connectionStatus: WsConnectionStatus
  reconnectAttempts: number

  setPrice: (
    symbol: string,
    data: Omit<SymbolPrice, 'lastTickAt'>
  ) => void
  setConnectionStatus: (status: WsConnectionStatus) => void
  setReconnectAttempts: (n: number) => void
}

export const usePriceStore = create<PriceState>()((set) => ({
  prices: {},
  connectionStatus: 'connecting',
  reconnectAttempts: 0,

  setPrice: (symbol, data) =>
    set((s) => ({
      prices: {
        ...s.prices,
        [symbol]: { ...data, lastTickAt: Date.now() },
      },
    })),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setReconnectAttempts: (reconnectAttempts) => set({ reconnectAttempts }),
}))
