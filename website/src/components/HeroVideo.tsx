/**
 * @file src/components/HeroVideo.tsx
 * @description The product demo that anchors the hero: an autoplaying, muted,
 * looping screencast framed in a browser-window chrome.
 *
 * 📖 Drop-in contract for the video file. Put `demo.webm` and/or `demo.mp4` in
 * `website/public/` and a still frame at `public/demo-poster.png`. Nothing else
 * needs to change — until those files exist the component renders the poster,
 * and if the poster is missing too it falls back to a static board mock so the
 * hero is never a grey rectangle.
 *
 * 📖 Autoplay only survives if the video is `muted` *and* `playsInline`; Safari
 * on iOS blocks it otherwise. `preload="metadata"` keeps the initial payload
 * small, and the whole element is skipped for visitors who asked for reduced
 * motion — they get the poster image instead.
 *
 * @functions HeroVideo → the framed player with graceful degradation
 * @exports HeroVideo
 */
import { useEffect, useRef, useState } from 'react'
import { BoardMock } from './BoardMock'

const SOURCES = [
  { src: '/demo.webm', type: 'video/webm' },
  { src: '/demo.mp4', type: 'video/mp4' },
]

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  // 📖 A missing source fires `error` on the <source>, not on the <video>, so
  // the element itself never reports failure. Checking `networkState` after the
  // element settles is the reliable signal that no source could be loaded.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const check = () => {
      if (video.networkState === video.NETWORK_NO_SOURCE) setFailed(true)
    }
    const id = setTimeout(check, 1200)
    video.addEventListener('error', check, true)
    return () => {
      clearTimeout(id)
      video.removeEventListener('error', check, true)
    }
  }, [])

  return (
    <figure className="border border-border bg-bg">
      {/* 📖 A window chrome reduced to a single mono address line. The three
          traffic-light dots were dropped deliberately: they are skeuomorphic
          filler that every screenshot frame on the web already has, and they say
          nothing about a tool that runs on your own machine. */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <span className="label truncate">localhost:5176 — kandown</span>
        <span className="label hidden shrink-0 text-accent-fg sm:block">live demo</span>
      </div>

      <div className="aspect-[16/10] w-full">
        {failed ? (
          <BoardMock />
        ) : (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            poster="/demo-poster.png"
            autoPlay={!reducedMotion}
            muted
            loop
            playsInline
            preload="metadata"
            controls={reducedMotion}
            aria-label="Screen recording of the Kandown board"
          >
            {SOURCES.map((source) => (
              <source key={source.src} src={source.src} type={source.type} />
            ))}
          </video>
        )}
      </div>
    </figure>
  )
}
