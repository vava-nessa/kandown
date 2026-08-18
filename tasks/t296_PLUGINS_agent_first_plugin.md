---
id: t296
title: Agent-first plugin authoring loop: kandown plugin create/build/check/dev/publish
status: Done
category: plugins
priority: P1
tags: [plugins, extensions, cli, agents, dx]
ownerType: human
assignee: claude
created: 2026-08-17
updated: 2026-08-18T02:09:23Z
report: |
  ## Goal

  Make it possible for a user to open a project, start their coding agent, run
  one command, and end up with a plugin that is written, bundled, validated,
  enabled and live in the board. Inspired by Pi ("pi can create extensions, ask
  it to build one", single-file jiti extensions, `/reload`) and by the DeepSeek
  harness (documentation generated from the extension points, hot reload through
  disposable registrations).

  ## Changes

  - `scripts/build-extension-brief.js`: generates the plugin authoring contract
    from `src/lib/extensions/types.ts`. Signatures, event unions and field types
    are lifted out of the source, the prose lives in the script. It emits two
    artefacts from one render: `docs/EXTENSIONS-AGENT.md` and
    `src/lib/extensions/agent-brief.ts`, the second so the CLI can print the
    contract from the published bundle (which ships `dist/`, never `docs/`).
    `pnpm extension-brief:check` is wired into `pnpm verify`.
  - `src/cli/lib/plugin-scaffold.ts`: `--kind field|panel|gate|sync|command|full`
    templates. Every kind builds and passes `plugin check` with zero warnings out
    of the box, and declares exactly the permissions its own code needs.
  - `src/cli/lib/plugin-build.ts`: esbuild bundling of `index.ts` and `web*.tsx`
    into browser-executable ESM. React, `react-dom` and `kandown` stay external;
    a panel bundle that still imports React is a build error, because the Blob
    loader cannot resolve the bare specifier and the browser failure is opaque.
  - `src/cli/lib/plugin-check.ts`: eight checks against a synthetic in-memory
    board (manifest, entry, registered contributions, permissions declared versus
    called, bundle freshness, one panel render with a stub React runtime, a
    dispatch of every gate/sync/command, frontmatter round-trip of every write).
    Returns `{ ok, id, dir, checks: [{ id, status, message, fix }] }`.
  - `src/cli/lib/plugin-dev.ts`: watch, rebuild, revalidate, push a hot reload.
    Generated bundles are excluded from the watch set so the loop cannot feed
    itself.
  - `src/cli/lib/plugin-cli.ts`: the `kandown plugin` façade, including
    `--from "<goal>"` which hands the contract plus a working order to the coding
    agent already detected on the machine, and `publish` which re-verifies before
    printing the store entry.
  - `src/lib/extensions/host.ts`: `loadAll({ only, inspect })`. Inspection skips
    the trust, restricted-mode and quarantine gates so the validator can report on
    a plugin that is not enabled yet, without persisting anything.
  - `src/cli/lib/server.ts`: `POST /api/extensions/reload` drops the cached host
    and broadcasts the existing `extensions` SSE event.
  - `ExtensionRuntimeProvider` / `TaskExtensionSurface`: the runtime exposes a
    `revision` that panels key their module import on, so a hot reload re-imports
    the rebuilt bundle instead of keeping the mounted one.
  - Docs: `docs/EXTENSIONS-AGENT.md` (generated), rewritten quick start and
    testing sections in `docs/EXTENSIONS-AUTHORING.md`, updated authoring section
    in `docs/EXTENSIONS.md`, a "Writing a plugin" table in `README.md`, and the
    new generated files added to the never-edit table in `AGENTS.md`.
  - `esbuild` added as a runtime dependency and marked external in `tsup.config.ts`
    (it resolves a platform-specific native binary from its own install path, so
    bundling the wrapper breaks it).

  ## Decisions

  - kandown never calls a model. It supplies the contract, the loop and the
    verdict; the agent supplies the code. `--from` spawns the agent CLI the user
    already has, reusing the existing agent catalog and `buildAgentCommand`.
  - `kandown extension` stays as the administrative surface and `kandown plugin`
    is the authoring surface. The shared subcommands alias through to
    `cmdExtension` rather than being reimplemented, so trust, health and the
    community store keep one code path.
  - The validator runs the plugin against a fake board rather than a temp project
    on disk: no state file is written, no user task is touched, and the real
    discovery path is still exercised.
  - Warnings never fail a run, but the scaffolds are held to zero warnings: a
    template that ships a warning teaches every author who copies it to ignore
    warnings.
  - A registered field implies `write:field:plugins.<id>.*` even when the plugin
    never calls `setField` itself, because editing that field in the drawer goes
    through `host.setFieldValue`, which enforces the same permission.

  ## Verification

  - `pnpm verify` green: typecheck, 360 tests across 34 files, build, codemap
    check (217 files, 100% documented), changelog check, extension-brief check,
    diff check.
  - New suite `src/cli/lib/__tests__/plugin-authoring.spec.ts`, 27 tests: all six
    scaffold kinds build and check clean with zero warnings, plus negative cases
    for missing permissions, over-declared permissions, missing bundle, stale
    bundle, empty factory, throwing factory, missing panel export, throwing panel,
    React import in a panel bundle, syntax error, and proof that checking never
    writes a task file.
  - Manual end-to-end in a scratch project: scaffold each kind, build, check
    (green), break it on purpose (permissions removed, React imported, export
    removed) and confirm each failure names the right check and a usable fix,
    then `plugin dev` against a live daemon: enable, build, check, reload, edit a
    file, single rebuild and second reload, no loop.
  - `POST /api/extensions/reload` verified against a running daemon with the auth
    token, returns `{"ok":true}`.

  ## Review

  - Standards and spec review: reported complete by vava on 2026-08-18, no
    blocking findings relayed to this task.
  - Re-verified on acceptance, after the review window: `pnpm verify` green
    (typecheck, 360 tests / 34 files, build, codemap 217 files at 100%,
    changelog, extension brief, diff check), plus one end-to-end smoke run on the
    rebuilt CLI (`plugin create --kind full`, `build`, `check --json`) returning
    `ok: true` with zero failures and zero warnings.

  ## Follow-up, non-blocking

  - No release cut. `changelogs/unreleased.md` holds the notes under the name
    "Plugin Forge", ready for the next bump.
  - `plugin install` still only accepts a local directory; the GitHub URL fetch
    lives in the extension store path and was left untouched.
  - The permission scan in `plugin check` is a source scan, so a capability
    reached through an aliased reference is not detected. Runtime dispatch
    catches it instead, which is why both checks exist.

  ## Out of scope

  - No version bump or release: "bump" was not requested, so the notes live in
    `changelogs/unreleased.md`.
  - `plugin publish` prints the registry entry, it does not open the PR.
  - `plugin check` executes plugin code by design. Checking an untrusted
    third-party plugin runs it with the user's privileges, exactly like `enable`,
    and this is documented rather than sandboxed.
---

## Context

Vava asked for a loop where a user starts their agent in a project, runs one
command, and gets a working, tested, installed kandown plugin. Research on Pi and
the DeepSeek harness confirmed the shape: keep the plugin format trivial, make
the documentation generated, and give the author a machine-readable verdict.

## Acceptance criteria

- [x] `kandown plugin create` scaffolds a valid plugin and prints the full
      authoring contract on stdout.
- [x] The contract is generated from the extension types and checked in CI.
- [x] `kandown plugin build` produces browser-executable bundles.
- [x] `kandown plugin check --json` returns a structured verdict with a fix per
      failure and a non-zero exit code.
- [x] `kandown plugin dev` rebuilds, revalidates and hot reloads the board.
- [x] `kandown plugin create --from` delegates to the installed coding agent.
- [x] `kandown plugin publish` refuses to publish a failing plugin.
- [x] Tests cover every scaffold kind and every failure path.
- [x] Docs updated: README, EXTENSIONS, EXTENSIONS-AUTHORING, AGENTS.
