/** Google Takeout Location History Records.json — the only format that carries
 *  a per-record deviceTag, so one file fans out into N device tracks. */
import type { DeviceTrack, ParseResult, TrackPoint } from '../types'
import { parseLatLng, parseTime } from './common'

export function parseRecords(fileName: string, json: unknown): ParseResult {
  let skipped = 0
  const byDevice = new Map<string, TrackPoint[]>()
  const locations = (json as Record<string, unknown>)?.locations
  if (Array.isArray(locations)) {
    for (const raw of locations) {
      const rec = raw as Record<string, unknown>
      const ll = parseLatLng(rec)
      const t = parseTime(rec.timestamp) ?? parseTime(rec.timestampMs)
      if (!ll || t == null) { skipped++; continue }
      const tag = rec.deviceTag != null ? String(rec.deviceTag) : 'unknown'
      let arr = byDevice.get(tag)
      if (!arr) { arr = []; byDevice.set(tag, arr) }
      arr.push({ lat: ll.lat, lng: ll.lng, t })
    }
  }
  const devices: DeviceTrack[] = [...byDevice.entries()].map(([tag, points]) => {
    points.sort((a, b) => a.t - b.t)
    return {
      id: `records:${fileName}:${tag}`,
      label: tag === 'unknown' ? '기기 미상' : `기기 ${tag}`,
      source: fileName,
      points,
    }
  })
  devices.sort((a, b) => b.points.length - a.points.length)
  return { format: 'records', devices, skipped, ignored: 0 }
}
