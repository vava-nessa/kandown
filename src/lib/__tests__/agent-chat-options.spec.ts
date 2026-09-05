/**
 * @file Tests for the agent chat choice/proposal parser
 * @description Locks the pure contract of src/lib/agent-chat-options.ts:
 * the ```options fenced block (choices capped at 6, clipped at 90 chars,
 * empty lines skipped, fences still open mid-stream tolerated, foreign fences
 * protective) and the PROPOSE line (action required, fences protective), plus
 * the exact stripping of both from the displayed text without leaving ragged
 * blank lines behind.
 */

import { describe, expect, it } from 'vitest';
import {
  extractOptionsBlocks,
  stripOptionsBlocks,
  extractProposals,
  stripProposals,
  MAX_OPTIONS,
  MAX_OPTION_LENGTH,
} from '../agent-chat-options';

describe('extractOptionsBlocks', () => {
  it('parses a well-formed block with its exact span', () => {
    const text = 'How should we proceed?\n\n```options\nMove t271 to Done\nSplit it into two tasks\n```\n';
    const blocks = extractOptionsBlocks(text);
    expect(blocks).toHaveLength(1);
    const [block] = blocks;
    expect(block?.choices).toEqual(['Move t271 to Done', 'Split it into two tasks']);
    expect(text.slice(block.start, block.end)).toBe('```options\nMove t271 to Done\nSplit it into two tasks\n```\n');
  });

  it('accepts the language tag case-insensitively and small indents', () => {
    const blocks = extractOptionsBlocks('  ```OPTIONS\nA\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.choices).toEqual(['A']);
  });

  it('returns nothing when the fences are missing (a bare options line is not a block)', () => {
    expect(extractOptionsBlocks('options\nChoice one\nChoice two')).toEqual([]);
    expect(extractOptionsBlocks('- Move t271 to Done\n- Split it')).toEqual([]);
  });

  it('caps the choices at MAX_OPTIONS, first ones winning', () => {
    const lines = Array.from({ length: 9 }, (_, i) => `Choice ${i + 1}`);
    const text = '```options\n' + lines.join('\n') + '\n```';
    const [block] = extractOptionsBlocks(text);
    expect(block?.choices).toHaveLength(MAX_OPTIONS);
    expect(block?.choices[0]).toBe('Choice 1');
    expect(block?.choices[MAX_OPTIONS - 1]).toBe(`Choice ${MAX_OPTIONS}`);
  });

  it('clips a choice longer than MAX_OPTION_LENGTH', () => {
    const long = 'x'.repeat(200);
    const [block] = extractOptionsBlocks(`\`\`\`options\n${long}\n\`\`\``);
    expect(block?.choices[0]).toHaveLength(MAX_OPTION_LENGTH);
  });

  it('skips empty lines inside the block', () => {
    const [block] = extractOptionsBlocks('```options\n\nFirst\n\n\nSecond\n\n```');
    expect(block?.choices).toEqual(['First', 'Second']);
  });

  it('parses a block that is not last, keeping the trailing text out of the span', () => {
    const text = '```options\nA\n```\n\nAnd some prose after.';
    const [block] = extractOptionsBlocks(text);
    expect(block?.choices).toEqual(['A']);
    expect(text.slice(block.start, block.end)).toBe('```options\nA\n```\n');
  });

  it('parses several blocks in order', () => {
    const text = '```options\nA\n```\nmiddle\n```options\nB\nC\n```';
    const blocks = extractOptionsBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.choices).toEqual(['A']);
    expect(blocks[1]?.choices).toEqual(['B', 'C']);
    expect(blocks[0]?.start).toBeLessThan(blocks[1]?.start ?? 0);
  });

  it('yields the choices so far when the fence is still open (streaming)', () => {
    const [block] = extractOptionsBlocks('intro\n\n```options\nFirst\nSec');
    expect(block?.choices).toEqual(['First', 'Sec']);
    expect(block?.end).toBe('intro\n\n```options\nFirst\nSec'.length);
  });

  it('ignores an options fence nested inside another fence', () => {
    const text = '```ts\n// sample\nconst x = 1;\n```\n```options\nReal\n```';
    const blocks = extractOptionsBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.choices).toEqual(['Real']);
  });
});

describe('stripOptionsBlocks', () => {
  it('removes the block and leaves no ragged blank seam', () => {
    const text = 'Question?\n\n```options\nA\nB\n```\n';
    expect(stripOptionsBlocks(text)).toBe('Question?');
  });

  it('keeps the text after a block that is not last', () => {
    const text = '```options\nA\n```\n\nProse stays.';
    expect(stripOptionsBlocks(text)).toBe('Prose stays.');
  });

  it('removes every block from a multi-block message', () => {
    const text = 'One:\n```options\nA\n```\nTwo:\n```options\nB\n```';
    expect(stripOptionsBlocks(text)).toBe('One:\nTwo:');
  });

  it('returns the text untouched when there is no block', () => {
    const text = 'Plain markdown, `inline code`, nothing special.';
    expect(stripOptionsBlocks(text)).toBe(text);
  });
});

describe('extractProposals', () => {
  it('parses a PROPOSE line with its action and span', () => {
    const text = 'Checked the board.\nPROPOSE: move t271 to Done\n';
    const proposals = extractProposals(text);
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(proposal?.action).toBe('move t271 to Done');
    expect(text.slice(proposal.start, proposal.end)).toBe('PROPOSE: move t271 to Done\n');
  });

  it('parses several proposals in order and requires action text', () => {
    const text = 'PROPOSE: move t1 to Done\nPROPOSE:\nPROPOSE: split t2';
    const proposals = extractProposals(text);
    expect(proposals.map(p => p.action)).toEqual(['move t1 to Done', 'split t2']);
  });

  it('never matches inside a fenced block', () => {
    const text = '```\nPROPOSE: fake inside code\n```\nPROPOSE: real';
    const proposals = extractProposals(text);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.action).toBe('real');
  });

  it('ignores list items and deep indents', () => {
    expect(extractProposals('- PROPOSE: not at margin')).toEqual([]);
    expect(extractProposals('    PROPOSE: indented code block')).toEqual([]);
  });
});

describe('stripProposals', () => {
  it('removes the line entirely, leaving no blank seam', () => {
    const text = 'Before.\nPROPOSE: move t271 to Done\nAfter.';
    expect(stripProposals(text)).toBe('Before.\nAfter.');
  });

  it('removes a proposal that ends the message', () => {
    const text = 'Intro.\n\nPROPOSE: move t271 to Done';
    expect(stripProposals(text)).toBe('Intro.');
  });

  it('returns the text untouched when there is no proposal', () => {
    expect(stripProposals('Nothing to see here.')).toBe('Nothing to see here.');
  });
});
