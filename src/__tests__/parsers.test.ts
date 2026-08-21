import { describe, expect, it } from 'vitest'
import { parseTimelineJson, UnrecognizedFormatError } from '../parsers'
import { parseLatLng, parseTime } from '../parsers/common'
import { decimate, filterByRange, haversineKm, trackDistanceKm } from '../geo'

describe('parseLatLng', () => {
  it('parses geo: URI, degree pairs, plain pairs and E7 objects', () => {
    expect(parseLatLng('geo:35.1587,129.1604')).toEqual({ lat: 35.1587, lng: 129.1604 })
    expect(parseLatLng('37.4220936°, -122.083922°')).toEqual({ lat: 37.4220936, lng: -122.083922 })
    expect(parseLatLng('35.1, 129.0')).toEqual({ lat: 35.1, lng: 129.0 })
    expect(parseLatLng({ latitudeE7: 351587000, longitudeE7: 1291604000 })).toEqual({ lat: 35.1587, lng: 129.1604 })
    expect(parseLatLng({ latLng: '35.1°, 129.0°' })).toEqual({ lat: 35.1, lng: 129.0 })
  })
  it('rejects garbage, out-of-range and null island', () => {
    expect(parseLatLng('hello')).toBeNull()
    expect(parseLatLng('95.0, 10.0')).toBeNull()
    expect(parseLatLng('0, 0')).toBeNull()
    expect(parseLatLng(null)).toBeNull()
  })
})

describe('parseTime', () => {
  it('parses ISO strings, epoch numbers, epoch strings', () => {
    expect(parseTime('2025-08-01T00:00:00.000Z')).toBe(Date.UTC(2025, 7, 1))
    expect(parseTime(1754006400000)).toBe(1754006400000)
    expect(parseTime('1754006400000')).toBe(1754006400000)
    expect(parseTime('nope')).toBeNull()
  })
})

describe('phone export (object form: semanticSegments + rawSignals)', () => {
  const json = {
    semanticSegments: [
      {
        startTime: '2025-08-01T09:00:00.000Z',
        endTime: '2025-08-01T10:00:00.000Z',
        timelinePath: [
          { point: 'geo:35.1000,129.0000', durationMinutesOffsetFromStartTime: '0' },
          { point: 'geo:35.2000,129.1000', durationMinutesOffsetFromStartTime: '30' },
          { point: 'geo:35.3000,129.2000', time: '2025-08-01T10:00:00.000Z' },
        ],
      },
      {
        startTime: '2025-08-02T12:00:00.000Z',
        endTime: '2025-08-02T13:00:00.000Z',
        visit: { topCandidate: { placeLocation: { latLng: '35.5384°, 129.3114°' } } },
      },
      {
        startTime: '2025-08-03T08:00:00.000Z',
        endTime: '2025-08-03T09:30:00.000Z',
        activity: { start: { latLng: '35.10°, 129.00°' }, end: { latLng: '37.55°, 126.99°' } },
      },
    ],
    rawSignals: [
      { position: { LatLng: '35.1111°, 129.0111°', timestamp: '2025-08-04T01:00:00.000Z' } },
    ],
  }

  it('parses all segment kinds into one device sorted by time', () => {
    const res = parseTimelineJson('Timeline.json', json)
    expect(res.format).toBe('phone-object')
    expect(res.devices).toHaveLength(1)
    const pts = res.devices[0].points
    expect(pts).toHaveLength(7) // 3 path + 1 visit + 2 activity + 1 raw
    expect(res.skipped).toBe(0)
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThanOrEqual(pts[i - 1].t)
    // offset-only path point resolved against segment start
    expect(pts[0].t).toBe(Date.UTC(2025, 7, 1, 9, 0, 0))
    expect(pts[1].t).toBe(Date.UTC(2025, 7, 1, 9, 30, 0))
  })

  it('splits real conversion failures (skipped) from non-location signals (ignored)', () => {
    const res = parseTimelineJson('Timeline.json', {
      semanticSegments: [{ startTime: 'bad', timelinePath: [{ point: 'garbage' }] }],
      rawSignals: [
        { position: { LatLng: '35.0°, 129.0°', timestamp: '2025-01-01T00:00:00Z' } },
        { wifiScan: { devices: 3 } },
      ],
    })
    expect(res.devices[0].points).toHaveLength(1)
    expect(res.skipped).toBe(1)
    expect(res.ignored).toBe(1)
  })

  it('derives identity from content so same-named exports from two devices never collide', () => {
    const seg = (iso: string, latLng: string) => ({
      startTime: iso,
      visit: { topCandidate: { placeLocation: { latLng } } },
    })
    const a = parseTimelineJson('Timeline.json', { semanticSegments: [seg('2025-01-01T00:00:00Z', '35.1°, 129.0°')] })
    const b = parseTimelineJson('Timeline.json', { semanticSegments: [seg('2025-02-01T00:00:00Z', '37.5°, 127.0°')] })
    const aAgain = parseTimelineJson('Timeline.json', { semanticSegments: [seg('2025-01-01T00:00:00Z', '35.1°, 129.0°')] })
    expect(a.devices[0].id).not.toBe(b.devices[0].id)
    expect(a.devices[0].id).toBe(aAgain.devices[0].id)
  })
})

