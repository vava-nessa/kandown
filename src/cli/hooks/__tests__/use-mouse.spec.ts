/**
 * @file Unit tests for the SGR mouse sequence parser
 * @description `parseMouseInput` is what makes the TUI board clickable and
 * draggable: every click, drag and wheel tick arrives as a raw SGR escape
 * sequence on stdin and is decoded here. It has no seams to mock — string in,
 * event out — so it is exactly the kind of code that should be pinned by tests
 * rather than by trying a mouse in a terminal.
 *
 * 📖 Ink strips the leading ESC (\x1b) before handing input to `useInput`, so
 * every fixture below starts at `[<` — the real shape the parser sees at
 * runtime, not the textbook `\x1b[<…` form.
 */
import { describe, it, expect } from 'vitest';
import { parseMouseInput, isMouseInput } from '../use-mouse';

/** SGR: `[<Cb;Cx;Cy` + `M` (press/drag) or `m` (release). */
const sgr = (cb: number, x: number, y: number, final: 'M' | 'm' = 'M') => `[<${cb};${x};${y}${final}`;

describe('parseMouseInput', () => {
  it('returns null for ordinary keystrokes', () => {
    expect(parseMouseInput('q')).toBeNull();
    expect(parseMouseInput('')).toBeNull();
    expect(parseMouseInput('[A')).toBeNull();
  });

  it('decodes a left-button press with 1-based coordinates', () => {
    expect(parseMouseInput(sgr(0, 12, 5))).toEqual({ x: 12, y: 5, button: 0, action: 'press' });
  });

  it('decodes middle and right presses', () => {
    expect(parseMouseInput(sgr(1, 3, 4))).toMatchObject({ button: 1, action: 'press' });
    expect(parseMouseInput(sgr(2, 3, 4))).toMatchObject({ button: 2, action: 'press' });
  });

  it('decodes a release (lowercase final byte) whatever the button', () => {
    expect(parseMouseInput(sgr(0, 12, 5, 'm'))).toMatchObject({ action: 'release', button: 0 });
    expect(parseMouseInput(sgr(2, 12, 5, 'm'))).toMatchObject({ action: 'release', button: 2 });
  });

  it('decodes a drag (motion bit 32 with a button held)', () => {
    expect(parseMouseInput(sgr(32, 20, 8))).toEqual({ x: 20, y: 8, button: 0, action: 'drag' });
  });

  it('decodes a buttonless hover as move, not drag', () => {
    // 📖 35 = motion (32) + button bits 11 = "no button", the hover report.
    expect(parseMouseInput(sgr(35, 20, 8))).toEqual({ x: 20, y: 8, button: 0, action: 'move' });
  });

  it('decodes wheel up and wheel down with an explicit direction', () => {
    expect(parseMouseInput(sgr(64, 10, 10))).toEqual({ x: 10, y: 10, button: 0, action: 'scroll', wheel: 'up' });
    expect(parseMouseInput(sgr(65, 10, 10))).toEqual({ x: 10, y: 10, button: 0, action: 'scroll', wheel: 'down' });
  });

  it('leaves wheel unset on every non-scroll event', () => {
    expect(parseMouseInput(sgr(0, 1, 1))).not.toHaveProperty('wheel');
  });

  it('parses multi-digit coordinates on a wide terminal', () => {
    expect(parseMouseInput(sgr(0, 214, 103))).toMatchObject({ x: 214, y: 103 });
  });

  it('reads the leading sequence when the terminal batches input', () => {
    expect(parseMouseInput(`${sgr(0, 7, 9)}${sgr(0, 8, 9, 'm')}`)).toMatchObject({ x: 7, y: 9, action: 'press' });
  });
});

describe('isMouseInput', () => {
  it('recognizes SGR and legacy X10 mouse prefixes', () => {
    expect(isMouseInput(sgr(0, 1, 1))).toBe(true);
    expect(isMouseInput('[M abc')).toBe(true);
  });

  it('rejects keystrokes and arrow keys', () => {
    expect(isMouseInput('q')).toBe(false);
    expect(isMouseInput('[A')).toBe(false);
  });
});
