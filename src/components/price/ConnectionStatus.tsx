import { usePriceStore } from '@/store/priceStore'
import type { WsConnectionStatus } from '@/types/websocket'

const STATUS_CONFIG: Record<WsConnectionStatus, { label: string; dotClass: string }> = {
  connecting:    { label: 'Connecting',   dotClass: 'bg-yellow-400 animate-pulse' },
  connected:     { label: 'Live',         dotClass: 'bg-bull-green' },
  disconnected:  { label: 'Disconnected', dotClass: 'bg-bear-red' },
  reconnecting:  { label: 'Reconnecting', dotClass: 'bg-yellow-400 animate-pulse' },
  failed:        { label: 'Offline',      dotClass: 'bg-bear-red' },
}

export function ConnectionStatus() {
  const status = usePriceStore((s) => s.connectionStatus)
  const { label, dotClass } = STATUS_CONFIG[status]

  return (
    <div className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
      <span>{label}</span>
    </div>
  )
}
