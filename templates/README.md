# .kandown/

File-based kanban for this project. Zero install, zero backend, plain markdown on disk.

## Usage

1. Open `kandown.html` in Chrome, Edge, Brave or Opera (File System Access API required)
2. Click **Select folder** and pick this `.kandown/` directory, then grant read/write permission
3. That's it

The app remembers the last 10 projects you've opened — no need to re-select the folder each time.

## Structure

```
.kandown/
├── board.md          ← source of truth for state and index
├── tasks/
│   ├── t-001.md      ← full task details
│   └── ...
├── kandown.html       ← the engine (single file, no dependencies)
├── kandown.json      ← project preferences, appearance, and optional fields
├── AGENT.md          ← AI coding agent conventions
└── README.md         ← this file
```

## Settings

Open Settings from the app header to tune this project. Appearance settings are stored in `kandown.json`: theme mode (`auto`, `light`, `dark`), color skin, and font preset are all project-specific.

## Editing without the app

Everything is plain markdown. Edit files directly in your IDE, Obsidian, or vim. Click **Reload** in the app (or press `R`) to see changes.

## For AI agents

See `AGENT.md`. The key convention: agents read `board.md` only for the index, and only fetch `tasks/t-xxx.md` on demand. Keeps AI context clean when there are hundreds of tasks.

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
