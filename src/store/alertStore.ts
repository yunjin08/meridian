import { create } from 'zustand'
import * as api from '@/lib/alertsApi'
import { takeLegacyAlerts } from '@/lib/alertMigration'
import type { Alert, AlertInput } from '@/types/alert'

interface AlertState {
  alerts: Alert[]
  // Previous price this browser tab saw per alert, for price_crosses detection.
  // Client-side only — never persisted or sent to the server, which tracks its
  // own copy (`last_price`) for the cron's independent cross detection.
  clientLastPrice: Record<string, number>
  isLoading: boolean
  hasLoaded: boolean
  error: string | null

  load: () => Promise<void>
  addAlert: (input: AlertInput) => Promise<void>
  removeAlert: (id: string) => Promise<void>
  toggleActive: (id: string) => Promise<void>
  resetAlert: (id: string) => Promise<void>
  markTriggered: (id: string) => void
  updateLastEvaluatedPrice: (id: string, price: number) => void
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
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
    clientLastPrice: {},
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

    // Fired from useAlertEvaluator for instant in-tab feedback. Updates local
    // state immediately for the notification/UI, then persists in the
    // background so the next cron run sees it already triggered and doesn't
    // send a duplicate email. A failed persist just means the cron (which
    // independently evaluates the same condition) catches it within a minute.
    markTriggered: (id) => {
      const triggeredAt = Date.now()
      set({
        alerts: get().alerts.map((a) => (a.id === id ? { ...a, triggered: true, triggeredAt } : a)),
      })
      void api.triggerAlert(id).catch((err: unknown) => {
        console.error('[alertStore] failed to persist trigger, cron will catch it:', err)
      })
    },

    updateLastEvaluatedPrice: (id, price) =>
      set({ clientLastPrice: { ...get().clientLastPrice, [id]: price } }),
  }
})
