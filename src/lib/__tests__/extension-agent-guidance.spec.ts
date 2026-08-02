/**
 * @file Extension agent guidance manifest tests
 * @description Locks concise summary, safe guide path, and optional source
 * validation so malformed extension guidance cannot break Kandown Work.
 */

import { describe, expect, it } from 'vitest';
import { parseManifest } from '../extensions/manifest';

const base = { id: 'proof', name: 'Proof', version: '1.0.0', apiVersion: 1 };

describe('extension agent guidance', () => {
  it('accepts concise guidance with a safe on-demand guide', () => {
    const result = parseManifest({ ...base, agent: { summary: 'Capture evidence.', guide: 'docs/guide.md', source: 'https://example.com' } });
    expect(result.ok).toBe(true);
  });

  it('rejects missing summaries and path traversal', () => {
    expect(parseManifest({ ...base, agent: { guide: 'guide.md' } }).ok).toBe(false);
    expect(parseManifest({ ...base, agent: { summary: 'Proof.', guide: '../secret.md' } }).ok).toBe(false);
  });
});
