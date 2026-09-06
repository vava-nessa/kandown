/**
 * @vitest-environment jsdom
 * @file Tests for the streaming markdown helpers
 * @description Locks the two pure helpers that keep a streaming assistant
 * message presentable: `closeDanglingCodeFence` (an odd number of ``` markers
 * means the stream cut a fenced block open, so a closing fence is appended
 * before the parser sees the text) and `splitStreamingTail` (the last few
 * words of the tail, split off for the generation shimmer sweep). The helpers
 * live next to the renderer (MarkdownContent.tsx) because they exist for its
 * streaming path; this suite only exercises their string behavior.
 */

import { describe, expect, it } from 'vitest';
import { closeDanglingCodeFence, splitStreamingTail } from '../../components/agent/MarkdownContent';

describe('closeDanglingCodeFence', () => {
  it('leaves balanced fences untouched', () => {
    const text = 'intro\n\n```ts\nconst a = 1;\n```\n\noutro';
    expect(closeDanglingCodeFence(text)).toBe(text);
  });

  it('leaves text without fences untouched', () => {
    expect(closeDanglingCodeFence('just prose and `inline code`')).toBe('just prose and `inline code`');
  });

  it('closes a fence the stream cut open (language form)', () => {
    expect(closeDanglingCodeFence('look:\n\n```ts\nconst a = 1;')).toBe('look:\n\n```ts\nconst a = 1;\n```');
  });

  it('closes a bare opening fence', () => {
    expect(closeDanglingCodeFence('```')).toBe('```\n```');
  });

  it('closes an open fence mid-typing of the language tag', () => {
    expect(closeDanglingCodeFence('```t')).toBe('```t\n```');
  });

  it('counts four markers as balanced (two complete blocks)', () => {
    const text = '```js\na()\n```\ntext\n```py\nb()\n```';
    expect(closeDanglingCodeFence(text)).toBe(text);
  });

  it('leaves the empty string alone', () => {
    expect(closeDanglingCodeFence('')).toBe('');
  });
});

describe('splitStreamingTail', () => {
  it('splits the last few words off the tail', () => {
    const { head, tail } = splitStreamingTail('one two three four five six seven');
    expect(head).toBe('one two three ');
    expect(tail).toBe('four five six seven');
  });

  it('keeps the tail on one line (no newline inside the sweep)', () => {
    const { head, tail } = splitStreamingTail('paragraph one\n\nshort tail here');
    expect(tail).not.toContain('\n');
    expect(head.endsWith('\n\n')).toBe(true);
    expect(`${head}${tail}`).toBe('paragraph one\n\nshort tail here');
  });

  it('wraps the whole string when it is only a few words', () => {
    expect(splitStreamingTail('tiny')).toEqual({ head: '', tail: 'tiny' });
  });

  it('returns no tail for empty or whitespace-only strings', () => {
    expect(splitStreamingTail('')).toEqual({ head: '', tail: '' });
    expect(splitStreamingTail('   \n  ')).toEqual({ head: '   \n  ', tail: '' });
  });

  it('is lossless: head plus tail always rebuilds the input', () => {
    const text = 'The answer **spans** words, and `code` too, with a trailing caret \u258D';
    const { head, tail } = splitStreamingTail(text);
    expect(`${head}${tail}`).toBe(text);
  });
});
