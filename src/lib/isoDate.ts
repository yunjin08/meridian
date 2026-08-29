// No `@/` imports in this file: it is bundled directly into Netlify
// Functions (via a relative import from netlify/functions/utils/tax-validation.ts),
// and that esbuild run has no path-alias configuration, so an `@/` import
// here would fail to resolve in the deployed function bundle.

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// All arithmetic runs on UTC midnight so a browser in UTC+8 and a function
// in UTC agree on which calendar day a string represents.
export function parseIsoDate(iso: string): Date {
  const match = ISO_DATE_PATTERN.exec(iso)
  if (match === null) throw new Error(`Invalid ISO date: ${iso}`)
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

export function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

export function isValidIsoDate(iso: string): boolean {
  if (!ISO_DATE_PATTERN.test(iso)) return false
  const parsed = parseIsoDate(iso)
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === iso
}
