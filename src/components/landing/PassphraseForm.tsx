import { useState } from 'react'
import type { SyntheticEvent } from 'react'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'That passphrase is not correct.',
}

export function PassphraseForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

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
    <form
      className="space-y-4"
      onSubmit={(event) => {
        void onLogin(event)
      }}
    >
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
  )
}
