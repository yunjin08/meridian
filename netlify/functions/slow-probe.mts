import type { Config } from '@netlify/functions'

// Temporary diagnostic: does a v2 function get cut at 5 s, and does streaming
// (bytes sent before the work finishes) escape that limit?
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url)
  const ms = Math.min(Number(url.searchParams.get('ms') ?? '7000'), 25_000)
  const mode = url.searchParams.get('mode') ?? 'buffer'
  const started = Date.now()

  if (mode === 'stream') {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'start' }) + '\n'))
        const ticks = Math.floor(ms / 1000)
        for (let i = 0; i < ticks; i++) {
          await sleep(1000)
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'tick', i }) + '\n'))
        }
        await sleep(ms - ticks * 1000)
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', elapsed: Date.now() - started }) + '\n'))
        controller.close()
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } })
  }

  await sleep(ms)
  return Response.json({ mode, elapsed: Date.now() - started })
}

export const config: Config = { path: '/api/slow-probe' }
