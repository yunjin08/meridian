import { useEffect, useState } from 'react'
import { FingerprintIcon } from '@/components/ui/FingerprintIcon'
import {
  dismissPasskeyOffer,
  hasDismissedPasskeyOffer,
  hasRegisteredPasskey,
  markPasskeyRegistered,
} from '@/lib/passkeyPreference'
import {
  isPlatformAuthenticatorAvailable,
  isUserCancellation,
  isWebAuthnSupported,
  registerPasskey,
} from '@/lib/webauthnApi'

/**
 * Offered once after a passphrase sign-in on a browser that has no passkey yet.
 * Dismissal sticks, so the dashboard never nags.
 */
export function PasskeyPrompt() {
  const [isVisible, setIsVisible] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function decideVisibility() {
      if (hasRegisteredPasskey() || hasDismissedPasskeyOffer()) return
      if (!isWebAuthnSupported()) return
      const available = await isPlatformAuthenticatorAvailable()
      if (!cancelled && available) setIsVisible(true)
    }

    void decideVisibility()
    return () => {
      cancelled = true
    }
  }, [])

  if (!isVisible) return null

  async function onEnable() {
    setIsRegistering(true)
    setError(null)
    try {
      await registerPasskey()
      markPasskeyRegistered()
      setIsVisible(false)
    } catch (err) {
      if (isUserCancellation(err)) return
      setError(err instanceof Error ? err.message : 'Could not set up Touch ID')
    } finally {
      setIsRegistering(false)
    }
  }

  function onDismiss() {
    dismissPasskeyOffer()
    setIsVisible(false)
  }

  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-panel-border bg-panel-bg p-4">
      <span className="mt-0.5 text-btc-orange">
        <FingerprintIcon className="h-6 w-6" />
      </span>
      <div className="flex-1 space-y-2">
        <p className="font-mono text-sm text-text-primary">Set up Touch ID on this device?</p>
        <p className="text-xs text-text-muted">
          Sign in with your fingerprint instead of typing the passphrase. Your passphrase keeps working.
        </p>
        {error !== null && <p className="font-mono text-xs text-bear-red">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              void onEnable()
            }}
            disabled={isRegistering}
            className="rounded-md bg-btc-orange px-3 py-1.5 font-mono text-xs font-semibold text-terminal-bg transition-colors hover:bg-[#ffa63a] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange active:translate-y-px"
          >
            {isRegistering ? 'Waiting for Touch ID...' : 'Set up Touch ID'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
