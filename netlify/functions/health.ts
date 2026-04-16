import type { Handler } from '@netlify/functions'
import { ok } from './utils/http.ts'

export const handler: Handler = async () => ok({ status: 'ok', ts: Date.now() })
