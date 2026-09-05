---
id: t239
title: Implement `kandown undo` (mutation journal)
status: Review
priority: P3
tags: [cli, tui, ux]
ownerType: agent
created: 2026-07-25
order: 11
updated: 2026-09-05T18:34:00Z
category: CLI
---

# Implement `kandown undo`

## Context

`FABLE_FEATURES` §2.6 records undo as shipped — `u` in the TUI, `kandown undo` in
the CLI, journal in `.kandown/.undo/log.json`. **Neither exists.** `kandown help`
lists no `undo` command and there is no reference to it in `src/cli/`.

The web UI does have `⌘Z` / `⌘Shift+Z`, so the gap is CLI/TUI-side only. Worth
having: a mis-typed `kandown move` from an agent script is currently unrecoverable
except through git.

## Subtasks

- [x] Append every mutation (create / move / assign / set / archive / delete) to a
      bounded journal in `.kandown/.undo/log.json`, recording enough to invert it
  report: le journal existait deja (pushUndo, borne a 50, contenu precedent conserve) et couvre create/move/assign/archive/delete via les 5 appelants de board-reader.ts (assign est journalise, etiquete 'move'). Gap confirme et documente : les ecritures hors de ces 5 fonctions (MCP add_report, setField des extensions, editions drawer web) contournent le journal. Follow-up a creer, correction verrouillee par la propriete de board-reader.ts/mcp.ts (travail non commite d'un autre agent ce soir).
- [x] `kandown undo` (revert the last entry) ; `kandown undo --list` to inspect
  report: src/cli/commands/undo.ts + lecteur pur src/cli/lib/undo.ts (narrowing defensif, jamais de throw). undo : peek avant pop, une phrase claire, exit 1 si vide/echec. --list : une ligne par entree sur stdout (pippable). Enregistre dans cli.ts + cli-shared.ts (COMMANDS, help, printTaskCommandsHelp). 11 tests (undo.spec.ts), typecheck vert.
- [x] Bind `u` in the TUI to the same code path with a status message
  report: deja en place (board.tsx:1223, undoLastAction + toast "Undid last action") : confirme, rien a faire.
- [x] Add `.kandown/.undo/` to the generated `.kandown/.gitignore` (runtime state)
  report: deja en place (KANDOWN_GITIGNORE dans init.ts) : confirme, rien a faire.
- [x] Make deletes recoverable by keeping the file content in the journal entry
  report: deja en place (deleteTaskInBoard pousse previousContent ; undoLastAction reecrit au meme path, recreation du repertoire parent incluse) : confirme et couvert par les tests d'integration du nouveau spec.

## Livraison

- pnpm verify vert, commit feat(cli), rebuild des binaires (bin/*), daemon non
  impacte (CLI pur).
