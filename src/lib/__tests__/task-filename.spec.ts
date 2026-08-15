/**
 * @file Tests for task filename slugs and id resolution
 * @description Guards the module that decides which file on disk holds a task.
 * A bug here is silent and expensive: the wrong file gets written, or a task
 * disappears from the board while its Markdown is still sitting in `tasks/`.
 * The cases below are the ones that actually break naive implementations,
 * accents, stop words, emoji-only titles, ids containing an underscore,
 * ambiguous folders, so they are locked before the resolver is wired into the
 * CLI and the browser filesystem layer.
 *
 * @see src/lib/task-filename.ts
 */

import { describe, it, expect } from 'vitest';
import {
  SLUG_MAX_LENGTH,
  slugifyTitle,
  buildTaskFilename,
  isTaskFilename,
  parseTaskFilename,
  taskIdFromFilename,
  resolveTaskFilename,
  hasDescriptiveSlug,
  hasCategorySegment,
  categorySegmentFromTitle,
  normalizeCategorySegment,
} from '../task-filename';

describe('slugifyTitle', () => {
  it('keeps the three words that carry meaning', () => {
    expect(slugifyTitle('Remove the dead code from the repo')).toBe('remove_dead_code');
    expect(slugifyTitle('Fix the login button')).toBe('fix_login_button');
    expect(slugifyTitle('Refactor button admin')).toBe('refactor_button_admin');
  });

  it('flattens accents and Latin letters Unicode decomposition misses', () => {
    expect(slugifyTitle('Réparer la génération des thèmes')).toBe('reparer_generation_themes');
    expect(slugifyTitle('Straße größer machen')).toBe('strasse_grosser_machen');
    expect(slugifyTitle('Sønderborg øst')).toBe('sonderborg_ost');
  });

  it('treats symbols as word breaks rather than trying to spell them out', () => {
    expect(slugifyTitle('Login & signup')).toBe('login_signup');
    expect(slugifyTitle('Ship C++ support')).toBe('ship_c_support');
    expect(slugifyTitle('user@example.com bounces')).toBe('user_example_com');
  });

  it('drops punctuation, emoji and casing', () => {
    expect(slugifyTitle('TUI: render markdown properly!')).toBe('tui_render_markdown');
    expect(slugifyTitle('🚀 Ship it (finally)')).toBe('ship_finally');
    // 📖 An underscore in the title is a word break like any other, it does not survive as itself.
    expect(slugifyTitle('snake_case and kebab-case titles')).toBe('snake_case_kebab');
  });

  it('ignores a leading bracket category, which says where and not what', () => {
    expect(slugifyTitle('[UI] Fix the login button')).toBe('fix_login_button');
    expect(slugifyTitle('[FABLE_CLEANUP] Remove dead code')).toBe('remove_dead_code');
  });

  it('returns an empty slug when nothing survives, so the caller falls back to the bare id', () => {
    expect(slugifyTitle('')).toBe('');
    expect(slugifyTitle('   ')).toBe('');
    expect(slugifyTitle('🎉🎉🎉')).toBe('');
    expect(slugifyTitle('!!! ... ???')).toBe('');
    expect(slugifyTitle('修复登录按钮')).toBe('');
    expect(slugifyTitle('Исправить кнопку входа')).toBe('');
  });

  it('keeps only the meaningful words, even when that leaves a single one', () => {
    expect(slugifyTitle('For the record')).toBe('record');
  });

  it('still produces a slug for a title made of nothing but stop words', () => {
    expect(slugifyTitle('de la des')).toBe('de_la_des');
    expect(slugifyTitle('The of and')).toBe('the_of_and');
  });

  it('caps the length so the filename can never approach the filesystem limit', () => {
    const long = slugifyTitle('Implement supercalifragilisticexpialidocious pseudopseudohypoparathyroidism handling');
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(long).not.toMatch(/_$/);

    const oneHugeWord = slugifyTitle('a'.repeat(300));
    expect(oneHugeWord.length).toBeGreaterThan(0);
    expect(oneHugeWord.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
  });

  it('honours an explicit word budget and refuses a nonsense one', () => {
    expect(slugifyTitle('Remove the dead code from the repo', 1)).toBe('remove');
    expect(slugifyTitle('Remove the dead code from the repo', 5)).toBe('remove_dead_code_repo');
    expect(slugifyTitle('Remove dead code', 0)).toBe('');
    expect(slugifyTitle('Remove dead code', Number.NaN)).toBe('');
  });

  it('produces only filename-safe characters, for any input', () => {
    const nasty = ['../../etc/passwd', 'a/b\\c', 'CON:', 'tab\tand\nnewline', '"quoted"', '$(whoami)'];
    for (const title of nasty) expect(slugifyTitle(title)).toMatch(/^[a-z0-9_]*$/);
  });
});

describe('buildTaskFilename', () => {
  it('composes id and slug', () => {
    expect(buildTaskFilename('t292', 'Fix the login button')).toBe('t292_fix_login_button.md');
  });

  it('falls back to the bare id when the title yields no slug', () => {
    expect(buildTaskFilename('t292', '🎉')).toBe('t292.md');
    expect(buildTaskFilename('t292', '')).toBe('t292.md');
    expect(buildTaskFilename('t292')).toBe('t292.md');
  });

  it('works with a configurable id format that contains a dash', () => {
    expect(buildTaskFilename('BUG-001', 'Fix the login button')).toBe('BUG-001_fix_login_button.md');
  });

  it('avoids a collision when the exact filename is already taken', () => {
    const taken = ['t292_fix_login_button.md'];
    expect(buildTaskFilename('t292', 'Fix the login button', null, taken)).toBe('t292_fix_login_button_2.md');
    expect(buildTaskFilename('t292', 'Fix the login button', null, [...taken, 't292_fix_login_button_2.md']))
      .toBe('t292_fix_login_button_3.md');
  });

  it('treats collisions case-insensitively, like macOS and Windows do', () => {
    expect(buildTaskFilename('t292', 'Fix login', null, ['T292_FIX_LOGIN.md'])).toBe('t292_fix_login_2.md');
  });

  it('accepts an explicit category segment from the frontmatter field', () => {
    expect(buildTaskFilename('t232', 'Fix the login button', 'UI')).toBe('t232_UI_fix_login_button.md');
    expect(buildTaskFilename('t232', 'Fix the login button', 'FABLE CLEANUP')).toBe('t232_FABLE_CLEANUP_fix_login_button.md');
    // 📖 A category that normalizes to nothing falls back to a legacy title bracket.
    expect(buildTaskFilename('t232', '[UI] Fix the login button', '')).toBe('t232_UI_fix_login_button.md');
  });

  it('still derives the category from a legacy leading bracket when none is passed', () => {
    expect(buildTaskFilename('t232', '[CLEANUP] Remove dead code')).toBe('t232_CLEANUP_remove_dead_code.md');
  });

  it('refuses an id that would escape the tasks directory', () => {
    expect(() => buildTaskFilename('../t292', 'x')).toThrow();
    expect(() => buildTaskFilename('a/b', 'x')).toThrow();
    expect(() => buildTaskFilename('..', 'x')).toThrow();
    expect(() => buildTaskFilename('  ', 'x')).toThrow();
  });
});

describe('isTaskFilename', () => {
  it('accepts task files in both forms', () => {
    expect(isTaskFilename('t232.md')).toBe(true);
    expect(isTaskFilename('t232_remove_dead_code.md')).toBe(true);
    expect(isTaskFilename('BUG-001_fix_login.md')).toBe(true);
  });

  it('rejects everything that is not a task file', () => {
    for (const name of ['README.txt', 'notes', 'archive', '.hidden.md', '.md', 'a/b.md', 'a\\b.md', '..md']) {
      expect(isTaskFilename(name), name).toBe(false);
    }
    expect(isTaskFilename(undefined as unknown as string)).toBe(false);
  });
});

describe('parseTaskFilename', () => {
  it('reads a bare id', () => {
    expect(parseTaskFilename('t232.md')).toEqual({
      base: 't232', idPrefix: null, slug: null, candidateIds: ['t232'], category: null,
    });
  });

  it('reads a slugged id and answers to both forms, most specific first', () => {
    expect(parseTaskFilename('t232_remove_dead_code.md')).toEqual({
      base: 't232_remove_dead_code',
      idPrefix: 't232',
      slug: 'remove_dead_code',
      candidateIds: ['t232_remove_dead_code', 't232'],
      category: null,
    });
  });

  it('does not treat a leading or trailing underscore as a slug boundary', () => {
    expect(parseTaskFilename('_t232.md')?.slug).toBeNull();
    expect(parseTaskFilename('t232_.md')?.slug).toBeNull();
    expect(parseTaskFilename('_t232.md')?.candidateIds).toEqual(['_t232']);
  });

  it('only splits on a prefix that looks like an allocated id, which protects existing projects', () => {
    // 📖 A hand-named file keeps its whole basename as its id, or a project
    // holding `bug_login.md` would see its id silently become `bug`.
    expect(parseTaskFilename('bug_login.md')).toEqual({
      base: 'bug_login', idPrefix: null, slug: null, candidateIds: ['bug_login'], category: null,
    });
    expect(taskIdFromFilename('bug_login.md')).toBe('bug_login');
    // 📖 Allocated ids always carry a number, and those do split.
    expect(taskIdFromFilename('t232_remove_dead_code.md')).toBe('t232');
    expect(taskIdFromFilename('BUG-001_ship_it.md')).toBe('BUG-001');
    expect(taskIdFromFilename('t271.md')).toBe('t271');
    expect(taskIdFromFilename('archive')).toBeNull();
  });

  it('returns null for a non-task file, so it can filter a directory scan', () => {
    expect(parseTaskFilename('README.md')).not.toBeNull(); // a lookalike is still parseable
    expect(parseTaskFilename('archive')).toBeNull();
    expect(parseTaskFilename('.DS_Store')).toBeNull();
  });
});

describe('resolveTaskFilename', () => {
  const mixed = ['t232.md', 't233_add_dark_mode.md', 't234_fix_login.md', 'BUG-001_ship_it.md'];

  it('resolves a legacy bare filename', () => {
    expect(resolveTaskFilename('t232', mixed)).toMatchObject({ filename: 't232.md', slug: null, exact: true });
  });

  it('resolves a slugged filename from the bare id', () => {
    expect(resolveTaskFilename('t233', mixed)).toMatchObject({
      filename: 't233_add_dark_mode.md', slug: 'add_dark_mode', exact: false, ambiguousWith: [],
    });
  });

  it('resolves a configurable id containing a dash', () => {
    expect(resolveTaskFilename('BUG-001', mixed)?.filename).toBe('BUG-001_ship_it.md');
  });

  it('returns null for an unknown id', () => {
    expect(resolveTaskFilename('t999', mixed)).toBeNull();
    expect(resolveTaskFilename('', mixed)).toBeNull();
    expect(resolveTaskFilename('t23', mixed)).toBeNull(); // a prefix of t232 is not t232
  });

  it('never lets a slug prefix hijack a legacy id that contains an underscore', () => {
    const files = ['t232_remove_dead_code.md', 'bug_login.md', 'bug_login_extra.md'];
    expect(resolveTaskFilename('bug_login', files)).toMatchObject({ filename: 'bug_login.md', exact: true });
    expect(resolveTaskFilename('bug_login_extra', files)?.filename).toBe('bug_login_extra.md');
    // 📖 `bug` was never an allocated id, so it resolves to nothing rather than to a guess.
    expect(resolveTaskFilename('bug', files)).toBeNull();
  });

  it('is deterministic and loud when two files claim the same id', () => {
    const files = ['t232_b_variant.md', 't232_a_variant.md'];
    const match = resolveTaskFilename('t232', files);
    expect(match?.filename).toBe('t232_a_variant.md');
    expect(match?.ambiguousWith).toEqual(['t232_b_variant.md']);
  });

  it('reports the slugged sibling of a bare file as ambiguous rather than ignoring it', () => {
    const match = resolveTaskFilename('t232', ['t232.md', 't232_remove_dead_code.md']);
    expect(match?.filename).toBe('t232.md');
    expect(match?.exact).toBe(true);
    expect(match?.ambiguousWith).toEqual(['t232_remove_dead_code.md']);
  });

  it('does not depend on directory order', () => {
    const files = ['t232_b.md', 't232_a.md', 't232_c.md'];
    const first = resolveTaskFilename('t232', files)?.filename;
    const second = resolveTaskFilename('t232', [...files].reverse())?.filename;
    expect(first).toBe(second);
  });

  it('falls back to a case-insensitive match for a hand-typed id', () => {
    expect(resolveTaskFilename('T232', mixed)?.filename).toBe('t232.md');
    expect(resolveTaskFilename('T233', mixed)?.filename).toBe('t233_add_dark_mode.md');
  });

  it('prefers the exact case when both cases exist on a case-sensitive filesystem', () => {
    expect(resolveTaskFilename('t232', ['T232.md', 't232.md'])?.filename).toBe('t232.md');
  });

  it('ignores directory noise in the listing', () => {
    expect(resolveTaskFilename('t232', ['archive', '.DS_Store', 't232.md'])?.filename).toBe('t232.md');
    expect(resolveTaskFilename('t232', [])).toBeNull();
  });

  it('round-trips a filename it built itself', () => {
    const name = buildTaskFilename('t292', 'Descriptive task filenames everywhere');
    expect(resolveTaskFilename('t292', [name])?.filename).toBe(name);
    expect(hasDescriptiveSlug(name)).toBe(true);
    expect(hasDescriptiveSlug(buildTaskFilename('t292', '🎉'))).toBe(false);
  });

  it('round-trips a category+slug filename through parse and resolve', () => {
    const name = buildTaskFilename('t297', '[UI] Fix the login button');
    expect(name).toBe('t297_UI_fix_login_button.md');
    const parsed = parseTaskFilename(name);
    expect(parsed).toEqual({
      base: 't297_UI_fix_login_button',
      idPrefix: 't297',
      slug: 'fix_login_button',
      category: 'UI',
      candidateIds: ['t297_UI_fix_login_button', 't297'],
    });
    expect(hasCategorySegment(name)).toBe(true);
    expect(hasCategorySegment('t297.md')).toBe(false);
    // 📖 The resolver still answers to the bare id, the category is decoration.
    expect(resolveTaskFilename('t297', [name])?.filename).toBe(name);
  });

  it('does not mistake a pure-digit prefix for a category', () => {
    // 📖 `12345` is all digits, no uppercase letter: not a category, just the
    // tail of a custom id. The whole basename after `t297_` reads as the slug.
    const parsed = parseTaskFilename('t297_12345_fix.md');
    expect(parsed?.category).toBeNull();
  });
});
