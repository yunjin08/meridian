import type { ReactNode } from 'react'

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-panel-border bg-terminal-bg px-2 py-0.5 font-mono text-[11px] text-text-muted">
      {children}
    </span>
  )
}
