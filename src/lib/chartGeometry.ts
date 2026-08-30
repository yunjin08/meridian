// SVG path building for the since-inception chart. Pure so the shapes can be
// tested and previewed without a browser.
import type { BandPoint } from '@/lib/portfolioHistory'

export interface ChartBox {
  width: number
  height: number
  padLeft: number
  padRight: number
  padTop: number
  padBottom: number
}

export interface Scales {
  x: (i: number) => number
  y: (v: number) => number
}

/** Maps point index to x and money to y, with the y axis anchored at zero. */
export function buildScales(box: ChartBox, pointCount: number, maxValue: number): Scales {
  const span = Math.max(pointCount - 1, 1)
  const top = maxValue > 0 ? maxValue * 1.08 : 1
  const plotWidth = box.width - box.padLeft - box.padRight
  const plotHeight = box.height - box.padTop - box.padBottom
  return {
    x: (i) => box.padLeft + (i / span) * plotWidth,
    y: (v) => box.height - box.padBottom - (v / top) * plotHeight,
  }
}

function point(x: number, y: number, command: 'M' | 'L'): string {
  return `${command}${x.toFixed(2)} ${y.toFixed(2)}`
}

export function linePath(values: readonly number[], scales: Scales): string {
  return values.map((v, i) => point(scales.x(i), scales.y(v), i === 0 ? 'M' : 'L')).join(' ')
}

/** Closed shape between the value line and the spent line over one stretch. */
export function bandPath(points: readonly BandPoint[], scales: Scales): string {
  const top = points.map((p, i) => point(scales.x(p.i), scales.y(p.value), i === 0 ? 'M' : 'L'))
  const bottom: string[] = []
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i]
    if (p !== undefined) bottom.push(point(scales.x(p.i), scales.y(p.spent), 'L'))
  }
  return [...top, ...bottom, 'Z'].join(' ')
}
