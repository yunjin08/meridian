export function FingerprintIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 10a2 2 0 0 1 2 2c0 2.4-.3 4.3-.9 6" />
      <path d="M10 12a2 2 0 0 1 3.2-1.6" />
      <path d="M9.8 19.3c.8-1.6 1.2-3.4 1.2-5.3v-2" />
      <path d="M7 17.5c.7-1.6 1-3.4 1-5.5a4 4 0 0 1 6.6-3" />
      <path d="M16 12c0 3-.4 5.6-1.2 8" />
      <path d="M5 14.5c.3-1 .5-2 .5-2.5a6.5 6.5 0 0 1 11.2-4.5" />
      <path d="M19 11c0 4-.5 7-1.4 9.6" />
      <path d="M3.5 10.5A9 9 0 0 1 12 3a8.9 8.9 0 0 1 6.4 2.7" />
    </svg>
  )
}
