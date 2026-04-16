import { useNavigationStore, type DashboardTab } from '@/store/navigationStore'

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'crypto',    label: 'Crypto' },
  { id: 'stocks',    label: 'Stocks' },
  { id: 'reits',     label: 'REITs' },
  { id: 'portfolio', label: 'Portfolio' },
]

export function TabBar() {
  const activeTab = useNavigationStore((s) => s.activeTab)
  const setActiveTab = useNavigationStore((s) => s.setActiveTab)

  return (
    <div className="flex border-b border-panel-border bg-panel-bg px-3 gap-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={[
            'px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 -mb-px',
            activeTab === tab.id
              ? 'border-btc-orange text-btc-orange'
              : 'border-transparent text-text-muted hover:text-text-primary hover:border-panel-border',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
