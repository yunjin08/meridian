import type { CSSProperties } from 'react'

/** Sets the `--i` custom property read by `.landing-rise` and `.landing-reveal`. */
export function stagger(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}
