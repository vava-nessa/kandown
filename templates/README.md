# .kandown/

File-based kanban for this project. Zero backend, plain markdown on disk.

## Usage

1. Open `kandown.html` in Chrome, Edge, Brave or Opera (File System Access API required)
2. Click **Select folder** and pick the project folder, then grant read/write permission
3. Start editing tasks

The app remembers the last 10 projects you've opened.

## Structure

```
.kandown/
├── tasks/
│   ├── t1.md      ← full task details and board status
│   └── ...
├── kandown.html      ← the engine (single file, no dependencies)
├── kandown.json      ← project preferences, columns, appearance, optional fields
├── AGENT.md          ← AI coding agent conventions
└── README.md         ← this file
```

## Settings

Open Settings from the app header to tune this project. Board columns are stored in `kandown.json` at `board.columns`. Each task chooses a column with its frontmatter `status`.

## Editing without the app

Everything is plain markdown. Edit files directly in your IDE, Obsidian, or vim. Click **Reload** in the app (or press `R`) to see changes.

## For AI agents

See `AGENT.md`. The key convention: each task file is its own source of truth. Moving a task means editing the task's frontmatter `status`.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘1` / `⌘2` | Board / list view |
| `N` | New task |
| `R` | Reload |
| `/` | Focus search |
| `Esc` | Close drawer / palette |
| `⌘S` | Save current task |
