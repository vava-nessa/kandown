# Changelog

## 0.1.0 — 2026-04-19

- Refactored Kandown to derive boards from `tasks/*.md` task frontmatter instead of a separate board index, with custom columns stored in `kandown.json`, unknown-status columns surfaced in the UI, and multiline task reports preserved on save.
- Added configurable web notifications for task status changes, debounced task-file edits, completed subtasks, and in-page notification sounds, with matching web and TUI settings.
- Added a zero-dependency local HTTP server for the bare `kandown` command, including `window.__KANDOWN_ROOT__` injection, `/api/*` 501 stubs with CORS, automatic port fallback from 2048 to 2060, and `--port` support.
- **Fixed**: Subtask progress tracker in board view now correctly updates when saving (was always showing 0/X due to `saveDrawer` not updating columns or board.md).
- **Fixed**: Debounce race on drawer close — closing the drawer now flushes any pending autosave before closing, and saves are guarded against concurrent execution.
- **Improved**: Reduced autosave debounce from 600ms to 150ms for snappier responsiveness.
- Added 11 new languages: Thai (th), Malay (ms), Tamil (ta), Telugu (te), Marathi (mr), Gujarati (gu), Kannada (kn), Malayalam (ml), Sinhala (si), Burmese (my), Khmer (km).
- Optional task metadata fields now hide across drawer, cards, list view, and filters when disabled; Priority and Owner defaults moved under Fields settings.
- Added more column background colors, including black and semi-transparent black options.
- Updated board task cards to use 50% white in light mode and 50% black in dark mode so cards blend into colored columns.
- Redesigned Settings with compact option rows, 300ms debounced search, and a contextual help panel for hovered options.
- Added drawer footer shortcut hints and a `⌘⌫` / `Ctrl+Backspace` shortcut for deleting the current task after confirmation.
- Added a guarded hover trash action on board cards: first click arms deletion, second click confirms it.
- Added Tabler icons to board column headers so statuses are easier to scan at a glance.
- Added project-level appearance skins with shadcn-compatible CSS tokens, auto/light/dark mode, and local font presets in Settings.
- Increased web UI typography slightly across board cards, filters, menus, modals, settings, and editor surfaces so the app reads better without changing the layout structure.
- **Content search**: Search now looks inside task content (subtasks, description, tags, assignee, priority). When a match is found, a highlighted preview snippet is shown below the card title. Same engine powers both the FilterBar search and CommandPalette (⌘K).
