import type { ChatMessage } from '@/types/chat'

interface Props {
  message: ChatMessage
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'
  const lookups = message.lookups ?? []
  if (message.failed) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] text-xs px-2.5 py-1.5 rounded-lg leading-relaxed border border-bear-red/40 text-bear-red font-mono">
          Request failed: {message.content}. Nothing was changed.
        </div>
      </div>
    )
  }
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
