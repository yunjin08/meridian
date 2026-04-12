const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactPriceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatPrice(price: number): string {
  return priceFormatter.format(price)
}

export function formatPriceCompact(price: number): string {
  return compactPriceFormatter.format(price)
}

export function formatPercent(value: number, includeSign = true): string {
  const sign = includeSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatBtc(value: number): string {
  return `${value.toFixed(8)} BTC`
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals)
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

/** Returns the last non-NaN value from an array, or null if none. */
export function lastValue(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i]
    if (v !== undefined && !isNaN(v)) return v
  }
  return null
}
