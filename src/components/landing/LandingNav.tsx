import { ConnectionStatus } from '@/components/price/ConnectionStatus'

export function LandingNav({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-panel-border bg-terminal-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold text-btc-orange">◈</span>
          <span className="font-semibold tracking-wide text-text-primary">Investing Dashboard</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden sm:block">
            <ConnectionStatus />
          </div>
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-md border border-panel-border px-3 py-1.5 font-mono text-xs text-text-muted transition-colors hover:border-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange active:translate-y-px"
          >
            Owner sign in
          </button>
        </div>
      </div>
    </header>
  )
}
