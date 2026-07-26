/**
 * @file website/src/components/MorphingText.tsx
 * @description Dynamic text morphing component using blur, opacity, and SVG threshold filters.
 * Adapted from Magic UI MorphingText with crisp static rendering and per-item typography.
 *
 * 📖 Smoothly transitions between text items by interpolating blur and opacity
 * during morphing frames, while removing all SVG filters during cooldown so static text
 * remains 100% crisp, sharp, and readable.
 *
 * @functions useMorphingText → manages animation frames, styles, and per-item classes
 * @exports MorphingText
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '~/lib/utils'

export interface TextItem {
  text: string
  className?: string
}

export type MorphItem = string | TextItem

const morphTime = 1.2
const cooldownTime = 2.0

function getItem(item?: MorphItem): TextItem {
  if (!item) return { text: '' }
  if (typeof item === 'string') {
    return { text: item }
  }
  return item
}

const useMorphingText = (items: MorphItem[]) => {
  const textIndexRef = useRef(0)
  const morphRef = useRef(0)
  const cooldownRef = useRef(0)
  const timeRef = useRef(new Date())

  const text1Ref = useRef<HTMLSpanElement>(null)
  const text2Ref = useRef<HTMLSpanElement>(null)
  const [isMorphing, setIsMorphing] = useState(false)

  const setStyles = useCallback(
    (fraction: number) => {
      const [current1, current2] = [text1Ref.current, text2Ref.current]
      if (!current1 || !current2) return

      const item1 = getItem(items[textIndexRef.current % items.length])
      const item2 = getItem(items[(textIndexRef.current + 1) % items.length])

      current1.textContent = item1.text ?? null
      current1.className = cn(
        'absolute inset-x-0 top-0 m-auto inline-block w-full transition-none',
        item1.className
      )

      current2.textContent = item2.text ?? null
      current2.className = cn(
        'absolute inset-x-0 top-0 m-auto inline-block w-full transition-none',
        item2.className
      )

      const blur2 = Math.min(8 / Math.max(fraction, 0.01) - 8, 40)
      current2.style.filter = `blur(${blur2}px)`
      current2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`

      const invertedFraction = 1 - fraction
      const blur1 = Math.min(8 / Math.max(invertedFraction, 0.01) - 8, 40)
      current1.style.filter = `blur(${blur1}px)`
      current1.style.opacity = `${Math.pow(invertedFraction, 0.4) * 100}%`
    },
    [items]
  )

  const doMorph = useCallback(() => {
    setIsMorphing(true)
    morphRef.current -= cooldownRef.current
    cooldownRef.current = 0

    let fraction = morphRef.current / morphTime

    if (fraction > 1) {
      cooldownRef.current = cooldownTime
      fraction = 1
    }

    setStyles(fraction)

    if (fraction === 1) {
      textIndexRef.current++
    }
  }, [setStyles])

  const doCooldown = useCallback(() => {
    setIsMorphing(false)
    morphRef.current = 0
    const [current1, current2] = [text1Ref.current, text2Ref.current]
    if (current1 && current2) {
      const activeItem = getItem(items[textIndexRef.current % items.length])
      current2.textContent = activeItem.text ?? null
      current2.className = cn(
        'absolute inset-x-0 top-0 m-auto inline-block w-full',
        activeItem.className
      )
      current2.style.filter = 'none'
      current2.style.opacity = '100%'

      current1.style.filter = 'none'
      current1.style.opacity = '0%'
    }
  }, [items])

  useEffect(() => {
    let animationFrameId: number

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)

      const newTime = new Date()
      const dt = (newTime.getTime() - timeRef.current.getTime()) / 1000
      timeRef.current = newTime

      cooldownRef.current -= dt

      if (cooldownRef.current <= 0) doMorph()
      else doCooldown()
    }

    animate()
    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [doMorph, doCooldown])

  return { text1Ref, text2Ref, isMorphing }
}

interface MorphingTextProps {
  className?: string
  items: MorphItem[]
}

const SvgFilters: React.FC = () => (
  <svg
    id="filters"
    className="fixed h-0 w-0 pointer-events-none"
    preserveAspectRatio="xMidYMid slice"
  >
    <defs>
      <filter id="threshold">
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 255 -140"
        />
      </filter>
    </defs>
  </svg>
)

export function MorphingText({ items, className }: MorphingTextProps) {
  const { text1Ref, text2Ref, isMorphing } = useMorphingText(items)
  const firstItem = getItem(items[0])
  const secondItem = getItem(items[1] ?? items[0])

  return (
    <div
      style={isMorphing ? { filter: 'url(#threshold) blur(0.4px)' } : undefined}
      className={cn(
        'relative mx-auto flex h-10 w-full items-center justify-center text-center',
        className
      )}
    >
      <span
        className={cn(
          'absolute inset-x-0 top-0 m-auto inline-block w-full',
          firstItem.className
        )}
        ref={text1Ref}
      >
        {firstItem.text}
      </span>
      <span
        className={cn(
          'absolute inset-x-0 top-0 m-auto inline-block w-full',
          secondItem.className
        )}
        ref={text2Ref}
      >
        {secondItem.text}
      </span>
      <SvgFilters />
    </div>
  )
}
