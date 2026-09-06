---
id: t228
title: Add a CI quality gate (typecheck + test + build + codemap) on pull requests
status: Review
priority: P1
tags: [quality, ci, infra]
ownerType: agent
created: 2026-07-25
order: 1
updated: 2026-09-05T09:40:10Z
category: QUALITY
---

# Add a CI quality gate on pull requests

## Context

`.github/workflows/` currently holds only `publish.yml` (fires on a `v*` tag) and
`commit-log.yml` (posts commits to Discord). **Nothing verifies a change before it
lands on `main`**: a broken typecheck or build is only discovered at release time,
which is exactly when it is most expensive.

## Subtasks

- [x] Add `.github/workflows/ci.yml` running on `pull_request` and `push` to `main`
- [x] Steps: `pnpm install --frozen-lockfile` -> `pnpm typecheck` -> `pnpm test` -> `pnpm build`
- [x] Add `pnpm codemap:check` so a PR that changes source without regenerating
      `CODEMAP.md` fails loudly
- [x] Cache the pnpm store to keep the run under ~2 min
- [x] report: verified the whole gate against a clean `HEAD` worktree
- [x] Standards + spec review pass, blocking finding fixed (step order), re-verified
      on a fresh checkout: `report:` below

## Notes

Blocked by [[t227]] for the `pnpm test` step: ship the typecheck/build/codemap
steps first if tests are not ready, then add `pnpm test`.

Resolved: the Vitest suite exists and is green (46 files, 531 tests locally), so
`pnpm test` went into the gate in this pass. [[t227]] is still open as a
coverage task, but it no longer blocks anything here.

## Completion report

`.github/workflows/ci.yml` existed already with a partial gate (install,
codemap, changelog, typecheck, build). This pass finished it so a green CI run
means the same thing as a green `pnpm verify` on a laptop.

What changed:

- **`pnpm test` step added.** The suite is fast (about 7 s cold) and was the one
  piece the workflow was missing.
- **`pnpm extension-brief:check` added.** `docs/EXTENSIONS-AGENT.md` and
  `src/lib/extensions/agent-brief.ts` are generated from the extension types;
  without this step the plugin authoring contract could silently drift on main,
  exactly like a stale codemap.
- **pnpm pinned to 11, not 9.** `pnpm-lock.yaml` is written by pnpm 11 locally
  (lockfileVersion 9.0), and the job runs `--frozen-lockfile`, so the resolver in
  CI has to match the one that wrote the lockfile.
- **Concurrency group added.** A new push to a PR cancels its in-flight run;
  runs on `main` are never cancelled.
- **Build moved ahead of Test** (see the review below: this was a blocking bug).
- **`permissions: contents: read`** added: nothing in the job writes to the repo.

The pnpm store cache was already handled by `cache: pnpm` on
`actions/setup-node@v4`, which keys the store on `pnpm-lock.yaml`.

## Review pass

### Standards review

Three findings, all fixed in this pass.

1. **Blocking: the gate was red on a clean checkout.** The steps ran
   `pnpm test` before `pnpm build`. The CLI suite spawns the real bundle in a
   tmpdir, and `kandown init` copies `dist/index.html` into
   `.kandown/kandown.html` (`src/cli/lib/init.ts:74`). `dist/` is gitignored, so
   on a fresh clone that file does not exist yet and
   `cli-lifecycle.spec.ts:75` fails with `expected false to be true` on a
   repository that is perfectly healthy. Reproduced deterministically in a
   brand-new worktree at `HEAD` (1 failed / 723 passed), and green (724 passed)
   as soon as `pnpm build` runs first. **Fixed:** Build now precedes Test, with
   the reason written into the workflow header so nobody reorders it back for
   the sake of cheapest-signal-first.
2. **`pnpm verify` carried the same trap.** The local gate was
   `typecheck && test && build && ...`, so a contributor on a fresh clone hit
   the identical false failure. **Fixed:** `verify` is now
   `typecheck && build && test && ...`, which also keeps the local gate and CI
   in the same order.
3. **The workflow token was default-scoped.** `publish.yml` declares its
   permissions; this job did not. **Fixed:** `permissions: contents: read`.

### Spec review

All four subtasks are satisfied by `ci.yml` as it now stands: it triggers on
`pull_request` and `push` to `main`; it runs install / typecheck / test / build;
`pnpm codemap:check` fails a PR that changes source without regenerating the
codemap; and the pnpm store is cached through `cache: pnpm`. Finding 1 above was
a spec failure as much as a standards one: the step list matched the contract on
paper while the gate could not go green on the branch it was meant to protect.

### Verification

Run in a throwaway detached worktree at `HEAD` (a2730e1), which is the clean
checkout CI actually sees, with the fixed `ci.yml` and `package.json` copied in.
Steps executed in exactly the workflow's order:

| Step | Result | Time |
|---|---|---|
| `pnpm install --frozen-lockfile` | exit 0, lockfile in sync | 5 s |
| `pnpm codemap:check` | **exit 1**, see below | 1 s |
| `pnpm changelog:check` | exit 0, 120 releases | 0 s |
| `pnpm extension-brief:check` | exit 0 | 1 s |
| `pnpm typecheck` | exit 0 | 7 s |
| `pnpm build` | exit 0, vite + tsup success | 20 s |
| `pnpm test` | exit 0, 60 files, 724 tests passed | 7 s |

About 41 s of step time, so the run stays comfortably inside the ~2 min target
once the pnpm store cache is warm. `ci.yml` parses as valid YAML and the step
list resolves in the intended order.

The `codemap:check` failure is **not** produced by this task and not fixable from
here. `CODEMAP.md` at `HEAD` documents `src/cli/lib/runner/herdr-client.ts` and
`src/cli/lib/runner/types.ts`, which are still untracked in the working tree: the
pre-commit hook regenerated the map from the dirty tree and committed it ahead of
its own sources. Regenerating the map from the main checkout would only reproduce
the same drift on the next commit. It clears itself the moment the `runner/` work
is committed.

### Non-blocking follow-ups for vava

- **CI will be red on `main` until `src/cli/lib/runner/` is committed**, for the
  codemap reason above. Nothing to fix in the workflow; it is the gate working.
- `publish.yml` still pins pnpm 9 and installs with `--no-frozen-lockfile`, so
  the release build resolves dependencies with a different resolver than the one
  that gated the PR. Worth aligning in a separate task.
- `publish.yml` comments contain em-dashes (rule #7). Untouched here to keep this
  diff to the CI gate.
- CI does not run `pnpm verify:diff`. It is a working-tree whitespace lint that
  says nothing useful about a fresh checkout, so it was deliberately left out.

### Proposed move

Ready for **Done**. Both review axes pass and the blocking finding is fixed and
re-verified. Terminal move left to vava.
