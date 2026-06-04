/**
 * @file Mouse support hook for Ink-based TUI
 * @description Enables terminal mouse tracking (X10 mode) and parses click events
 * from stdin. Provides a React hook that reports click positions so components
 * can respond to mouse input.
 *
 * 📖 How it works:
 *  - On mount, sends `\x1b[?1000h` to enable X10 mouse tracking (button press/release only)
 *  - Also sends `\x1b[?1006h` for SGR extended mouse mode (better coordinate handling)
 *  - Listens on stdin for `\x1b[<Cb;Cx;CyM` sequences (SGR mouse format)
 *  - On unmount, sends `\x1b[?1006l` and `\x1b[?1000l` to disable tracking
 *
 * 📖 The SGR format (`\x1b[?1006h`) is preferred over legacy X10 because:
 *  - Coordinates are in decimal ASCII, not encoded as single bytes (supports large terminals)
 *  - Uses 'M' for press and 'm' for release (unambiguous)
 *  - Supported by virtually all modern terminals (iTerm2, Terminal.app, kitty, alacritty, Windows Terminal)
 *
 * 📖 Mouse events are throttled to avoid flooding React re-renders during drag-like sequences.
 * Only click events (press) are reported by default.
 *
 * @functions
 *  → useMouse — React hook that enables terminal mouse tracking and fires onClick
 *
 * @exports useMouse
 */

