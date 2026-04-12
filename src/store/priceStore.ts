import { create } from 'zustand'
import type { WsConnectionStatus } from '@/types/websocket'

interface PriceState {
  price: number | null
  changePercent: number | null
  high24h: number | null
  low24h: number | null
  volume24h: number | null
  lastTickAt: number | null
  connectionStatus: WsConnectionStatus
  reconnectAttempts: number

  setPrice: (price: number, changePercent: number, high24h: number, low24h: number, volume24h: number) => void
  setConnectionStatus: (status: WsConnectionStatus) => void
  setReconnectAttempts: (n: number) => void
  setLastTickAt: (ts: number) => void
}

export const usePriceStore = create<PriceState>()((set) => ({
  price: null,
  changePercent: null,
  high24h: null,
  low24h: null,
  volume24h: null,
  lastTickAt: null,
  connectionStatus: 'connecting',
  reconnectAttempts: 0,

  setPrice: (price, changePercent, high24h, low24h, volume24h) =>
    set({ price, changePercent, high24h, low24h, volume24h, lastTickAt: Date.now() }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setReconnectAttempts: (reconnectAttempts) => set({ reconnectAttempts }),
  setLastTickAt: (lastTickAt) => set({ lastTickAt }),
}))
