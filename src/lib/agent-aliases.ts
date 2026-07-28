/**
 * @file Agent alias resolver (shared, framework-agnostic)
 * @description The single source of truth for mapping a free-form assignee
 * string (as typed in a task's `assignee:` frontmatter or quick-add `@token`)
 * to a canonical agent id. Used by both the web UI (avatar resolver) and the
 * CLI (launch-on-assignee, cascade agent selection), so neither side keeps a
 * private copy of the alias table.
 *
 * 📖 Matching is fuzzy + case-insensitive: "Claude", "claude code", "ClaudeCode"
 * and "anthropic-claude" all collapse to `claude` because the lookup key is
 * lowercased and stripped of every non-alphanumeric character before the table
 * probe. A bare canonical id (`claude`) also resolves to itself.
 *
 * 📖 This module is deliberately dependency-free — no React, no Node `fs` — so
 * it can be imported from the web bundle, the CLI bundle, and unit tests
 * without pulling in a UI runtime. Keep it that way.
 *
 * @functions
 *  → normalizeAlias — lowercase + strip non-alphanumerics
 *  → resolveAgent   — assignee string → canonical agent id, or null (human)
 *  → knownAgentIds  — the set of canonical ids the table can produce
 *
 * @exports ALIAS_TO_AGENT, normalizeAlias, resolveAgent, knownAgentIds
 * @see src/components/agentIcons.tsx — web avatar resolver (re-exports resolveAgent)
 * @see src/cli/lib/agents.ts — CLI catalog + detection
 */

/** 📖 Alias → canonical agent id. Keys are lowercased + stripped of
 *  non-alphanumerics, so lookups are fuzzy (spaces, dashes, case all collapse).
 *  Built once, shared across web + CLI. When you add an agent to the CLI
 *  registry in `src/cli/lib/agents.ts`, add its aliases here too. */
export const ALIAS_TO_AGENT: Record<string, string> = {
  "pi": "pi",
  "piearendil": "pi",
  "picodingagent": "pi",
  "claudeai": "claude",
  "claude": "claude",
  "claudecode": "claude",
  "anthropic": "anthropic",
  "codex": "codex",
  "openaicodex": "codex",
  "openai": "openai",
  "chatgpt": "openai",
  "gpt": "openai",
  "geminicli": "gemini",
  "googlegemini": "gemini",
  "gemini": "gemini",
  "google": "google",
  "cursor": "cursor",
  "githubcopilot": "copilot",
  "copilot": "copilot",
  "github": "github",
  "octocat": "github",
  "clinedev": "cline",
  "claudedev": "cline",
  "cline": "cline",
  "opencode": "opencode",
  "sstopencode": "opencode",
  "moonshot": "kimi",
  "moonshotai": "kimi",
  "kimi": "kimi",
  "kiro": "kiro",
  "awskiro": "kiro",
  "sourcegraphamp": "amp",
  "amp": "amp",
  "grok": "grok",
  "xaigrok": "grok",
  "xai": "xai",
  "hermesagent": "hermes",
  "hermes": "hermes",
  "qodercli": "qoder",
  "qoder": "qoder",
  "devin": "devin",
  "googleantigravity": "antigravity",
  "antigravity": "antigravity",
  "windsurf": "windsurf",
  "codeium": "windsurf",
  "bytedancetrae": "trae",
  "trae": "trae",
  "goose": "goose",
  "blockgoose": "goose",
  "roocli": "roocode",
  "roo": "roocode",
  "roocode": "roocode",
  "replit": "replit",
  "deepseek": "deepseek",
  "mistralai": "mistral",
  "mistral": "mistral",
  "alibabaqwen": "qwen",
  "qwen": "qwen",
  "groq": "groq",
  "perplexityai": "perplexity",
  "perplexity": "perplexity",
  "ollama": "ollama",

  // 📖 Wide-compat chainable CLI (added via mode-chasse + exa): every
  // entry here must ALSO exist in `src/cli/lib/agents.ts` with a matching
  // `bin` and `buildCommand` — otherwise `which <bin>` will fail.
  "crush": "crush",
  "charmbraceletcrush": "crush",
  "charmcrush": "crush",
  "openclaw": "openclaw",
  "openclawfoundation": "openclaw",
  "claw": "openclaw",
  "qwencode": "qwen",
  "qwenlm": "qwen",
  "vibe": "vibe",
  "mistralvibe": "vibe",
  "grokbuild": "grok",
  "openhands": "openhands",
  "openhand": "openhands",
  "openhandscli": "openhands",
  "pplx": "pplx",
  "pplxcli": "pplx",
  "perplexitycli": "pplx",

  // 📖 Second compatibility wave (CLI harnesses the TUI can assign + launch).
  // Same rule as above: every id here has a matching entry in
  // `src/cli/lib/agents.ts`, otherwise `which <bin>` has nothing to find.
  "ghcopilot": "copilot",
  "ampcode": "amp",
  "droid": "droid",
  "factory": "droid",
  "factoryai": "droid",
  "factorydroid": "droid",
  "auggie": "auggie",
  "augment": "auggie",
  "augmentcode": "auggie",
  "q": "amazonq",
  "amazonq": "amazonq",
  "awsq": "amazonq",
  "qdeveloper": "amazonq",
  "agy": "agy",

  // 📖 Desktop / app-only identifiers. They reuse the brand SVG of their
  // chainable cousin (Claude app = Claude brand logo, just in `desktop`
  // rendering mode). The pre-built agents.ts detects `which <bin>` and
  // cannot spawn these — the `desktop:` prefix on the assignee string is
  // the user-level signal that says "I know this can't be chainable".
  "claudeapp": "claude-app",
  "claudeappdesktop": "claude-app",
  "claudedesktop": "claude-app",
  "codexapp": "codex-app",
  "codexdesktop": "codex-app",
  "vscode": "vscode",
  "visualstudiocode": "vscode",
  "vscodecopilot": "vscode-copilot",
  "t3code": "t3-code",
  "t3codex": "t3-code",
  "t3codeapp": "t3-code",
  "minimaxcode": "minimax-code",
  "clawapp": "openclaw-app",
  "openclawapp": "openclaw-app",
  "warpsh": "warp",
  "warpapp": "warp",
};

