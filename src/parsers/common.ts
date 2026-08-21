/** Tolerant primitives shared by all Google timeline formats. */

export interface LatLng { lat: number; lng: number }

const NUM_PAIR = /(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)\s*°?/

/** Accepts "geo:37.4,-122.0", "37.4°, -122.0°", "37.4, -122.0",
 *  or objects carrying latLng/LatLng/placeLocation/point variants. */
export function parseLatLng(v: unknown): LatLng | null {
  if (v == null) return null
  if (typeof v === 'string') {
    const s = v.startsWith('geo:') ? v.slice(4) : v
    const m = NUM_PAIR.exec(s)
    if (!m) return null
    return validLatLng(Number(m[1]), Number(m[2]))
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o.latitudeE7 != null && o.longitudeE7 != null) {
      return validLatLng(Number(o.latitudeE7) / 1e7, Number(o.longitudeE7) / 1e7)
    }
    if (o.latE7 != null && o.lngE7 != null) {
      return validLatLng(Number(o.latE7) / 1e7, Number(o.lngE7) / 1e7)
    }
    return (
      parseLatLng(o.latLng) ??
      parseLatLng(o.LatLng) ??
      parseLatLng(o.placeLocation) ??
      parseLatLng(o.location) ??
      parseLatLng(o.point) ??
      null
    )
  }
  return null
}

function validLatLng(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

/** ISO string, epoch ms number, or epoch-ms-as-string → epoch ms. */
export function parseTime(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null
  if (typeof v === 'string') {
    if (/^\d{10,}$/.test(v)) return Number(v)
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : t
  }
  return null
}
