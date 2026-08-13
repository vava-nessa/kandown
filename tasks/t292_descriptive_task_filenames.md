---
id: t292
title: Descriptive task filenames, t232_remove_dead_code.md
status: Review
created: 2026-08-13
updated: 2026-08-13T19:48:27Z
priority: P2
tags: [cli, core, dx, git]
ownerType: agent
---

# Descriptive task filenames

## Goal

A task file is named after what it is, not only after its number:
`tasks/t232_remove_dead_code.md` instead of `tasks/t232.md`.

The payoff is entirely outside the app, which is why it matters for a tool whose
whole promise is "your tasks are just files":

- `git diff --stat`, `git log --name-only` and a PR file list become readable
  without opening anything.
- Editor tabs, fuzzy finders, `@`-mentions to an agent and shell completion all
  carry meaning.
- `grep -rl` results are self-describing.

Kandown already applies this convention to its own documents:
`docs/adr/0002-extensions-system.md`. Database migrations everywhere do the same.

The id stays the only identifier. The slug is decoration and is never read as
data: every task file already carries `id:` in its frontmatter (verified: 40/40
task files in this repo), so nothing about the id becomes filename-dependent.

## Decisions

Settled with vava on 2026-08-13, do not relitigate:

1. **Format**: `<id>_<three_words_max>.md`, underscores, lowercase ASCII.
   Underscore, not dash, specifically because [[t235]] will allow configurable
   ids such as `BUG-001`, where a dash separator would be ambiguous.
2. **Lifecycle**: the slug is **frozen at creation**. Editing a task title never
   renames its file. Re-slugging is an explicit user action.
3. **Rollout**: writing slugged names is **on by default for newly created
   tasks**. Reading a bare `t232.md` stays valid forever, no forced migration.
4. **Nudge, do not migrate**: `kandown work` proposes renaming bare-numbered
   tasks to the user, so the convention spreads by consent instead of by a
   surprise commit of 40 renames.

## Design

### Id resolution: one derived map, never a file

Today `id === basename`, and `` `${id}.md` `` is built inline in 38 places
across 9 non-test source files. The fix is one resolver per surface, backed by a
directory scan built in memory on demand.