/**
 * 📖 Normalises a raw assignee string for alias lookup: lowercase, then drop
 * every character that is not `a-z0-9`. "Claude Code" → "claudecode",
 * "anthropic-claude" → "anthropicclaude". Returns "" for blank/non-string
 * input, which the resolver treats as "no agent" (human).
 */
export function normalizeAlias(assignee: string | null | undefined): string {
  if (!assignee || typeof assignee !== 'string') return '';
  return assignee.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 📖 Resolves a raw assignee string to a known canonical agent id, or `null`
 * when it looks like a human / unknown value. Normalises first, then probes
 * the alias table. A direct canonical-id match also works.
 *
 * Returns `null` for humans so callers can render a fallback avatar or skip
 * agent-based launch logic.
 */
export function resolveAgent(assignee: string | null | undefined): string | null {
  const norm = normalizeAlias(assignee);
  if (!norm) return null;
  if (ALIAS_TO_AGENT[norm]) return ALIAS_TO_AGENT[norm];
  // Substring safety: only accept exact alias matches. A loose `includes`
  // would let "pi" match "spiral" etc., so we require equality.
  for (const [alias, id] of Object.entries(ALIAS_TO_AGENT)) {
    if (norm === alias) return id;
  }
  return null;
}

/**
 * 📖 The set of canonical agent ids the alias table can produce. Useful for
 * validating a frontmatter `assignee:` value or seeding a picker. Computed
 * once via a Set for O(1) membership checks.
 */
export function knownAgentIds(): Set<string> {
  return new Set(Object.values(ALIAS_TO_AGENT));
}

/** 📖 A matched agent from `matchAgent`: the canonical id, plus whether the
 *  caller should render the agent in chainable or desktop mode (ring + tooltip). */
export interface AgentMatch {
  id: string;
  kind: 'chainable' | 'desktop';
}

/**
 * 📖 The set of canonical ids that have a working CLI hookup in
 * `src/cli/lib/agents.ts` (`which <bin>` + `buildCommand`). Anything NOT in
 * this set is by definition non-scriptable — desktop apps, IDEs, GUI-only
 * tools — and renders with a dashed ring + "non chainable" tooltip. This
 * list must be kept in sync with `src/cli/lib/agents.ts` when agents are
 * added or removed; the assumption is that the two lists grow together.
 */
export const CHAINABLE_IDS: ReadonlySet<string> = new Set<string>([
  // Built-in CLI (see src/cli/lib/agents.ts AGENTS array).
  'claude', 'codex', 'gemini', 'goose', 'aider', 'opencode', 'cursor', 'pi',
  // Wide-compat additions (mode-chasse / exa).
  'crush', 'openclaw', 'kimi', 'qwen', 'vibe', 'grok', 'openhands', 'pplx',
  // 📖 Second wave: these gained a real entry in the CLI catalog, so the web
  // avatar must stop ringing them as desktop-only. An id that is launchable
  // from `a` belongs here the same day it lands in AGENTS.
  'copilot', 'amp', 'droid', 'auggie', 'amazonq', 'cline', 'agy',
]);

/**
 * 📖 Resolves an assignee string into `{ id, kind }` or null. The kind is the
 * rendering hint for the avatar: `chainable` is solid brand color, `desktop`
 * adds a dashed ring + tooltip. Decision: an entry is `desktop` if EITHER the
 * caller prefixed `desktop:` (explicit override — useful when an id like
 * `claude` exists in both chainable and desktop forms) OR the resolved id is
 * not in CHAINABLE_IDS (intrinsic — the canonical id has no working CLI).
 *
 * Returns null for humans / unknowns, exactly like `resolveAgent`.
 */
export function matchAgent(assignee: string | null | undefined): AgentMatch | null {
  if (!assignee || typeof assignee !== 'string') return null;
  const prefix = 'desktop:';
  const explicitDesktop = assignee.toLowerCase().startsWith(prefix);
  const bare = explicitDesktop ? assignee.slice(prefix.length).trim() : assignee;
  const id = resolveAgent(bare);
  if (!id) return null;
  const kind: 'chainable' | 'desktop' =
    explicitDesktop || !CHAINABLE_IDS.has(id) ? 'desktop' : 'chainable';
  return { id, kind };
}
