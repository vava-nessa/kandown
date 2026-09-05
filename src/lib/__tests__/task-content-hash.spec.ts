/**
 * @file Tests for the shared task-content hash
 * @description Covers the three properties the optimistic-concurrency guard
 * depends on: stability (same content, same digest, across calls), sensitivity
 * (any content change produces a different digest) and the 16-character slice
 * length. Golden vectors are the published SHA-256 digests, so a regression in
 * the underlying implementation cannot pass silently.
 * @see src/lib/task-content-hash.ts
 */

import { describe, expect, it } from 'vitest';
import { CONTENT_HASH_LENGTH, contentHash } from '../task-content-hash';

describe('contentHash', () => {
  it('matches the published SHA-256 digest of the empty string', () => {
    // sha256("") = e3b0c44298fc1c149afbf4c8996fb924...
    expect(contentHash('')).toBe('e3b0c44298fc1c14');
  });

  it('matches the published SHA-256 digest of "abc"', () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223...
    expect(contentHash('abc')).toBe('ba7816bf8f01cfea');
  });

  it('is stable: identical content hashes identically across calls', () => {
    const content = '---\nid: t1\ntitle: Example\n---\n\n## Context\n\nBody text\n';
    expect(contentHash(content)).toBe(contentHash(content));
  });

  it('is sensitive: any content change changes the digest', () => {
    const base = '---\nid: t1\ntitle: Example\n---\n\nBody\n';
    expect(contentHash(base)).not.toBe(contentHash(`${base}more\n`));
    expect(contentHash(base)).not.toBe(contentHash(base.replace('Example', 'Changed')));
    expect(contentHash(base)).not.toBe(contentHash(`${base}\n`));
  });

  it('always returns exactly 16 lowercase hex characters', () => {
    for (const content of ['', 'a', 'kandown'.repeat(500)]) {
      const hash = contentHash(content);
      expect(hash).toHaveLength(CONTENT_HASH_LENGTH);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    }
  });
});
