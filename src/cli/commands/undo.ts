/**
 * @file `kandown undo` command
 * @description Reverts the most recent journalized board change (move, create,
 * delete or archive), or lists the journal with `--list`. Until now the undo
 * safety net was reachable only through the TUI's `u` key; this command makes
 * it available to agents and shell pipelines, so a scripted `kandown move`
 * from a Yolo-mode run can be walked back without git and without opening the
 * board.
 *
 * 📖 The reverted entry is read through the pure reader in `lib/undo.ts`
 * BEFORE calling `undoLastAction`, because the revert pops the journal as a
 * side effect and only returns a boolean: peek first, revert second, then
 * report the record that actually left the journal.
 *
 * 📖 Output follows the house invariant "stdout is data, stderr is
 * decoration": `--list` prints one line per entry on stdout so it can be
 * piped or grepped, the revert confirmation goes to stderr through
 * `success()` like every other mutation report (`Moved t1`, `Archived t1`),
 * and failures print on stderr and exit 1.
 *
 * @functions
 *  → describe: one short sentence saying what a reverted record did to the board
 *  → cmdUndo: the `kandown undo [--list]` handler
 *
 * @exports cmdUndo
 * @see src/cli/lib/undo.ts: the pure journal reader used to peek
 * @see src/cli/lib/board-reader.ts: `undoLastAction`, the revert itself
 */

import { log, info, success, err, parseArgs, ensureKandownDir } from '../lib/cli-shared';
import { undoLastActionDetailed } from '../lib/board-reader';
import { listUndoRecords } from '../lib/undo';
import type { UndoRecord } from '../lib/undo';

/**
 * 📖 One short sentence per record type, so the confirmation says what the
 * revert did to the board, not just which record left the journal. The paths
 * come straight from the record, so they name the real file even when the
 * filename carries a slug.
 */
function describe(record: UndoRecord): string {
  switch (record.type) {
    case 'move':
      return `Undid move of ${record.taskId} (previous status restored)`;
    case 'create':
      return `Undid creation of ${record.taskId} (${record.path} deleted)`;
    case 'delete':
      return `Undid deletion of ${record.taskId} (${record.path} restored)`;
    case 'archive':
      return `Undid archive of ${record.taskId} (${record.path} restored to the board)`;
  }
}

/**
 * 📖 The `kandown undo [--list]` handler. Revert mode exits 1 both when the
 * journal is empty (nothing to undo is a failure for scripts, matching
 * `undoLastAction`'s own false) and when the revert itself fails, so a
 * pipeline can trust the exit code rather than parse the message.
 */
export function cmdUndo(rawArgs: string[]): void {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = parseArgs(rawArgs);

  if (args.flags.help === true || args.flags.h === true) {
    info('Usage: kandown undo [--list | -l] [--path <kandown-dir>]');
    info('');
    info('  (no flags)  Revert the most recent journalized board change.');
    info('  --list, -l  List the journal entries, newest first (read-only).');
    info('  -h, --help  Show this help.');
    return;
  }

  if (args.flags.list === true || args.flags.l === true) {
    const records = listUndoRecords(kandownDir);
    if (records.length === 0) {
      info('The undo journal is empty.');
      return;
    }
    for (const record of records) {
      const when = new Date(record.timestamp).toISOString();
      log(`${record.type.padEnd(8)}${record.taskId.padEnd(10)}${when}  ${record.path}`);
    }
    return;
  }

  // 📖 The detailed verdict reports the entry it would revert AND why it
  // refused, so scripts get a truthful exit code and sentence in one call.
  const outcome = undoLastActionDetailed(kandownDir);
  if (!outcome.ok) {
    if (outcome.reason === 'drifted' && outcome.record) {
      err(`Cannot undo ${outcome.record.type} of ${outcome.record.taskId}: `
        + `${outcome.record.path} changed after the journalized mutation. `
        + 'The journal entry is kept; resolve the file by hand.');
      process.exit(1);
    }
    err('Nothing to undo: the journal is empty.');
    process.exit(1);
  }
  success(describe(outcome.record!));
}
