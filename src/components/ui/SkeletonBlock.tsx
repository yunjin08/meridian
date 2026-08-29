interface SkeletonBlockProps {
  className?: string
}

export function SkeletonBlock({ className = '' }: SkeletonBlockProps) {
  return <div className={`animate-pulse rounded bg-panel-border/60 ${className}`} aria-hidden="true" />
}
