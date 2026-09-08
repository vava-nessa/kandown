---
id: t337
title: [AGENTIC] Agent full page view with conversation rail
status: Review
priority: P1
tags: [ui, agent]
assignee: zcode
created: 2026-09-08
updated: 2026-09-08T16:23:10Z
---

# [AGENTIC] Agent full page view with conversation rail

## Context

The agent chat currently opens as a 400px fixed overlay on top of the board
(`ChatSidebar`). vava wants a code-harness style layout: Agent becomes a real
full-page view, the conversation list lives in the left rail at all times, and
a retractable right panel hosts per-conversation content (task editing, diffs,
future usages).

## Decisions

- Agent is a real view (`currentPage: 'agent'`), the rail stays, the chat
  fills the main area as a centered column (harness proportions).
- The conversation list lives in the rail (expanded mode), always visible,
  and becomes the only switcher: the SessionSwitcher dropdown is removed.
- The rail can collapse, but only within the agent view (Zcode-style toggle).
- A generic right panel space, keyed per conversation, extensible: v1 ships
  Task (editable, via a TaskWorkspace panel variant) and Changes (touched
  files + live task diffs).
- New config flag `agent.useAgents` (default true): when off, every agent
  chat surface hides, leaving board / list / archives only.
- Mobile: untouched, keeps the fullscreen overlay chat below 768px.

## Subtasks

- [x] Store: currentPage 'agent', agentRailCollapsed persisted, agentPanel slice
  report: store.ts + store/types.ts carry `currentPage: 'agent'`, the
  persisted `agentRailCollapsed` flag and the new `agentPanelSlice`
  (per-session tab state, 'draft' key when no session is active).
- [x] Config: agent.useAgents in types, defaults and normalization
  report: `agent.useAgents` boolean, default true, normalized with
  `booleanOr` like the other agent flags; absent key keeps agents on so no
  project needs a migration.
- [x] Extract AgentChatSurface from ChatSidebar; ChatSidebar becomes mobile-only
  report: the whole conversation body (guards, banners, messages, skills,
  PromptBar, harness/model pick) now lives in AgentChatSurface; ChatSidebar
  is a mobile-only fullscreen overlay (nothing renders at 768px+).
- [x] AgentPage full view with header (title, usage, panel toggles, new conversation)
  report: header owns the Zcode-style rail toggle, conversation title,
  harness chip, relative time, live-turn dot, UsageBadge, AutopilotControls,
  Task/Changes panel toggles and new conversation; the chat is a centered
  780px column; refreshSessions on mount; a task opened while on the page
  lands in the panel instead of the main area.
- [x] Conversations section in SideNav (resume, forget, new) + agent item navigation
  report: the expanded rail lists the session index (title, harness chip,
  relative age, hover forget, + new chat), visible on every view; a row
  resumes and opens the agent page; section hides when the daemon is
  unreachable. The Agent nav item navigates (desktop) or opens the overlay
  (mobile).
- [x] AgentPanelSpace + task panel (TaskWorkspace variant=panel) + changes panel
  report: AgentPanelSpace drives its tabs from a registry (add a tab = one
  union member + one registry entry); Task tab renders TaskWorkspace
  `variant="panel"` (no navigator) from the drawer store; Changes tab lists
  the session's touched files plus live task diffs (computeLineDiff).
- [x] Remove SessionSwitcher dropdown (superseded by the rail list)
  report: file deleted; the mobile overlay header keeps a new-chat shortcut.
- [x] Settings toggle 'Use agents' + gating of all chat entries (nav, cmd-J, drawer buttons)
  report: SettingDef in the agent section rendered as its own card at the top
  of the section; gates: SideNav item + conversations, cmd-J, AgentPage
  branch, ChatSidebar mount, ask-the-agent buttons on Card, Drawer and
  TaskWorkspace. Assign-and-launch stays available by design.
- [x] i18n: English keys propagated to every locale
  report: 10 new keys (agentChat: conversations, panelTask, panelChanges,
  panelTaskEmpty, panelLabel, changesEmpty, touchedFiles, liveDiffs;
  settings: useAgents, useAgentsDesc) translated in all 48 locale files via
  a one-off injector script (deleted after the run).
- [x] Build + typecheck + visual self-test on the dev server
  report: pnpm typecheck + pnpm build pass. Playwright run against the
  worktree daemon (port 2053): board intact, conversation list, real claude
  session round-trip (title, usage, follow-ups), Task panel with an editable
  task, rail collapse toggle agent-only, useAgents off hides every chat
  surface and on restores them, mobile overlay unchanged.

## Evidence

- Daemon + fresh build: `http://127.0.0.1:2053/?p=kandown-agent-fullpage-view`
- typecheck/build: clean. Console on a fresh load: only the pre-existing
  manifest.json 404.
