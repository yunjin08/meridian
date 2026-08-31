// Whether this browser has a passkey, and whether the owner has already turned
// down the offer to make one. Both are UX hints held in localStorage, never a
// security boundary: the server decides every sign-in outcome regardless of
// what these say.

import { getItem, removeItem, setItem } from '@/lib/localStorage'

const REGISTERED_KEY = 'meridian.passkey.registered'
const DISMISSED_KEY = 'meridian.passkey.offerDismissed'

export function hasRegisteredPasskey(): boolean {
  return getItem<boolean>(REGISTERED_KEY) === true
}

export function markPasskeyRegistered(): void {
  setItem(REGISTERED_KEY, true)
}

export function clearPasskeyRegistered(): void {
  removeItem(REGISTERED_KEY)
}

export function hasDismissedPasskeyOffer(): boolean {
  return getItem<boolean>(DISMISSED_KEY) === true
}

export function dismissPasskeyOffer(): void {
  setItem(DISMISSED_KEY, true)
}

export type AutoPromptInputs = {
  browserSupportsWebAuthn: boolean
  platformAuthenticatorAvailable: boolean
  registeredOnThisBrowser: boolean
}

/**
 * Fingerprint is the default, but only where it can actually succeed. Firing
 * the OS sheet at a browser that has never registered would show a "no passkey
 * found" error instead of a sign-in form, which is worse than not trying.
 */
export function shouldAutoPrompt(inputs: AutoPromptInputs): boolean {
  return (
    inputs.browserSupportsWebAuthn &&
    inputs.platformAuthenticatorAvailable &&
    inputs.registeredOnThisBrowser
  )
}
