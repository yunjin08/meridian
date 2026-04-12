import { useState } from 'react'
import { useAlertStore } from '@/store/alertStore'
import { requestNotificationPermission } from '@/lib/notifications'
import type { AlertCondition, AlertConditionType } from '@/types/alert'

const CONDITION_OPTIONS: { value: AlertConditionType; label: string; hasThreshold: boolean }[] = [
  { value: 'price_above',     label: 'Price above ($)',   hasThreshold: true },
  { value: 'price_below',     label: 'Price below ($)',   hasThreshold: true },
  { value: 'price_crosses',   label: 'Price crosses ($)', hasThreshold: true },
  { value: 'rsi_above',       label: 'RSI above',         hasThreshold: true },
  { value: 'rsi_below',       label: 'RSI below',         hasThreshold: true },
  { value: 'macd_crossover',  label: 'MACD crossover',    hasThreshold: false },
  { value: 'macd_crossunder', label: 'MACD crossunder',   hasThreshold: false },
]

export function AlertForm() {
  const addAlert = useAlertStore((s) => s.addAlert)

  const [label, setLabel] = useState('')
  const [conditionType, setConditionType] = useState<AlertConditionType>('price_below')
  const [threshold, setThreshold] = useState('')
  const [autoReset, setAutoReset] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = CONDITION_OPTIONS.find((o) => o.value === conditionType)
  const needsThreshold = selected?.hasThreshold ?? true

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (label.trim() === '') {
      setError('Label is required')
      return
    }

    if (needsThreshold) {
      const val = parseFloat(threshold)
      if (isNaN(val) || val <= 0) {
        setError('Enter a valid threshold value')
        return
      }
    }

    // Request notification permission on first alert creation (requires user gesture)
    await requestNotificationPermission()

    let condition: AlertCondition
    if (conditionType === 'macd_crossover' || conditionType === 'macd_crossunder') {
      condition = { type: conditionType }
    } else if (conditionType === 'rsi_above' || conditionType === 'rsi_below') {
      condition = { type: conditionType, threshold: parseFloat(threshold) }
    } else {
      condition = {
        type: conditionType as 'price_above' | 'price_below' | 'price_crosses',
        threshold: parseFloat(threshold),
      }
    }

    addAlert(label.trim(), condition, autoReset)
    setLabel('')
    setThreshold('')
    setAutoReset(false)
  }

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg p-4">
      <div className="text-xs text-text-muted mb-3 font-mono">New Alert</div>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-3">
        <div>
          <label className="block text-xs text-text-muted/60 mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. RSI oversold"
            className="w-full bg-terminal-bg border border-panel-border rounded px-2 py-1.5 text-sm text-text-primary font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-btc-orange/60"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted/60 mb-1">Condition</label>
          <select
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value as AlertConditionType)}
            className="w-full bg-terminal-bg border border-panel-border rounded px-2 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-btc-orange/60"
          >
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {needsThreshold && (
          <div>
            <label className="block text-xs text-text-muted/60 mb-1">Value</label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              step="any"
              placeholder={conditionType.startsWith('rsi') ? '0–100' : '65000'}
              className="w-full bg-terminal-bg border border-panel-border rounded px-2 py-1.5 text-sm text-text-primary font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-btc-orange/60"
            />
          </div>
        )}

        {conditionType === 'price_crosses' && (
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoReset}
              onChange={(e) => setAutoReset(e.target.checked)}
              className="accent-btc-orange"
            />
            Auto-reset after 5 min (re-fire on repeated crosses)
          </label>
        )}

        {error !== null && <div className="text-bear-red text-xs">{error}</div>}

        <button
          type="submit"
          className="w-full bg-btc-orange text-terminal-bg font-mono font-bold text-sm py-2 rounded hover:brightness-110 transition-all"
        >
          Add Alert
        </button>
      </form>
    </div>
  )
}
