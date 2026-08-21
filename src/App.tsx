import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { demoDevices } from './demo'
import { decimate, filterByRange, trackDistanceKm } from './geo'
import { mergeDevices } from './merge'
import { parseTimelineJson } from './parsers'
import type { DeviceTrack } from './types'
import { GoogleAuth, PROFILE_KEY, type Profile } from './components/GoogleAuth'
import { MapView, type RenderTrack } from './components/MapView'
import { Odometer } from './components/Odometer'
import { loadSettings, SettingsModal, type Settings } from './components/SettingsModal'

const PALETTE = ['#ff2e6c', '#35d0ff', '#ffc53d', '#7cff6b', '#b388ff', '#ff8a3d', '#4dffd2', '#ff5c5c']
const MAX_RENDER_POINTS = 20_000

type PresetId = 'all' | '7d' | '30d' | '90d' | '1y' | 'custom'
const PRESETS: { id: PresetId; label: string; days?: number }[] = [
  { id: 'all', label: '전체' },
  { id: '7d', label: '7일', days: 7 },
  { id: '30d', label: '30일', days: 30 },
  { id: '90d', label: '90일', days: 90 },
  { id: '1y', label: '1년', days: 365 },
]

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtMonth(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

export default function App() {
  const [devices, setDevices] = useState<DeviceTrack[]>([])
  const [disabled, setDisabled] = useState<Set<string>>(new Set())
  const [preset, setPreset] = useState<PresetId>('all')
  const [customFrom, setCustomFrom] = useState<string>('')
  const [customTo, setCustomTo] = useState<string>('')
  const [profile, setProfile] = useState<Profile | null>(() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') } catch { return null }
  })
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* ---- import ---- */
  const onFiles = useCallback(async (files: FileList | File[]) => {
    setParseError(null)
    setImportNote(null)
    const errors: string[] = []
    const added: DeviceTrack[] = []
    let loaded = 0
    let skipped = 0
    let ignored = 0
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const res = parseTimelineJson(file.name, JSON.parse(text))
        if (res.devices.length === 0) errors.push(`${file.name}: 위치 포인트가 없다`)
        added.push(...res.devices)
        loaded += res.devices.reduce((s, d) => s + d.points.length, 0)
        skipped += res.skipped
        ignored += res.ignored
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `${file.name}: 파싱 실패`)
      }
    }
    if (added.length > 0) setDevices((prev) => mergeDevices(prev, added))
    if (loaded > 0 || skipped > 0) {
      const parts = [`포인트 ${loaded.toLocaleString()}개 로드`]
      if (skipped > 0) parts.push(`변환 실패 ${skipped.toLocaleString()}개 — 일부 데이터가 표시되지 않는다`)
      if (ignored > 0) parts.push(`비위치 항목 ${ignored.toLocaleString()}개 제외`)
      setImportNote(parts.join(' · '))
    }
    if (errors.length > 0) setParseError(errors.join(' · '))
  }, [])

  useEffect(() => {
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true) }
    const onDragLeave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false) }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (e.dataTransfer?.files?.length) void onFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [onFiles])

  /* ---- time range ---- */
  const dataSpan = useMemo(() => {
    let min = Infinity, max = -Infinity
    for (const d of devices) {
      if (d.points.length === 0) continue
      min = Math.min(min, d.points[0].t)
      max = Math.max(max, d.points[d.points.length - 1].t)
    }
    return Number.isFinite(min) ? { min, max } : null
  }, [devices])

  const range = useMemo((): { from: number | null; to: number | null } => {
    if (preset === 'all') return { from: null, to: null }
    if (preset === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).getTime() : null,
        to: customTo ? new Date(customTo).getTime() : null,
      }
    }
    const days = PRESETS.find((p) => p.id === preset)?.days ?? 0
    const end = dataSpan?.max ?? Date.now()
    return { from: end - days * 86_400_000, to: end }
  }, [preset, customFrom, customTo, dataSpan])

  /* ---- derived tracks ---- */
  const perDevice = useMemo(() => devices.map((d, i) => {
    const filtered = filterByRange(d.points, range.from, range.to)
    return {
      device: d,
      color: PALETTE[i % PALETTE.length],
      filtered,
      km: trackDistanceKm(filtered),
      on: !disabled.has(d.id),
    }
  }), [devices, range, disabled])

  const renderTracks = useMemo((): RenderTrack[] =>
    perDevice
      .filter((x) => x.on && x.filtered.length > 0)
      .map((x) => ({
        id: x.device.id,
        label: x.device.label,
        color: x.color,
        points: decimate(x.filtered, Math.floor(MAX_RENDER_POINTS / Math.max(1, perDevice.length))),
      })), [perDevice])

  const totalKm = useMemo(() => perDevice.filter((x) => x.on).reduce((s, x) => s + x.km, 0), [perDevice])
  const visiblePoints = useMemo(() => perDevice.filter((x) => x.on).reduce((s, x) => s + x.filtered.length, 0), [perDevice])

  const title = useMemo(() => {
    const on = perDevice.filter((x) => x.on)
    if (on.length === 0) return null
    const spanFrom = range.from ?? dataSpan?.min
    const spanTo = range.to ?? dataSpan?.max
    const name = on.length === 1 ? on[0].device.label : `기기 ${on.length}대`
    return {
      name,
      span: spanFrom != null && spanTo != null ? `${fmtMonth(spanFrom)} – ${fmtMonth(spanTo)}` : '',
    }
  }, [perDevice, range, dataSpan])

  const hasData = devices.length > 0

  return (
    <div className="app">
      <MapView tracks={renderTracks} mapsKey={settings.mapsKey} />

      <header className="topbar">
        <div className="wordmark">g<em>timeline</em></div>
        <div className="topbar-right">
          <GoogleAuth
            clientId={settings.clientId}
            profile={profile}
            onProfile={setProfile}
            onNeedSetup={() => setShowSettings(true)}
          />
          <button className="ghost" aria-label="설정" title="설정" onClick={() => setShowSettings(true)}>⚙</button>
        </div>
      </header>

      <aside className="rail">
        <section className="panel">
          <h2>데이터 가져오기</h2>
          <div
            className={`import-zone${dragging ? ' drag' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
          >
            <strong>타임라인 JSON을 끌어다 놓기</strong>
            <br />폰 내보내기 Timeline.json · Takeout Records.json · Semantic JSON
            <br />파일별 자동 인식, 기기별 자동 분리
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={(e) => { if (e.target.files) void onFiles(e.target.files); e.target.value = '' }}
          />
          <div className="import-actions">
            <button onClick={() => setDevices(demoDevices())}>데모 데이터</button>
            {hasData && <button className="ghost" onClick={() => { setDevices([]); setDisabled(new Set()); setImportNote(null); setParseError(null) }}>비우기</button>}
          </div>
          {parseError && <p className="parse-error">{parseError}</p>}
          {importNote && <p className="import-note">{importNote}</p>}
          <p className="privacy">
            위치 파일은 이 브라우저 안에서만 파싱된다 — 업로드 0. 지도: 구글맵 모드는 보이는
            영역의 타일을 Google에서 받아오고, 오프라인 미리보기는 지도 관련 외부 요청이 없다.
            Google 로그인을 쓰면 인증 스크립트·프로필 이미지는 Google에서 로드된다.
            {profile ? ` ${profile.email} 세션.` : ''}
          </p>
        </section>

        {hasData && (
          <section className="panel">
            <h2>기기 {devices.length}대</h2>
            {perDevice.map(({ device, color, km, on, filtered }) => (
              <label key={device.id} className={`device${on ? '' : ' off'}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setDisabled((prev) => {
                    const next = new Set(prev)
                    if (next.has(device.id)) next.delete(device.id)
                    else next.add(device.id)
                    return next
                  })}
                />
                <span className="dot" style={{ background: color, color }} />
                <span className="meta">
                  <span className="name">{device.label}</span>
                  <span className="sub">{filtered.length.toLocaleString()} pts</span>
                </span>
                <span className="km">{Math.round(km).toLocaleString()} km</span>
              </label>
            ))}
          </section>
        )}

        {hasData && (
          <section className="panel">
            <h2>기간</h2>
            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p.id} className={preset === p.id ? 'on' : ''} onClick={() => setPreset(p.id)}>
                  {p.label}
                </button>
              ))}
              <button className={preset === 'custom' ? 'on' : ''} onClick={() => {
                if (dataSpan && !customFrom) {
                  setCustomFrom(toLocalInput(dataSpan.min))
                  setCustomTo(toLocalInput(dataSpan.max))
                }
                setPreset('custom')
              }}>직접</button>
            </div>
            {preset === 'custom' && (
              <>
                <label className="field"><span>시작</span>
                  <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </label>
                <label className="field"><span>끝</span>
                  <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </label>
              </>
            )}
          </section>
        )}
      </aside>

      {!hasData && (
        <div className="empty-note panel">
          <h1>내 기기들이 그린 지도</h1>
          <p>
            폰에서 내보낸 구글 타임라인 JSON을 떨어뜨리면, 기기별 이동 경로가 리본으로 그려진다.
            구글은 타임라인 조회 API를 제공하지 않으므로 (2024년 말 온디바이스 이관)
            데이터는 내 손의 파일에서 오고, 파일은 브라우저 밖으로 업로드되지 않는다.
          </p>
        </div>
      )}

      {hasData && title && (
        <div className="odometer panel">
          <div className="title"><b>{title.name}</b>의 타임라인</div>
          <Odometer km={totalKm} />
          <div className="sub">{title.span} · {visiblePoints.toLocaleString()} points</div>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          value={settings}
          onSave={(s) => { setSettings(s); setShowSettings(false) }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
