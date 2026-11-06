import { useEffect, useRef, useState } from 'react'

/**
 * A decorative background loop. Muted, never controls, never announced. It plays only on screens wider than 700px,
 * when the visitor has not asked for reduced motion or data saving, and only while it is on screen; otherwise the
 * poster frame shows. The poster is also what search engines, the pre-rendered page and print see.
 */
export function BgVideo({ src, poster, className }: { src: string; poster: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null), [play, setPlay] = useState(false)
  useEffect(() => {
    const save = (navigator as any).connection?.saveData === true
    const mq = matchMedia('(min-width: 701px) and (prefers-reduced-motion: no-preference)')
    const decide = () => setPlay(mq.matches && !save)
    decide(); mq.addEventListener('change', decide)
    return () => mq.removeEventListener('change', decide)
  }, [])
  useEffect(() => {
    const v = ref.current; if (!v || !play) return
    const io = new IntersectionObserver(([e]) => { e.isIntersecting && !document.hidden ? v.play().catch(() => {}) : v.pause() }, { threshold: .05 })
    const vis = () => { document.hidden ? v.pause() : io.takeRecords() }
    io.observe(v); document.addEventListener('visibilitychange', vis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [play])
  return play
    ? <video ref={ref} className={className} src={src} poster={poster} muted loop playsInline preload="auto" aria-hidden tabIndex={-1} disablePictureInPicture />
    : <img className={className} src={poster} alt="" aria-hidden decoding="async" />
}
