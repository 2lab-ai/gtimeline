import { useEffect, useRef, useState } from 'react'

/** Count-up distance readout — the app's signature element. */
export function Odometer({ km }: { km: number }) {
  const [shown, setShown] = useState(km)
  const fromRef = useRef(km)
  const rafRef = useRef(0)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setShown(km); return }
    const from = fromRef.current
    const start = performance.now()
    const dur = 700
    cancelAnimationFrame(rafRef.current)
    const tick = (now: number) => {
      const f = Math.min(1, (now - start) / dur)
      const eased = 1 - (1 - f) ** 3
      setShown(from + (km - from) * eased)
      if (f < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = km
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [km])

  return (
    <span className="km">
      {Math.round(shown).toLocaleString('ko-KR')}
      <small>km</small>
    </span>
  )
}
