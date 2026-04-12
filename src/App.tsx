import { Header } from '@/components/layout/Header'
import { Dashboard } from '@/components/layout/Dashboard'
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket'
import { useCandles } from '@/hooks/useCandles'
import { useBalance } from '@/hooks/useBalance'
import { useAlertEvaluator } from '@/hooks/useAlertEvaluator'

function AppInner() {
  useBinanceWebSocket()
  useCandles()
  useBalance()
  useAlertEvaluator()

  return (
    <div className="min-h-screen bg-terminal-bg text-text-primary flex flex-col">
      <Header />
      <main className="flex-1">
        <Dashboard />
      </main>
    </div>
  )
}

export default function App() {
  return <AppInner />
}
