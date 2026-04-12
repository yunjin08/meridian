import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { useChat } from '@/hooks/useChat'
import { ChatMessage } from '@/components/chat/ChatMessage'

const SUGGESTIONS = [
  'What is the current BTC price?',
  'Is RSI overbought or oversold?',
  'What is my total portfolio value?',
  'Are any alerts close to triggering?',
]

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const { messages, isLoading, error, sendMessage, clearHistory } = useChat()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    await sendMessage(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit(e as unknown as FormEvent)
    }
  }

  const handleSuggestion = async (suggestion: string) => {
    setInput('')
    await sendMessage(suggestion)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="w-80 flex flex-col bg-panel-bg border border-panel-border rounded-lg shadow-2xl"
             style={{ height: '420px' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-btc-orange font-mono text-sm">₿</span>
              <span className="text-text-primary text-xs font-medium tracking-wide">BTC Assistant</span>
            </div>
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-text-muted hover:text-text-primary text-xs transition-colors"
                  title="Clear history"
                >
                  clear
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-text-muted hover:text-text-primary text-xs transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-2 mt-2">
                <p className="text-text-muted text-xs text-center mb-1">
                  Ask about your live dashboard data
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void handleSuggestion(s)}
                    disabled={isLoading}
                    className="text-left text-xs text-text-muted hover:text-text-primary bg-terminal-bg hover:border-panel-border border border-transparent px-2.5 py-1.5 rounded transition-colors disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="text-text-muted text-xs px-2.5 py-1.5 bg-terminal-bg border border-panel-border rounded-lg">
                  <span className="animate-pulse">thinking…</span>
                </div>
              </div>
            )}

            {error != null && (
              <p className="text-bear-red text-xs text-center">{error}</p>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="border-t border-panel-border p-2 flex gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about price, balance, indicators…"
              disabled={isLoading}
              className="flex-1 bg-terminal-bg text-text-primary text-xs px-2.5 py-1.5 rounded border border-panel-border focus:outline-none focus:border-btc-orange disabled:opacity-50 placeholder-text-muted font-mono"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="text-btc-orange hover:text-white disabled:opacity-30 px-1.5 text-sm transition-colors"
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
        className="w-11 h-11 rounded-full bg-btc-orange hover:bg-orange-400 text-white flex items-center justify-center shadow-lg transition-colors text-base"
        aria-label={isOpen ? 'Close assistant' : 'Open BTC assistant'}
        title="BTC Assistant"
      >
        {isOpen ? '✕' : '💬'}
      </button>
    </div>
  )
}
