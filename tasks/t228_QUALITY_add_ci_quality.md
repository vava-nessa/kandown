---
id: t228
title: [QUALITY] Add a CI quality gate (typecheck + test + build + codemap) on pull requests
status: Backlog
priority: P1
tags: [quality, ci, infra]
ownerType: agent
created: 2026-07-25
order: 1
updated: 2026-07-27T00:47:46Z
---

# Add a CI quality gate on pull requests

## Context

`.github/workflows/` currently holds only `publish.yml` (fires on a `v*` tag) and
`commit-log.yml` (posts commits to Discord). **Nothing verifies a change before it
lands on `main`** — a broken typecheck or build is only discovered at release time,
which is exactly when it is most expensive.

## Subtasks

- [ ] Add `.github/workflows/ci.yml` running on `pull_request` and `push` to `main`
- [ ] Steps: `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` → `pnpm build`
- [ ] Add `node scripts/build-codemap.js --check` so a PR that changes source
- [ ] Cache the pnpm store to keep the run under ~2 min

      without regenerating `CODEMAP.md` fails loudly

## Notes

Blocked by [[t227]] for the `pnpm test` step — ship the typecheck/build/codemap
steps first if tests are not ready, then add `pnpm test`.
