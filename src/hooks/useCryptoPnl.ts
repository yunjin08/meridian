import { useEffect } from 'react'
import { useCryptoPnlStore } from '@/store/cryptoPnlStore'
import { API_BASE, CRYPTO_PNL_POLL_INTERVAL_MS } from '@/constants'
import type { CryptoPnlResponse } from '@/types/pnl'

async function fetchCryptoPnl(): Promise<CryptoPnlResponse> {
  const res = await fetch(`${API_BASE}/crypto-pnl`, { credentials: 'include' })
  if (!res.ok) {
    const body = await res.json() as { error?: string; msg?: string }
    throw new Error(body.msg ?? body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<CryptoPnlResponse>
}

/**
 * Rebuilds crypto cost basis from Binance history. Each refresh is a burst of
 * ~30 Binance calls, so unlike the balance and quote hooks it polls every five
 * minutes and does not refetch on tab focus.
 */
export function useCryptoPnl() {
  const setData = useCryptoPnlStore((s) => s.setData)
  const setLoading = useCryptoPnlStore((s) => s.setLoading)
  const setError = useCryptoPnlStore((s) => s.setError)

  function load() {
    setLoading(true)
    fetchCryptoPnl()
      .then((data) => {
        setData(data)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load crypto P&L'
        console.error('[useCryptoPnl] fetch failed:', err)
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
    }, CRYPTO_PNL_POLL_INTERVAL_MS)

    return () => {
      clearInterval(interval)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
