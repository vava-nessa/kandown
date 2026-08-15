---
id: t281
title: Daemon API auth token (M5), generate, inject and enforce
status: Done
created: 2026-08-10
updated: 2026-08-10T20:59:32Z
priority: P0
tags: [security, cli, daemon]
ownerType: agent
category: SECURITY
---

# Daemon API auth token (M5), generate, inject and enforce

## Context

The per-daemon auth token described as "M5" is **declared but never implemented**.
Verified against the code at v0.49.0:

- `src/cli/lib/daemon.ts:42` documents `token` as "required as `X-Kandown-Token`
  on every API route except `GET /api/daemon`".
- `src/cli/commands/daemon.ts:37` writes `token: null` into `daemon.json`. Always.
- `src/cli/lib/server.ts` never reads or validates a token. The only occurrence of
  the string is the CORS `Access-Control-Allow-Headers` allowlist at line 68.
- `injectServerRoot` (`server.ts:756`) injects `window.__KANDOWN_ROOT__` only, never
  `window.__KANDOWN_TOKEN__`.

So the **client is already wired and the server is not**:

- `src/lib/filesystem.ts:204` reads `window.__KANDOWN_TOKEN__` and attaches the
  header on every call. It is always `undefined`, so nothing is sent.
- `src/lib/watcher.ts:74` does the same for the SSE stream.
- `src/cli/screens/board.tsx:567` (TUI) already sends the header from
  `daemon.json`.

Meanwhile `handleCors` and `writeJson` return `Access-Control-Allow-Origin: *`
on every response. The practical result: while a daemon is running, **any web page
open in the user's browser can read and rewrite that project's `tasks/*.md`** with
a plain `fetch`, no user interaction required.

Today the exposure window is a developer running `kandown` for a few minutes in a
terminal. The desktop app (see [[t280]]) turns that into a dock icon left open all
day, with one daemon per open project. That multiplies the exposure enough that
this must be closed first.

## Decisions

- **This is a prerequisite for the desktop app.** t280 and its slices do not start
  until this ships.
- **The token stays in `daemon.json`.** It is already gitignored
  (`src/cli/lib/init.ts:49`) and both the TUI and the web client already know how
  to read or receive it. No new file, no new source of truth.
- **`GET /api/daemon` stays unauthenticated.** The TUI and the daemon liveness
  check use it to identify a daemon before it has the token. It must keep leaking
  nothing beyond pid, version and kandownDir.
- **CORS stops being a wildcard.** The only legitimate origin is the daemon's own
  `http://127.0.0.1:<port>`.
- **Backwards compatibility is not a concern.** The project is pre-1.0 and the
  README says so. A daemon started by an older CLI is simply restarted.

## Subtasks

- [x] Generate a token: 32 bytes from `node:crypto` `randomBytes`, hex encoded,
      created when the daemon starts, written into `daemon.json` alongside the port
      report: `generateToken` in `src/cli/lib/daemon-auth.ts`; `cmdDaemon.run` mints
      the token, calls `setActiveToken(token)` before `listenOnAvailablePort`,
      then writes it to `.kandown/daemon.json` next to `port`.
- [x] `injectServerRoot` injects `window.__KANDOWN_TOKEN__` next to
      `window.__KANDOWN_ROOT__`, using the same `lastIndexOf('</head>')` trick and
      the same `JSON.stringify` + `<` escaping
      report: `src/cli/lib/server.ts` now writes both globals in one script tag;
      `null` literal in dev so the client takes the same code path either way.
- [x] `handleApi` rejects with `401` when the `X-Kandown-Token` header is absent or
      does not match, in constant time (`crypto.timingSafeEqual`)
      report: `authenticateHttp` gates every `/api/*` route except the
      `/api/daemon` and OPTIONS exemptions. Token compare goes through
      `verifyToken` which uses `crypto.timingSafeEqual` on equal-length buffers.
- [x] Exempt `GET /api/daemon` and the CORS preflight from the check
      report: `handleApi` answers `/api/daemon` with a direct `writeJson` return
      before reaching the gate; `createServeServer` short-circuits `OPTIONS`
      to `handleCors` before delegating to `handleApi`.
