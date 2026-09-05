/**
 * @file Chat mention + slash token helper tests
 * @description Locks the pure prompt-token contract the PromptBar codes
 * against: the @task mention scanner (active query at the caret), the /skill
 * scanner, the mentioned-id extraction for the transport, and the explicit
 * identity of stripMentionMarkers (mentions stay visible in the sent text).
 */

import { describe, expect, it } from 'vitest';
import {
  extractMentionedTaskIds,
  findActiveMentionQuery,
  findActiveSlashQuery,
  stripMentionMarkers,
} from '../chat-mentions';

describe('findActiveMentionQuery', () => {
  it('detects an unfinished token at the end of the text', () => {
    expect(findActiveMentionQuery('analyse @t2', 11)).toEqual({ query: 't2', tokenStart: 8 });
  });

  it('detects a bare trigger with an empty query', () => {
    expect(findActiveMentionQuery('@', 1)).toEqual({ query: '', tokenStart: 0 });
    expect(findActiveMentionQuery('hello @', 7)).toEqual({ query: '', tokenStart: 6 });
  });

  it('detects a token at the very start of the text', () => {
    expect(findActiveMentionQuery('@t271', 5)).toEqual({ query: 't271', tokenStart: 0 });
  });

  it('requires a word boundary before the trigger', () => {
    expect(findActiveMentionQuery('mail me@some', 12)).toBeNull();
  });

  it('stops matching once a space follows the token', () => {
    expect(findActiveMentionQuery('analyse @t271 stp', 17)).toBeNull();
  });

  it('ignores tokens the caret has already left', () => {
    // Caret sits at the token end: still active.
    expect(findActiveMentionQuery('analyse @t271', 13)).toEqual({ query: 't271', tokenStart: 8 });
    // Caret at the very start: nothing typed yet, nothing active.
    expect(findActiveMentionQuery('@t271 work', 0)).toBeNull();
    expect(findActiveMentionQuery('done @t271 work', 15)).toBeNull();
  });

  it('accepts hyphens and underscores in the query', () => {
    expect(findActiveMentionQuery('see @t-9_x now', 10)).toEqual({ query: 't-9_x', tokenStart: 4 });
  });

  it('clamps an out-of-range caret instead of throwing', () => {
    expect(findActiveMentionQuery('@t1', 99)).toEqual({ query: 't1', tokenStart: 0 });
    expect(findActiveMentionQuery('@t1', -3)).toBeNull();
  });
});

describe('findActiveSlashQuery', () => {
  it('detects an unfinished slash token', () => {
    expect(findActiveSlashQuery('/grill', 6)).toEqual({ query: 'grill', tokenStart: 0 });
    expect(findActiveSlashQuery('hey /gri', 8)).toEqual({ query: 'gri', tokenStart: 4 });
  });

  it('does not match a slash inside a word', () => {
    expect(findActiveSlashQuery('a/b', 3)).toBeNull();
  });

  it('stops matching after a space closes the token', () => {
    expect(findActiveSlashQuery('/grill me', 9)).toBeNull();
  });
});

describe('extractMentionedTaskIds', () => {
  it('extracts unique ids in first-occurrence order', () => {
    expect(extractMentionedTaskIds('analyse @t271 stp, puis @t3 et @t271 encore')).toEqual([
      't271',
      't3',
    ]);
  });

  it('caps the list at 5 ids, first wins', () => {
    const text = '@a @b @c @d @e @f @g';
    expect(extractMentionedTaskIds(text)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps hyphens and underscores in ids', () => {
    expect(extractMentionedTaskIds('see @t-9_x')).toEqual(['t-9_x']);
  });

  it('returns an empty list without mentions', () => {
    expect(extractMentionedTaskIds('no mentions here')).toEqual([]);
    expect(extractMentionedTaskIds('')).toEqual([]);
    expect(extractMentionedTaskIds('bare @ alone')).toEqual([]);
  });
});

describe('stripMentionMarkers', () => {
  it('is an explicit identity: mentions stay visible in the sent text', () => {
    const text = 'analyse @t271 stp';
    expect(stripMentionMarkers(text)).toBe(text);
  });
});
