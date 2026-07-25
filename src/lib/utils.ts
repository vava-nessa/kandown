/**
 * @file Tailwind class-name merge helper
 * @description Provides `cn`, the single utility used across every web component to
 * compose conditional class names. It runs `clsx` (which flattens arrays, objects
 * and falsy values into a class string) and then `tailwind-merge` (which resolves
 * conflicts by keeping the last of any competing Tailwind utilities).
 *
 * 📖 The `tailwind-merge` pass is the reason this exists rather than plain `clsx`:
 * it is what makes `cn('p-2', className)` behave, letting a caller override padding
 * from the outside instead of ending up with `p-2 p-6` and CSS-order roulette.
 *
 * @functions
 *  → cn — merge conditional class names, resolving Tailwind conflicts
 *
 * @exports cn
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