describe('phone export (iOS bare-array form)', () => {
  it('detects and parses an array of segments', () => {
    const res = parseTimelineJson('iphone-timeline.json', [
      {
        startTime: '2025-08-01T09:00:00.000Z',
        endTime: '2025-08-01T09:40:00.000Z',
        activity: { start: '35.10°, 129.00°', end: '35.30°, 129.20°' },
      },
      { startTime: '2025-08-02T09:00:00.000Z', visit: { topCandidate: { placeLocation: '35.20°, 129.10°' } } },
    ])
    expect(res.format).toBe('phone-array')
    expect(res.devices).toHaveLength(1)
    expect(res.devices[0].points).toHaveLength(3)
    expect(res.devices[0].label).toBe('iphone-timeline')
  })
})

describe('Records.json (Takeout) — deviceTag split', () => {
  it('fans one file out into one track per deviceTag', () => {
    const res = parseTimelineJson('Records.json', {
      locations: [
        { latitudeE7: 351000000, longitudeE7: 1290000000, timestampMs: '1690000000000', deviceTag: 111 },
        { latitudeE7: 352000000, longitudeE7: 1291000000, timestamp: '2023-07-22T05:00:00.000Z', deviceTag: 111 },
        { latitudeE7: 375000000, longitudeE7: 1269000000, timestamp: '2023-07-23T05:00:00.000Z', deviceTag: 222 },
        { latitudeE7: 999999999, longitudeE7: 1269000000, timestamp: '2023-07-23T05:00:00.000Z', deviceTag: 222 },
      ],
    })
    expect(res.format).toBe('records')
    expect(res.devices).toHaveLength(2)
    const tags = res.devices.map((d) => d.label).sort()
    expect(tags).toEqual(['기기 111', '기기 222'])
    expect(res.devices.find((d) => d.label === '기기 111')!.points).toHaveLength(2)
    expect(res.skipped).toBe(1) // out-of-range lat dropped
  })
})

