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

## Architecture Summary

| File | Role | Editable? |
|------|------|-----------|
| `templates/AGENT_KANDOWN.md` | npm package source + dev source | ✅ YES |
| `AGENT_KANDOWN.md` (root) | synced copy of templates version | ❌ NO (auto-sync'd) |
| `AGENT_KANDOWN_COMPACT.md` | CLI prompt injection artifact | ❌ NO (auto-gen'd) |
| `.kandown/AGENT.md` | quick reference inside installed app | ❌ NO (auto-copied) |
| `AGENTS.md` | this file — project-level agent rules | ✅ YES |
| `.kandown/tasks/*.md` | individual task files | ✅ YES (as you work) |