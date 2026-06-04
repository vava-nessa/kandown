/**
 * @file Mouse support utilities for Ink-based TUI
 * @description Provides terminal mouse tracking enable/disable and a parser
 * for SGR mouse sequences. Unlike v1 which intercepted stdin (fragile with Ink),
 * this v2 simply enables mouse mode and lets Ink process all input normally.
 * Mouse sequences are detected in useInput's `input` parameter.
 *
 * 📖 How it works (v2):
 *  1. `useMouseMode()` enables SGR mouse tracking + button-motion drag events through Ink's stdout helper
 *  2. Terminal sends `\x1b[<Cb;Cx;CyM` on press/drag and `\x1b[<Cb;Cx;Cym` on release
 *  3. Ink's input parser passes these as raw `input` strings in useInput
 *  4. `parseMouseInput()` extracts coordinates, button, and action
 *  5. No stdin interception — no conflicts with Ink
 *
 * 📖 SGR format: `\x1b[<Cb;Cx;CyM` (press) or `\x1b[<Cb;Cx;Cym` (release)
 *  Cb = button code, Cx = column (1-based), Cy = row (1-based)
 *
 * @functions
 *  → safeWrite       — writes terminal control codes without throwing during teardown
 *  → useMouseMode    — React hook to enable/disable terminal mouse tracking
 *  → parseMouseInput — parse SGR mouse sequence from a string
 *
 * @exports useMouseMode, parseMouseInput, MouseInputEvent
 */

import { useEffect } from 'react';
import { useStdout } from 'ink';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MouseInputEvent {
  /** Column (1-based, matches process.stdout.columns) */
  x: number;
  /** Row (1-based, matches process.stdout.rows) */
  y: number;
  /** Which button: 0=left, 1=middle, 2=right */
  button: number;
  /** Press, drag, release, hover move, or wheel scroll. */
  action: 'press' | 'drag' | 'release' | 'move' | 'scroll';
}

// ─── ANSI sequences ──────────────────────────────────────────────────────────

const MOUSE_ENABLE  = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const MOUSE_DISABLE = '\x1b[?1006l\x1b[?1002l\x1b[?1000l';

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
  const final = match[4];
  const buttonNumber = (cb & 0b0000_0011) | ((cb & 0b1100_0000) >> 4);
  const dragging = (cb & 0b0010_0000) === 0b0010_0000;

  let action: MouseInputEvent['action'];
  if (final === 'm') action = 'release';
  else if (dragging && buttonNumber <= 2) action = 'drag';
  else if (dragging) action = 'move';
  else if (buttonNumber >= 4 && buttonNumber <= 7) action = 'scroll';
  else action = 'press';

  return {
    x: cx,
    y: cy,
    button: buttonNumber <= 2 ? buttonNumber : 0,
    action,
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
function safeWrite(write: (data: string) => void, data: string): void {
  try {
    write(data);
  } catch {
    // 📖 Terminal teardown can close stdout before React effects finish.
  }
}

export function useMouseMode(enabled = true): void {
  const { write } = useStdout();

  useEffect(() => {
    if (!enabled) return;
    if (!process.stdin.isTTY) return;

    safeWrite(write, MOUSE_ENABLE);

    // 📖 Safety: ensure mouse mode is disabled on process exit.
    const cleanup = () => safeWrite(write, MOUSE_DISABLE);
    process.on('exit', cleanup);

    return () => {
      process.removeListener('exit', cleanup);
      safeWrite(write, MOUSE_DISABLE);
    };
  }, [enabled, write]);
}
