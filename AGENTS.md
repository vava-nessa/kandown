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

When the user says **"bump"**, follow this exact workflow.

**Auto-bump rule:** For critical bug fixes or broken functionality (e.g. CLI crash, install failure, broken build), the agent MAY bump a patch version and publish without asking. This applies only to patches that fix something clearly broken — never for features, refactors, or subjective improvements.

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

### 2. Update CHANGELOG.md

- Add a new `## <version> — <YYYY-MM-DD> — "<name>"` section at the top (below `# Changelog`).
- Summarize all commits since the last release as bullet points, grouped by type:
  - **Added**: new features
  - **Fixed**: bug fixes
  - **Changed**: improvements, refactors
  - **Removed**: deleted features or code
- Keep entries concise (one line each). Don't list every file touched — describe what changed for the user.

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
| `AGENT_KANDOWN_COMPACT.md` | CLI prompt injection artifact | ❌ NO (auto-gen'd) |
| `.kandown/AGENT.md` | quick reference inside installed app | ❌ NO (auto-copied) |
| `AGENTS.md` | this file — project-level agent rules | ✅ YES |
| `.kandown/tasks/*.md` | individual task files | ✅ YES (as you work) |