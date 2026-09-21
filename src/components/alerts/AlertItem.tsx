import { useState } from 'react'
import { useAlertStore } from '@/store/alertStore'
import { formatTimestamp } from '@/lib/formatters'
import { describeCondition } from '@/lib/alertEvaluation'
import type { Alert } from '@/types/alert'

interface AlertItemProps {
  alert: Alert
}

export function AlertItem({ alert }: AlertItemProps) {
  const toggleActive = useAlertStore((s) => s.toggleActive)
  const removeAlert = useAlertStore((s) => s.removeAlert)
  const resetAlert = useAlertStore((s) => s.resetAlert)
  const [actionError, setActionError] = useState<string | null>(null)

  function onError(err: unknown): void {
    setActionError(err instanceof Error ? err.message : 'Action failed')
  }

  return (
    <div
      className={[
        'flex items-start justify-between gap-2 p-2 rounded border text-xs',
        alert.triggered
          ? 'border-btc-orange/50 bg-btc-orange/5'
          : alert.active
          ? 'border-panel-border bg-terminal-bg'
          : 'border-panel-border/50 bg-terminal-bg opacity-50',
      ].join(' ')}
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-text-primary truncate">{alert.label}</div>
        <div className="text-text-muted font-mono mt-0.5">
          <span className="text-text-muted/60">[{alert.symbol}]</span> {describeCondition(alert)}
        </div>
        {alert.triggered && alert.triggeredAt !== null && (
          <div className="text-btc-orange mt-0.5">
            Triggered {formatTimestamp(alert.triggeredAt)}
          </div>
        )}
        {actionError !== null && <div className="text-bear-red mt-0.5">{actionError}</div>}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {alert.triggered && (
          <button
            onClick={() => resetAlert(alert.id).catch(onError)}
            className="text-text-muted hover:text-text-primary px-1.5 py-0.5 rounded border border-panel-border hover:border-text-muted/50 transition-colors"
            title="Reset alert"
          >
            ↺
          </button>
        )}
        <button
          onClick={() => toggleActive(alert.id).catch(onError)}
          className={[
            'px-1.5 py-0.5 rounded border transition-colors text-xs font-mono',
            alert.active
              ? 'text-bull-green border-bull-green/40 hover:bg-bull-green/10'
              : 'text-text-muted border-panel-border hover:border-text-muted/50',
          ].join(' ')}
          title={alert.active ? 'Pause alert' : 'Enable alert'}
        >
          {alert.active ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={() => removeAlert(alert.id).catch(onError)}
          className="text-bear-red/60 hover:text-bear-red px-1.5 py-0.5 rounded border border-transparent hover:border-bear-red/30 transition-colors"
          title="Delete alert"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