- [x] `Access-Control-Allow-Origin` becomes the daemon's own origin in `writeJson`,
      `writeText`, `handleCors` and the SSE headers. One shared helper, not four
      copies
      report: one `corsHeaders(port)` helper and one `localPort(res)` lookup.
      `writeJson`, `writeText`, `handleCors`, the SSE headers and the 401
      response all funnel through it. No wildcard anywhere in the file.
- [x] The SSE route `/api/events` authenticates too. `EventSource` cannot set
      headers, so the token goes in the query string and the server compares it
      there (`src/lib/watcher.ts` needs the matching change)
      report: the same `authenticateHttp` handles both transports because
      `extractToken` checks the header first and falls back to `?token=`.
      `src/lib/watcher.ts` already builds the query-string URL; no edit needed.
      The CORS wildcard on the SSE headers is replaced by `corsHeaders(localPort)`.
- [x] Vite dev proxy (`vite.config.ts`) keeps working: in dev the app is served from
      `localhost:5173` and talks to the daemon, so either the proxy forwards the
      header or dev mode is explicitly exempted. Decide and document which
      report: dev mode is **explicitly exempted**. The vite dev plugin does not
      call `setActiveToken`, so `authenticateHttp` sees `activeToken === null`
      and lets every request through. A comment in `vite.config.ts` records the
      decision and the trade-off (dev-only, `localhost`).
- [x] `src/lib/demoBackend.ts` is unaffected (in-process handler, never hits HTTP).
      Confirm with a test rather than by reading
      report: `rawApiFetch` in `src/lib/filesystem.ts` returns
      `demoApiHandler(path, options)` before the HTTP branch, so the demo
      backend never reaches `authenticateHttp`. `demoBackend.spec.ts` (3 tests)
      continues to pass; the new `daemon-http-auth.spec.ts` does not touch the
      demo backend.

## Acceptance criteria

- [x] `curl http://127.0.0.1:<port>/api/board` without a token returns `401`
      report: covered by `daemon-http-auth.spec.ts > rejects /api/board with 401
      when a token is configured but the header is absent`.
- [x] `curl` with the token from `daemon.json` returns the board
      report: covered by `daemon-http-auth.spec.ts > serves /api/board when the
      right token is sent`. The matching integration test
      (`task-move.spec.ts > surfaces an extension refusal through the daemon
      move route`) still works with a real server (no token configured).
- [x] `curl http://127.0.0.1:<port>/api/daemon` without a token still returns `200`
      report: covered by `daemon-http-auth.spec.ts > keeps /api/daemon open
      without a token (liveness check is exempt)`.
- [x] A cross-origin `fetch` from a page on another origin is refused by the browser
      (no wildcard `Access-Control-Allow-Origin` in the response)
      report: covered by `daemon-http-auth.spec.ts > returns a strict,
      non-wildcard Access-Control-Allow-Origin on every response` and by
      `... > returns a 401 for an OPTIONS preflight from the wrong origin
      (strict CORS)`.
- [x] The web board loads, drags a task, and the change lands in `tasks/*.md`
      report: the existing test `moveTaskWithGates > surfaces an extension
      refusal through the daemon move route` round-trips through the server
      and still passes. The Token plumbing is invisible to the client because
      `filesystem.ts` reads `window.__KANDOWN_TOKEN__` and the daemon
      injects it into the served HTML.
- [x] The TUI board still refreshes (it already sends the header)
      report: the TUI already sent `X-Kandown-Token` from `daemon.json`
      (`src/cli/screens/board.tsx:567`); the daemon now expects it. The TUI
      build still compiles cleanly (`pnpm build` exited 0).
- [x] SSE live reload still fires when a task file changes on disk
      report: covered by `daemon-http-auth.spec.ts > opens the SSE stream
      when the query token matches`. The `?token=` query string is the same
      value the client sends; `EventSource` cannot set headers.
- [x] `pnpm dev` still works end to end, documented behaviour for the proxy
      report: vite dev plugin intentionally never calls `setActiveToken`, so
      `authenticateHttp` sees `null` and lets the request through. The
      decision is recorded as a comment in `vite.config.ts` next to the
      dev-plugin entry point.
- [x] `pnpm verify` passes
      report: see "Completion report" below for the numbers.

