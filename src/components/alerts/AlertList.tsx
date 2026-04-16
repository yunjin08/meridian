import { useAlertStore } from '@/store/alertStore'
import { AlertItem } from './AlertItem'

export function AlertList() {
  const alerts = useAlertStore((s) => s.alerts)

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg p-4">
      <div className="text-xs text-text-muted mb-3 font-mono">
        Active Alerts ({alerts.length})
      </div>

      {alerts.length === 0 ? (
        <div className="text-text-muted/50 text-xs text-center py-4">
          No alerts — ask the assistant to create one.
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      {alerts.some((a) => a.triggered) && (
        <div className="mt-2 text-xs text-text-muted/60">
          Keep this tab open to receive alerts. Browser tab must be open for notifications to fire.
        </div>
      )}
    </div>
  )
}
