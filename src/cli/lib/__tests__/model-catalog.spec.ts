/**
 * @file Model catalog tests: the deterministic half of the catalog (t324)
 * @description Locks the parts of listHarnessModels that must hold on every
 * machine: harnesses that do not speak ACP (and unknown ids) answer the
 * curated baseline with source "baseline", ids are normalized entries, and
 * the cache reset clears state. The live ACP discovery half is exercised
 * against the real binaries during release testing instead of here, because
 * it depends on what is installed; the discovery code path degrades to this
 * baseline on every failure mode by contract.
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/model-catalog.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listHarnessModels,
  modelsDevToHarness,
  resetModelCatalog,
  type ModelsDevCatalog,
} from '../agent/model-catalog';

/** 📖 Minimal models.dev fixture: two providers, mixed tool_call flags,
 *  unordered release dates (the API does not sort). */
const FIXTURE: ModelsDevCatalog = {
  anthropic: {
    models: {
      'claude-opus-5': { name: 'Claude Opus 5', release_date: '2026-07-24', tool_call: true },
      'claude-sonnet-4-6': { name: 'Claude Sonnet 4.6', release_date: '2026-02-17', tool_call: true },
      'claude-old': { name: 'Claude Old', release_date: '2024-01-01', tool_call: true },
    },
  },
  openai: {
    models: {
      'gpt-5.6': { name: 'GPT-5.6', release_date: '2026-07-09', tool_call: true },
      'gpt-4o-2024-05-13': { name: 'GPT-4o', release_date: '2024-05-13', tool_call: true },
      'chatgpt-image-latest': { name: 'Image', release_date: '2025-12-16', tool_call: false },
    },
  },
  google: {
    models: {
      'gemini-3.8-flash': { name: 'Gemini 3.8 Flash', release_date: '2026-08-01', tool_call: true },
      'lyria-3-clip-preview': { name: 'Lyria', release_date: '2026-03-25', tool_call: false },
      'gemma-4-26b': { name: 'Gemma 4', release_date: '2026-04-02', tool_call: true },
    },
  },
};

describe('models.dev mapping', () => {
  it('sorts newest release first and keeps display names', () => {
    const models = modelsDevToHarness(FIXTURE, { providers: ['anthropic'], prefix: false });
    expect(models.map(model => model.id)).toEqual(['claude-opus-5', 'claude-sonnet-4-6', 'claude-old']);
    expect(models[0].name).toBe('Claude Opus 5');
  });

  it('drops non-chat models and applies the family filter', () => {
    const models = modelsDevToHarness(FIXTURE, { providers: ['google'], prefix: false, filter: /gemini/ });
    expect(models.map(model => model.id)).toEqual(['gemini-3.8-flash']);
    const openai = modelsDevToHarness(FIXTURE, { providers: ['openai'], prefix: false, filter: /gpt-5|codex/ });
    expect(openai.map(model => model.id)).toEqual(['gpt-5.6']);
  });

  it('prefixes provider ids for harnesses that name models that way (pi)', () => {
    const models = modelsDevToHarness(FIXTURE, { providers: ['anthropic'], prefix: true });
    expect(models[0]).toMatchObject({ id: 'anthropic/claude-opus-5' });
    expect(models[0].name).toContain('(anthropic)');
  });

  it('ignores providers missing from the catalog', () => {
    const models = modelsDevToHarness(FIXTURE, { providers: ['no-such-provider', 'anthropic'], prefix: false });
    expect(models.length).toBe(3);
  });
});

describe('model catalog baselines', () => {
  beforeEach(() => {
    // 📖 Hermetic offline mode: the models.dev fetch must fail for these
    // tests, since what they lock is the degrade-to-baseline contract. A
    // machine with network would otherwise answer with the live catalog.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  });
  afterEach(() => {
    resetModelCatalog();
    vi.unstubAllGlobals();
  });

  it('answers the curated baseline for a non-ACP harness when offline', async () => {
    const list = await listHarnessModels('claude');
    expect(list.source).toBe('baseline');
    expect(list.models.map(model => model.id)).toEqual(['opus', 'sonnet', 'haiku']);
  });

  it('answers an empty list for an unknown harness id, never an error', async () => {
    const list = await listHarnessModels('no-such-harness');
    expect(list.source).toBe('baseline');
    expect(list.models).toEqual([]);
  });

  it('baseline entries carry id and name', async () => {
    const list = await listHarnessModels('claude');
    expect(list.models.length).toBeGreaterThan(0);
    for (const model of list.models) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBe(model.id);
    }
  });

  it('reset clears cached state without throwing', async () => {
    await listHarnessModels('codex');
    expect(() => resetModelCatalog()).not.toThrow();
  });
});
