import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import { useChat, type ChatDraft } from '@/hooks/useChat'
import { ChatMessage, AssistantBody } from '@/components/chat/ChatMessage'

const SUGGESTIONS = [
  'How am I doing overall, and where am I losing money?',
  'Why are stocks down today?',
  'Is the market fearful or greedy right now?',
  'Alert me if BTC drops under its 4h Bollinger lower band',
]

// Autoscroll only while the reader is already at the bottom, so scrolling up
// to re-read an earlier answer is not yanked back by streaming text.
const STICK_THRESHOLD_PX = 48

function DraftBubble({ draft }: { draft: ChatDraft }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[88%] text-[13px] px-3 py-2 rounded-lg leading-relaxed bg-terminal-bg text-text-primary border border-panel-border">
        {draft.text ? (
          <AssistantBody text={draft.text} />
        ) : (
          <span className="inline-flex items-center gap-1 text-text-muted">
            <span className="chat-dot">●</span>
            <span className="chat-dot">●</span>
            <span className="chat-dot">●</span>
          </span>
        )}
      </div>
      {draft.status && (
        <div className="px-1 text-[11px] text-text-muted font-mono">{draft.status}…</div>
      )}
    </div>
  )
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [isWide, setIsWide] = useState(false)
  const [input, setInput] = useState('')
  const { messages, isLoading, error, draft, sendMessage, clearHistory } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages, draft, error])

  useEffect(() => {
    if (isOpen) {
      stickToBottom.current = true
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const submit = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    stickToBottom.current = true
    await sendMessage(text)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const handleSuggestion = async (suggestion: string) => {
    setInput('')
    stickToBottom.current = true
    await sendMessage(suggestion)
  }

  const panelWidth = isWide ? 'w-[min(760px,calc(100vw-2rem))]' : 'w-[min(440px,calc(100vw-2rem))]'

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {isOpen && (
        <div
          className={`${panelWidth} h-[min(680px,calc(100vh-7rem))] flex flex-col bg-panel-bg border border-panel-border rounded-xl shadow-2xl overflow-hidden transition-[width] duration-200`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-panel-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-btc-orange font-mono text-sm">◈</span>
              <span className="text-text-primary text-sm font-medium tracking-wide">Investing Assistant</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {messages.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-text-muted hover:text-text-primary transition-colors"
                  title="Clear history"
                >
                  clear
                </button>
              )}
              <button
                onClick={() => setIsWide((w) => !w)}
                className="text-text-muted hover:text-text-primary transition-colors font-mono"
                aria-label={isWide ? 'Narrow panel' : 'Widen panel'}
                title={isWide ? 'Narrow' : 'Widen'}
              >
                {isWide ? '⇥' : '⇤'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Transcript */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="chat-scroll flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0"
          >
            {messages.length === 0 && !draft ? (
              <div className="flex flex-col gap-2 mt-1">
                <p className="text-text-muted text-xs mb-1">
                  Ask about the market, your portfolio, or manage alerts and the watchlist.
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void handleSuggestion(s)}
                    disabled={isLoading}
                    className="text-left text-[13px] text-text-muted hover:text-text-primary bg-terminal-bg hover:border-panel-border border border-transparent px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
            )}

            {draft && <DraftBubble draft={draft} />}

            {error != null && !isLoading && (
              <p className="text-bear-red text-xs text-center">{error}</p>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={handleSubmit} className="border-t border-panel-border p-3 flex gap-2 items-end shrink-0">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about prices, your P&L, create alerts…"
              disabled={isLoading}
              className="chat-scroll flex-1 resize-none max-h-32 bg-terminal-bg text-text-primary text-[13px] px-3 py-2 rounded-lg border border-panel-border focus:outline-none focus:border-btc-orange disabled:opacity-50 placeholder-text-muted font-mono leading-relaxed"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="h-9 w-9 rounded-lg bg-btc-orange/15 text-btc-orange hover:bg-btc-orange hover:text-white disabled:opacity-30 disabled:hover:bg-btc-orange/15 disabled:hover:text-btc-orange transition-colors text-sm shrink-0"
              aria-label="Send"
            >
              ▶
            </button>
          </form>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-12 h-12 rounded-full bg-btc-orange hover:bg-orange-400 text-white flex items-center justify-center shadow-lg transition-colors text-base"
        aria-label={isOpen ? 'Close assistant' : 'Open investing assistant'}
        title="Investing Assistant"
      >
        {isOpen ? '✕' : '💬'}
      </button>
    </div>
  )
}
