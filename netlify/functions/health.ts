import type { Config } from '@netlify/functions'
import { corsHeaders } from './utils/http.ts'

// Presence only, never values. Runs as Functions 2.0 because the AI Gateway
// injects its variables into that runtime alone, so this is the honest place
// to report whether the chat and analysis functions will find credentials.
const isSet = (name: string): boolean => (process.env[name] ?? '') !== ''

export default async (): Promise<Response> =>
  Response.json(
    {
      status: 'ok',
      ts: Date.now(),
      ai: {
        gateway: isSet('NETLIFY_AI_GATEWAY_KEY'),
        anthropicKey: isSet('ANTHROPIC_API_KEY'),
        anthropicBaseUrl: isSet('ANTHROPIC_BASE_URL'),
      },
    },
    { headers: corsHeaders() }
  )

export const config: Config = { path: '/api/health' }
