import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Dashboard } from '@/components/layout/Dashboard'
import { ChatWidget } from '@/components/chat/ChatWidget'
import { LandingPage } from '@/components/landing/LandingPage'
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket'
import { useCandles } from '@/hooks/useCandles'
import { useBalance } from '@/hooks/useBalance'
import { useAlertEvaluator } from '@/hooks/useAlertEvaluator'
import { useStockQuotes } from '@/hooks/useStockQuotes'
import { useStockPositions } from '@/hooks/useStockPositions'
import { useTaxData } from '@/hooks/useTaxData'
import { useTaxDeadlineNotifier } from '@/hooks/useTaxDeadlines'

type SessionResponse = {
  authenticated: boolean
}

function AppInner() {
  useBinanceWebSocket()
  useCandles()
  useBalance()
  useAlertEvaluator()
  useStockQuotes()
  useStockPositions()
  useTaxData()
  useTaxDeadlineNotifier()

  return (
    <div className="min-h-screen bg-terminal-bg text-text-primary flex flex-col">
      <button
        type="button"
        className="fixed top-4 right-4 z-40 px-3 py-1.5 border border-panel-border rounded text-xs font-mono text-text-muted hover:text-text-primary hover:border-text-muted"
        onClick={() => {
          void fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
            globalThis.location.reload()
          })
        }}
      >
        Logout
      </button>
      <Header />
      <main className="flex-1 flex flex-col">
        <Dashboard />
      </main>
      <ChatWidget />
    </div>
  )
}

export default function App() {
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    void fetch('/api/session', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return { authenticated: false } satisfies SessionResponse
        return res.json() as Promise<SessionResponse>
      })
      .then((data) => {
        setIsAuthenticated(data.authenticated)
      })
      .finally(() => {
        setIsCheckingSession(false)
      })
  }, [])

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-terminal-bg text-text-primary flex items-center justify-center">
        <p className="font-mono text-sm text-text-muted animate-pulse">Checking session...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LandingPage onAuthenticated={() => setIsAuthenticated(true)} />
  }

  return <AppInner />
}
