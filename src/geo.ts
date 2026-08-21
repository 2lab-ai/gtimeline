import type { TrackPoint } from './types'

const R = 6371.0088

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la = (a.lat * Math.PI) / 180
  const lb = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Total path length. Consecutive fixes further apart than `gapKm` are treated
 *  as data gaps (e.g. tracking off), not travel, and are not counted. */
export function trackDistanceKm(points: TrackPoint[], gapKm = 2000): number {
  let sum = 0
  for (let i = 1; i < points.length; i++) {
    const d = haversineKm(points[i - 1], points[i])
    if (d < gapKm) sum += d
  }
  return sum
}

export function filterByRange(points: TrackPoint[], from: number | null, to: number | null): TrackPoint[] {
  if (from == null && to == null) return points
  return points.filter((p) => (from == null || p.t >= from) && (to == null || p.t <= to))
}

/** Uniform stride decimation to keep rendering bounded. Always keeps first/last. */
export function decimate(points: TrackPoint[], max: number): TrackPoint[] {
  if (points.length <= max) return points
  const stride = Math.ceil(points.length / max)
  const out: TrackPoint[] = []
  for (let i = 0; i < points.length; i += stride) out.push(points[i])
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

export interface Bounds { minLat: number; maxLat: number; minLng: number; maxLng: number }

export function boundsOf(points: TrackPoint[]): Bounds | null {
  if (points.length === 0) return null
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  return { minLat, maxLat, minLng, maxLng }
}
