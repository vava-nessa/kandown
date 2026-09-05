/**
 * @file Unit tests for the quick-add inline syntax
 * @description `parseQuickAddInput` is what turns one typed line
 * ("Fix login p1 #auth @vava due:2026-01-30 +t12") into task frontmatter, in
 * both the web quick-add bar and the TUI. It is the only place where a user's
 * free text becomes structured data, so the two failure modes that matter are
 * losing an annotation and eating a word that only looked like one.
 *
 * Relative due dates ("today", "friday") are asserted against a recomputed
 * expectation rather than a frozen string, so the suite does not rot overnight.
 */
import { describe, it, expect } from 'vitest';
import { parseQuickAddInput } from '../quick-add-parser';

const isoDaysFromToday = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('parseQuickAddInput', () => {
  it('returns the bare title untouched when there is no annotation', () => {
    expect(parseQuickAddInput('Fix the login button')).toEqual({ title: 'Fix the login button' });
  });

  it('trims and collapses whitespace left behind by stripped annotations', () => {
    expect(parseQuickAddInput('  Fix   p1   login  ').title).toBe('Fix login');
  });

  it('extracts the priority and uppercases it', () => {
    expect(parseQuickAddInput('Fix login p2')).toMatchObject({ title: 'Fix login', priority: 'P2' });
    expect(parseQuickAddInput('P3 ship it').priority).toBe('P3');
  });

  it('ignores a p-token that is part of a word (p1x, top1)', () => {
    expect(parseQuickAddInput('Bump top1 chart').priority).toBeUndefined();
    expect(parseQuickAddInput('Bump p1x chart').priority).toBeUndefined();
  });

  it('ignores a priority level outside p1..p4', () => {
    expect(parseQuickAddInput('Sprint p5 planning').priority).toBeUndefined();
  });

  it('collects every #tag and lowercases them', () => {
    expect(parseQuickAddInput('Fix login #Auth #ui')).toMatchObject({
      title: 'Fix login',
      tags: ['auth', 'ui'],
    });
  });

  it('extracts an @assignee', () => {
    expect(parseQuickAddInput('Fix login @vava')).toMatchObject({ title: 'Fix login', assignee: 'vava' });
  });

  it('collects every +dependency', () => {
    expect(parseQuickAddInput('Ship v2 +t12 +t13')).toMatchObject({
      title: 'Ship v2',
      depends_on: ['t12', 't13'],
    });
  });

  it('keeps an explicit ISO due date verbatim', () => {
    expect(parseQuickAddInput('Fix login due:2026-01-30').due).toBe('2026-01-30');
  });

  it('resolves due:today and due:tomorrow relative to the run date', () => {
    expect(parseQuickAddInput('x due:today').due).toBe(isoDaysFromToday(0));
    expect(parseQuickAddInput('x due:tomorrow').due).toBe(isoDaysFromToday(1));
  });

  it('resolves a weekday to the next occurrence, never today', () => {
    const todayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
    expect(parseQuickAddInput(`x due:${todayName}`).due).toBe(isoDaysFromToday(7));
  });

  it('parses every annotation in one line without losing the prose', () => {
    expect(parseQuickAddInput('Fix login p1 #auth @vava due:2026-01-30 +t12')).toEqual({
      title: 'Fix login',
      priority: 'P1',
      tags: ['auth'],
      assignee: 'vava',
      due: '2026-01-30',
      depends_on: ['t12'],
    });
  });

  it('falls back to the raw input when the annotations consume the whole line', () => {
    expect(parseQuickAddInput('#auth').title).toBe('#auth');
  });

  it('omits absent fields instead of writing empty values into frontmatter', () => {
    expect(Object.keys(parseQuickAddInput('Just a title'))).toEqual(['title']);
  });
});
