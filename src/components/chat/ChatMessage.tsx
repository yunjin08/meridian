import type { ChatMessage } from '@/types/chat'

interface Props {
  message: ChatMessage
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] text-xs px-2.5 py-1.5 rounded-lg leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-btc-orange/20 text-text-primary'
            : 'bg-terminal-bg text-text-primary border border-panel-border'
        }`}
      >
        {message.content}
      </div>
    </div>
  )
}
