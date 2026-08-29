import { useEffect, useState } from 'react'
import type { SyntheticEvent } from 'react'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'That passphrase is not correct.',
}

export function SignInModal({ onClose, onAuthenticated }: { onClose: () => void; onAuthenticated: () => void }) {
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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
        setLoginError(ERROR_MESSAGES[body.error ?? ''] ?? body.error ?? 'Login failed')
        return
      }
      setPassword('')
      onAuthenticated()
    } catch {
      setLoginError('Network error while logging in')
    } finally {
      setIsLoggingIn(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-terminal-bg/80 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        className="w-full max-w-sm space-y-4 rounded-lg border border-panel-border bg-panel-bg p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          void onLogin(event)
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="sign-in-title" className="font-mono text-lg text-text-primary">Owner sign in</h2>
            <p className="mt-1 text-xs text-text-muted">This dashboard is connected to one private account.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <label htmlFor="sign-in-passphrase" className="block text-xs text-text-muted">Passphrase</label>
          <input
            id="sign-in-passphrase"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
            className="w-full rounded-md border border-panel-border bg-terminal-bg px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-btc-orange"
            autoComplete="current-password"
            autoFocus
            required
          />
          {loginError !== null && <p className="font-mono text-xs text-bear-red">{loginError}</p>}
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-btc-orange px-3 py-2 font-mono text-sm font-semibold text-terminal-bg transition-colors hover:bg-[#ffa63a] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange active:translate-y-px"
          disabled={isLoggingIn}
        >
          {isLoggingIn ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
