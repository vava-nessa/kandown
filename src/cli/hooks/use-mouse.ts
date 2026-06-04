/**
 * @file Mouse support utilities for Ink-based TUI
 * @description Provides terminal mouse tracking enable/disable and a parser
 * for SGR mouse sequences. Unlike v1 which intercepted stdin (fragile with Ink),
 * this v2 simply enables mouse mode and lets Ink process all input normally.
 * Mouse sequences are detected in useInput's `input` parameter.
 *
 * 📖 How it works (v2):
 *  1. `useMouseMode()` enables SGR mouse tracking (\x1b[?1006h)
 *  2. Terminal sends `\x1b[<Cb;Cx;CyM` on click
 *  3. Ink's input parser passes these as raw `input` strings in useInput
 *  4. `parseMouseInput()` extracts coordinates from the string
 *  5. No stdin interception — no conflicts with Ink
 *
 * 📖 SGR format: `\x1b[<Cb;Cx;CyM` (press) or `\x1b[<Cb;Cx;Cym` (release)
 *  Cb = button code, Cx = column (1-based), Cy = row (1-based)
 *
 * @functions
 *  → useMouseMode    — React hook to enable/disable terminal mouse tracking
 *  → parseMouseInput — parse SGR mouse sequence from a string
 *
 * @exports useMouseMode, parseMouseInput, MouseInputEvent
 */

import { useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MouseInputEvent {
  /** Column (1-based, matches process.stdout.columns) */
  x: number;
  /** Row (1-based, matches process.stdout.rows) */
  y: number;
  /** Which button: 0=left, 1=middle, 2=right */
  button: number;
  /** 'press' or 'release' */
  action: 'press' | 'release';
}

// ─── ANSI sequences ──────────────────────────────────────────────────────────

const MOUSE_ENABLE  = '\x1b[?1000h\x1b[?1006h';
const MOUSE_DISABLE = '\x1b[?1006l\x1b[?1000l';

// ─── Regex ───────────────────────────────────────────────────────────────────

// 📖 Matches SGR mouse after Ink strips ESC prefix: [<Cb;Cx;CyM or [<Cb;Cx;Cym
// Original terminal sequence: \x1b[<Cb;Cx;CyM, but Ink strips \x1b from input
const RE_SGR_MOUSE = /^\[<(\d+);(\d+);(\d+)([Mm])/;

// ─── Parse utility ───────────────────────────────────────────────────────────

/**
 * 📖 Try to parse a mouse event from a raw input string.
 * Returns null if the string is not a mouse sequence.
 * Designed to be called from useInput's callback.
 */
export function parseMouseInput(input: string): MouseInputEvent | null {
  const match = input.match(RE_SGR_MOUSE);
  if (!match) return null;

  const cb = parseInt(match[1], 10);
  const cx = parseInt(match[2], 10);
  const cy = parseInt(match[3], 10);
  const isPress = match[4] === 'M';

  return {
    x: cx,
    y: cy,
    button: cb & 0x03,
    action: isPress ? 'press' : 'release',
  };
}

/** 📖 Check if a raw input string looks like a mouse sequence (for filtering in useInput).
 *  Note: Ink strips the leading ESC (\x1b) from sequences, so we check for `[<` prefix. */
export function isMouseInput(input: string): boolean {
  return input.startsWith('[<') || input.startsWith('[M');
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * 📖 React hook that enables terminal mouse tracking.
 * Call this once in your root component. Mouse events are then detected
 * via `parseMouseInput()` inside useInput handlers.
 *
 * @param enabled — whether mouse tracking is active (default: true)
 */
export function useMouseMode(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (!process.stdin.isTTY) return;

    process.stdout.write(MOUSE_ENABLE);

    // 📖 Safety: ensure mouse mode is disabled on process exit
    const cleanup = () => {
      process.stdout.write(MOUSE_DISABLE);
    };
    process.on('exit', cleanup);

    return () => {
      process.removeListener('exit', cleanup);
      process.stdout.write(MOUSE_DISABLE);
    };
  }, [enabled]);
}
