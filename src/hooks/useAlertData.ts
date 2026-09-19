import { useEffect } from 'react'
import { useAlertStore } from '@/store/alertStore'
import { ALERT_POLL_INTERVAL_MS } from '@/constants'

/**
 * Loads alerts from the server and re-polls so a trigger the cron set while
 * this tab was open (or was closed and reopened) shows up without a refresh.
 */
export function useAlertData() {
  const load = useAlertStore((s) => s.load)

  useEffect(() => {
    void load()

    const interval = setInterval(() => {
      if (!document.hidden) void load()
    }, ALERT_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [load])
}
