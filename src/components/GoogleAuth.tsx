import { useEffect, useRef } from 'react'

export interface Profile {
  name: string
  email: string
  picture: string
}

export const PROFILE_KEY = 'gtimeline.profile'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void
          disableAutoSelect: () => void
        }
      }
    }
  }
}

let gsiLoading: Promise<void> | null = null
function loadGsi(): Promise<void> {
  if (!gsiLoading) {
    gsiLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Google Identity Services 로드 실패'))
      document.head.appendChild(s)
    })
  }
  return gsiLoading
}

function decodeJwtProfile(credential: string): Profile | null {
  try {
    const payload = credential.split('.')[1]
    const json = JSON.parse(decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))))
    return { name: json.name ?? json.email, email: json.email, picture: json.picture ?? '' }
  } catch {
    return null
  }
}

/** "gmail 로그인 → 계정 권한" — Google Identity Services sign-in.
 *  Identity only: Google ships no API that returns Timeline data, so the
 *  signed-in account scopes the local workspace, not a server fetch. */
export function GoogleAuth({ clientId, profile, onProfile, onNeedSetup }: {
  clientId: string
  profile: Profile | null
  onProfile: (p: Profile | null) => void
  onNeedSetup: () => void
}) {
  const btnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!clientId || profile || !btnRef.current) return
    let cancelled = false
    loadGsi().then(() => {
      if (cancelled || !window.google || !btnRef.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => {
          const p = decodeJwtProfile(r.credential)
          if (p) {
            localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
            onProfile(p)
          }
        },
      })
      window.google.accounts.id.renderButton(btnRef.current, { theme: 'filled_black', size: 'medium', shape: 'pill', text: 'signin_with' })
    }).catch(() => { /* offline — the app still works without sign-in */ })
    return () => { cancelled = true }
  }, [clientId, profile, onProfile])

  if (profile) {
    return (
      <div className="auth-chip panel">
        {profile.picture && <img src={profile.picture} alt="" referrerPolicy="no-referrer" />}
        <div className="who">
          {profile.name}
          <small>{profile.email}</small>
        </div>
        <button
          className="ghost"
          onClick={() => {
            localStorage.removeItem(PROFILE_KEY)
            window.google?.accounts.id.disableAutoSelect()
            onProfile(null)
          }}
        >
          로그아웃
        </button>
      </div>
    )
  }
  if (!clientId) {
    return <button onClick={onNeedSetup}>Google 로그인 설정</button>
  }
  return <div ref={btnRef} />
}
