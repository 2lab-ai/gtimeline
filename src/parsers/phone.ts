/** On-device Timeline export (Android settings / Google Maps app, 2024+).
 *  Android: object with semanticSegments / rawSignals / userLocationProfile.
 *  iOS: bare array of the same segment objects. One export file == one device. */
import type { DeviceTrack, ParseResult, TimelineFormat, TrackPoint } from '../types'
import { parseLatLng, parseTime } from './common'

interface Counter { skipped: number }

function pushPoint(out: TrackPoint[], c: Counter, loc: unknown, t: number | null): void {
  const ll = parseLatLng(loc)
  if (ll && t != null) out.push({ lat: ll.lat, lng: ll.lng, t })
  else c.skipped++
}

function parseSegment(seg: Record<string, unknown>, out: TrackPoint[], c: Counter): void {
  const segStart = parseTime(seg.startTime)
  const segEnd = parseTime(seg.endTime)

  const path = seg.timelinePath
  if (Array.isArray(path)) {
    for (const raw of path) {
      const p = raw as Record<string, unknown>
      let t = parseTime(p.time)
      if (t == null && segStart != null) {
        const off = Number(p.durationMinutesOffsetFromStartTime)
        if (Number.isFinite(off)) t = segStart + off * 60_000
      }
      pushPoint(out, c, p.point ?? p, t)
    }
    return
  }

  const visit = seg.visit as Record<string, unknown> | undefined
  if (visit) {
    const top = (visit.topCandidate ?? visit) as Record<string, unknown>
    pushPoint(out, c, top.placeLocation ?? top, segStart ?? segEnd)
    return
  }

  const activity = seg.activity as Record<string, unknown> | undefined
  if (activity) {
    if (activity.start != null) pushPoint(out, c, activity.start, segStart)
    if (activity.end != null) pushPoint(out, c, activity.end, segEnd)
    return
  }

  // Raw position signal shape (also appears inside rawSignals)
  const pos = seg.position as Record<string, unknown> | undefined
  if (pos) {
    pushPoint(out, c, pos, parseTime(pos.timestamp) ?? segStart)
    return
  }
  c.skipped++
}

export function parsePhoneExport(fileName: string, json: unknown, format: TimelineFormat): ParseResult {
  const c: Counter = { skipped: 0 }
  const points: TrackPoint[] = []
  const segments: unknown[] = []

  if (Array.isArray(json)) {
    segments.push(...json)
  } else if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (Array.isArray(o.semanticSegments)) segments.push(...o.semanticSegments)
    if (Array.isArray(o.rawSignals)) segments.push(...o.rawSignals)
  }

  for (const seg of segments) {
    if (seg && typeof seg === 'object') parseSegment(seg as Record<string, unknown>, points, c)
    else c.skipped++
  }

  points.sort((a, b) => a.t - b.t)
  const label = fileName.replace(/\.json$/i, '').replace(/^Timeline[ _-]?/i, '') || fileName
  const device: DeviceTrack = {
    id: `phone:${fileName}`,
    label: label === fileName.replace(/\.json$/i, '') && /^timeline$/i.test(label) ? '내 기기' : label,
    source: fileName,
    points,
  }
  return { format, devices: points.length > 0 ? [device] : [], skipped: c.skipped }
}
