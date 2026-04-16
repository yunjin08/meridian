import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, AlertCondition } from '@/types/alert'

interface AlertState {
  alerts: Alert[]

  addAlert: (label: string, symbol: string, condition: AlertCondition, autoReset?: boolean) => void
  removeAlert: (id: string) => void
  toggleActive: (id: string) => void
  markTriggered: (id: string) => void
  resetAlert: (id: string) => void
  updateLastEvaluatedPrice: (id: string, price: number) => void
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set) => ({
      alerts: [],

      addAlert: (label, symbol, condition, autoReset = false) =>
        set((state) => ({
          alerts: [
            ...state.alerts,
            {
              id: crypto.randomUUID(),
              label,
              symbol,
              condition,
              active: true,
              triggered: false,
              triggeredAt: null,
              createdAt: Date.now(),
              lastEvaluatedPrice: null,
              autoReset,
              autoResetAt: null,
            } satisfies Alert,
          ],
        })),

      removeAlert: (id) =>
        set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),

      toggleActive: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, active: !a.active } : a
          ),
        })),

      markTriggered: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id
              ? { ...a, triggered: true, triggeredAt: Date.now() }
              : a
          ),
        })),

      resetAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id
              ? { ...a, triggered: false, triggeredAt: null, autoResetAt: null }
              : a
          ),
        })),

      updateLastEvaluatedPrice: (id, price) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, lastEvaluatedPrice: price } : a
          ),
        })),
    }),
    {
      name: 'dashboard-alerts',
      // Only persist these fields — lastEvaluatedPrice resets on page load (intentional)
      partialize: (state) => ({
        alerts: state.alerts.map((a) => ({ ...a, lastEvaluatedPrice: null })),
      }),
    }
  )
)
