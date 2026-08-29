import { useEffect } from 'react'
import type { RefObject } from 'react'
import {
  getHeroTimeline,
  hasHeroTimeline,
  segment,
  HERO_TIMELINE_LENGTH,
} from '@/lib/theatre/heroTimeline'

type Animated = HTMLElement | SVGElement

function fadeUp(el: Animated | null, value: number, distance: number) {
  if (el === null) return
  el.style.opacity = String(value)
  el.style.transform = `translateY(${((1 - value) * distance).toFixed(2)}px)`
}

function pop(el: Animated | null, value: number) {
  if (el === null) return
  el.style.opacity = String(Math.min(1, value * 1.5))
  el.style.transform = `translate(-50%, -50%) scale(${value.toFixed(3)})`
}

interface StudioLike {
  initialize: () => void
}

// @theatre/studio ships CommonJS; depending on the bundler the studio object
// arrives as the module's default export or one level deeper.
function resolveStudio(mod: unknown): StudioLike | null {
  let candidate: unknown = mod
  for (let depth = 0; depth < 3; depth++) {
    if (candidate !== null && typeof candidate === 'object' && 'initialize' in candidate) {
      return candidate as StudioLike
    }
    candidate = (candidate as { default?: unknown } | null)?.default
  }
  return null
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Binds the hero's Theatre.js sequence to the DOM under `containerRef`.
 * Elements opt in with `data-anim="<key>"`; values are written straight to
 * inline styles so no React render happens per frame.
 */
export function useHeroTimeline(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = containerRef.current
    if (root === null) return

    const pick = (key: string) => root.querySelector<Animated>(`[data-anim="${key}"]`)
    const pickAll = (prefix: string) =>
      Array.from(root.querySelectorAll<Animated>(`[data-anim^="${prefix}-"]`))

    const headline = pick('headline')
    const subtext = pick('subtext')
    const ctas = pick('ctas')
    const path = pick('curve-path')
    const area = pick('curve-area')
    const nodes = pickAll('node')
    const endpoint = pick('curve-end')
    const glow = pick('curve-glow')
    const card = pick('card')
    const alloc = [pick('alloc-0'), pick('alloc-1'), pick('alloc-2')]
    const rows = pickAll('row')
    const deadline = pick('deadline')

    let cancelled = false
    const unsubscribes: (() => void)[] = []

    async function start() {
      // Studio is the visual keyframe editor. It is AGPL and dev-only, so it is
      // never bundled; opt in locally with `?studio` in the URL.
      if (import.meta.env.DEV && window.location.search.includes('studio')) {
        const studio = resolveStudio(await import('@theatre/studio'))
        if (studio !== null) studio.initialize()
        else console.warn('[hero] @theatre/studio loaded but exposed no initialize()')
      }
      if (cancelled) return

      const { project, sheet, text, curve, card: cardObject } = getHeroTimeline()

      unsubscribes.push(
        text.onValuesChange((v) => {
          fadeUp(headline, v.headline, 28)
          fadeUp(subtext, v.subtext, 20)
          fadeUp(ctas, v.ctas, 16)
        }),
        curve.onValuesChange((v) => {
          if (path !== null) path.style.strokeDashoffset = String(1 - v.progress)
          if (area !== null) area.style.opacity = String(v.area)
          nodes.forEach((node, i) => pop(node, segment(v.nodes, i)))
          pop(endpoint, Math.min(1, Math.max(0, (v.progress - 0.92) * 12.5)))
          if (glow !== null) {
            glow.style.opacity = String((1 - v.glow) * 0.7)
            glow.style.transform = `translate(-50%, -50%) scale(${(1 + v.glow * 2.6).toFixed(3)})`
          }
        }),
        cardObject.onValuesChange((v) => {
          if (card !== null) {
            card.style.opacity = String(v.enter)
            card.style.transform = `translateY(${((1 - v.enter) * 32).toFixed(2)}px) scale(${(0.97 + v.enter * 0.03).toFixed(4)})`
          }
          const fills = [v.crypto, v.stocks, v.reits]
          fills.forEach((value, i) => {
            const el = alloc[i]
            if (el) el.style.transform = `scaleX(${value.toFixed(4)})`
          })
          rows.forEach((row, i) => fadeUp(row, segment(v.rows, i), 10))
          fadeUp(deadline, v.deadline, 12)
        }),
      )

      await project.ready
      if (cancelled) return
      if (prefersReducedMotion()) {
        sheet.sequence.position = HERO_TIMELINE_LENGTH
      } else {
        sheet.sequence.position = 0
        void sheet.sequence.play({ range: [0, HERO_TIMELINE_LENGTH] })
      }
    }

    void start()

    return () => {
      cancelled = true
      if (hasHeroTimeline()) getHeroTimeline().sheet.sequence.pause()
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, [containerRef])
}
