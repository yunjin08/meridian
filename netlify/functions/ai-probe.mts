import type { Config } from '@netlify/functions'

// Temporary diagnostic in the Functions 2.0 runtime. Reports presence only, no
// values, so the two runtimes can be compared for AI Gateway injection.
const isSet = (name: string): boolean => (process.env[name] ?? '') !== ''

export default async (): Promise<Response> =>
  Response.json({
    runtime: 'functions-v2',
    gateway: isSet('NETLIFY_AI_GATEWAY_KEY'),
    gatewayUrl: isSet('NETLIFY_AI_GATEWAY_URL'),
    anthropicKey: isSet('ANTHROPIC_API_KEY'),
    anthropicBaseUrl: isSet('ANTHROPIC_BASE_URL'),
    openaiKey: isSet('OPENAI_API_KEY'),
    envCount: Object.keys(process.env).length,
    netlifyVars: Object.keys(process.env).filter((k) => k.startsWith('NETLIFY_')).sort(),
  })

export const config: Config = { path: '/api/ai-probe' }
