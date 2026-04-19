# Agent Instructions

This app is a file-based **kandown** engine backed by plain markdown.
It installs on the user project with `npx kandown init`.
That installs the CLI Tool and the `.kandown` folder.
Task files in `.kandown/tasks/` are the source of truth; board columns live in `.kandown/kandown.json` under `board.columns`.

If the user mentions **tasks**, **kandown**, **backlog**, or any task-related work — read `AGENT_KANDOWN.md` first to understand how the Kandown task system works.
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

The `AGENT_KANDOWN_COMPACT.md` at the root is auto-generated from the full doc and used by the CLI board launcher. It is gitignored — do not edit it manually.

---

## Version Bump & Release (the "bump" command)

When the user says **"bump"**, follow this exact workflow:

### 1. Determine the version increment

- Read the current version from `package.json` → `version` field.
- Look at commits since the last version tag (`git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")..HEAD --oneline`).
- Decide the increment:
  - **patch** (0.1.0 → 0.1.1): bug fixes, typos, small improvements
  - **minor** (0.1.0 → 0.2.0): new features, new commands, UI additions
  - **major** (0.1.0 → 1.0.0): breaking changes, architecture rewrites
- If unsure, ask the user: "patch, minor, or major?"

### 2. Update CHANGELOG.md

- Add a new `## <version> — <YYYY-MM-DD>` section at the top (below `# Changelog`).
- Summarize all commits since the last release as bullet points, grouped by type:
  - **Added**: new features
  - **Fixed**: bug fixes
  - **Changed**: improvements, refactors
  - **Removed**: deleted features or code
- Keep entries concise (one line each). Don't list every file touched — describe what changed for the user.

### 3. Bump package.json version

```bash
npm version <patch|minor|major> --no-git-tag-version
```

### 4. Build & verify

```bash
pnpm build
```

If build fails, fix it before continuing.

### 5. Commit, tag, and push

```bash
git add package.json CHANGELOG.md
git commit -m "release: v<NEW_VERSION>"
git tag v<NEW_VERSION>
git push origin main
git push origin v<NEW_VERSION>
```

The `v*` tag push triggers `.github/workflows/publish.yml` which:
1. Builds the project
2. Publishes to npm (`npm publish --access public`)
3. Creates a GitHub Release with the changelog section attached

### Prerequisites

- The repo must have an `NPM_TOKEN` secret set in GitHub → Settings → Secrets → Actions.
- The user must have push access to `main`.

### Example

```
User: bump
Agent: Looking at 5 commits since v0.1.0... all bug fixes → patch bump to 0.1.1.
       Updated CHANGELOG.md, bumped package.json, built, committed, tagged v0.1.1, pushed.
```

---

## Architecture Summary

| File | Role | Editable? |
|------|------|-----------|
| `templates/AGENT_KANDOWN.md` | npm package source + dev source | ✅ YES |
| `AGENT_KANDOWN.md` (root) | synced copy of templates version | ❌ NO (auto-sync'd) |
| `AGENT_KANDOWN_COMPACT.md` | CLI prompt injection artifact | ❌ NO (auto-gen'd) |
| `.kandown/AGENT.md` | quick reference inside installed app | ❌ NO (auto-copied) |
| `AGENTS.md` | this file — project-level agent rules | ✅ YES |
| `.kandown/tasks/*.md` | individual task files | ✅ YES (as you work) |