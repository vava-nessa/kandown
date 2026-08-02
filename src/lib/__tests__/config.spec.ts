/**
 * @file Shared Kandown config normalization tests
 * @description Locks canonical defaults, legacy instruction density migration,
 * malformed input handling, semantic column lookup, and optional agent config
 * preservation into one suite shared by browser and CLI adapters.
 *
 * @see src/lib/config.ts
 * @see src/lib/types.ts
 */

import { describe, expect, it } from 'vitest';
import {
  detailModeFromLegacyBaseRulesMode,
  normalizeKandownConfig,
  resolveColumnNameByRole,
  resolveColumnNamesByRole,
  resolveColumnRole,
} from '../config';
import { DEFAULT_CONFIG } from '../types';
import type { WorkOutputBaseRulesMode, WorkOutputDetailMode } from '../types';

describe('normalizeKandownConfig', () => {
  it('returns the complete canonical defaults for an empty config', () => {
    const config = normalizeKandownConfig({});

    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.workflow).toEqual({
      active: 'kandown-standard',
      skills: [],
      trackingCadence: 'balanced',
    });
    expect(config.agent.workOutput.detailMode).toBe('complete');
    expect(config.tui.columns.tags).toBe(false);
    expect(config.extensions.restricted).toBe(true);
  });

  it.each<[WorkOutputBaseRulesMode, WorkOutputDetailMode]>([
    ['caveman', 'caveman'],
    ['concise', 'standard'],
    ['optimized', 'standard'],
    ['full', 'complete'],
    ['verbose', 'complete'],
  ])('migrates legacy baseRulesMode %s to %s', (baseRulesMode, detailMode) => {
    const config = normalizeKandownConfig({
      agent: { workOutput: { baseRulesMode } },
    });

    expect(detailModeFromLegacyBaseRulesMode(baseRulesMode)).toBe(detailMode);
    expect(config.agent.workOutput.detailMode).toBe(detailMode);
    expect(config.agent.workOutput).not.toHaveProperty('baseRulesMode');
  });

  it('keeps an explicit detail mode when legacy settings also exist', () => {
    const config = normalizeKandownConfig({
      agent: {
        workOutput: {
          includeBaseRules: false,
          baseRulesMode: 'full',
          detailMode: 'caveman',
        },
      },
    });

    expect(config.agent.workOutput.detailMode).toBe('caveman');
    expect(config.agent.workOutput).not.toHaveProperty('includeBaseRules');
    expect(config.agent.workOutput).not.toHaveProperty('rawTemplate');
  });

  it('safely replaces malformed sections and nested values with defaults', () => {
    const config = normalizeKandownConfig({
      ui: null,
      agent: { workOutput: { boardDigest: false, sectionOrder: [null, 'boardDigest'] } },
      workflow: ['not', 'an', 'object'],
      board: { columns: [null, '', '  ', 12], columnMeta: null },
      tui: { columns: 'all' },
      fields: 7,
      notifications: null,
      extensions: false,
      agents: [],
    });

    expect(config.ui).toEqual(DEFAULT_CONFIG.ui);
    expect(config.workflow).toEqual(DEFAULT_CONFIG.workflow);
    expect(config.board.columns).toEqual(DEFAULT_CONFIG.board.columns);
    expect(config.board.columnMeta).toEqual(DEFAULT_CONFIG.board.columnMeta);
    expect(config.agent.workOutput).not.toHaveProperty('sectionOrder');
    expect(config.agent.workOutput.boardDigest).toEqual(DEFAULT_CONFIG.agent.workOutput.boardDigest);
    expect(config.tui).toEqual(DEFAULT_CONFIG.tui);
    expect(config.fields).toEqual(DEFAULT_CONFIG.fields);
    expect(config.notifications).toEqual(DEFAULT_CONFIG.notifications);
    expect(config.agents).toBeUndefined();
  });

  it('preserves valid optional agent selection and extra arguments', () => {
    const agents = {
      preferred: 'claude',
      extraArgs: {
        claude: ['--allowedTools', 'Edit,Write,Bash'],
        codex: ['--full-auto'],
      },
    };

    const config = normalizeKandownConfig({ agents });

    expect(config.agents).toEqual(agents);
    expect(config.agents).not.toBe(agents);
    expect(config.agents?.extraArgs).not.toBe(agents.extraArgs);
  });
});

describe('semantic column roles', () => {
  it('resolves canonical default column names by role', () => {
    const config = normalizeKandownConfig({});

    expect(resolveColumnNameByRole(config, 'backlog')).toBe('Backlog');
    expect(resolveColumnNameByRole(config, 'ready')).toBe('Todo');
    expect(resolveColumnNameByRole(config, 'active')).toBe('In Progress');
    expect(resolveColumnNameByRole(config, 'review')).toBe('Review');
    expect(resolveColumnNameByRole(config, 'terminal')).toBe('Done');
  });

  it('resolves renamed columns and supports repeated custom roles', () => {
    const config = normalizeKandownConfig({
      board: {
        columns: ['Ideas', 'Queued', 'Building', 'QA', 'Released', 'Archived'],
        columnMeta: {
          Ideas: { role: 'backlog' },
          Queued: { role: 'ready' },
          Building: { role: 'active', instructions: 'Keep this current.' },
          QA: { role: 'review' },
          Released: { role: 'terminal' },
          Archived: { role: 'terminal' },
        },
      },
    });

    expect(resolveColumnRole(config, 'building')).toBe('active');
    expect(resolveColumnNameByRole(config, 'review')).toBe('QA');
    expect(resolveColumnNamesByRole(config, 'terminal')).toEqual(['Released', 'Archived']);
    expect(config.board.columnMeta.Building.instructions).toBe('Keep this current.');
    expect(config.board.columnMeta.QA.instructions).toBeUndefined();
  });

  it('marks unrecognized columns without metadata as custom', () => {
    const config = normalizeKandownConfig({
      board: { columns: ['Inbox', 'Doing', 'Shipped'] },
    });

    expect(resolveColumnNamesByRole(config, 'custom')).toEqual(['Inbox', 'Doing', 'Shipped']);
    expect(resolveColumnNameByRole(config, 'terminal')).toBeUndefined();
  });
});
