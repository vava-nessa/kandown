/**
 * @file Agent chat skill helper tests
 * @description Locks the pure interactive-skill contract (t310): the numbered
 * question parser the answer form is built from, and the answer formatter the
 * sidebar sends back as a plain follow-up message.
 */

import { describe, expect, it } from 'vitest';
import { formatAnswers, parseNumberedQuestions } from '../agent-chat-skills';

describe('parseNumberedQuestions', () => {
  it('extracts "N." lines trimmed', () => {
    expect(parseNumberedQuestions('Intro\n1. What is the goal?\n2.  Who reviews? \nBye.')).toEqual([
      'What is the goal?',
      'Who reviews?',
    ]);
  });

  it('tolerates "N)" and "N -" separators', () => {
    expect(parseNumberedQuestions('1) First?\n2 - Second?\n3-Third no space')).toEqual([
      'First?',
      'Second?',
    ]);
  });

  it('returns an empty list when no numbered line exists', () => {
    expect(parseNumberedQuestions('Just prose, no questions.\n- a bullet\n10. beyond single digit')).toEqual([]);
    expect(parseNumberedQuestions('')).toEqual([]);
  });

  it('ignores non-question numbered shapes (decimals, 10+, hyphenated words)', () => {
    expect(parseNumberedQuestions('1.5 is a decimal\n10. too high\n1-step is one word')).toEqual([]);
  });

  it('dedupes repeated questions keeping the first occurrence', () => {
    expect(parseNumberedQuestions('1. Same?\n2. Other?\n3. Same?')).toEqual(['Same?', 'Other?']);
  });

  it('caps the list at 8 questions', () => {
    const text = Array.from({ length: 12 }, (_, i) => `${i + 1}. Question ${i + 1}?`).join('\n');
    const parsed = parseNumberedQuestions(text);
    expect(parsed).toHaveLength(8);
    expect(parsed[0]).toBe('Question 1?');
    expect(parsed[7]).toBe('Question 8?');
  });
});

describe('formatAnswers', () => {
  it('pairs answers with their questions under numbered lines', () => {
    const message = formatAnswers(['What scope?', 'Who reviews?'], ['The sidebar', 'vava']);
    expect(message).toBe('Answers:\n\n1. What scope?\nThe sidebar\n\n2. Who reviews?\nvava');
  });

  it('skips empty answers but keeps the original numbering', () => {
    const message = formatAnswers(['One?', 'Two?', 'Three?'], ['', 'second only', '   ']);
    expect(message).toBe('Answers:\n\n2. Two?\nsecond only');
  });

  it('still numbers answers when no questions were captured', () => {
    const message = formatAnswers([], ['fallback answer']);
    expect(message).toBe('Answers:\n\n1. Answer:\nfallback answer');
  });

  it('returns just the header when every answer is empty', () => {
    expect(formatAnswers(['One?'], ['', ''])).toBe('Answers:');
  });
});
