import { getItem, removeItem, setItem } from '@/lib/localStorage'
import type { ChatMessage } from '@/types/chat'

export const CHAT_HISTORY_KEY = 'meridian.chat.history'

// The model only ever sees the last 20 messages, so storing more than a few
// screens of scrollback buys nothing and lets localStorage grow without bound.
export const CHAT_HISTORY_LIMIT = 100

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return (
    typeof m['id'] === 'string' &&
    (m['role'] === 'user' || m['role'] === 'assistant') &&
    typeof m['content'] === 'string' &&
    typeof m['timestamp'] === 'number'
  )
}

/** Oldest messages drop first once the cap is reached. */
export function trimHistory(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.length > CHAT_HISTORY_LIMIT ? messages.slice(-CHAT_HISTORY_LIMIT) : [...messages]
}

/** Anything that is not a well-formed message is dropped rather than trusted. */
export function loadChatHistory(): ChatMessage[] {
  const raw = getItem<unknown>(CHAT_HISTORY_KEY)
  if (!Array.isArray(raw)) return []
  return trimHistory(raw.filter(isMessage))
}

export function saveChatHistory(messages: readonly ChatMessage[]): void {
  if (messages.length === 0) {
    removeItem(CHAT_HISTORY_KEY)
    return
  }
  setItem(CHAT_HISTORY_KEY, trimHistory(messages))
}
