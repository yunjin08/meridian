import { useCallback, useEffect, useState } from 'react'
import { FingerprintIcon } from '@/components/ui/FingerprintIcon'
import type { PasskeyCredential } from '@/types/webauthn'
import { clearPasskeyRegistered, markPasskeyRegistered } from '@/lib/passkeyPreference'
import {
  deletePasskey,
  fetchPasskeys,
  isPlatformAuthenticatorAvailable,
  isUserCancellation,
  isWebAuthnSupported,
  registerPasskey,
} from '@/lib/webauthnApi'

function formatUsed(lastUsedAt: string | null): string {
  if (lastUsedAt === null) return 'never used'
  return `last used ${new Date(lastUsedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`
}

export function PasskeyPanel({ onClose }: { onClose: () => void }) {
  const [credentials, setCredentials] = useState<PasskeyCredential[] | null>(null)
  const [canRegister, setCanRegister] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCredentials(await fetchPasskeys())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load devices')
      setCredentials([])
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false

    async function init() {
      const available = isWebAuthnSupported() && (await isPlatformAuthenticatorAvailable())
      if (!cancelled) setCanRegister(available)
      await load()
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [load])

  async function onAdd() {
    setIsRegistering(true)
    setError(null)
    try {
      await registerPasskey()
      markPasskeyRegistered()
      await load()
    } catch (err) {
      if (isUserCancellation(err)) return
      setError(err instanceof Error ? err.message : 'Could not add this device')
    } finally {
      setIsRegistering(false)
    }
  }

  async function onRemove(credential: PasskeyCredential) {
    setError(null)
    try {
      await deletePasskey(credential.credentialId)
      // The hint is per browser and cannot tell which row belonged to it, so
      // any removal drops it. A stale hint would auto-prompt for a credential
      // the server no longer knows.
      clearPasskeyRegistered()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this device')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-terminal-bg/80 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-panel-title"
        className="w-full max-w-md space-y-4 rounded-lg border border-panel-border bg-panel-bg p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="passkey-panel-title" className="font-mono text-lg text-text-primary">Passkeys</h2>
            <p className="mt-1 text-xs text-text-muted">Devices that can sign in with a fingerprint.</p>
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

        {credentials === null && (
          <p className="py-4 text-center font-mono text-xs text-text-muted">Loading devices...</p>
        )}

        {credentials !== null && credentials.length === 0 && (
          <p className="rounded-md border border-dashed border-panel-border px-3 py-6 text-center text-xs text-text-muted">
            No devices registered yet.
          </p>
        )}

        {credentials !== null && credentials.length > 0 && (
          <ul className="space-y-2">
            {credentials.map((credential) => (
              <li
                key={credential.credentialId}
                className="flex items-center justify-between gap-3 rounded-md border border-panel-border px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-text-muted">
                    <FingerprintIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-mono text-sm text-text-primary">{credential.deviceLabel}</p>
                    <p className="text-xs text-text-muted">{formatUsed(credential.lastUsedAt)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void onRemove(credential)
                  }}
                  className="text-xs text-text-muted transition-colors hover:text-bear-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {error !== null && <p className="font-mono text-xs text-bear-red">{error}</p>}

        {canRegister && (
          <button
            type="button"
            onClick={() => {
              void onAdd()
            }}
            disabled={isRegistering}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-btc-orange px-3 py-2 font-mono text-sm font-semibold text-terminal-bg transition-colors hover:bg-[#ffa63a] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange active:translate-y-px"
          >
            <FingerprintIcon className="h-4 w-4" />
            {isRegistering ? 'Waiting for Touch ID...' : 'Add this device'}
          </button>
        )}

        {!canRegister && (
          <p className="text-xs text-text-muted">
            This browser has no fingerprint sensor available, so it cannot be registered here.
          </p>
        )}
      </div>
    </div>
  )
}
