import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { requireAuth } from './utils/auth.ts'
import { ok, preflight, internalError } from './utils/http.ts'
import { getDb, schema } from './utils/db.ts'

// One-off: copies the handful of rows that lived in Supabase before the
// Netlify Database migration. Safe to call more than once (onConflictDoNothing).
// Delete this file once run successfully in production.

const ALERTS = [
  {
    id: 'e061c7d6-a84f-4aec-a535-47b21732ec98',
    label: 'ID sell signal - recent high',
    symbol: 'IDUSDT',
    conditionType: 'price_above',
    threshold: '0.037',
    active: true,
    triggered: true,
    triggeredAt: '2026-09-21T11:03:04.381+00:00',
    autoReset: false,
    lastPrice: '0.0371',
    createdAt: '2026-09-21T09:26:39.803345+00:00',
    updatedAt: '2026-09-21T11:03:04.381+00:00',
  },  {
    id: '98f0054c-7e23-41af-953e-e217bfdc3724',
    label: 'TIA sell signal - recent high',
    symbol: 'TIAUSDT',
    conditionType: 'price_above',
    threshold: '0.48',
    active: true,
    triggered: false,
    triggeredAt: null,
    autoReset: false,
    lastPrice: '0.4784',
    createdAt: '2026-09-21T09:26:40.192618+00:00',
    updatedAt: '2026-09-21T09:26:40.192618+00:00',
  },  {
    id: '9fee2983-bfdb-49ae-b89f-eed56ebf67f0',
    label: 'JTO sell signal - recent high',
    symbol: 'JTOUSDT',
    conditionType: 'price_above',
    threshold: '0.75',
    active: true,
    triggered: false,
    triggeredAt: null,
    autoReset: false,
    lastPrice: '0.5255',
    createdAt: '2026-09-21T10:31:51.71069+00:00',
    updatedAt: '2026-09-21T10:31:51.71069+00:00',
  },  {
    id: 'a2a41e40-ec0e-4571-9321-bd71d28b4640',
    label: 'ZK sell signal - recent high',
    symbol: 'ZKUSDT',
    conditionType: 'price_above',
    threshold: '0.015',
    active: true,
    triggered: false,
    triggeredAt: null,
    autoReset: false,
    lastPrice: '0.012',
    createdAt: '2026-09-21T10:31:51.71069+00:00',
    updatedAt: '2026-09-21T10:31:51.71069+00:00',
  }
]

const WEBAUTHN_CREDENTIALS = [
  {
    credentialId: 'Ie8xS4dJDZzBvp5oVzIcXg',
    publicKey: 'pQECAyYgASFYIKtphDImm-QdiMcE9mncddDgdseoD1-t4zciwbvvwOUXIlgg9ZtJJagcwEgH6zOp7HiFSitzFfSScSWs-pi03nnjcjw',
    counter: 0,
    transports: ["hybrid", "internal"],
    deviceLabel: 'macOS, Chrome',
    createdAt: '2026-08-31T20:32:51.150299+00:00',
    lastUsedAt: '2026-09-07T17:03:21.191+00:00',
  }
]

export const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    const db = getDb()
    let alertsInserted = 0
    for (const a of ALERTS) {
      const result = await db.insert(schema.alerts).values(a).onConflictDoNothing().returning({ id: schema.alerts.id })
      alertsInserted += result.length
    }

    let credentialsInserted = 0
    for (const c of WEBAUTHN_CREDENTIALS) {
      const result = await db
        .insert(schema.webauthnCredentials)
        .values(c)
        .onConflictDoNothing()
        .returning({ credentialId: schema.webauthnCredentials.credentialId })
      credentialsInserted += result.length
    }

    return ok({ alertsInserted, credentialsInserted, alertsAttempted: ALERTS.length, credentialsAttempted: WEBAUTHN_CREDENTIALS.length })
  } catch (err) {
    console.error('[migrate-legacy-data] failed:', err)
    // Names only, never values — narrows down what this function's runtime
    // environment actually has, since two different resolution paths have
    // both failed to find a database connection string here.
    const relevantEnvKeys = Object.keys(process.env)
      .filter((k) => /DATABASE|NETLIFY_DB|NEON/i.test(k))
      .sort()
    return internalError(
      `${err instanceof Error ? err.message : 'unknown error'} | relevant env keys present: [${relevantEnvKeys.join(', ')}] | NETLIFY_DEV=${process.env['NETLIFY_DEV'] ?? 'unset'} | CONTEXT=${process.env['CONTEXT'] ?? 'unset'}`
    )
  }
}
