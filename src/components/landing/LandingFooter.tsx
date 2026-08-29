import { LANDING_GITHUB_URL, LANDING_REPO_URL } from '@/constants'

export function LandingFooter() {
  return (
    <footer className="border-t border-panel-border">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-text-muted sm:px-6">
        <p>
          Built by{' '}
          <a
            href={LANDING_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="text-text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange"
          >
            Jed Donaire
          </a>
        </p>
        <a
          href={LANDING_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="font-mono hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange"
        >
          github.com/yunjin08/meridian
        </a>
      </div>
    </footer>
  )
}
