import { ConnectionStatus } from '@/components/price/ConnectionStatus'

export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-panel-border bg-panel-bg">
      <div className="flex items-center gap-2">
        <span className="text-btc-orange font-mono font-bold text-lg">₿</span>
        <span className="font-semibold text-text-primary tracking-wide">BTC Dashboard</span>
      </div>
      <ConnectionStatus />
    </header>
  )
}
