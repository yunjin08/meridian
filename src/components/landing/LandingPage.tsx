import { useState } from 'react'
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket'
import { useCandles } from '@/hooks/useCandles'
import { LandingNav } from './LandingNav'
import { HeroSection } from './HeroSection'
import { MarketSection } from './MarketSection'
import { FeatureGrid } from './FeatureGrid'
import { ArchitectureSection } from './ArchitectureSection'
import { StackStrip } from './StackStrip'
import { LandingFooter } from './LandingFooter'
import { SignInModal } from './SignInModal'

/**
 * Public page shown before login. Only public BTCUSDT market data is fetched
 * here; every hook that touches the owner's account mounts in AppInner.
 */
export function LandingPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  useBinanceWebSocket()
  useCandles()
  const [isSignInOpen, setIsSignInOpen] = useState(false)

  return (
    <div className="flex min-h-[100dvh] flex-col bg-terminal-bg text-text-primary">
      <LandingNav onSignIn={() => setIsSignInOpen(true)} />
      <main className="flex-1">
        <HeroSection />
        <FeatureGrid />
        <MarketSection />
        <ArchitectureSection />
        <StackStrip />
      </main>
      <LandingFooter />
      {isSignInOpen && (
        <SignInModal onClose={() => setIsSignInOpen(false)} onAuthenticated={onAuthenticated} />
      )}
    </div>
  )
}
