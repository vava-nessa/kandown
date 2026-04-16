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
