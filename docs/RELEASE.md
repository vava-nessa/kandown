# Release runbook

Everything needed to cut a kandown release. Triggered by the user saying **"bump"**.

If you only remember one thing: **the full changelog section goes in the commit
message body.** It is not optional, and it is the step most often skipped.

---

## The version system

`package.json` → `version` is the **single source of truth**. Everything else reads
from it.

```
package.json (version field)
  ├── scripts/inject-version.js  →  src/lib/version.ts   (web app, baked in at build)
  └── getCurrentVersion()        →  CLI + TUI            (read from disk at runtime)
```

- **`src/lib/version.ts`** is generated at build time. Do not edit it — it exports
  `KANDOWN_VERSION` and `KANDOWN_BUILD_TIME`, both overwritten on every build.
- **The CLI** reads `package.json` directly at runtime, so there is nothing to keep
  in sync there.
- **`src/cli/screens/settings.tsx`** receives `version` as a prop, passed down from
  the CLI entrypoint → `tui.tsx` → `App` → `Settings`.

Bumping `package.json` and running `pnpm build` is therefore enough to update the
CLI banner, the TUI header and the web Settings page at once.

---

## 0. Mandatory pre-bump manual test

**Before anything else**, launch kandown and use it:

```bash
node bin/kandown.js doctor
node bin/kandown.js work
node bin/kandown.js          # full launch: daemon + web UI + TUI
```

Confirm the daemon starts, the web UI loads and the TUI renders without runtime
errors. **If anything is broken, fix it and re-verify before continuing.** A
release that fails at launch is worse than a late release — it auto-updates onto
users' machines.

---

## 1. Choose the increment

Read the current version from `package.json`, then look at what landed since the
last tag:

```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")..HEAD --oneline
```

| Increment | When |
|---|---|
| **patch** (0.1.0 → 0.1.1) | bug fixes, typos, small improvements |
| **minor** (0.1.0 → 0.2.0) | new features, new commands, UI additions |
| **major** (0.1.0 → 1.0.0) | breaking changes, architecture rewrites |

If it is genuinely ambiguous, ask: "patch, minor, or major?"

## 1b. Choose the name

Every release carries a short **name** — one to three words capturing the main
change ("Pre-Alpha", "Content Search", "TUI Agents", "Motion Polish").

**Pick it yourself and move on. Do not ask for confirmation.** If the user
supplied a name, use it verbatim; otherwise name the release after its largest
change and keep going. This is an explicit instruction from the project owner —
stopping the release to validate a two-word label wastes a round trip on a
decision that has never needed one. The name appears in the changelog heading and
the tag annotation.

---

## 2. Write the changelog

**One file per release.** Create `changelogs/v<version>.md` — never edit
`CHANGELOG.md`, which is a generated index (see below).

```markdown
# <version> — <YYYY-MM-DD> — "<name>"

## Added

- …
```

The `# ` heading is parsed by `scripts/build-changelog.js`, so its shape matters:
`# <version> — <YYYY-MM-DD> — "<name>"`, em dashes, straight quotes around the
name. `pnpm changelog:check` fails on anything else, and so does CI.

**In English, always** — regardless of the language of the conversation. These
notes ship in the npm package, become the GitHub release body, and are read by
every user in every locale.

Group the entries by type:

- **Added** — new features, CLI/TUI commands, API endpoints, MCP tools
- **Fixed** — bug fixes, edge cases
- **Changed** — improvements, refactors, workflow adjustments
- **Removed** — deleted features, obsolete code

Describe each change with enough context to be understood by someone who did not
write it. Never list bare filenames, and never omit an item because it seems small.

If a `changelogs/unreleased.md` exists, it holds work already written up but not
yet shipped: rename it to `changelogs/v<version>.md`, replace its
`# Unreleased — "<name>"` heading with the released form, and fold anything new
into it rather than creating a second file for the same release.

### The index is generated

`CHANGELOG.md` at the repository root is **built from `changelogs/`** by
`scripts/build-changelog.js`. Do not hand-edit it — the pre-commit hook
regenerates and stages it on every commit, so a manual edit is erased on the next
one. Regenerate on demand with:

```bash
pnpm changelog          # rewrite the index
pnpm changelog:check    # verify it is current (what CI runs)
```

---

## 3. Build

```bash
pnpm build
```

If the build fails, fix it before continuing. CI runs the same steps on the tag
push, so a local failure is a guaranteed release failure.

---

## 4. Commit, tag, push

```bash
npm version <patch|minor|major> --no-git-tag-version
git add package.json changelogs/ CHANGELOG.md
git commit -m "$(cat <<'EOF'
release: v<NEW_VERSION> — <NAME>

<the full changelog file for this version, without the # heading>
EOF
)"
git tag -a v<NEW_VERSION> -m "v<NEW_VERSION> — <NAME>"
git push origin main
git push origin v<NEW_VERSION>
```

**The changelog must be in the commit body.** This is non-negotiable: it is what
makes `git log` self-documenting, and it is what someone reads when bisecting a
regression six months from now.

Pushing the `v*` tag triggers `.github/workflows/publish.yml`, which builds,
publishes to npm and creates a GitHub Release with the changelog attached.

---

## 5. Verify the publish

**Always check the workflow passed.** A silently failed publish means users are
told a version exists that they cannot install.

```bash
gh run list --limit 3
npm view kandown version
```

If it failed: fix the issue, push the fix, then delete and recreate the tag.

```bash
git tag -d v<X.Y.Z>
git push origin :refs/tags/v<X.Y.Z>
git tag -a v<X.Y.Z> -m "v<X.Y.Z> — <NAME>"
git push origin v<X.Y.Z>
```

---

## Prerequisites

- An `NPM_TOKEN` secret set in GitHub → Settings → Secrets → Actions
- Push access to `main`

---

## Worked example

```
User:  bump
Agent: 5 commits since v0.1.0 — new search feature + two fixes → minor, 0.2.0.
       Name suggestion: "Content Search". OK?
User:  yes
Agent: Tested launch ✓ · changelog written · built ✓ · committed, tagged v0.2.0, pushed.
       Workflow green, npm shows 0.2.0.
```
