import { create } from 'zustand'
import { DEFAULT_CRYPTO_SYMBOL } from '@/constants'

export type DashboardTab = 'crypto' | 'stocks' | 'reits' | 'portfolio'

interface NavigationState {
  activeTab: DashboardTab
  activeSymbol: string    // symbol shown in the chart panel
  setActiveTab: (tab: DashboardTab) => void
  setActiveSymbol: (symbol: string) => void
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  activeTab: 'crypto',
  activeSymbol: DEFAULT_CRYPTO_SYMBOL,
  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveSymbol: (activeSymbol) => set({ activeSymbol }),
}))