import { useEffect, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MouseEvent {
  /** Column (1-based, matches process.stdout.columns) */
  x: number;
  /** Row (1-based, matches process.stdout.rows) */
  y: number;
  /** Which button: 0=left, 1=middle, 2=right */
  button: number;
  /** 'press' or 'release' */
  action: 'press' | 'release';
  /** Shift held */
  shift: boolean;
  /** Alt/Meta held */
  meta: boolean;
  /** Ctrl held */
  ctrl: boolean;
}

export type MouseHandler = (event: MouseEvent) => void;

interface UseMouseOptions {
  /** Whether mouse tracking is active (default: true). Use false to temporarily disable. */
  enabled?: boolean;
  /** Only fire for press events (default: true). Set false to also get release events. */
  pressOnly?: boolean;
}

// ─── ANSI sequences for mouse mode ───────────────────────────────────────────

// 📖 X10 basic mouse tracking (button press only, limited to coords < 223)
const MOUSE_ENABLE_X10 = '\x1b[?1000h';
const MOUSE_DISABLE_X10 = '\x1b[?1000l';

// 📖 SGR extended mouse mode (decimal coords, supports large terminals, press+release)
const MOUSE_ENABLE_SGR = '\x1b[?1006h';
const MOUSE_DISABLE_SGR = '\x1b[?1006l';

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * 📖 Attempts to parse a mouse event from the beginning of a string buffer.
 * Looks for SGR mouse sequences: `\x1b[<Cb;Cx;CyM` or `\x1b[<Cb;Cx;Cym`
 * Cb = button code (button + modifiers), Cx = column, Cy = row
 * Final char 'M' = press, 'm' = release
 *
 * @returns parsed MouseEvent and end index, or null if no match
 */
function parseSGRMouse(buffer: string): { event: MouseEvent; endIndex: number } | null {
  // SGR format: ESC [ < Cb ; Cx ; Cy M/m
  const sgrRegex = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
  const match = buffer.match(sgrRegex);
  if (!match) return null;

  const cb = parseInt(match[1], 10);
  const cx = parseInt(match[2], 10);
  const cy = parseInt(match[3], 10);
  const isPress = match[4] === 'M';

  // 📖 Decode button code: bits 0-1 = button (0=left, 1=middle, 2=right, 3=release/move)
  // bit 2 = shift, bit 3 = meta, bit 4 = ctrl, bit 5 = motion
  const button = cb & 0x03;
  const shift = (cb & 0x04) !== 0;
  const meta = (cb & 0x08) !== 0;
  const ctrl = (cb & 0x10) !== 0;

  return {
    event: {
      x: cx,
      y: cy,
      button,
      action: isPress ? 'press' : 'release',
      shift,
      meta,
      ctrl,
    },
    endIndex: match[0].length,
  };
}

/**
 * 📖 Fallback: parse legacy X10 mouse sequences for terminals that don't support SGR.
 * Format: ESC [ M Cb Cx Cy (where each is a byte + 32)
 * Less reliable for large terminals (coordinate limit 223) but widely supported.
 */
function parseX10Mouse(buffer: string): { event: MouseEvent; endIndex: number } | null {
  if (!buffer.startsWith('\x1b[M')) return null;
  if (buffer.length < 6) return null; // need at least ESC [ M + 3 bytes

  const cb = buffer.charCodeAt(3) - 32;
  const cx = buffer.charCodeAt(4) - 32;
  const cy = buffer.charCodeAt(5) - 32;

  if (cb < 0 || cx < 0 || cy < 0) return null;

  const button = cb & 0x03;
  const shift = (cb & 0x04) !== 0;
  const meta = (cb & 0x08) !== 0;
  const ctrl = (cb & 0x10) !== 0;

  return {
    event: {
      x: cx,
      y: cy,
      button,
      action: 'press', // X10 only reports press
      shift,
      meta,
      ctrl,
    },
    endIndex: 6,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * 📖 React hook that enables terminal mouse tracking and calls the handler on click events.
 *
 * Usage:
 * ```tsx
 * useMouse((evt) => {
 *   console.log(`Clicked at row ${evt.y}, col ${evt.x}`);
 * }, { enabled: true });
 * ```
 *
 * @param handler — callback fired on every mouse event (or press-only by default)
 * @param options — enabled (default true), pressOnly (default true)
 */
export function useMouse(handler: MouseHandler, options: UseMouseOptions = {}): void {
  const { enabled = true, pressOnly = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const stdin = process.stdin;
    if (!stdin.isTTY) return;

    // 📖 Enable both SGR (preferred) and X10 (fallback) mouse tracking
    process.stdout.write(MOUSE_ENABLE_SGR + MOUSE_ENABLE_X10);

    // 📖 Buffer for accumulating partial sequences
    let buffer = '';

    const onData = (data: Buffer) => {
      buffer += data.toString('utf8');

      // 📖 Process all complete mouse sequences in the buffer
      while (buffer.length > 0) {
        // 📖 Try to parse a mouse sequence first
        let parsed = parseSGRMouse(buffer);
        if (!parsed) {
          parsed = parseX10Mouse(buffer);
        }

        if (parsed) {
          const { event, endIndex } = parsed;
          buffer = buffer.slice(endIndex);

          // 📖 Filter: press-only mode skips release events
          if (pressOnly && event.action === 'release') continue;
          // 📖 Filter: skip motion events (button 3 in X10 mode can be motion)
          if (event.button === 3 && event.action === 'press') continue;

          handlerRef.current(event);
        } else if (buffer.startsWith('\x1b[')) {
          // 📖 Starts with ESC[ but isn't a mouse sequence.
          // Check if it's a complete non-mouse CSI sequence that we should pass through.
          // Non-mouse CSI sequences are things like: \x1b[A (up arrow), \x1b[1;5C (ctrl-right), etc.
          // Mouse SGR: \x1b[<... — the '<' after '[' distinguishes mouse from keyboard sequences.
          // Mouse X10: \x1b[M — the 'M' after '[' distinguishes mouse from keyboard.
          if (buffer.length >= 3 && buffer[2] !== '<' && buffer[2] !== 'M') {
            // 📖 This is a keyboard CSI sequence, not a mouse sequence — pass everything through
            const leftover = buffer;
            buffer = '';
            stdin.unshift(Buffer.from(leftover, 'utf8'));
            break;
          }
          // 📖 Mouse-like sequence but incomplete — wait for more data
          // Safety: if buffer has been waiting too long (too many bytes), flush it
          if (buffer.length > 32) {
            const leftover = buffer;
            buffer = '';
            stdin.unshift(Buffer.from(leftover, 'utf8'));
          }
          break;
        } else if (buffer.startsWith('\x1b') && buffer.length > 1 && buffer[1] !== '[') {
          // 📖 Other escape sequences (e.g. \x1bOA for SS3 sequences) — pass through
          const leftover = buffer;
          buffer = '';
          stdin.unshift(Buffer.from(leftover, 'utf8'));
          break;
        } else if (buffer.startsWith('\x1b') && buffer.length === 1) {
          // 📖 Bare escape — wait a tiny bit for more data
          break;
        } else {
          // 📖 No escape sequence at all — regular keyboard input, push back to stdin
          const leftover = buffer;
          buffer = '';
          stdin.unshift(Buffer.from(leftover, 'utf8'));
          break;
        }
      }

      // 📖 Safety: clear buffer if it grows too large (stuck partial sequences)
      if (buffer.length > 256) {
        const leftover = buffer;
        buffer = '';
        stdin.unshift(Buffer.from(leftover, 'utf8'));
      }
    };

    // 📖 We listen on 'data' but must play nice with Ink's own stdin listener.
    // Using `prependListener` ensures we get first crack at the data.
    stdin.prependListener('data', onData);

    // 📖 Safety: ensure mouse mode is disabled on process exit even if unmount doesn't fire
    const cleanup = () => {
      process.stdout.write(MOUSE_DISABLE_SGR + MOUSE_DISABLE_X10);
    };
    process.on('exit', cleanup);

    return () => {
      stdin.removeListener('data', onData);
      process.removeListener('exit', cleanup);
      // 📖 Disable mouse tracking on unmount
      process.stdout.write(MOUSE_DISABLE_SGR + MOUSE_DISABLE_X10);
    };
  }, [enabled, pressOnly]);
}
