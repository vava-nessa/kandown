/**
 * @file Runner registry: the one place that knows which backends exist
 * @description Assembles the runners for a project (t261) and answers the two
 * questions everything above asks: which backends can this machine use, and
 * what is running right now. Routes, the store and the UI import from here and
 * never from a concrete runner, so adding a third backend later is a change to
 * this file plus one implementation.
 *
 * 📖 Availability is the whole zero-config story. `runnerAvailability()` is
 * synchronous and never throws: on a machine without Herdr it answers one
 * entry, the default runner, and the UI has nothing extra to render. No
 * warning, no error, no disabled button; the feature simply is not there.
 *
 * 📖 One registry per project, cached. Runners are bound to a `.kandown`
 * directory (that is how `list()` resolves the project without paths flowing
 * through every call), and the daemon serves one project at a time, so the
 * cache is a single entry keyed by that directory.
 *
 * @functions
 *  → createRunnerRegistry : build the runners for one .kandown directory
 *  → getRunnerRegistry    : cached registry for the daemon's current project
 *  → resetRunnerRegistry  : drop the cache (tests, project switch)
 *
 * @exports RunnerRegistry, RunnerDescriptor, createRunnerRegistry, getRunnerRegistry, resetRunnerRegistry
 * @see src/cli/lib/runner/types.ts: the contract every runner implements
 */

import { createDefaultRunner } from './default-runner';
import { createHerdrRunner } from './herdr-runner';
import type { RunnerId, RunnerRun, TaskRunner } from './types';

/** 📖 One backend as the API describes it: identity plus availability,
 *  flattened so the client can render a row without unwrapping anything. */
export interface RunnerDescriptor {
  id: RunnerId;
  name: string;
  available: boolean;
  version?: string | null;
  endpoint?: string | null;
  reason?: string;
}

/** 📖 The registry surface. `runs()` fans out to every *available* runner and
 *  tolerates one of them failing: a wedged Herdr must not blank the board. */
export interface RunnerRegistry {
  kandownDir: string;
  all(): TaskRunner[];
  get(id: string): TaskRunner | undefined;
  describe(): RunnerDescriptor[];
  runs(): Promise<RunnerRun[]>;
}

export function createRunnerRegistry(kandownDir: string): RunnerRegistry {
  const runners: TaskRunner[] = [createDefaultRunner(kandownDir), createHerdrRunner(kandownDir)];
  return {
    kandownDir,
    all: () => [...runners],
    get: (id: string) => runners.find(runner => runner.id === id),
    describe: () => runners.map(runner => {
      const availability = runner.detect();
      return {
        id: runner.id,
        name: runner.name,
        available: availability.available,
        version: availability.version ?? null,
        endpoint: availability.endpoint ?? null,
        ...(availability.reason ? { reason: availability.reason } : {}),
      };
    }),
    runs: async () => {
      const settled = await Promise.allSettled(
        runners.filter(runner => runner.detect().available).map(runner => runner.list()),
      );
      return settled.flatMap(result => (result.status === 'fulfilled' ? result.value : []));
    },
  };
}

let cache: RunnerRegistry | null = null;

/** 📖 Registry for the daemon's current project, built on first use. */
export function getRunnerRegistry(kandownDir: string): RunnerRegistry {
  if (!cache || cache.kandownDir !== kandownDir) cache = createRunnerRegistry(kandownDir);
  return cache;
}

/** 📖 Test seam, and what a project switch would call. */
export function resetRunnerRegistry(): void {
  cache = null;
}

export type { RunnerId, RunnerRun, TaskRunner } from './types';
