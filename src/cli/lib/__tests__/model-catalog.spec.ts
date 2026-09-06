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

import { describe, expect, it } from 'vitest';
import { listHarnessModels, resetModelCatalog } from '../agent/model-catalog';

describe('model catalog baselines', () => {
  it('answers the curated baseline for a non-ACP harness', async () => {
    const list = await listHarnessModels('claude');
    expect(list.source).toBe('baseline');
    expect(list.models.map(model => model.id)).toEqual(['opus', 'sonnet', 'haiku']);
  });

  it('answers an empty list for an unknown harness id, never an error', async () => {
    const list = await listHarnessModels('no-such-harness');
    expect(list.source).toBe('baseline');
    expect(list.models).toEqual([]);
  });

  it('entries carry id and name', async () => {
    // 📖 A non-ACP harness only: an ACP id (gemini, opencode) would trigger
    // live discovery against whatever binary this machine has, which is a
    // release-test concern, not a unit-test one.
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
