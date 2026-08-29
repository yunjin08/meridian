import { useState } from 'react'
import { getNotificationPermission, requestNotificationPermission } from '@/lib/notifications'

/** Browsers grant Notification permission only from a user gesture, hence a button. */
export function EnableNotificationsButton() {
  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission())

  if (permission !== 'default') return null

  return (
    <button
      type="button"
      onClick={() => {
        void requestNotificationPermission().then(setPermission)
      }}
      className="px-2.5 py-1 rounded border border-panel-border font-mono text-xs text-text-muted hover:text-text-primary hover:border-text-muted"
    >
      Enable notifications
    </button>
  )
}
