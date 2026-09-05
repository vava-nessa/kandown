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

- **`pnpm test` step added.** The suite is fast (about 4 s cold) and was the one
  piece the workflow was missing.
- **`pnpm extension-brief:check` added.** `docs/EXTENSIONS-AGENT.md` and
  `src/lib/extensions/agent-brief.ts` are generated from the extension types;
  without this step the plugin authoring contract could silently drift on main,
  exactly like a stale codemap.
- **pnpm pinned to 11, not 9.** `pnpm-lock.yaml` is written by pnpm 11 locally,
  and the job runs `--frozen-lockfile`, so the resolver in CI has to match the
  one that wrote the lockfile.
- **Concurrency group added.** A new push to a PR cancels its in-flight run;
  runs on `main` are never cancelled.
- **Step order documented** as cheapest-signal-first: generated-file checks,
  then typecheck, then tests, then the full build.

The pnpm store cache was already handled by `cache: pnpm` on
`actions/setup-node@v4`, which keys the store on `pnpm-lock.yaml`.

### Verification

The working tree is dirty with someone else's in-progress work, and it does not
typecheck (`src/components/Card.tsx`, `src/components/agent/Blobatar.tsx`), so
the gate was run against a clean detached worktree at `HEAD` (3ce67d7) instead,
which is what CI actually sees:

| Step | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ok, lockfile in sync |
| `pnpm codemap:check` | codemap up to date, 266 files, 100% documented |
| `pnpm changelog:check` | up to date, 117 releases |
| `pnpm extension-brief:check` | up to date |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 44 files, 506 tests passed, 3.8 s |
| `pnpm build` | vite + tsup build success |

`ci.yml` also parses as valid YAML and the step list resolves in the intended
order. Wall clock for the four heavy steps is well under a minute locally, so
the ~2 min target holds once install and the pnpm store cache are added.

### Non-blocking follow-ups

- `publish.yml` still pins pnpm 9 and installs with `--no-frozen-lockfile`.
  It works, but the release build resolves dependencies with a different
  resolver than the one that gated the PR. Worth aligning in a separate task.
- The two typecheck errors in the uncommitted working tree belong to whoever is
  mid-feature on the Blobatar card work. They are not touched here, but they
  will turn CI red the moment that work is pushed.

### Proposed move

Ready for **Done** once reviewed. Terminal move left to vava.
