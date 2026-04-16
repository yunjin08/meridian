import { create } from 'zustand'
import type { CryptoHolding } from '@/types/portfolio'

interface CryptoHoldingsState {
  holdings: CryptoHolding[]
  setHoldings: (holdings: CryptoHolding[]) => void
}

export const useCryptoHoldingsStore = create<CryptoHoldingsState>()((set) => ({
  holdings: [],
  setHoldings: (holdings) => set({ holdings }),
}))
