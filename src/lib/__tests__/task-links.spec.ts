/**
 * @file Tests for the agent chat task link parser
 * @description Locks the pure contract of src/lib/task-links.ts: the
 * `[show: tXXX]` directive (last one wins, known anchors kept, unknown anchors
 * and malformed forms rejected), the stripping of directives from displayed
 * text without leaving ragged blank lines, and the linkification of `[[tXXX]]`
 * plus bare `tXXX` references into `task:` markdown links, with code fences
 * and inline code spans protected.
 */

import { describe, expect, it } from 'vitest';
import { findShowDirective, linkifyTaskReferences, stripShowDirectives } from '../task-links';

describe('findShowDirective', () => {
  it('parses the plain directive and canonicalizes the task id', () => {
    expect(findShowDirective('Working on it.\n[show: t42]')).toEqual({ taskId: 't42', anchor: null });
  });

  it('keeps a known anchor and drops an unknown one without rejecting the directive', () => {
    expect(findShowDirective('[show: t42]#subtasks')).toEqual({ taskId: 't42', anchor: 'subtasks' });
    expect(findShowDirective('[ show : T7 ]#report')).toEqual({ taskId: 't7', anchor: 'report' });
    expect(findShowDirective('[show: t42]#summary')).toEqual({ taskId: 't42', anchor: null });
  });

  it('takes the last directive when a message carries several', () => {
    expect(findShowDirective('[show: t1]\nmiddle\n[show: t2]#description')).toEqual({
      taskId: 't2',
      anchor: 'description',
    });
  });

  it('rejects malformed directives and plain task ids', () => {
    expect(findShowDirective('[show: t]')).toBeNull();
    expect(findShowDirective('[show 42]')).toBeNull();
    expect(findShowDirective('show: t42')).toBeNull();
    expect(findShowDirective('no directive here')).toBeNull();
    expect(findShowDirective('')).toBeNull();
  });
});

describe('stripShowDirectives', () => {
  it('removes the directive line entirely', () => {
    expect(stripShowDirectives('Here you go.\n[show: t42]\n')).toBe('Here you go.');
  });

  it('removes an inline directive without touching surrounding words', () => {
    expect(stripShowDirectives('before [show: t42]#subtasks after')).toBe('before  after');
  });

  it('keeps paragraph separation when the directive sat between paragraphs', () => {
    expect(stripShowDirectives('first\n\n[show: t42]\n\nsecond')).toBe('first\n\nsecond');
  });

  it('leaves text without directives untouched', () => {
    expect(stripShowDirectives('plain [text] with brackets')).toBe('plain [text] with brackets');
  });
});

describe('linkifyTaskReferences', () => {
  it('rewrites the explicit [[t42]] form into a task link', () => {
    expect(linkifyTaskReferences('see [[t42]] now')).toBe('see [t42](task:t42) now');
  });

  it('linkifies a bare task id followed by space or punctuation', () => {
    expect(linkifyTaskReferences('t42 is ready')).toBe('[t42](task:t42) is ready');
    expect(linkifyTaskReferences('done in t42.')).toBe('done in [t42](task:t42).');
    expect(linkifyTaskReferences('(t42)')).toBe('([t42](task:t42))');
    expect(linkifyTaskReferences('end t42')).toBe('end [t42](task:t42)');
  });

  it('never linkifies inside words, paths or code', () => {
    expect(linkifyTaskReferences('part123 stays')).toBe('part123 stays');
    expect(linkifyTaskReferences('t42px stays')).toBe('t42px stays');
    expect(linkifyTaskReferences('url /t42 stays')).toBe('url /t42 stays');
    expect(linkifyTaskReferences('`code t42` stays')).toBe('`code t42` stays');
    expect(linkifyTaskReferences('```\nfence t42\n```')).toBe('```\nfence t42\n```');
  });

  it('keeps linkifying after an unterminated streaming fence boundary', () => {
    const out = linkifyTaskReferences('```\nopen fence t42\n');
    expect(out).toBe('```\nopen fence t42\n');
  });

  it('canonicalizes letter case in the href', () => {
    expect(linkifyTaskReferences('[[T42]]')).toBe('[t42](task:t42)');
  });
});
