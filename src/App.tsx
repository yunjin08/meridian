import { useEffect, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Dashboard } from '@/components/layout/Dashboard'
import { ChatWidget } from '@/components/chat/ChatWidget'
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket'
import { useCandles } from '@/hooks/useCandles'
import { useBalance } from '@/hooks/useBalance'
import { useAlertEvaluator } from '@/hooks/useAlertEvaluator'
import { useStockQuotes } from '@/hooks/useStockQuotes'

type SessionResponse = {
  authenticated: boolean
}

function AppInner() {
  useBinanceWebSocket()
  useCandles()
  useBalance()
  useAlertEvaluator()
  useStockQuotes()

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
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

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

  async function onLogin(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoggingIn(true)
    setLoginError(null)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setLoginError(body.error ?? 'Login failed')
        return
      }
      setPassword('')
      setIsAuthenticated(true)
    } catch {
      setLoginError('Network error while logging in')
    } finally {
      setIsLoggingIn(false)
    }
  }

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-terminal-bg text-text-primary flex items-center justify-center">
        <p className="font-mono text-sm text-text-muted animate-pulse">Checking session...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-terminal-bg text-text-primary flex items-center justify-center px-4">
        <form
          className="w-full max-w-sm bg-panel-bg border border-panel-border rounded-lg p-5 space-y-4"
          onSubmit={(event) => {
            void onLogin(event)
          }}
        >
          <div>
            <h1 className="font-mono text-lg">Dashboard Login</h1>
            <p className="text-xs text-text-muted mt-1">Enter your admin passphrase.</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
            className="w-full bg-terminal-bg border border-panel-border rounded px-3 py-2 font-mono text-sm outline-none focus:border-text-muted"
            placeholder="Passphrase"
            autoComplete="current-password"
            required
          />
          {loginError !== null && <p className="text-xs text-bear-red font-mono">{loginError}</p>}
          <button
            type="submit"
            className="w-full bg-btc-orange text-terminal-bg rounded px-3 py-2 font-mono text-sm disabled:opacity-60"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    )
  }

  return <AppInner />
}
