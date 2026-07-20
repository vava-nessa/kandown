# Agent Instructions

This app is a file-based **kandown** engine backed by plain markdown.
It installs on the user project with `npx kandown init`.
That installs the CLI Tool and the `.kandown` folder.
Task files in `.kandown/tasks/` are the source of truth; board columns live in `.kandown/kandown.json` under `board.columns`.

If the user mentions **tasks**, **kandown**, **backlog**, or any task-related work — read `AGENT_KANDOWN.md` first to understand how the Kandown task system works. you should ALWAYS Keep kandown tasks up to date, move them to the corresponding columns, state, and add rreports in them to explain what you did, and move them to correct column.
Read the README.md file for more information.

---

## editing UI text in the web application

- Only edit in ENGLISH as the default.
- If the user requests to edit in another language, edit all corresponding language files in `src/lib/i18n/locales/`.
- The source of truth is English and must always be English. Translations need to be done based on English.
- When the user says "translate all" just compare the English version with a file in the locales folder and translate the missing keys. Then proceed to do the same with another language, until you have translated all languages.

---

## AGENT_KANDOWN.md Sync System (For Kandown Developers)

If you're working on **Kandown itself** (not just using it):

The **source of truth** for `AGENT_KANDOWN.md` is `templates/AGENT_KANDOWN.md` — this is what ships in the npm package and gets copied when users run `kandown init`.

For development, the project root `AGENT_KANDOWN.md` is kept in sync with `templates/AGENT_KANDOWN.md` via:

```bash
pnpm sync:agent   # manual sync
pnpm dev          # auto-syncs before starting
pnpm build        # auto-syncs before building
```

**Do NOT edit the root `AGENT_KANDOWN.md` directly.** Edit `templates/AGENT_KANDOWN.md` and run `pnpm sync:agent` to propagate changes to the project root.

---

## Version System

`package.json` → `version` field is the **single source of truth**. Everything else reads from it automatically.

```
package.json (version field)
  ├── scripts/inject-version.js  →  src/lib/version.ts  (web app, baked in at build time)
  └── bin/kandown.js getCurrentVersion()  →  CLI + TUI runtime
```

### How it works

- **`src/lib/version.ts`** — auto-generated at build time by `scripts/inject-version.js`. Do NOT edit manually. It exports `KANDOWN_VERSION` and `KANDOWN_BUILD_TIME`.
- **`bin/kandown.js`** — reads `package.json` directly at runtime via `getCurrentVersion()` (no file to maintain).
- **`src/cli/screens/settings.tsx`** — receives `version` as a prop passed down from `bin/kandown.js` → `tui.tsx` → `App` → `Settings`.

### When bumping

1. Run `npm version <patch|minor|major> --no-git-tag-version` — updates `package.json`.
2. `pnpm build` runs `scripts/inject-version.js` first, which re-generates `src/lib/version.ts` with the new version.
3. All consumers (CLI banner, TUI header, web app Settings) get the new version automatically.

---

## Version Bump & Release (the "bump" command)

### 0. Mandatory Pre-Bump Manual Test

Before performing any release bump:
- **Manually launch and test Kandown**: Run `node bin/kandown.js doctor`, `node bin/kandown.js work`, or test the CLI / web app locally to verify that the daemon, web UI, and CLI start properly without runtime errors or crashes.
- If any runtime issues or bugs are discovered, **fix them immediately** and verify the fix before continuing to step 1.

### 1. Determine the version increment

- Read the current version from `package.json` → `version` field.
- Look at commits since the last version tag (`git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")..HEAD --oneline`).
- Decide the increment:
  - **patch** (0.1.0 → 0.1.1): bug fixes, typos, small improvements
  - **minor** (0.1.0 → 0.2.0): new features, new commands, UI additions
  - **major** (0.1.0 → 1.0.0): breaking changes, architecture rewrites
- If unsure, ask the user: "patch, minor, or major?"

### 1b. Version name

Every release has a short **name** — a 1–3 word label capturing the main change (e.g. "Pre-Alpha", "Content Search", "TUI Agents").

- If the user provides a name, use it as-is.
- If the user forgot, **suggest one** based on the biggest change in the release and ask for confirmation.
- The name goes in the changelog heading and the git tag annotation.

### 2. Update CHANGELOG.md (Mandatory Detailed English Changelog)

- **Language Requirement**: The changelog MUST be written in clear, comprehensive **English** for every release.
- Add a new `## <version> — <YYYY-MM-DD> — "<name>"` section at the top of `CHANGELOG.md` (below `# Changelog`).
- Thoroughly document and explain every feature, fix, and behavior change as bullet points, grouped by type:
  - **Added**: new features, new CLI/TUI commands, API endpoints, MCP tools
  - **Fixed**: bug fixes, edge case resolutions
  - **Changed**: improvements, UI refactors, workflow adjustments
  - **Removed**: deleted features or obsolete code
- Ensure every change is clearly described with full context and explanations (never omit items or just list raw filenames).
- **CLI Update Display**: The CLI parses `CHANGELOG.md` during auto-updates, `kandown update`, and version notice popups to display the full release changelog directly in the terminal so users see what changed.

### 3. Build & verify

```bash
pnpm build
```

If build fails, fix it before continuing.

### 5. Commit, tag, and push

```bash
git add package.json CHANGELOG.md
# IMPORTANT: The commit message MUST include the full changelog section for this version in the body.
git commit -m "$(cat <<'EOF'
release: v<NEW_VERSION> — <NAME>

<paste the full changelog section for this version here, without the ## heading>
EOF
)"
git tag -a v<NEW_VERSION> -m "v<NEW_VERSION> — <NAME>"
git push origin main
git push origin v<NEW_VERSION>
```

**The changelog MUST be attached to the commit message body.** This is non-negotiable — every release commit must carry its full changelog so `git log` is self-documenting.

The `v*` tag push triggers `.github/workflows/publish.yml` which:
1. Builds the project
2. Publishes to npm (`npm publish --access public`)
3. Creates a GitHub Release with the changelog section attached

### 6. Verify the publish action

**Always check that the GitHub Actions workflow passes** after pushing the tag:

```bash
gh run list --limit 3  # check latest run status
npm view kandown version  # verify it shows the new version
```

If it fails, fix the issue, push a new commit, delete the old tag (`git tag -d v<X.Y.Z> && git push origin :refs/tags/v<X.Y.Z>`), re-tag, and re-push.

### Prerequisites

- The repo must have an `NPM_TOKEN` secret set in GitHub → Settings → Secrets → Actions.
- The user must have push access to `main`.

### Example

```
User: bump
Agent: 5 commits since v0.1.0 — new search feature + fixes → minor bump to 0.2.0.
       Name suggestion: "Content Search" — OK?
User: yes
Agent: Updated CHANGELOG.md, bumped package.json, built, committed, tagged v0.2.0, pushed.
```

---

## Architecture Summary

| File | Role | Editable? |
|------|------|-----------|
| `templates/AGENT_KANDOWN.md` | npm package source + dev source | ✅ YES |
| `AGENT_KANDOWN.md` (root) | synced copy of templates version | ❌ NO (auto-sync'd) |

| `.kandown/AGENT.md` | quick reference inside installed app | ❌ NO (auto-copied) |
| `AGENTS.md` | this file — project-level agent rules | ✅ YES |
| `.kandown/tasks/*.md` | individual task files | ✅ YES (as you work) |