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
  /** entries that could not be converted into a point */
  skipped: number
}