describe('Semantic Location History (Takeout monthly)', () => {
  it('parses activitySegment waypoints/raw path and placeVisit', () => {
    const res = parseTimelineJson('2023_JULY.json', {
      timelineObjects: [
        {
          activitySegment: {
            startLocation: { latitudeE7: 351000000, longitudeE7: 1290000000 },
            endLocation: { latitudeE7: 375000000, longitudeE7: 1269000000 },
            duration: { startTimestamp: '2023-07-01T01:00:00.000Z', endTimestamp: '2023-07-01T04:00:00.000Z' },
            waypointPath: { waypoints: [{ latE7: 360000000, lngE7: 1280000000 }] },
            simplifiedRawPath: { points: [{ latE7: 355000000, lngE7: 1285000000, timestampMs: '1688175000000' }] },
          },
        },
        {
          placeVisit: {
            location: { latitudeE7: 375000000, longitudeE7: 1269000000 },
            duration: { startTimestamp: '2023-07-01T05:00:00.000Z' },
          },
        },
      ],
    })
    expect(res.format).toBe('semantic')
    expect(res.devices).toHaveLength(1)
    expect(res.devices[0].id).toBe('semantic:takeout') // months are NOT devices — all merge into one track
    const pts = res.devices[0].points
    expect(pts).toHaveLength(5) // start + raw + waypoint + end + visit
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThanOrEqual(pts[i - 1].t)
    // interpolated waypoint sits strictly inside the segment window
    const t0 = Date.parse('2023-07-01T01:00:00.000Z')
    const t1 = Date.parse('2023-07-01T04:00:00.000Z')
    expect(pts.some((p) => p.t > t0 && p.t < t1 && p.lat === 36)).toBe(true)
  })
})

describe('detection failures', () => {
  it('throws UnrecognizedFormatError for unknown shapes', () => {
    expect(() => parseTimelineJson('x.json', { foo: 1 })).toThrow(UnrecognizedFormatError)
    expect(() => parseTimelineJson('x.json', [1, 2, 3])).toThrow(UnrecognizedFormatError)
    expect(() => parseTimelineJson('x.json', 'nope')).toThrow(UnrecognizedFormatError)
  })
})

describe('geo', () => {
  it('haversine: Seoul—Busan straight line ≈ 325 km', () => {
    const d = haversineKm({ lat: 37.5503, lng: 126.9971 }, { lat: 35.1587, lng: 129.1604 })
    expect(d).toBeGreaterThan(300)
    expect(d).toBeLessThan(350)
  })
  it('trackDistanceKm counts physically plausible hops only (speed-based)', () => {
    const H = 3_600_000
    const pts = [
      { lat: 35.0, lng: 129.0, t: 0 },
      { lat: 35.1, lng: 129.0, t: 1 * H }, // ~11 km in 1h — walk/drive, counted
      { lat: -35.0, lng: -50.0, t: 1 * H + 60_000 }, // ~18,000 km in 1min — artifact, dropped
    ]
    const d = trackDistanceKm(pts)
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(13)
  })
  it('trackDistanceKm keeps long-haul flights (real hours elapsed)', () => {
    const H = 3_600_000
    const flight = [
      { lat: 37.46, lng: 126.44, t: 0 }, // ICN
      { lat: 49.0, lng: 2.55, t: 12 * H }, // CDG, ~8,900 km / 12h ≈ 742 km/h
    ]
    const d = trackDistanceKm(flight)
    expect(d).toBeGreaterThan(8000)
  })
  it('trackDistanceKm tolerates duplicate timestamps for tiny hops only', () => {
    const pts = [
      { lat: 35.0, lng: 129.0, t: 5 },
      { lat: 35.001, lng: 129.0, t: 5 }, // dup ts, ~0.1 km — counted
      { lat: 36.0, lng: 129.0, t: 5 }, // dup ts, ~111 km — artifact, dropped
    ]
    const d = trackDistanceKm(pts)
    expect(d).toBeGreaterThan(0.05)
    expect(d).toBeLessThan(1)
  })
  it('filterByRange is inclusive and null-open', () => {
    const pts = [1, 2, 3, 4].map((t) => ({ lat: 35, lng: 129, t }))
    expect(filterByRange(pts, 2, 3)).toHaveLength(2)
    expect(filterByRange(pts, null, 2)).toHaveLength(2)
    expect(filterByRange(pts, 3, null)).toHaveLength(2)
    expect(filterByRange(pts, null, null)).toHaveLength(4)
  })
  it('decimate caps size and keeps endpoints', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ lat: 35, lng: 129, t: i }))
    const out = decimate(pts, 100)
    expect(out.length).toBeLessThanOrEqual(101)
    expect(out[0].t).toBe(0)
    expect(out[out.length - 1].t).toBe(999)
  })
})
