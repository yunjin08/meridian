import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_HISTORY_KEY, CHAT_HISTORY_LIMIT, loadChatHistory, saveChatHistory, trimHistory } from './chatHistory'
import type { ChatMessage } from '@/types/chat'

function message(i: number, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { id: `m${i}`, role, content: `msg ${i}`, timestamp: i }
}

// Vitest runs in node here; a tiny in-memory localStorage is enough.
function fakeStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    store,
  }
}

let storage: ReturnType<typeof fakeStorage>

beforeEach(() => {
  storage = fakeStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat history persistence', () => {
  it('round-trips messages including lookups and failure markers', () => {
    const messages: ChatMessage[] = [
      message(1),
      { ...message(2, 'assistant'), lookups: [{ name: 'get_candles', summary: 'ETHUSDT 4h, 100 candles' }] },
      { ...message(3, 'assistant'), failed: true },
    ]
    saveChatHistory(messages)
    expect(loadChatHistory()).toEqual(messages)
  })

  it('keeps only the newest messages past the cap', () => {
    const many = Array.from({ length: CHAT_HISTORY_LIMIT + 25 }, (_, i) => message(i))
    expect(trimHistory(many).map((m) => m.id)).toEqual(many.slice(25).map((m) => m.id))
    saveChatHistory(many)
    expect(loadChatHistory()).toHaveLength(CHAT_HISTORY_LIMIT)
  })

  it('drops malformed entries instead of trusting them', () => {
    storage.setItem(
      CHAT_HISTORY_KEY,
      JSON.stringify([message(1), { id: 'bad', role: 'system', content: 'x', timestamp: 1 }, 'junk', null])
    )
    expect(loadChatHistory()).toEqual([message(1)])
  })

  it('returns nothing for a missing or corrupt key', () => {
    expect(loadChatHistory()).toEqual([])
    storage.setItem(CHAT_HISTORY_KEY, '{not json')
    expect(loadChatHistory()).toEqual([])
  })

  it('removes the key when the history is cleared', () => {
    saveChatHistory([message(1)])
    expect(storage.store.has(CHAT_HISTORY_KEY)).toBe(true)
    saveChatHistory([])
    expect(storage.store.has(CHAT_HISTORY_KEY)).toBe(false)
  })
})
