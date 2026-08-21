import { describe, expect, it } from 'vitest'
import { mergeDevices } from '../merge'
import type { DeviceTrack } from '../types'

const track = (id: string, label: string, ts: number[], source = 'f.json'): DeviceTrack => ({
  id,
  label,
  source,
  points: ts.map((t) => ({ lat: 35, lng: 129, t })),
})

describe('mergeDevices', () => {
  it('re-importing the same content is idempotent (dedupe by full point tuple)', () => {
    const prev = mergeDevices([], [track('a', '내 기기', [1, 2, 3])])
    const next = mergeDevices(prev, [track('a', '내 기기', [2, 3, 4])])
    expect(next).toHaveLength(1)
    expect(next[0].points.map((p) => p.t)).toEqual([1, 2, 3, 4])
  })

  it('keeps two distinct fixes that share one timestamp (no coordinate loss)', () => {
    const a: DeviceTrack = { id: 'a', label: 'x', source: 'f', points: [{ lat: 35.0, lng: 129.0, t: 7 }] }
    const b: DeviceTrack = { id: 'a', label: 'x', source: 'f', points: [{ lat: 35.001, lng: 129.0, t: 7 }] }
    const next = mergeDevices(mergeDevices([], [a]), [b])
    expect(next[0].points).toHaveLength(2)
  })

  it('two devices with the same label both survive, disambiguated', () => {
    const next = mergeDevices(
      mergeDevices([], [track('a', '내 기기', [1])]),
      [track('b', '내 기기', [2])],
    )
    expect(next).toHaveLength(2)
    expect(next.map((d) => d.label).sort()).toEqual(['내 기기', '내 기기 (2)'])
  })

  it('monthly Semantic files accumulate into the single shared track', () => {
    const jan = track('semantic:takeout', 'Takeout 타임라인 (기기 미상)', [10, 11], '2023_JANUARY.json')
    const feb = track('semantic:takeout', 'Takeout 타임라인 (기기 미상)', [20, 21], '2023_FEBRUARY.json')
    const next = mergeDevices(mergeDevices([], [jan]), [feb])
    expect(next).toHaveLength(1)
    expect(next[0].points.map((p) => p.t)).toEqual([10, 11, 20, 21])
    expect(next[0].source).toContain('JANUARY')
    expect(next[0].source).toContain('FEBRUARY')
  })
})
