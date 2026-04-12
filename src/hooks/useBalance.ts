import { useEffect, useRef } from 'react'
import { useBalanceStore } from '@/store/balanceStore'
import { usePriceStore } from '@/store/priceStore'
import { API_BASE, BALANCE_POLL_INTERVAL_MS } from '@/constants'
import type { AccountBalance } from '@/types/account'

async function fetchBalance(price: number | null): Promise<AccountBalance> {
  const url = price !== null
    ? `${API_BASE}/balance?price=${price}`
    : `${API_BASE}/balance`
  const res = await fetch(url)
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

  const priceRef = useRef<number | null>(null)

  // Track current price in a ref to avoid effect re-runs on price changes
  useEffect(() => {
    return usePriceStore.subscribe((state) => {
      priceRef.current = state.price
    })
  }, [])

  function load() {
    setLoading(true)
    fetchBalance(priceRef.current)
      .then((data) => {
        setBalance(data)
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
      if (!document.hidden) {
        load()
      }
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
