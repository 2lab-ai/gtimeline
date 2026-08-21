export interface TrackPoint {
  lat: number
  lng: number
  /** epoch ms */
  t: number
}

export interface DeviceTrack {
  id: string
  label: string
  /** which import file / format this came from */
  source: string
  points: TrackPoint[]
}

export type TimelineFormat = 'phone-object' | 'phone-array' | 'records' | 'semantic'

export interface ParseResult {
  format: TimelineFormat
  devices: DeviceTrack[]
  /** entries that carried a position but failed to convert — real data loss */
  skipped: number
  /** entries that are not location-bearing by design (wifi scans, unknown kinds) */
  ignored: number
}
