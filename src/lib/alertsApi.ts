import { API_BASE } from '@/constants'
import type { Alert, AlertInput } from '@/types/alert'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config: RequestInit = {
    credentials: 'include',
    ...init,
  }
  if (init.body !== undefined) {
    config.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(`${API_BASE}${path}`, config)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; msg?: string }
      message = body.msg ?? body.error ?? message
    } catch {
      // non-JSON error body, keep the status message
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function fetchAlerts(): Promise<Alert[]> {
  const body = await request<{ alerts: Alert[] }>('/alerts')
  return body.alerts
}

export async function createAlert(input: AlertInput): Promise<Alert> {
  const body = await request<{ alert: Alert }>('/alerts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.alert
}

export async function setAlertActive(id: string, active: boolean): Promise<Alert> {
  const body = await request<{ alert: Alert }>(`/alerts?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ active }),
  })
  return body.alert
}

export async function resetAlert(id: string): Promise<Alert> {
  const body = await request<{ alert: Alert }>(`/alerts?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ reset: true }),
  })
  return body.alert
}

export async function deleteAlert(id: string): Promise<void> {
  await request<undefined>(`/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
