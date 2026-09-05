/**
 * @file Tool detail excerpt for harness adapters
 * @description Extracts a short single-line excerpt from a harness tool input
 * so the chat activity rows show WHAT the agent is doing (the bash command,
 * the touched file) instead of the bare tool name. Shared by every adapter:
 * the same input shapes recur across harnesses (command, path, query), and
 * anything else falls back to a compact JSON view.
 *
 * @functions
 *  → excerptFromToolInput: one-line excerpt (max 80 chars) or undefined
 *
 * @exports excerptFromToolInput
 * @see src/cli/lib/agent/adapters/pi.ts, acp.ts, claude-code.ts: consumers
 */

/** 📖 Collapses whitespace and truncates to 80 chars with an ellipsis. */
function truncateLine(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/**
 * 📖 Pulls the most telling scalar out of a tool input object (command first,
 * then file paths, then query-ish fields), falling back to compact JSON so an
 * unknown tool still shows something. Returns undefined when there is nothing
 * human-readable to show.
 */
export function excerptFromToolInput(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined;
  if (typeof input === 'string') return input.trim() ? truncateLine(input) : undefined;
  if (typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const commandKeys = ['command', 'cmd', 'script'];
  for (const key of commandKeys) {
    if (typeof record[key] === 'string' && (record[key] as string).trim()) {
      return truncateLine(record[key] as string);
    }
  }
  const pathKeys = ['path', 'file_path', 'filePath', 'notebook_path', 'target', 'file'];
  for (const key of pathKeys) {
    if (typeof record[key] === 'string' && (record[key] as string).trim()) {
      return truncateLine(record[key] as string);
    }
  }
  const queryKeys = ['query', 'url', 'pattern', 'question'];
  for (const key of queryKeys) {
    if (typeof record[key] === 'string' && (record[key] as string).trim()) {
      return truncateLine(record[key] as string);
    }
  }
  try {
    const json = JSON.stringify(record);
    if (json && json !== '{}') return truncateLine(json);
  } catch {
    return undefined;
  }
  return undefined;
}
