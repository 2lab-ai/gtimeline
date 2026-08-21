/** Deterministic sample data: two devices roaming Korea over one year,
 *  so the app demos end-to-end without any real export file. */
import type { DeviceTrack, TrackPoint } from './types'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HOME = { lat: 35.1587, lng: 129.1604 } // 부산 해운대
const CITIES: Record<string, { lat: number; lng: number }> = {
  서울: { lat: 37.5503, lng: 126.9971 },
  울산: { lat: 35.5384, lng: 129.3114 },
  대구: { lat: 35.8714, lng: 128.6014 },
  거제: { lat: 34.8806, lng: 128.6211 },
  경주: { lat: 35.8562, lng: 129.2247 },
}

function trip(rand: () => number, from: { lat: number; lng: number }, to: { lat: number; lng: number }, startMs: number, hours: number): TrackPoint[] {
  const points: TrackPoint[] = []
  const n = 40 + Math.floor(rand() * 40)
  for (let i = 0; i <= n; i++) {
    const f = i / n
    // slight arc + jitter so the ribbon reads as a route, not a ruler line
    const arc = Math.sin(f * Math.PI) * 0.04 * (rand() > 0.5 ? 1 : -1)
    points.push({
      lat: from.lat + (to.lat - from.lat) * f + arc * 0.3 + (rand() - 0.5) * 0.004,
      lng: from.lng + (to.lng - from.lng) * f + arc + (rand() - 0.5) * 0.004,
      t: Math.round(startMs + f * hours * 3_600_000),
    })
  }
  return points
}

function wander(rand: () => number, center: { lat: number; lng: number }, startMs: number, days: number): TrackPoint[] {
  const points: TrackPoint[] = []
  let { lat, lng } = center
  const n = days * 6
  for (let i = 0; i < n; i++) {
    lat = center.lat + (lat - center.lat) * 0.7 + (rand() - 0.5) * 0.02
    lng = center.lng + (lng - center.lng) * 0.7 + (rand() - 0.5) * 0.025
    points.push({ lat, lng, t: Math.round(startMs + (i / 6) * 86_400_000) })
  }
  return points
}

function makeDevice(id: string, label: string, seed: number, tripsPerCity: Record<string, number>): DeviceTrack {
  const rand = mulberry32(seed)
  const start = Date.UTC(2025, 7, 1) // 2025-08-01
  const points: TrackPoint[] = []
  let cursor = start
  points.push(...wander(rand, HOME, cursor, 10))
  cursor += 12 * 86_400_000
  for (const [city, count] of Object.entries(tripsPerCity)) {
    for (let k = 0; k < count; k++) {
      const dest = CITIES[city]
      points.push(...trip(rand, HOME, dest, cursor, 4))
      cursor += 86_400_000
      points.push(...wander(rand, dest, cursor, 2))
      cursor += 2 * 86_400_000
      points.push(...trip(rand, dest, HOME, cursor, 4))
      cursor += 86_400_000
      points.push(...wander(rand, HOME, cursor, 14))
      cursor += 20 * 86_400_000
    }
  }
  points.sort((a, b) => a.t - b.t)
  return { id, label, source: 'demo', points }
}

export function demoDevices(): DeviceTrack[] {
  return [
    makeDevice('demo:s25', 'S25 Ultra (데모)', 25, { 서울: 2, 울산: 3, 대구: 1, 경주: 1 }),
    makeDevice('demo:tab', 'Tab S10 (데모)', 77, { 서울: 1, 거제: 2 }),
  ]
}
