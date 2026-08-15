/**
 * @file Parser + serializer round-trip
 * @description Vitest suite locking the `parseSimpleYaml` / `parseTaskFile` ↔
 * `serializeTaskFile` round-trip. This is invariant #1 from
 * docs/ARCHITECTURE.md: anything the serializer can write, the parser must read
 * back identically. It was the highest-value target with zero coverage, so it is
 * the first thing we lock down before extending the format.
 *
 * The suite characterises the historical behaviour (flat scalars, inline
 * arrays, multi-line block scalars, empty-value omission) AND the new nested
 * mapping support that backs the opaque `plugins.<id>.*` extension namespace
 * (see docs/EXTENSIONS.md § "The data model").
 */

import { describe, it, expect } from 'vitest';
import { parseSimpleYaml, parseTaskFile } from '../parser';
import { serializeTaskFile } from '../serializer';
import type { TaskFrontmatter } from '../types';

function roundTrip(fm: TaskFrontmatter, body = ''): TaskFrontmatter {
  return parseTaskFile(serializeTaskFile(fm, body)).frontmatter;
}

describe('parseSimpleYaml — flat values (regression guard)', () => {
  it('parses flat string scalars', () => {
    const out = parseSimpleYaml('id: t1\ntitle: Hello world\nstatus: In Progress');
    expect(out).toEqual({ id: 't1', title: 'Hello world', status: 'In Progress' });
  });

  it('parses inline arrays', () => {
    const out = parseSimpleYaml('tags: [a, b, c]\ndepends_on: [t2, t3]');
    expect(out).toEqual({ tags: ['a', 'b', 'c'], depends_on: ['t2', 't3'] });
  });

  it('strips surrounding quotes from scalars', () => {
    const out = parseSimpleYaml('title: "quoted"\nowner: \'single\'');
    expect(out).toEqual({ title: 'quoted', owner: 'single' });
  });

  it('parses a multi-line block scalar', () => {
    const out = parseSimpleYaml('report: |\n  line one\n  line two');
    expect(out.report).toBe('line one\nline two');
  });

  it('preserves blank lines inside a block scalar', () => {
    const out = parseSimpleYaml('report: |\n  line one\n\n  line three');
    expect(out.report).toBe('line one\n\nline three');
  });

  it('treats an empty value as empty string', () => {
    const out = parseSimpleYaml('blank:');
    expect(out.blank).toBe('');
  });
});

describe('serializeTaskFile ↔ parseTaskFile — flat round-trip (regression guard)', () => {
  it('round-trips a typical task', () => {
    const fm: TaskFrontmatter = {
      id: 't1',
      title: 'Refactor parser',
      status: 'In Progress',
      priority: 'P1',
      depends_on: ['t2', 't3'],
      tags: ['backend', 'parser'],
    };
    expect(roundTrip(fm)).toEqual(fm);
  });

  it('round-trips the category field (0.53.0 first-class category)', () => {
    const fm: TaskFrontmatter = {
      id: 't232',
      title: 'Fix the login button',
      category: 'UI',
      status: 'Backlog',
    };
    expect(roundTrip(fm)).toEqual(fm);
    // 📖 The category must land in the frontmatter as its own line, next to
    // the clean title, and never inside the title itself.
    const out = serializeTaskFile(fm, '');
    expect(out).toContain('category: UI');
    expect(out).not.toContain('[UI]');
  });

  it('round-trips a multi-line report byte-stably', () => {
    const fm = { id: 't9', title: 'X', report: 'first paragraph.\n\nsecond paragraph.' } as TaskFrontmatter;
    expect(roundTrip(fm).report).toBe(fm.report);
  });

  it('omits empty values on write', () => {
    const fm = { id: 't1', title: 'X', assignee: '', depends_on: [] } as unknown as TaskFrontmatter;
    const out = serializeTaskFile(fm, '');
    expect(out).not.toContain('assignee');
    expect(out).not.toContain('depends_on');
  });

  it('round-trips the body separately from frontmatter', () => {
    const fm = { id: 't1', title: 'X' } as TaskFrontmatter;
    const body = '## Goal\n\nDo the thing.\n';
    const parsed = parseTaskFile(serializeTaskFile(fm, body));
    expect(parsed.frontmatter).toEqual(fm);
    expect(parsed.body).toBe(body.trimStart());
  });
});

describe('nested mappings — the plugins.* extension namespace', () => {
  it('parses a nested object two levels deep', () => {
    const out = parseSimpleYaml('plugins:\n  burndown:\n    points: 5\n    assignee: vava');
    expect(out.plugins).toEqual({ burndown: { points: '5', assignee: 'vava' } });
  });

  it('parses sibling namespaces under plugins', () => {
    const yaml = [
      'plugins:',
      '  burndown:',
      '    points: 5',
      '  labels:',
      '    color: red',
      'title: foo',
    ].join('\n');
    const out = parseSimpleYaml(yaml);
    expect(out.plugins).toEqual({
      burndown: { points: '5' },
      labels: { color: 'red' },
    });
    expect(out.title).toBe('foo');
  });

  it('parses three levels of nesting', () => {
    const out = parseSimpleYaml('plugins:\n  ext:\n    a:\n      b: deep');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((out.plugins as any).ext.a.b).toBe('deep');
  });

  it('round-trips a nested plugins namespace through serialize + parse', () => {
    const fm = {
      id: 't1',
      title: 'Task with extension data',
      plugins: { burndown: { points: '5', assignee: 'vava' } },
    } as unknown as TaskFrontmatter;
    const back = roundTrip(fm);
    expect(back.plugins).toEqual({ burndown: { points: '5', assignee: 'vava' } });
  });

  it('keeps core fields and plugins side by side', () => {
    const fm = {
      id: 't1',
      title: 'Mixed',
      status: 'Done',
      depends_on: ['t2'],
      plugins: { time: { estimate: '3' } },
    } as unknown as TaskFrontmatter;
    const back = roundTrip(fm);
    expect(back.id).toBe('t1');
    expect(back.status).toBe('Done');
    expect(back.depends_on).toEqual(['t2']);
    expect(back.plugins).toEqual({ time: { estimate: '3' } });
  });

  it('produces readable indented YAML for nested data', () => {
    const fm = {
      id: 't1',
      title: 'X',
      plugins: { burndown: { points: '5' } },
    } as unknown as TaskFrontmatter;
    const out = serializeTaskFile(fm, '');
    expect(out).toContain('plugins:\n  burndown:\n    points: 5');
  });

  it('omits an empty plugins namespace', () => {
    const fm = { id: 't1', title: 'X', plugins: {} } as unknown as TaskFrontmatter;
    expect(serializeTaskFile(fm, '')).not.toContain('plugins');
  });
});
