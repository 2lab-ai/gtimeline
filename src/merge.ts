import type { DeviceTrack } from './types'

/** Merge newly imported tracks into the existing set.
 *  - Same id (same content / same logical track): union points, dedupe by
 *    timestamp — re-importing a file is idempotent, and monthly Semantic
 *    files accumulate into their one shared track.
 *  - New id whose label collides with an existing one: suffix " (2)", " (3)" …
 *    so two devices both exporting "Timeline.json" stay distinguishable. */
export function mergeDevices(prev: DeviceTrack[], added: DeviceTrack[]): DeviceTrack[] {
  const map = new Map(prev.map((d) => [d.id, d]))
  for (const d of added) {
    const existing = map.get(d.id)
    if (existing) {
      const byT = new Map(existing.points.map((p) => [p.t, p]))
      for (const p of d.points) byT.set(p.t, p)
      map.set(d.id, {
        ...existing,
        source: existing.source === d.source ? existing.source : `${existing.source}, ${d.source}`,
        points: [...byT.values()].sort((a, b) => a.t - b.t),
      })
    } else {
      const labels = new Set([...map.values()].map((x) => x.label))
      let label = d.label
      let n = 2
      while (labels.has(label)) label = `${d.label} (${n++})`
      map.set(d.id, { ...d, label })
    }
  }
  return [...map.values()]
}
