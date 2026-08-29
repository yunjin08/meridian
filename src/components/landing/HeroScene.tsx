import { useEffect, useRef } from 'react'

/**
 * The growth curve under the hero copy. It carries no data: the path is a
 * fixed shape, drawn on load by the Theatre.js timeline, with one node per
 * asset class. It sits in its own band so it never crosses text or buttons,
 * and the band overlaps the Overview card's bottom edge so the line reads as
 * feeding into it.
 */
const VIEW_W = 1200
const VIEW_H = 240
// The band overlaps the Overview card by 32-40px, so the curve flattens out
// above y=70 to finish just under the card's bottom-right corner, not behind it.
const CURVE =
  'M0 222 C150 218 230 200 340 182 C450 164 520 156 620 136 C720 116 800 112 900 96 C1000 80 1100 74 1200 70'

const NODES: { label: string; at: number; tone: string; ring: string }[] = [
  { label: 'Crypto', at: 0.24, tone: 'bg-btc-orange', ring: 'border-btc-orange/40' },
  { label: 'Stocks', at: 0.52, tone: 'bg-bull-green', ring: 'border-bull-green/40' },
  { label: 'REITs', at: 0.76, tone: 'bg-text-muted', ring: 'border-text-muted/40' },
]

function place(el: HTMLElement | null, point: DOMPoint) {
  if (el === null) return
  el.style.left = `${((point.x / VIEW_W) * 100).toFixed(3)}%`
  el.style.top = `${((point.y / VIEW_H) * 100).toFixed(3)}%`
}

export function HeroScene() {
  const pathRef = useRef<SVGPathElement>(null)
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)

  // Node markers are HTML so they keep their shape while the SVG stretches to
  // the band; their positions are read off the path once on mount.
  useEffect(() => {
    const path = pathRef.current
    if (path === null) return
    const total = path.getTotalLength()
    NODES.forEach((node, i) => {
      place(nodeRefs.current[i] ?? null, path.getPointAtLength(total * node.at))
    })
    const end = path.getPointAtLength(total)
    place(endRef.current, end)
    place(glowRef.current, end)
  }, [])

  return (
    <div className="pointer-events-none relative h-40 md:h-52 lg:h-60" aria-hidden="true">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F7931A" stopOpacity="0.18" />
            <stop offset="1" stopColor="#F7931A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          data-anim="curve-area"
          d={`${CURVE} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z`}
          fill="url(#hero-area)"
          style={{ opacity: 0 }}
        />
        <path
          ref={pathRef}
          data-anim="curve-path"
          d={CURVE}
          pathLength={1}
          stroke="#F7931A"
          strokeOpacity="0.9"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
        />
      </svg>

      {NODES.map((node, i) => (
        <div
          key={node.label}
          ref={(el) => {
            nodeRefs.current[i] = el
          }}
          data-anim={`node-${i}`}
          className="absolute flex flex-col items-center gap-1.5"
          style={{ opacity: 0, transform: 'translate(-50%, -50%) scale(0)' }}
        >
          <span className="font-mono text-[11px] text-text-muted">{node.label}</span>
          <span className={`flex h-4 w-4 items-center justify-center rounded-full border bg-terminal-bg ${node.ring}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${node.tone}`} />
          </span>
        </div>
      ))}

      <div
        ref={glowRef}
        data-anim="curve-glow"
        className="absolute h-5 w-5 rounded-full border border-btc-orange"
        style={{ opacity: 0, transform: 'translate(-50%, -50%) scale(1)' }}
      />
      <div
        ref={endRef}
        data-anim="curve-end"
        className="absolute h-2.5 w-2.5 rounded-full bg-btc-orange shadow-[0_0_12px_rgba(247,147,26,0.8)]"
        style={{ opacity: 0, transform: 'translate(-50%, -50%) scale(0)' }}
      />
    </div>
  )
}