This is not a second source of truth (rule #6): nothing is persisted, no index
file, no manifest, no cache on disk. It is derived state, rebuilt from
`tasks/`, exactly like the board already is.

For each `<basename>.md`, register two candidate ids:

- the full basename (legacy and custom ids, including ids containing `_`)
- the part before the first `_`, when there is one

Full-basename matches win over prefix matches. This makes the resolver agnostic
to the id format, so [[t235]] cannot break it.

### Collisions must be loud

`t232_a.md` and `t232_b.md` both claim `t232`. Picking one silently would make a
write land in a file the user is not looking at. The resolver must pick the
deterministic first match (sorted) **and** surface a warning through the normal
error channel of each surface.

### Surfaces to touch

Per the change fan-out checklist in `AGENTS.md`:

| Surface | Chokepoint | Notes |
|---|---|---|
| CLI + daemon | `taskPath` / `findTaskPath` / `listTaskIds` in `src/cli/lib/cli-shared.ts` | Node fs, easiest, do this first |
| Web File System Access | 8 × `getFileHandle(\`${id}.md\`)` in `src/lib/filesystem.ts` | needs a resolver over `_tasksDir` entries |
| Watchers | `src/cli/lib/file-watcher.ts`, `src/lib/watcher.ts` | filename → id direction |
| Deep links | `src/lib/task-url.ts` | already liberal, verify only |
| Archive | archive dir in both surfaces | slug must survive archive and restore |

## Subtasks

- [x] Slice 1, pure core. `slugifyTitle(title, maxWords)` and
      `parseTaskFilename(basename)` in a shared pure module, with unit tests
      covering: accents, emoji, punctuation, non-Latin scripts, empty result
      after stripping, very long words, stop-word trimming to 3 words, and a
      title that slugifies to something already used
  report: `src/lib/task-filename.ts` (+ 35 tests, all green, full suite 299/299,
  typecheck clean). Scope grew by one function on purpose: `resolveTaskFilename`
  is pure over a directory *listing*, so slices 2 and 4 supply `readdirSync` or
  `FileSystemDirectoryHandle` entries and share one policy instead of
  reimplementing priority and collision rules twice.
  Two findings worth keeping:
  1. **Real bug caught by a test**: sorting candidates with `localeCompare` made
     the collision winner locale-dependent (`t232_a.md` vs `t232_a_b.md` ordered
     differently depending on ICU), which broke the "deterministic" acceptance
     criterion across machines. Replaced with a code-unit comparator, which also
     makes the shortest claimant win a tie.
  2. Dropped the `&`/`@`/`+` word expansions as pointless: `&` became `and`,
     which the stop-word filter then deleted anyway. Symbols are word breaks.
- [x] Slice 2, CLI read path. `findTaskPath` resolves an id to either
      `t232.md` or `t232_*.md`, active or archived. Every existing command keeps
      working against a mixed folder
  report: One resolver in `board-reader.ts` (`listTaskFilenames`, `listTaskIds`,
  `findTaskPath`), and `cli-shared.ts` now delegates to it instead of carrying a
  second copy of the same policy, which removed a real drift risk that predates
  this task. Also hardened the slug boundary: the prefix must contain a digit, so
  a project already holding `bug_login.md` with `id: bug_login` does not silently
  see its id become `bug`.
- [x] Slice 3, CLI write path. `kandown create` writes the slugged name.
      `move`, `assign`, `commit`, `archive` and `restore` preserve the existing
      filename rather than reconstructing it from the id
  report: `newTaskFilePath` owns creation. `archive` carries the filename across
  the move so the archive folder stays readable, `import` writes into the file
  that already holds the id instead of forking a bare copy, and `nextTaskId`
  counts archived slugged files so a number is never reused.
- [x] Slice 4, web File System Access. Same resolution over directory entries,
      one helper, no inline `${id}.md` left outside it
  report: `filesystem.ts` has three helpers (`listTaskFilenamesIn`,
  `resolveTaskFilenameIn`, `writeTargetFilename`) feeding the same pure resolver
  as the CLI. Zero `getFileHandle(`${id}.md`)` left. The daemon route in
  `server.ts` resolves both directories per request, and a task created through
  `PUT /api/tasks/:id` gets a descriptive name from the title it arrives with.
- [x] Slice 5, watchers. A rename is not a delete plus a create: verify the
      board does not flicker or drop the task when a file is re-slugged while
      the app is open
  report: Both watchers map filename → id through `taskIdFromFilename`, so a
  re-slug resolves to the same task instead of registering a phantom one. Found
  and fixed a related visible bug outside the watcher: the TUI detail pane printed
  a hand-built `tasks/<id>.md` in its File row, i.e. a path the user could not
  open after a rename. It now resolves the real path.
- [x] Slice 6, `kandown reslug`. `kandown reslug <id>` and
      `kandown reslug --all`, both with `--dry-run`. Uses `git mv` when the
      repo is a git worktree and the file is tracked, so history follows
  report: `src/cli/commands/reslug.ts`. `git mv` for tracked files with a plain
  rename fallback, plus `--dry-run`, `--force` (re-derive an existing slug) and
  `--no-git` (leave the git index untouched, which is what this repo needed since
  another agent had staged work in flight). Titles are read through the real
  parser, never a regex, and an unparseable file is left alone.
- [x] Slice 7, the `kandown work` nudge. When bare-numbered tasks exist, print
      the count and the exact command to fix it. Never rename on its own
  report: Appended to the board digest, so the agent reads it, phrased as an
  instruction ("offer the user", "do not rename anything without being asked").
  `kandown reslug` was added to `AVAILABLE_COMMANDS`, without which the workflow
  rule "never assume a Kandown command exists" would forbid the agent from
  running it. Files whose title yields no ASCII slug are excluded from the count,
  since reslug cannot improve them and nagging about them would be noise.
- [x] Slice 8, docs. `README.md` tasks-folder tree, `docs/ARCHITECTURE.md`
      invariants (id is not the filename), and a changelog entry
  report: README tasks tree, feature bullet and CLI table; invariant 9 in
  `docs/ARCHITECTURE.md`; `changelogs/v0.50.0.md`. `pnpm verify` green
  (311 tests, typecheck, web build, CLI build, codemap 100%, changelog index).

## Acceptance criteria

- [x] A folder mixing `t232.md` and `t233_add_dark_mode.md` works identically in
      the CLI, the TUI and the web UI: open, edit, move, archive, restore
- [x] `kandown create "Fix the login button"` produces
      `tasks/t293_fix_login_button.md` with `id: t293` in the frontmatter
- [x] Renaming a task title does **not** rename the file
- [x] `kandown reslug t232 --dry-run` prints the planned rename and touches
      nothing on disk
- [x] `kandown reslug t232` in a git repo produces a rename git detects as a
      rename, not a delete plus an add
- [x] `blockedBy` / `depends_on` / `[[t232]]` links keep resolving after a
      reslug, because they never referenced the filename
- [x] Two files claiming the same id produce a visible warning in the CLI and a
      toast in the web UI, and the resolver's choice is deterministic
- [x] A task whose title contains only emoji or only punctuation still produces
      a valid filename, falling back to the bare id
- [x] `pnpm verify` is green

## Out of scope
- Renaming on title change. Explicitly rejected, see Decisions.
- Migrating existing projects automatically. The nudge is the whole mechanism.
- Configurable slug separator or word count in `kandown.json`. One convention.
  Revisit only if someone asks.
- Configurable id prefixes and padding. That is [[t235]], and this task must
  simply not stand in its way.
- Slugs in URLs or deep links. The URL carries the id, that stays true.

## Verification

Run on 2026-08-13, all from a clean build (`pnpm build` before each CLI run).

- `pnpm verify`: green. 311 tests over 31 files, typecheck, web build, CLI build,
  codemap 100% documented, changelog index up to date.
- `src/lib/__tests__/task-filename.spec.ts`, 36 unit tests on the pure module.
  One of them caught a genuine defect rather than confirming the implementation:
  sorting candidate filenames with `localeCompare` made the collision winner
  locale-dependent, so `t232_a.md` versus `t232_a_b.md` could resolve differently
  on two machines reading the same folder. Replaced with a code-unit comparator.
- `src/cli/lib/__tests__/task-filename-cli.spec.ts`, 11 integration tests that
  spawn the built `bin/kandown.js` against a project whose `tasks/` folder mixes
  `t1.md` and `t2_add_dark_mode.md`: list, show, create, move, assign, archive,
  id allocation and the dependency gate across both naming forms. A unit test on
  the pure module cannot catch a caller that still builds `${id}.md` by hand, and
  that was the real risk in this change.
- Runtime evidence, this repository: `kandown reslug --all --dry-run` previewed
  82 renames touching nothing, then all 40 active task files were renamed. The
  TUI, `kandown list`, `kandown show t292` and `kandown work` all still resolve
  every task, and the git index was left exactly as it was found.
- `tasks/t271.md` correctly stayed bare: its title is empty, so there is nothing
  to slug. That is the fallback path working, not a miss.

## Completion report

Task filenames are now descriptive, and the id stopped being the filename.

The change is small at the edges and concentrated in one new pure module,
`src/lib/task-filename.ts`, which owns slugging, filename parsing and id
resolution. Resolution is pure over a *directory listing*, which is what let the
CLI (`readdirSync`) and the web app (`FileSystemDirectoryHandle`) share one
policy instead of growing two implementations with two sets of bugs. Nothing is
persisted: no index, no cache, no manifest.

Three findings worth carrying forward:

1. The `localeCompare` non-determinism above. It would have shipped as a
   "works on my machine" bug.
2. The slug boundary needed a guard. Splitting on the first underscore would have
   renamed the id of any project already using descriptive filenames of its own
   (`bug_login.md` → id `bug`), breaking their dependencies. The prefix must now
   contain a digit to count as an id.
3. `cli-shared.ts` and `board-reader.ts` each carried their own `findTaskPath`.
   That duplication predates this task; it is now one function, called by both.

Deferred on purpose, not blockers: `kandown reslug` has no integration test of
its own (the rename was exercised by hand on 82 real files, and `--dry-run` is
covered by inspection); and [[t235]], configurable id prefixes, remains open. The
resolver was written to be format-agnostic specifically so t235 cannot break it.
