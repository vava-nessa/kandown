/**
 * @file Tests for the dependency chip formatter
 * @description Pins the two rendering rules: single dep → `↪ t234: <20 chars>`,
 * multiple deps → `↪N id1, id2, …`. The cap, ellipsis, missing-title fallback
 * and empty input are all part of the contract because the chip lands on the
 * web card and the TUI row — both surfaces that a silent regression would make
 * immediately noticeable.
 */

import { describe, expect, it } from 'vitest';
import { formatDependencyChip, DEPENDENCY_TITLE_PREVIEW } from '../dependency-chip-format';

describe('formatDependencyChip', () => {
  it('returns an empty string when there are no dependencies', () => {
    expect(formatDependencyChip([], new Map())).toBe('');
  });

  it('renders a single dependency as `↪ id: <20 char title>`', () => {
    const titles = new Map([['t234', 'Fix login button']]);
    expect(formatDependencyChip(['t234'], titles)).toBe('↪ t234: Fix login button');
  });

  it('truncates titles longer than 20 chars with an ellipsis', () => {
    const longTitle = 'A very long task title that overflows the preview';
    const titles = new Map([['t1', longTitle]]);
    const chip = formatDependencyChip(['t1'], titles);
    expect(chip).toBe(`↪ t1: ${longTitle.slice(0, DEPENDENCY_TITLE_PREVIEW)}…`);
    expect(chip.endsWith('…')).toBe(true);
    // 📖 Preview + ellipsis stays within one extra char of the cap, so the
    // chip never grows enough to wrap the card meta row.
    expect(chip.length).toBeLessThanOrEqual(`↪ t1: `.length + DEPENDENCY_TITLE_PREVIEW + 1);
  });

  it('keeps short titles exactly as-is, no ellipsis', () => {
    const titles = new Map([['t1', 'short']]);
    expect(formatDependencyChip(['t1'], titles)).toBe('↪ t1: short');
  });

  it('falls back to `↪ id` when the blocking task has no title (deleted / missing)', () => {
    expect(formatDependencyChip(['t42'], new Map())).toBe('↪ t42');
  });

  it('falls back to `↪ id` when the title in the map is empty', () => {
    const titles = new Map([['t42', '']]);
    expect(formatDependencyChip(['t42'], titles)).toBe('↪ t42');
  });

  it('renders multiple dependencies as `↪N id1, id2, …`', () => {
    const titles = new Map([
      ['t234', 'Fix login'],
      ['t112', 'Add CSS'],
    ]);
    expect(formatDependencyChip(['t234', 't112'], titles)).toBe('↪2 t234, t112');
  });

  it('does not include title previews when there are multiple dependencies', () => {
    // Even if titles are available, multi-dep always collapses to ids.
    const titles = new Map([
      ['t1', 'Alpha'],
      ['t2', 'Beta'],
      ['t3', 'Gamma'],
    ]);
    expect(formatDependencyChip(['t1', 't2', 't3'], titles)).toBe('↪3 t1, t2, t3');
  });

  it('preserves the original ID order', () => {
    const titles = new Map();
    expect(formatDependencyChip(['t9', 't1', 't5'], titles)).toBe('↪3 t9, t1, t5');
  });

  it('exports the title preview length so callers can size columns consistently', () => {
    expect(DEPENDENCY_TITLE_PREVIEW).toBe(20);
  });
});
