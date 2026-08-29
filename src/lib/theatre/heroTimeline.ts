import { getProject, types } from '@theatre/core'
import type { IProject, ISheet, ISheetObject } from '@theatre/core'

/**
 * The landing hero's load choreography, authored as a Theatre.js sequence.
 *
 * Keyframes live here as data rather than in CSS so the whole entrance runs on
 * one clock and can be scrubbed. To iterate visually, open the dev server with
 * `?studio` in the URL (see useHeroTimeline), drag keyframes in Theatre Studio,
 * then transcribe the positions back into the tracks below.
 */

export const HERO_PROJECT_ID = 'Investing Dashboard Landing'
export const HERO_SHEET_ID = 'Hero'
export const HERO_TIMELINE_LENGTH = 4.2

type Ease = 'out' | 'inOut' | 'linear'

// Theatre interpolates a segment with cubicBezier(left.handles[2], left.handles[3],
// right.handles[0], right.handles[1]), so a keyframe's handles are
// [incomingX, incomingY, outgoingX, outgoingY].
const HANDLES: Record<Ease, [number, number, number, number]> = {
  out: [0.3, 1, 0.16, 1],
  inOut: [0.5, 1, 0.5, 0],
  linear: [0.67, 0.67, 0.33, 0.33],
}

type Point = [position: number, value: number]

interface TrackSpec {
  object: string
  prop: string
  ease: Ease
  points: Point[]
}

function ramp(
  object: string,
  prop: string,
  from: number,
  to: number,
  ease: Ease = 'out',
  start = 0,
  end = 1,
): TrackSpec {
  return { object, prop, ease, points: [[from, start], [to, end]] }
}

const TRACKS: TrackSpec[] = [
  // Copy enters first, top to bottom.
  ramp('Text', 'headline', 0.05, 0.85),
  ramp('Text', 'subtext', 0.3, 1.1),
  ramp('Text', 'ctas', 0.5, 1.3),

  // The growth curve draws across the hero while the copy settles.
  ramp('Curve', 'progress', 0.3, 2.4),
  ramp('Curve', 'area', 1.4, 2.6),
  ramp('Curve', 'nodes', 0.9, 2.3, 'linear', 0, 3),
  ramp('Curve', 'glow', 2.4, 3.1),

  // The Overview card rises to meet the end of the curve and assembles itself.
  ramp('Card', 'enter', 1.7, 2.5),
  ramp('Card', 'crypto', 2.4, 2.75),
  ramp('Card', 'stocks', 2.6, 2.95),
  ramp('Card', 'reits', 2.8, 3.15),
  ramp('Card', 'rows', 2.8, 3.6, 'linear', 0, 4),
  ramp('Card', 'deadline', 3.4, 4.0),
]

interface TrackData {
  type: 'BasicKeyframedTrack'
  __debugName: string
  keyframes: {
    id: string
    position: number
    value: number
    connectedRight: boolean
    handles: [number, number, number, number]
    type: 'bezier'
  }[]
}

interface ObjectTracks {
  trackIdByPropPath: Record<string, string>
  trackData: Record<string, TrackData>
}

function buildState(tracks: TrackSpec[]) {
  const tracksByObject: Record<string, ObjectTracks> = {}

  tracks.forEach((track, index) => {
    const entry = (tracksByObject[track.object] ??= { trackIdByPropPath: {}, trackData: {} })
    const trackId = `t${index}`
    entry.trackIdByPropPath[JSON.stringify([track.prop])] = trackId
    entry.trackData[trackId] = {
      type: 'BasicKeyframedTrack',
      __debugName: `${track.object}:["${track.prop}"]`,
      keyframes: track.points.map(([position, value], i) => ({
        id: `${trackId}k${i}`,
        position,
        value,
        connectedRight: true,
        handles: HANDLES[track.ease],
        type: 'bezier',
      })),
    }
  })

  return {
    sheetsById: {
      [HERO_SHEET_ID]: {
        staticOverrides: { byObject: {} },
        sequence: {
          type: 'PositionalSequence',
          length: HERO_TIMELINE_LENGTH,
          subUnitsPerUnit: 30,
          tracksByObject,
        },
      },
    },
    definitionVersion: '0.4.0',
    revisionHistory: [],
  }
}

const unit = () => types.number(0, { range: [0, 1] })

const TEXT_PROPS = { headline: unit(), subtext: unit(), ctas: unit() }
const CURVE_PROPS = {
  progress: unit(),
  area: unit(),
  nodes: types.number(0, { range: [0, 3] }),
  glow: unit(),
}
const CARD_PROPS = {
  enter: unit(),
  crypto: unit(),
  stocks: unit(),
  reits: unit(),
  rows: types.number(0, { range: [0, 4] }),
  deadline: unit(),
}

export interface HeroTimeline {
  project: IProject
  sheet: ISheet
  text: ISheetObject<typeof TEXT_PROPS>
  curve: ISheetObject<typeof CURVE_PROPS>
  card: ISheetObject<typeof CARD_PROPS>
}

let timeline: HeroTimeline | null = null

/** Creates the project once. Studio, when present, must be initialised before this runs. */
export function getHeroTimeline(): HeroTimeline {
  if (timeline !== null) return timeline
  const project = getProject(HERO_PROJECT_ID, { state: buildState(TRACKS) })
  const sheet = project.sheet(HERO_SHEET_ID)
  timeline = {
    project,
    sheet,
    text: sheet.object('Text', TEXT_PROPS),
    curve: sheet.object('Curve', CURVE_PROPS),
    card: sheet.object('Card', CARD_PROPS),
  }
  return timeline
}

export function hasHeroTimeline(): boolean {
  return timeline !== null
}

/** Eased 0..1 progress of item `index` on a shared 0..N track. */
export function segment(value: number, index: number): number {
  const t = Math.min(1, Math.max(0, value - index))
  return 1 - (1 - t) ** 3
}
