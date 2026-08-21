/** Google Takeout Semantic Location History (monthly YYYY_MONTH.json,
 *  pre-2024 format): timelineObjects of activitySegment / placeVisit.
 *  This format carries no device identifier, so every monthly file maps to
 *  ONE shared "device unknown" track (the app merges points by track id) —
 *  months must never be presented as devices. */
import type { DeviceTrack, ParseResult, TrackPoint } from '../types'
import { parseLatLng, parseTime } from './common'

export const SEMANTIC_TRACK_ID = 'semantic:takeout'

export function parseSemantic(fileName: string, json: unknown): ParseResult {
  let skipped = 0
  let ignored = 0
  const points: TrackPoint[] = []
  const objects = (json as Record<string, unknown>)?.timelineObjects

  const push = (loc: unknown, t: number | null) => {
    const ll = parseLatLng(loc)
    if (ll && t != null) points.push({ lat: ll.lat, lng: ll.lng, t })
    else skipped++
  }

  if (Array.isArray(objects)) {
    for (const raw of objects) {
      const o = raw as Record<string, unknown>
      const seg = o.activitySegment as Record<string, unknown> | undefined
      const visit = o.placeVisit as Record<string, unknown> | undefined
      if (seg) {
        const dur = seg.duration as Record<string, unknown> | undefined
        const t0 = parseTime(dur?.startTimestamp ?? dur?.startTimestampMs)
        const t1 = parseTime(dur?.endTimestamp ?? dur?.endTimestampMs)
        push(seg.startLocation, t0)
        const simplified = (seg.simplifiedRawPath as Record<string, unknown> | undefined)?.points
        if (Array.isArray(simplified)) {
          for (const p of simplified) {
            const pt = p as Record<string, unknown>
            push(pt, parseTime(pt.timestampMs) ?? parseTime(pt.timestamp))
          }
        }
        const waypoints = (seg.waypointPath as Record<string, unknown> | undefined)?.waypoints
        if (Array.isArray(waypoints) && t0 != null && t1 != null) {
          waypoints.forEach((w, i) => {
            const frac = (i + 1) / (waypoints.length + 1)
            push(w, Math.round(t0 + (t1 - t0) * frac))
          })
        }
        push(seg.endLocation, t1)
      } else if (visit) {
        const dur = visit.duration as Record<string, unknown> | undefined
        push(visit.location, parseTime(dur?.startTimestamp ?? dur?.startTimestampMs))
      } else {
        ignored++
      }
    }
  }

  points.sort((a, b) => a.t - b.t)
  const device: DeviceTrack = {
    id: SEMANTIC_TRACK_ID,
    label: 'Takeout 타임라인 (기기 미상)',
    source: fileName,
    points,
  }
  return { format: 'semantic', devices: points.length > 0 ? [device] : [], skipped, ignored }
}
