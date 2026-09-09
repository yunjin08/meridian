import type { Handler } from '@netlify/functions'
import { ok } from './utils/http.ts'

// Presence only, never values. The AI Gateway injects NETLIFY_AI_GATEWAY_KEY
// whenever it is active and skips ANTHROPIC_API_KEY if the project already
// defines one, so these two booleans tell apart "gateway off" from "gateway
// blocked by a project-level key" without reading any secret.
const isSet = (name: string): boolean => (process.env[name] ?? '') !== ''

export const handler: Handler = async () =>
  ok({
    status: 'ok',
    ts: Date.now(),
    ai: {
      gateway: isSet('NETLIFY_AI_GATEWAY_KEY'),
      anthropicKey: isSet('ANTHROPIC_API_KEY'),
      anthropicBaseUrl: isSet('ANTHROPIC_BASE_URL'),
      anthropicKeyDefinedButEmpty: process.env['ANTHROPIC_API_KEY'] === '',
    },
  })
