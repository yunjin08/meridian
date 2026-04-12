export function ChartLoadingOverlay() {
  return (
    <div className="absolute inset-0 bg-terminal-bg/80 flex items-center justify-center z-10 rounded-lg">
      <div className="flex items-center gap-2 text-text-muted text-sm font-mono">
        <div className="w-4 h-4 border-2 border-btc-orange border-t-transparent rounded-full animate-spin" />
        Loading candles…
      </div>
    </div>
  )
}
