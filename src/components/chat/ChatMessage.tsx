import type { ReactNode } from 'react'
import type { ChatMessage as ChatMessageType } from '@/types/chat'

interface Props {
  message: ChatMessageType
}

/**
 * The model writes light markdown: bold runs and line breaks. Render just
 * those; anything richer stays literal so nothing is silently dropped.
 */
export function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-text-primary">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function AssistantBody({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{renderInline(text)}</div>
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'
  const lookups = message.lookups ?? []

  if (message.failed) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[88%] text-[13px] px-3 py-2 rounded-lg leading-relaxed border border-bear-red/40 text-bear-red font-mono">
          Request failed: {message.content}. Nothing was changed.
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[88%] text-[13px] px-3 py-2 rounded-lg leading-relaxed ${
          isUser
            ? 'bg-btc-orange/20 text-text-primary whitespace-pre-wrap [overflow-wrap:anywhere]'
            : 'bg-terminal-bg text-text-primary border border-panel-border'
        }`}
      >
        {isUser ? message.content : <AssistantBody text={message.content} />}
      </div>
      {lookups.length > 0 && (
        <div className="max-w-[88%] px-1 text-[11px] text-text-muted font-mono leading-snug">
          Looked up: {lookups.map((l) => l.summary).join(' · ')}
        </div>
      )}
    </div>
  )
}
