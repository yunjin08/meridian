import { create } from 'zustand'
import { DEFAULT_CRYPTO_SYMBOL } from '@/constants'

export type DashboardTab = 'overview' | 'crypto' | 'stocks' | 'reits' | 'tax'

interface NavigationState {
  activeTab: DashboardTab
  activeSymbol: string    // symbol shown in the chart panel
  setActiveTab: (tab: DashboardTab) => void
  setActiveSymbol: (symbol: string) => void
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  activeTab: 'overview',
  activeSymbol: DEFAULT_CRYPTO_SYMBOL,
  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveSymbol: (activeSymbol) => set({ activeSymbol }),
}))
