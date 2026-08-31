import { useCallback, useEffect, useRef, useState } from 'react'
import { FingerprintIcon } from '@/components/ui/FingerprintIcon'
import { PassphraseForm } from './PassphraseForm'
import {
  clearPasskeyRegistered,
  hasRegisteredPasskey,
  markPasskeyRegistered,
  shouldAutoPrompt,
} from '@/lib/passkeyPreference'
import {
  isPlatformAuthenticatorAvailable,
  isUserCancellation,
  isWebAuthnSupported,
  PasskeyError,
  signInWithPasskey,
} from '@/lib/webauthnApi'

const PASSKEY_ERROR_MESSAGES: Record<string, string> = {
  challenge_expired: 'That took too long. Try again.',
  unknown_credential: 'This device is no longer registered. Use your passphrase.',
  invalid_credentials: 'That fingerprint was not recognised.',
  webauthn_not_configured: 'Passkeys are not configured on this deployment.',
}

type Mode = 'checking' | 'passkey' | 'passphrase'

export function SignInModal({ onClose, onAuthenticated }: { onClose: () => void; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<Mode>('checking')
  const [isPrompting, setIsPrompting] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  // Guards the mount effect against firing the OS sheet twice under StrictMode's
  // double invocation, which would show the user two Touch ID prompts.
  const hasAutoPrompted = useRef(false)

  const attemptPasskey = useCallback(async () => {
    setIsPrompting(true)
    setPasskeyError(null)
    try {
      await signInWithPasskey()
      markPasskeyRegistered()
      onAuthenticated()
    } catch (err) {
      if (isUserCancellation(err)) return   // a choice, not a failure

      if (err instanceof PasskeyError) {
        if (err.code === 'unknown_credential') {
          clearPasskeyRegistered()
          setMode('passphrase')
        }
        setPasskeyError(PASSKEY_ERROR_MESSAGES[err.code] ?? 'Could not sign in with this device.')
        return
      }
      setPasskeyError('Could not sign in with this device.')
    } finally {
      setIsPrompting(false)
    }
  }, [onAuthenticated])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false

    async function decideMode() {
      const supported = isWebAuthnSupported()
      const platformAvailable = supported && (await isPlatformAuthenticatorAvailable())
      if (cancelled) return

      if (!platformAvailable) {
        setMode('passphrase')
        return
      }

      setMode('passkey')
      const registered = hasRegisteredPasskey()
      if (shouldAutoPrompt({
        browserSupportsWebAuthn: supported,
        platformAuthenticatorAvailable: platformAvailable,
        registeredOnThisBrowser: registered,
      }) && !hasAutoPrompted.current) {
        hasAutoPrompted.current = true
        void attemptPasskey()
      }
    }

    void decideMode()
    return () => {
      cancelled = true
    }
  }, [attemptPasskey])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-terminal-bg/80 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        className="w-full max-w-sm space-y-4 rounded-lg border border-panel-border bg-panel-bg p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
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

        {mode === 'checking' && (
          <p className="py-6 text-center font-mono text-xs text-text-muted">Checking this device...</p>
        )}

        {mode === 'passkey' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-2">
              <span className={isPrompting ? 'text-btc-orange animate-pulse' : 'text-text-muted'}>
                <FingerprintIcon className="h-10 w-10" />
              </span>
              <p className="font-mono text-xs text-text-muted" aria-live="polite">
                {isPrompting ? 'Waiting for Touch ID...' : 'Use Touch ID to sign in.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                void attemptPasskey()
              }}
              disabled={isPrompting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-btc-orange px-3 py-2 font-mono text-sm font-semibold text-terminal-bg transition-colors hover:bg-[#ffa63a] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange active:translate-y-px"
            >
              <FingerprintIcon className="h-4 w-4" />
              {isPrompting ? 'Waiting...' : 'Sign in with Touch ID'}
            </button>

            {passkeyError !== null && <p className="font-mono text-xs text-bear-red">{passkeyError}</p>}

            <button
              type="button"
              onClick={() => {
                setPasskeyError(null)
                setMode('passphrase')
              }}
              className="w-full text-center text-xs text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange"
            >
              Use passphrase instead
            </button>
          </div>
        )}

        {mode === 'passphrase' && (
          <div className="space-y-4">
            {passkeyError !== null && <p className="font-mono text-xs text-bear-red">{passkeyError}</p>}
            <PassphraseForm onAuthenticated={onAuthenticated} />
          </div>
        )}
      </div>
    </div>
  )
}
