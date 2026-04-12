// Thin helpers used by alertStore's persist middleware.
// The Zustand persist middleware calls getItem/setItem directly on localStorage,
// so these are mostly for manual use if needed outside Zustand.

export function getItem<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or private browsing — fail silently
  }
}

export function removeItem(key: string): void {
  localStorage.removeItem(key)
}