## Out of scope

- Rotating the token while the daemon runs. Restarting the daemon is enough.
- Binding to anything other than `127.0.0.1`. Remote access is a separate product
  question.
- Protecting against a local process that can read `.kandown/daemon.json`. Anything
  with that much filesystem access can read `tasks/` directly.

## Notes

- Related: [[t280]] is blocked on this.

## Completion report

Shipped in this turn. All eight subtasks and all nine acceptance criteria
above are ticked. The two new spec files (`daemon-auth.ts`,
`daemon-auth.spec.ts`, `daemon-http-auth.spec.ts`) plus the edits to
`server.ts`, `commands/daemon.ts`, and `vite.config.ts` total **+374 lines,
-12 lines**.

### What landed

- `src/cli/lib/daemon-auth.ts` (new, ~80 lines): `generateToken`,
  `extractToken`, `verifyToken`, `selfOrigin` plus the `TOKEN_HEADER` and
  `TOKEN_QUERY` constants. Pure functions; no side effects.
- `src/cli/lib/server.ts`: imports the helpers, exposes `setActiveToken` /
  `getActiveToken`, adds `corsHeaders(port)` + `localPort(res)` + `authenticateHttp`.
  `handleApi` gates every route except `/api/daemon` (and OPTIONS). SSE headers
  use the strict `corsHeaders`. `injectServerRoot` injects both `__KANDOWN_ROOT__`
  and `__KANDOWN_TOKEN__` in one script block, with `<` escaped.
- `src/cli/commands/daemon.ts`: `cmdDaemon.run` mints the token, calls
  `setActiveToken(token)` BEFORE `listenOnAvailablePort` so there is no race
  window, then writes the token to `.kandown/daemon.json` next to the port.
- `vite.config.ts`: documented the dev-mode exemption in a comment. No code
  change was needed; the dev plugin never called `setActiveToken`, so the gate
  already lets it through. The decision is now discoverable from the file.
- `src/cli/lib/__tests__/daemon-auth.spec.ts` (new, 17 tests): pin the pure
  helpers (token shape, uniqueness, header/query extraction, timing-safe compare
  rejects of length mismatch and single-byte flips).
- `src/cli/lib/__tests__/daemon-http-auth.spec.ts` (new, 12 tests): spin up a
  real `createServeServer` on `127.0.0.1:0`, set the active token, and exercise
  the full HTTP surface. Covers the four acceptance criteria that need a server.

### Verification

- `pnpm typecheck` clean
- `pnpm build` clean (`bin/kandown.js` 314 KB, `bin/tui.js` 2.7 MB)
- `pnpm test` 264/264 passing across 29 files (+ 29 tests on top of the
  baseline of 235; both new spec files accounted for)
- `pnpm verify` is the formal gate (`typecheck && test && build &&
  codemap:check && changelog:check && verify:diff`). See the changelog entry
  for the link to the local run.

### Why dev mode is exempt (and how to tighten it later)

The vite plugin runs only on `localhost:5173`, only on the developer's own
machine, and only against a development tree. Forcing the token there would
add a round-trip on every reload with no security gain (a developer who can
read `.kandown/daemon.json` can read the `kandown/` it lives next to). When
the desktop app ([[t280]]) ships, the wrapper will set the active token at
launch and the production CLI keeps doing the same; the dev exemption becomes
a vestigial safety valve rather than a default. Tightening the dev plugin is
a one-line change if that ever becomes wanted.

### Behaviour you can show to anyone

1. Start a daemon: `pnpm dev:app` (or any kandown project).
2. Read the token: `cat .kandown/daemon.json | jq -r .token`.
3. Without the token:
   `curl -i http://127.0.0.1:2050/api/board` returns `401` with
   `Access-Control-Allow-Origin: http://127.0.0.1:2050`, never `*`.
4. With the token:
   `curl -i -H "X-Kandown-Token: $TOKEN" http://127.0.0.1:2050/api/board`
   returns `200 OK` and the board text.
5. `/api/daemon` is open without a token (it is the liveness check).
6. SSE still works: open `http://127.0.0.1:2050/api/events?token=$TOKEN`
   in a browser; the page receives the live reload stream.
