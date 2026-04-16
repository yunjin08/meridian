import { useEffect } from 'react'
import { useBalanceStore } from '@/store/balanceStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { API_BASE, BALANCE_POLL_INTERVAL_MS } from '@/constants'
import type { AccountBalance } from '@/types/account'

async function fetchBalance(): Promise<AccountBalance> {
  const res = await fetch(`${API_BASE}/balance`)
  if (!res.ok) {
    const body = await res.json() as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<AccountBalance>
}

export function useBalance() {
  const setBalance = useBalanceStore((s) => s.setBalance)
  const setLoading = useBalanceStore((s) => s.setLoading)
  const setError = useBalanceStore((s) => s.setError)
  const setHoldings = useCryptoHoldingsStore((s) => s.setHoldings)

  function load() {
    setLoading(true)
    fetchBalance()
      .then((data) => {
        setBalance(data)
        setHoldings(data.holdings)
        setError(null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load balance'
        console.error('[useBalance] fetch failed:', err)
        setError(msg)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    load()

    const interval = setInterval(() => {
      if (!document.hidden) load()
    }, BALANCE_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
