import type { Handler } from '@netlify/functions'

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok', ts: Date.now() }),
  }
}
