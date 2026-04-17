/**
 * @file Animated number hook
 * @description Converts a numeric target into a spring-animated Motion value
 * that renders as a rounded string, used for stable task counters.
 *
 * 📖 This keeps small numeric UI updates feeling alive without introducing
 * layout shifts or manual requestAnimationFrame bookkeeping.
 *
 * @functions
 *  → useAnimatedNumber — returns a spring-smoothed display value
 *
 * @exports useAnimatedNumber
 */

import { useSpring, useTransform, type MotionValue } from 'motion/react';
import { useEffect } from 'react';

/**
 * Animated number that interpolates smoothly when the value changes.
 */
export function useAnimatedNumber(target: number): MotionValue<string> {
  const spring = useSpring(target, { stiffness: 180, damping: 22, mass: 0.8 });
  useEffect(() => {
    spring.set(target);
  }, [target, spring]);
  const display = useTransform(spring, (v) => Math.round(v).toString());
  return display;
}
