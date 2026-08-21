export interface Settings {
  clientId: string
  mapsKey: string
}

import { DEFAULT_CLIENT_ID, DEFAULT_MAPS_KEY } from '../config'

export const SETTINGS_KEY = 'gtimeline.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>
      return {
        clientId: saved.clientId || DEFAULT_CLIENT_ID,
        mapsKey: saved.mapsKey || DEFAULT_MAPS_KEY,
      }
    }
  } catch { /* corrupted settings fall back to env defaults */ }
  return {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID,
    mapsKey: import.meta.env.VITE_MAPS_API_KEY || DEFAULT_MAPS_KEY,
  }
}

export function SettingsModal({ value, onSave, onClose }: {
  value: Settings
  onSave: (s: Settings) => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal panel"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const next = {
            clientId: String(fd.get('clientId') ?? '').trim(),
            mapsKey: String(fd.get('mapsKey') ?? '').trim(),
          }
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
          onSave(next)
        }}
      >
        <h2>연결 설정</h2>
        <p className="hint">
          기본 키가 앱에 내장돼 있어 보통 아무것도 입력할 필요 없다. 자기 키로 바꿀 때만 사용 —
          입력값은 이 브라우저의 localStorage에만 저장된다. 발급 방법은{' '}
          <a href="https://github.com/2lab-ai/gtimeline#설정" target="_blank" rel="noreferrer">README#설정</a> 참고.
        </p>
        <label className="field">
          <span>Google OAuth 클라이언트 ID — gmail 로그인용</span>
          <input type="text" name="clientId" defaultValue={value.clientId} placeholder="xxxx.apps.googleusercontent.com" />
        </label>
        <label className="field">
          <span>Google Maps API 키 — 구글맵 표시용 (없으면 오프라인 미리보기)</span>
          <input type="text" name="mapsKey" defaultValue={value.mapsKey} placeholder="AIza..." />
        </label>
        <div className="row">
          <button type="button" className="ghost" onClick={onClose}>닫기</button>
          <button type="submit" className="primary">저장</button>
        </div>
      </form>
    </div>
  )
}
