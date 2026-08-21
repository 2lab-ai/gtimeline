import { useEffect, useRef } from 'react'
import type { TrackPoint } from '../types'
import { boundsOf } from '../geo'

export interface RenderTrack {
  id: string
  label: string
  color: string
  points: TrackPoint[]
}

/* ---------------- Google Maps path ---------------- */

declare global {
  interface Window { __gtimelineMapsReady?: () => void }
}

const loaders = new Map<string, Promise<typeof google.maps>>()
function loadMaps(key: string): Promise<typeof google.maps> {
  let p = loaders.get(key)
  if (!p) {
    p = new Promise((resolve, reject) => {
      window.__gtimelineMapsReady = () => resolve(google.maps)
      const s = document.createElement('script')
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__gtimelineMapsReady&loading=async&v=weekly`
      s.async = true
      s.onerror = () => reject(new Error('Google Maps 로드 실패 — API 키를 확인하라'))
      document.head.appendChild(s)
    })
    loaders.set(key, p)
  }
  return p
}

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0b0e14' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5c6470' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0e14' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1a24' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#161b26' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1d2430' }] },
]

function GoogleMapCanvas({ tracks, mapsKey }: { tracks: RenderTrack[]; mapsKey: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const linesRef = useRef<google.maps.Polyline[]>([])

  useEffect(() => {
    let cancelled = false
    loadMaps(mapsKey).then((maps) => {
      if (cancelled || !elRef.current) return
      if (!mapRef.current) {
        mapRef.current = new maps.Map(elRef.current, {
          center: { lat: 36.2, lng: 127.9 },
          zoom: 7,
          styles: DARK_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          backgroundColor: '#0b0e14',
        })
      }
      const map = mapRef.current
      linesRef.current.forEach((l) => l.setMap(null))
      linesRef.current = []
      const allBounds = new maps.LatLngBounds()
      let hasPoints = false
      for (const track of tracks) {
        const path = track.points.map((p) => ({ lat: p.lat, lng: p.lng }))
        if (path.length === 0) continue
        hasPoints = true
        path.forEach((ll) => allBounds.extend(ll))
        // glow underlay + core line = ribbon look
        linesRef.current.push(
          new maps.Polyline({ path, map, strokeColor: track.color, strokeOpacity: 0.16, strokeWeight: 7, clickable: false }),
          new maps.Polyline({ path, map, strokeColor: track.color, strokeOpacity: 0.92, strokeWeight: 2.4, clickable: false }),
        )
      }
      if (hasPoints) map.fitBounds(allBounds, 72)
    }).catch(() => { /* surfaced via key hint in the rail */ })
    return () => { cancelled = true }
  }, [tracks, mapsKey])

  return <div className="gmap" ref={elRef} />
}

/* ---------------- offline canvas fallback ---------------- */

function drawPreview(canvas: HTMLCanvasElement, tracks: RenderTrack[]) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth, h = canvas.clientHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#0b0e14'
  ctx.fillRect(0, 0, w, h)

  const all = tracks.flatMap((t) => t.points)
  const b = boundsOf(all)
  if (!b) return
  const midLat = (b.minLat + b.maxLat) / 2
  const xScaleFix = Math.cos((midLat * Math.PI) / 180)
  const spanLat = Math.max(b.maxLat - b.minLat, 0.02)
  const spanLng = Math.max((b.maxLng - b.minLng) * xScaleFix, 0.02)
  const pad = 60
  const scale = Math.min((w - pad * 2) / spanLng, (h - pad * 2) / spanLat)
  const cx = w / 2, cy = h / 2
  const midLng = (b.minLng + b.maxLng) / 2
  const px = (p: TrackPoint) => cx + (p.lng - midLng) * xScaleFix * scale
  const py = (p: TrackPoint) => cy - (p.lat - midLat) * scale

  // subtle graticule so the void reads as a map surface
  ctx.strokeStyle = 'rgba(138,147,166,0.07)'
  ctx.lineWidth = 1
  for (let g = 0; g < 12; g++) {
    const x = (w / 12) * g
    const y = (h / 12) * g
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  for (const track of tracks) {
    if (track.points.length === 0) continue
    for (const [width, alpha] of [[7, 0.14], [2.2, 0.95]] as const) {
      ctx.strokeStyle = track.color
      ctx.globalAlpha = alpha
      ctx.lineWidth = width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      track.points.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p), py(p)) : ctx.lineTo(px(p), py(p))))
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    const last = track.points[track.points.length - 1]
    ctx.fillStyle = track.color
    ctx.beginPath()
    ctx.arc(px(last), py(last), 3.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function CanvasPreview({ tracks }: { tracks: RenderTrack[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const redraw = () => drawPreview(canvas, tracks)
    redraw()
    const ro = new ResizeObserver(redraw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [tracks])
  return (
    <>
      <canvas className="preview" ref={ref} />
      <div className="attribution">오프라인 미리보기 — ⚙ 설정에 Maps API 키를 넣으면 구글맵으로 전환</div>
    </>
  )
}

export function MapView({ tracks, mapsKey }: { tracks: RenderTrack[]; mapsKey: string }) {
  return <div className="map-layer">{mapsKey ? <GoogleMapCanvas tracks={tracks} mapsKey={mapsKey} /> : <CanvasPreview tracks={tracks} />}</div>
}
