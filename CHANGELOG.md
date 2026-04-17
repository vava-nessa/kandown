# Changelog

## Unreleased

- Added drawer footer shortcut hints and a `⌘⌫` / `Ctrl+Backspace` shortcut for deleting the current task after confirmation.
- Added a guarded hover trash action on board cards: first click arms deletion, second click confirms it.
- Added Tabler icons to board column headers so statuses are easier to scan at a glance.
- Added project-level appearance skins with shadcn-compatible CSS tokens, auto/light/dark mode, and local font presets in Settings.
- Increased web UI typography slightly across board cards, filters, menus, modals, settings, and editor surfaces so the app reads better without changing the layout structure.
- **Content search**: Search now looks inside task content (subtasks, description, tags, assignee, priority). When a match is found, a highlighted preview snippet is shown below the card title. Same engine powers both the FilterBar search and CommandPalette (⌘K).
