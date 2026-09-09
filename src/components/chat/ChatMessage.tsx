import type { ChatMessage } from '@/types/chat'

interface Props {
  message: ChatMessage
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'
  const lookups = message.lookups ?? []
  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] text-xs px-2.5 py-1.5 rounded-lg leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-btc-orange/20 text-text-primary'
            : 'bg-terminal-bg text-text-primary border border-panel-border'
        }`}
      >
        {message.content}
      </div>
      {lookups.length > 0 && (
        <div className="max-w-[85%] px-1 text-[10px] text-text-muted font-mono truncate">
          Looked up: {lookups.map((l) => l.summary).join(' · ')}
        </div>
      )}
    </div>
  )
}
