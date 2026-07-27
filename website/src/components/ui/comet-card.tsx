/**
 * @file src/components/ui/comet-card.tsx
 * @description A 3D-tilted interactive card with a mouse-following glare layer
 * and a hover lift. Wraps any content in a perspective container that rotates
 * in response to cursor position and renders a soft radial highlight through
 * `mix-blend-overlay` on top.
 *
 * 📖 The card has no opinion about its content. It accepts `children` and
 * applies the perspective, rotation springs, scale-on-hover and glare on top.
 * The intent is that anything styled with its own background and padding
 * (logo blocks, image cards, call-to-action panels) can be dropped in and
 * gain the interactive surface for free. The hero uses it to wrap the
 * Kandown logo + brand morph + install command.
 *
 * 📖 The motion values track normalized cursor coordinates in [-0.5, 0.5] and
 * are fed through `useSpring` so the tilt glides rather than snapping. The
 * `motion.div` owns the rotation, translation, z-translation and a heavy
 * shadow stack that grounds the card when it lifts on hover; a second
 * `motion.div` overlays the radial-gradient glare and uses
 * `mix-blend-overlay` so it reads as a light highlight rather than a tinted
 * veil.
 *
 * 📖 `framer-motion` and `motion` are the same library; `motion` is the
 * newer package name for the rebrand, but `framer-motion` is what this
 * project depends on. Imports use `framer-motion` so we do not pull a second
 * copy of the library into the website bundle.
 *
 * @exports CometCard
 */
'use client'

import React, { useRef } from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
} from 'framer-motion'
import { cn } from '~/lib/utils'

export const CometCard = ({
  rotateDepth = 17.5,
  translateDepth = 20,
  className,
  children,
}: {
  rotateDepth?: number
  translateDepth?: number
  className?: string
  children: React.ReactNode
}) => {
  const ref = useRef<HTMLDivElement>(null)

  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseXSpring = useSpring(x)
  const mouseYSpring = useSpring(y)

  const rotateX = useTransform(
    mouseYSpring,
    [-0.5, 0.5],
    [`-${rotateDepth}deg`, `${rotateDepth}deg`],
  )
  const rotateY = useTransform(
    mouseXSpring,
    [-0.5, 0.5],
    [`${rotateDepth}deg`, `-${rotateDepth}deg`],
  )

  const translateX = useTransform(
    mouseXSpring,
    [-0.5, 0.5],
    [`-${translateDepth}px`, `${translateDepth}px`],
  )
  const translateY = useTransform(
    mouseYSpring,
    [-0.5, 0.5],
    [`${translateDepth}px`, `-${translateDepth}px`],
  )

  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], [0, 100])
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], [0, 100])

  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.9) 10%, rgba(255, 255, 255, 0.75) 20%, rgba(255, 255, 255, 0) 80%)`

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return

    const rect = ref.current.getBoundingClientRect()

    const width = rect.width
    const height = rect.height

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5

    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <div className={cn('perspective-distant transform-3d', className)}>
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          translateX,
          translateY,
          boxShadow:
            'rgba(0, 0, 0, 0.01) 0px 520px 146px 0px, rgba(0, 0, 0, 0.04) 0px 333px 133px 0px, rgba(0, 0, 0, 0.26) 0px 83px 83px 0px, rgba(0, 0, 0, 0.29) 0px 21px 46px 0px',
        }}
        initial={{ scale: 1, z: 0 }}
        whileHover={{
          scale: 1.05,
          z: 50,
          transition: { duration: 0.2 },
        }}
        className="relative rounded-2xl"
      >
        {children}
        <motion.div
          className="pointer-events-none absolute inset-0 z-50 h-full w-full rounded-[16px] mix-blend-overlay"
          style={{
            background: glareBackground,
            opacity: 0.6,
          }}
          transition={{ duration: 0.2 }}
        />
      </motion.div>
    </div>
  )
}