- Known pre-existing observation (not this task): the TaskWorkspace navigator
  eager-fetches every task file at once; on a 64-task board a mid-session
  resize can hit the browser's concurrent-request cap (ERR_INSUFFICIENT_
  RESOURCES, retried by withRetry). Follow-up candidate: throttle
  loadTaskContents concurrency.

## Round 2 (vava feedback, commit 34d86d0)

- Harness names in the conversation rows and the page header clipped in
  the narrow rail (CLAUDE rendered as CLAIDE). Both now show the branded
  agent glyph the cards use for assignees, name on hover; unknown
  harnesses keep a tiny text chip. Files: SideNav.tsx, AgentPage.tsx.
- An empty conversation renders a centered welcome screen: big greeting
  (`agentChat.welcomeTitle`, translated in all 48 locales) with the
  composer under it in the BUI `tall` shape (more padding, wider gaps,
  15px text). The first send falls back to the classic bottom-anchored
  chat. The agent PromptBar wrapper grew a `tall` prop that also drops
  the bottom-bar chrome while centered; the BUI port's measure span now
  mirrors the tall font. Files: AgentChatSurface.tsx,
  agent/PromptBar.tsx, bui/PromptBar.tsx.

## Round 4 (vava feedback, nine UI improvements)

Implemented by five parallel sub-agents with disjoint file ownership,
then integration, a dedicated tester agent (9 scenarios, 9 bugs found),
four parallel fix agents, and a review agent (PASS, no blockers).

- Live indicator (#1): pulsing dot on a conversation row while its agent
  turn runs; the collapsed rail's Agent icon carries the count badge, and
  the SSE stream now reconnects when the agent page is open so the
  indicator is not blind to the conversation on screen.
- Per-conversation drafts (#2): the composer keeps one draft per
  conversation, keyed by the STABLE harnessSessionId (kandown session ids
  rotate on resume), mirrored to sessionStorage, capped at 20.
- Board navigation with an open task (#3): setCurrentPage to
  board/settings closes the editor with unsaved-edit stash; cmd+1/2 and
  the palette's view commands share the same path; "Back to cards" is
  icon-only.
- Conversations search (#5), date grouping (#6, Today / Yesterday /
  Last 7 days / Older), real portaled tooltips (#8, hover or focus, the
  filter input is hover-only so it never covers the header while typing).
- Ordering freeze: the conversation list stops re-ordering while the
  pointer hovers it (live updates re-sorting rows caused mis-clicks).
- Model picker (#7): per-provider model counts on the tabs, "New" badge
  for releases under 14 days, sticky group header, selected model pinned
  when filtered out, "(latest)" style name tags kept visible.
- Resizable panel (#9): drag handle on the left edge, 320 to 560px and
  50vw capped, persisted, keyboard resize with aria value semantics,
  double-click resets.
- Mini rail (#10): collapsing in the agent view drops the rail to its
  icon-only 56px form instead of removing it.
- Quick switcher (#11): the command palette gains Go to board / list /
  archives, Open agent page, and a Conversations group (resume the 8
  most recent sessions).
- Hygiene: the vestigial /api/migrate-tasks web call was removed (the
  daemon never had the route; it 404'd on every page load).

## Round 5 (vava bug report: lost prompt on a dead conversation)

Reproduced as a user: harness pi + model "Muse Spark 1.3" hangs forever
(the pi process spews stale-extension warnings then crashes; sometimes it
never registers at all). When the harness never reports its session id,
the index entry has no `harnessSessionId`, and clicking the conversation
dead-ended with "no harness session to resume yet": the typed prompt was
unreachable.

- resumeSession: a conversation without a harness session id no longer
  dead-ends. It activates locally (transcript and errors stay visible,
  the daemon replays its buffered history) with an info toast.
- sendMessage: a follow-up on such a conversation lazy-starts a fresh
  session on the same harness and task; the text becomes the new opening
  prompt.
- The daemon now stores a capped `promptPreview` (first user message) in
  the session index, and the composer is seeded with it when a dead
  conversation is activated, so the prompt always comes back.
- Verified by user-path test: broken entry (harness id stripped) clicked
  -> conversation opens, composer restored with the prompt, send starts
  a fresh session (new index entry with harness id + prompt preview);
  healthy conversations still resume through the normal path.
- Note: the Muse Spark 1.3 hang itself is harness/model-side (pi on that
  openrouter model never answers); kandown now survives it cleanly.

## Out of scope

- Mobile-specific agent page redesign (the overlay stays).
- Panel resizing and multiple simultaneous panel tabs.
- Conversation rename (no server endpoint for the index entry title).
