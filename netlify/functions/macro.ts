import type { Handler } from '@netlify/functions'
import { preflight, ok, methodNotAllowed, internalError } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import { fetchCryptoMarket, fetchMacroSnapshot, MissingFredKeyError } from './utils/market-data.ts'
import type { MacroApiResponse } from '../../src/types/market.ts'

const DEFAULT_SYMBOL = 'BTCUSDT'

/**
 * Same snapshot the chat's read tools see, exposed for the UI and for manual
 * verification. Macro is null rather than an error when FRED is not configured
 * so the crypto half still renders.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse
  if (event.httpMethod !== 'GET') return methodNotAllowed()

  const symbol = (event.queryStringParameters?.['symbol'] ?? DEFAULT_SYMBOL).toUpperCase()

  try {
    const [macroResult, crypto] = await Promise.all([
      fetchMacroSnapshot().then(
        (macro) => ({ macro, error: null as unknown }),
        (error: unknown) => ({ macro: null, error })
      ),
      fetchCryptoMarket(symbol),
    ])

    if (macroResult.error && !(macroResult.error instanceof MissingFredKeyError)) {
      console.error('[macro] FRED snapshot failed:', macroResult.error)
    }

    const body: MacroApiResponse = { macro: macroResult.macro, crypto }
    return ok(body)
  } catch (err) {
    console.error('[macro] unexpected error:', err)
    return internalError('internal_error')
  }
}
