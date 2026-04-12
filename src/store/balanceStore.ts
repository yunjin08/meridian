import { create } from 'zustand'
import type { AccountBalance } from '@/types/account'

interface BalanceState {
  balance: AccountBalance | null
  isLoading: boolean
  error: string | null

  setBalance: (balance: AccountBalance) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useBalanceStore = create<BalanceState>()((set) => ({
  balance: null,
  isLoading: false,
  error: null,

  setBalance: (balance) => set({ balance, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
