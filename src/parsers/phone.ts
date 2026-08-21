/** On-device Timeline export (Android settings / Google Maps app, 2024+).
 *  Android: object with semanticSegments / rawSignals / userLocationProfile.
 *  iOS: bare array of the same segment objects. One export file == one device. */
import type { DeviceTrack, ParseResult, TimelineFormat, TrackPoint } from '../types'
import { parseLatLng, parseTime } from './common'

interface Counter { skipped: number; ignored: number }

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

  // Some real exports wrap signals one level deeper: { signal: { position: … } }
  const inner = seg.signal as Record<string, unknown> | undefined
  if (inner && typeof inner === 'object') {
    parseSegment(inner, out, c)
    return
  }

  // Non-location signal kinds (wifiScan, activityRecord, …) are expected —
  // not data loss.
  c.ignored++
}

export function parsePhoneExport(fileName: string, json: unknown, format: TimelineFormat): ParseResult {
  const c: Counter = { skipped: 0, ignored: 0 }
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
    else c.ignored++
  }

  points.sort((a, b) => a.t - b.t)
  // Identity from content, not file name: every phone export is called
  // Timeline.json, so two devices' files must not collide, while re-importing
  // the same file must dedupe to the same track. The fingerprint covers every
  // point's time AND coordinates — two devices sharing a time window must
  // still diverge.
  let hash = 0x811c9dc5
  for (const pt of points) {
    const s = `${pt.t}:${pt.lat.toFixed(6)}:${pt.lng.toFixed(6)}`
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
  }
  const label = fileName.replace(/\.json$/i, '')
  const device: DeviceTrack = {
    id: `phone:${points.length}:${(hash >>> 0).toString(16)}`,
    label: /^timeline$/i.test(label) ? '내 기기' : label,
    source: fileName,
    points,
  }
  return { format, devices: points.length > 0 ? [device] : [], skipped: c.skipped, ignored: c.ignored }
}
