# 0001 — Task transition gate has one source

The rule "a task may only enter the terminal column (or be archived) when every `depends_on` id is resolved" lives entirely in `src/lib/dependencies.ts`. Every interface — web store, TUI, CLI, MCP, cascade — calls `resolveTransition` / `assertTransitionAllowed` / `checkTerminalStatusGate` from that module. Before this ADR the rule had been reimplemented in each of the four entry points and the copies had already drifted (archived dependencies blocked in two places, unknown ids blocked in one, the CLI/MCP bypassed the gate entirely).

## Status

Accepted — 2026-07-27.

## Considered Options

- **Reimplement per entry point.** Today's status quo. Each caller builds its own id → resolved map. Drifts the moment one path adds an `archived` shortcut.
- **Wrap each caller in an adapter.** Adds a layer without removing the copies; preserves every leak.
- **Pure module + thin adapters (chosen).** `dependencies.ts` is the only module that knows what "resolved" means; the four callers build a snapshot and ask it for a verdict. Archived, unknown, self-reference, and missing-dep rules live once.

## Consequences

- The transition policy becomes a unit-testable pure function with no I/O. The behavior matrix in `src/lib/__tests__/dependencies.spec.ts` is the contract; if a future change drops a row, CI catches it.
- Every interface still owns its UI side-effect (toast, status message, JSON-RPC error code). The module decides; the caller renders.
- Adding a new "terminal-equivalent" transition in the future means editing `isTerminalStatus` / `movesIntoArchived` once — every interface picks it up.

## Refs

- `src/lib/dependencies.ts` — the deep module.
- `src/lib/store/boardSlice.ts`, `src/lib/store.ts` — web callers.
- `src/cli/screens/board.tsx` — TUI caller.
- `src/cli/lib/board-reader.ts`, `src/cli/lib/mcp.ts`, `src/cli/lib/cascade.ts` — Node callers.
- `src/lib/__tests__/dependencies.spec.ts`, `src/cli/lib/__tests__/board-reader.spec.ts` — the matrix that locks the policy.