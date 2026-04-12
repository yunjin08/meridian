export function getNotificationPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

export function sendNotification(title: string, body: string, tag: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  new Notification(title, {
    body,
    tag,          // prevents duplicate notifications for the same alert
    icon: '/favicon.ico',
  })
}

export function formatAlertNotificationBody(label: string, detail: string): string {
  return `${label}: ${detail}`
}
