/**
 * @file Agent chat skill helper tests
 * @description Locks the pure interactive-skill contract (t310): the numbered
 * question parser the answer form is built from (including the candidate
 * answer bullets grill-me v2 asks agents to propose), and the answer formatter
 * the sidebar sends back as a plain follow-up message.
 */

import { describe, expect, it } from 'vitest';
import { formatAnswers, parseNumberedQuestions, parseSkillQuestions } from '../agent-chat-skills';

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

describe('parseSkillQuestions', () => {
  it('returns question texts with empty options when the turn has no bullets', () => {
    expect(parseSkillQuestions('1. What is the goal?\n2. Who reviews?')).toEqual([
      { text: 'What is the goal?', options: [] },
      { text: 'Who reviews?', options: [] },
    ]);
  });

  it('collects the "- " bullets directly under each question as options', () => {
    const text = [
      '1. Which surfaces must the filter cover?',
      '   - Web UI only',
      '   - Web UI and CLI',
      '   - Everything including the TUI',
      '2. How should legacy tasks without a category be treated?',
      '- Excluded until migrated',
      '* Matched as uncategorized',
    ].join('\n');
    expect(parseSkillQuestions(text)).toEqual([
      {
        text: 'Which surfaces must the filter cover?',
        options: ['Web UI only', 'Web UI and CLI', 'Everything including the TUI'],
      },
      {
        text: 'How should legacy tasks without a category be treated?',
        options: ['Excluded until migrated', 'Matched as uncategorized'],
      },
    ]);
  });

  it('tolerates blank lines inside an option block', () => {
    const text = '1. Scope?\n\n- Narrow\n- Wide\n\n2. Owner?\n- vava';
    expect(parseSkillQuestions(text)).toEqual([
      { text: 'Scope?', options: ['Narrow', 'Wide'] },
      { text: 'Owner?', options: ['vava'] },
    ]);
  });

  it('ends the option block at prose so unrelated text never becomes options', () => {
    const text = '1. Deadline?\n- This week\n- Next week\nI can also start immediately.\n2. Next question?';
    const parsed = parseSkillQuestions(text);
    expect(parsed[0].options).toEqual(['This week', 'Next week']);
    expect(parsed[1].text).toBe('Next question?');
  });

  it('dedupes options and caps them at four per question', () => {
    const text = [
      '1. Pick one?',
      '- Same option',
      '- Same option',
      '- A',
      '- B',
      '- C',
      '- D',
      '- E beyond the cap',
    ].join('\n');
    expect(parseSkillQuestions(text)[0].options).toEqual(['Same option', 'A', 'B', 'C']);
  });

  it('keeps questions without options compatible with the text-only parser', () => {
    const text = '1. Same?\n2. Other?\n3. Same?';
    expect(parseSkillQuestions(text).map(question => question.text)).toEqual(parseNumberedQuestions(text));
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
