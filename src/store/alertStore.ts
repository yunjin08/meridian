import { create } from 'zustand'
import * as api from '@/lib/alertsApi'
import { takeLegacyAlerts } from '@/lib/alertMigration'
import { sendNotification } from '@/lib/notifications'
import { describeCondition } from '@/lib/alertEvaluation'
import type { Alert, AlertEditFields, AlertInput } from '@/types/alert'

interface AlertState {
  alerts: Alert[]
  isLoading: boolean
  hasLoaded: boolean
  error: string | null

  load: () => Promise<void>
  addAlert: (input: AlertInput) => Promise<void>
  editAlert: (id: string, fields: AlertEditFields) => Promise<void>
  removeAlert: (id: string) => Promise<void>
  toggleActive: (id: string) => Promise<void>
  resetAlert: (id: string) => Promise<void>
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

// Alert conditions are evaluated only by the cron now, never in the browser.
// This notices a triggered transition purely by diffing successive polls
// against server truth — it never computes a condition itself, so it can't
// reintroduce the race the old in-browser evaluator had with the cron.
function notifyFreshTriggers(previous: Alert[], next: Alert[]): void {
  for (const alert of next) {
    const before = previous.find((a) => a.id === alert.id)
    if (alert.triggered && !(before?.triggered ?? false)) {
      sendNotification(`${alert.symbol} Alert`, describeCondition(alert), alert.id)
    }
  }
}

export const useAlertStore = create<AlertState>()((set, get) => {
  async function mutate(fallback: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
      set({ error: null })
    } catch (err) {
      set({ error: messageOf(err, fallback) })
      throw err
    }
  }

  return {
    alerts: [],
    isLoading: false,
    hasLoaded: false,
    error: null,

    load: async () => {
      set({ isLoading: true })
      try {
        let alerts = await api.fetchAlerts()

        if (alerts.length === 0) {
          const legacy = takeLegacyAlerts()
          if (legacy.length > 0) {
            const migrated = await Promise.all(legacy.map((input) => api.createAlert(input)))
            alerts = migrated
          }
        }

        const previous = get().alerts
        // Skip notifying on the very first load — every already-triggered
        // alert would otherwise "transition" the moment the tab opens.
        if (get().hasLoaded) notifyFreshTriggers(previous, alerts)

        set({ alerts, hasLoaded: true, error: null })
      } catch (err) {
        console.error('[alertStore] load failed:', err)
        set({ error: messageOf(err, 'Failed to load alerts') })
      } finally {
        set({ isLoading: false })
      }
    },

    addAlert: (input) =>
      mutate('Failed to add alert', async () => {
        const alert = await api.createAlert(input)
        set({ alerts: [alert, ...get().alerts] })
      }),

    editAlert: (id, fields) =>
      mutate('Failed to edit alert', async () => {
        const updated = await api.editAlert(id, fields)
        set({ alerts: get().alerts.map((a) => (a.id === id ? updated : a)) })
      }),

    removeAlert: (id) =>
      mutate('Failed to delete alert', async () => {
        await api.deleteAlert(id)
        set({ alerts: get().alerts.filter((a) => a.id !== id) })
      }),

    toggleActive: (id) =>
      mutate('Failed to update alert', async () => {
        const current = get().alerts.find((a) => a.id === id)
        if (!current) return
        const updated = await api.setAlertActive(id, !current.active)
        set({ alerts: get().alerts.map((a) => (a.id === id ? updated : a)) })
      }),

    resetAlert: (id) =>
      mutate('Failed to reset alert', async () => {
        const updated = await api.resetAlert(id)
        set({ alerts: get().alerts.map((a) => (a.id === id ? updated : a)) })
      }),
  }
})
