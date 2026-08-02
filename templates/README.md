# Kandown

File-based kanban for this project. Zero install, zero backend, plain markdown on disk.

## Layout

```
.kandown/             # config, web UI, workflows, skills
├── kandown.html      # single-file web app — open this in your browser
├── kandown.json      # project preferences, columns, appearance
├── kandown_work.md   # optional project agent instructions
├── workflows/        # optional local workflow packages
├── skills/           # optional local Markdown skill packages
└── README.md         # this file

tasks/                # source of truth — one .md file per task
├── t1.md
├── t2.md
└── archive/          # archived tasks live here
```

## Usage

1. Open `.kandown/kandown.html` in Chrome, Edge, Brave or Opera (File System Access API required)
2. Click **Select folder** and pick the **project root** (the parent of `.kandown/`), then grant read/write permission
3. That's it

The app remembers the last 10 projects you've opened — no need to re-select the folder each time.

## Settings

Open Settings from the app header to tune this project. Board columns are stored in `.kandown/kandown.json` at `board.columns`. Each task chooses a column with its frontmatter `status`.

## Editing without the app

Everything is plain markdown. Edit files directly in your IDE, Obsidian, or vim. Click **Reload** in the app (or press `R`) to see changes.

The task editor includes a markdown-backed subtask checklist. Add steps with **Add subtask**, press **Enter** to insert another step, and expand a step to edit its description or report. Changes are saved back to the task file automatically.

## For AI agents

Run `kandown work` for the current agent protocol and live board context. Each task file in `tasks/` is its own source of truth. Moving a task means editing its frontmatter `status`.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘1` / `Ctrl+1` | Board view |
| `⌘2` / `Ctrl+2` | List view |
| `N` | New task |
| `R` | Reload |
| `/` | Focus search |
| `Esc` | Close drawer / palette |
| `⌘S` | Save current task |
| `⌘⌫` | Delete task (with confirmation) |
