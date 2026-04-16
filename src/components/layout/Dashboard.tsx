import { TabBar } from '@/components/layout/TabBar'
import { CryptoSection } from '@/components/crypto/CryptoSection'
import { StocksSection } from '@/components/stocks/StocksSection'
import { ReitsSection } from '@/components/reits/ReitsSection'
import { PortfolioSection } from '@/components/portfolio/PortfolioSection'
import { useNavigationStore } from '@/store/navigationStore'

export function Dashboard() {
  const activeTab = useNavigationStore((s) => s.activeTab)

  return (
    <div className="flex flex-col h-full">
      <TabBar />
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'crypto'    && <CryptoSection />}
        {activeTab === 'stocks'    && <StocksSection tab="stocks" filter="stock" />}
        {activeTab === 'reits'     && <ReitsSection />}
        {activeTab === 'portfolio' && <PortfolioSection />}
      </div>
    </div>
  )
}
