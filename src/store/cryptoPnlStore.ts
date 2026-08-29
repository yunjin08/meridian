import { create } from 'zustand'
import type { CryptoPnlResponse } from '@/types/pnl'

interface CryptoPnlState {
  data: CryptoPnlResponse | null
  isLoading: boolean
  error: string | null
  setData: (data: CryptoPnlResponse) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useCryptoPnlStore = create<CryptoPnlState>()((set) => ({
  data: null,
  isLoading: false,
  error: null,
  setData: (data) => set({ data, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
