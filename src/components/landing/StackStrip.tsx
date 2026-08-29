import { useReveal } from '@/hooks/useReveal'
import { stagger } from './stagger'

const STACK = [
  'React 19',
  'TypeScript strict',
  'Vite 8',
  'Tailwind CSS 4',
  'Zustand 5',
  'Lightweight Charts 5',
  'Netlify Functions',
  'Anthropic SDK',
  'technicalindicators',
  'Supabase',
  'Vitest',
]

export function StackStrip() {
  const ref = useReveal<HTMLElement>()

  return (
    <section ref={ref} className="border-t border-panel-border">
      <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6">
        <ul className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Stack">
          {STACK.map((item, i) => (
            <li
              key={item}
              className="landing-reveal shrink-0 snap-start rounded-md border border-panel-border bg-panel-bg px-3 py-1.5 font-mono text-xs text-text-muted"
              style={stagger(i)}
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
