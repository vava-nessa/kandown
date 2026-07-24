/**
 * @file Settings — `kandown work` output configurator
 * @description The Agent section's biggest feature: lets the user shape
 * exactly what `kandown work` prints to an AI agent's terminal — base rules
 * density, project instructions (.kandown/instructions.md), and a live board
 * digest — with a live terminal-style preview panel on the right showing the
 * combined output and an approximate token count.
 *
 * @functions
 *  → estimateTokenCount — rough chars/4 token estimate for the preview panel
 *  → buildDigestPreview — renders the "Live Board Digest" block from board state
 *  → getBaseRulesPreview — picks the right canned rules text for a density mode
 *  → renderWorkPreviewBlocks / renderWorkPreview — assembles the full preview,
 *    respecting section order and the raw-template override mode
 *
 * @exports WorkOutputConfigurator
 */

import { useEffect, useState } from 'react';
import {
  IconCheck,
  IconCopy,
  IconPlus,
  IconRobot,
  IconSparkles,
  IconTerminal2,
} from '@tabler/icons-react';
import { fileWatcher } from '../../lib/watcher';
import { readProjectInstructions, writeProjectInstructions } from '../../lib/filesystem';
import { DEFAULT_WORK_OUTPUT } from '../../lib/types';
import type { BoardTask, KandownConfig, WorkOutputConfig, WorkOutputBaseRulesMode } from '../../lib/types';
import type { BrowserNotificationPermission } from '../../lib/notifications';
import { SettingRow } from './SettingRow';
import type { SettingDef } from './schema';

const CONCISE_RULES_PREVIEW = `# Kandown agent rules — concise

- Task state lives in project-root \`tasks/*.md\`; do not maintain a separate board index.
- Before work, read the relevant task file and keep it updated while you progress.
- Move tasks by editing frontmatter \`status:\`; complete work by setting \`status: Done\` and adding a markdown \`report:\` summary.
- Update subtasks in-place: \`- [ ]\` → \`- [x]\`, with a short \`report:\` line for meaningful progress.
- Board columns live in \`.kandown/kandown.json\` under \`board.columns\`; project instructions live in \`.kandown/instructions.md\`.
- Never put Kandown task data inside \`.kandown/\`; tasks belong in \`./tasks/\`.`;

function estimateTokenCount(text: string): number {
  return Math.max(0, Math.ceil(text.trim().length / 4));
}

function buildDigestPreview(columns: { name: string; tasks: BoardTask[] }[], options: WorkOutputConfig['boardDigest']): string {
  const lines = ['## Current board', ''];
  if (options.showColumnCounts) {
    lines.push(`**Columns:** ${columns.map(col => `${col.name} (${col.tasks.length})`).join(' · ')}`);
  }
  if (options.showTasks) {
    for (const col of columns) {
      if (col.tasks.length === 0) continue;
      lines.push('', `### ${col.name}`);
      for (const task of col.tasks.slice(0, 8)) {
        const pri = options.showPriority && task.priority ? `[${task.priority}] ` : '';
        const assignee = options.showAssignee && task.assignee ? ` (@${task.assignee})` : '';
        const blocked = options.showBlockedBy && task.dependsOn.length > 0 ? ` ⛔ blocked by ${task.dependsOn.join(', ')}` : '';
        lines.push(`- ${task.id} ${pri}${task.title || '(untitled)'}${assignee}${blocked}`);
      }
      if (col.tasks.length > 8) lines.push(`- … ${col.tasks.length - 8} more`);
    }
  }
  if (options.showNextActionable) {
    const next = columns.flatMap(col => col.tasks.map(task => ({ task, status: col.name }))).find(item => item.task.dependsOn.length === 0);
    lines.push('', '### Next actionable task');
    lines.push(next ? `→ **${next.task.id}** — ${next.task.title} (${next.task.priority ?? 'no priority'}, ${next.status})` : 'None — every task is done, archived, or blocked.');
  }
  return lines.join('\n');
}

const FULL_RULES_PREVIEW = `# Kandown — AI Agent Rules

## Quick CLI Reference

| Command | Description |
|---------|-------------|
| \`kandown work\` | Output agent rules + live board state digest |
| \`kandown list\` | List tasks (\`--status "In Progress"\`, \`--priority P1\`) |
| \`kandown show <id>\` | Display task details & subtasks |
| \`kandown create "<title>"\` | Create new task (\`--priority P1 --assignee user\`) |
| \`kandown move <id> <status>\` | Move task column (e.g. \`kandown move t1 "Done"\`) |
| \`kandown assign <id> <user>\` | Assign task |
| \`kandown commit\` | Commit board changes to git |

---

## The System

Kandown is a file-based Kanban backed by plain markdown. All task state lives in \`tasks/*.md\` at the project root — no separate board index, no database.

\`\`\`
.kandown/             # config, web UI, agent docs
├── kandown.json      # Board columns + project settings
├── kandown.html      # Web UI (single-file bundle)
├── AGENT.md          # AI-agent conventions
└── AGENT_KANDOWN.md  # full reference

tasks/                # source of truth — one .md per task
├── t1.md
├── t2.md
└── archive/          # archived tasks (.md files moved here)
    └── t99.md
\`\`\`

**Board columns** are configured in \`kandown.json\` at \`board.columns\`. Tasks without a \`status\` go to **Backlog**.

---

## Critical: Real-Time Task Updates

⚠️ **ALWAYS keep task files up to date as you work.** This is not optional — it lets the user see exactly what you're doing, what was decided, and what's left.

When you make progress:
1. Check off completed subtasks: \`- [ ]\` → \`- [x]\`
2. Add a \`report:\` under each done subtask with what changed
3. Move the task to the appropriate column by updating \`status:\` in frontmatter
4. Write a completion \`report:\` in frontmatter when the task is done

---

## Task Lifecycle

### Start working on a task
Update the task frontmatter: \`status: In Progress\`

### While working — UPDATE THE TASK FILE AS YOU GO

Every time you make progress — writing code, making a decision, discovering something — update the task file immediately. Do not wait until the task is done.

For each subtask you complete:
1. Check it off: \`- [ ]\` → \`- [x]\`
2. Add a \`report:\` line under it with what changed

### Complete a task

When the task is done:
1. Set \`status: Done\` in the frontmatter
2. Write a completion \`report:\` in the frontmatter summarizing:
   - **Changes**: What was created/modified/deleted
   - **Decisions**: Why you chose a particular approach
   - **Files**: List of affected files

---

## Mutation Rules

| Action | File to edit |
|--------|-------------|
| Move task between columns | Task file: update \`status:\` in frontmatter |
| Reorder task | Task file: update \`order:\` in frontmatter |
| Change title/priority/tags/assignee | Task file frontmatter |
| Edit description/notes/subtasks | Task file body only |
| Create task | Create one new \`tasks/t-NNN.md\` |
| Delete task | Delete the task file |
| Create/rename/delete columns | \`.kandown/kandown.json\` at \`board.columns\` |

**One task file = one source of truth.** Never maintain a separate board index.`;

const OPTIMIZED_RULES_PREVIEW = `# Kandown agent rules

## CLI Commands
- \`kandown list\` (list tasks) · \`kandown show <id>\` (view task)
- \`kandown create "<title>"\` (create task) · \`kandown move <id> <status>\` (move task column)
- \`kandown assign <id> <user>\` · \`kandown commit\` (commit board to git)

## Rules
- Task state lives in project-root \`tasks/*.md\`; do not maintain a separate board index.
- Before work, read the relevant task file and keep it updated while you progress.
- Move tasks by editing frontmatter \`status:\`; complete work by setting \`status: Done\` and adding a markdown \`report:\` summary.
- Update subtasks in-place: \`- [ ]\` → \`- [x]\`, with a short \`report:\` line for meaningful progress.
- Board columns live in \`.kandown/kandown.json\` under \`board.columns\`; project instructions live in \`.kandown/instructions.md\`.
- Never put Kandown task data inside \`.kandown/\`; tasks belong in \`./tasks/\`.`;

const CAVEMAN_RULES_PREVIEW = `# Kandown agent rules

CLI: kandown list | kandown show <id> | kandown create "<title>" | kandown move <id> <status> | kandown assign <id> <user> | kandown commit
RULES: TASKS IN ./tasks/*.md. READ TASK BEFORE WORK. UPDATE SUBTASKS - [ ] -> - [x] + REPORT. MOVE: EDIT status:. DONE: status: Done + report:.`;

function getBaseRulesPreview(mode: string): string {
  if (mode === 'caveman') return CAVEMAN_RULES_PREVIEW;
  if (mode === 'optimized' || mode === 'concise') return OPTIMIZED_RULES_PREVIEW;
  return FULL_RULES_PREVIEW;
}

interface PreviewBlockSection {
  id: 'baseRules' | 'projectInstructions' | 'boardDigest' | 'rawTemplate';
  subId?: 'columnCounts' | 'taskList' | 'nextActionable';
  label: string;
  content: string;
}

function renderWorkPreviewBlocks(
  config: WorkOutputConfig,
  projectInstructions: string,
  columns: { name: string; tasks: BoardTask[] }[]
): PreviewBlockSection[] {
  const rules = getBaseRulesPreview(config.baseRulesMode);
  const instrContent = projectInstructions.trim()
    ? `## Project-specific instructions\n\n${projectInstructions.trim()}`
    : `## Project-specific instructions\n\n*(No custom project instructions defined yet in .kandown/instructions.md)*`;

  if (config.mode === 'raw') {
    const rawText = config.rawTemplate
      .replaceAll('{{baseRules}}', rules)
      .replaceAll('{{projectInstructions}}', instrContent)
      .replaceAll('{{boardDigest}}', buildDigestPreview(columns, config.boardDigest))
      .trim();

    return [
      {
        id: 'rawTemplate',
        label: 'Raw Template Output',
        content: rawText,
      },
    ];
  }

  const result: PreviewBlockSection[] = [];

  for (const section of config.sectionOrder) {
    if (section === 'baseRules' && config.includeBaseRules) {
      result.push({
        id: 'baseRules',
        label: 'Base Kandown Rules',
        content: rules,
      });
    }
    if (section === 'projectInstructions' && config.includeProjectInstructions) {
      result.push({
        id: 'projectInstructions',
        label: 'Project Instructions (.kandown/instructions.md)',
        content: instrContent,
      });
    }
    if (section === 'boardDigest' && config.includeBoardDigest) {
      result.push({
        id: 'boardDigest',
        label: 'Live Board Digest',
        content: buildDigestPreview(columns, config.boardDigest),
      });
    }
  }

  return result;
}

function renderWorkPreview(config: WorkOutputConfig, projectInstructions: string, columns: { name: string; tasks: BoardTask[] }[]): string {
  return renderWorkPreviewBlocks(config, projectInstructions, columns)
    .map(b => b.content)
    .join('\n\n---\n\n');
}

const COLOR_THEMES: Record<string, { border: string; bg: string; badge: string; text: string }> = {
  baseRules: {
    border: 'border-emerald-500/80',
    bg: 'bg-emerald-500/10',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    text: 'text-emerald-200',
  },
  projectInstructions: {
    border: 'border-amber-500/80',
    bg: 'bg-amber-500/10',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    text: 'text-amber-200',
  },
  boardDigest: {
    border: 'border-sky-500/80',
    bg: 'bg-sky-500/10',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    text: 'text-sky-200',
  },
  columnCounts: {
    border: 'border-indigo-500/80',
    bg: 'bg-indigo-500/10',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    text: 'text-indigo-200',
  },
  taskList: {
    border: 'border-purple-500/80',
    bg: 'bg-purple-500/10',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    text: 'text-purple-200',
  },
  nextActionable: {
    border: 'border-rose-500/80',
    bg: 'bg-rose-500/10',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    text: 'text-rose-200',
  },
  rawTemplate: {
    border: 'border-cyan-500/80',
    bg: 'bg-cyan-500/10',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    text: 'text-cyan-200',
  },
};

interface WorkOutputConfiguratorProps {
  config: KandownConfig;
  columns: { name: string; tasks: BoardTask[] }[];
  dirHandle: FileSystemDirectoryHandle | null;
  onChange: (next: WorkOutputConfig) => void;
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', durationMs?: number) => void;
  agentSettings: SettingDef[];
  getConfigValue: (key: string) => unknown;
  handleChange: (setting: SettingDef, newValue: unknown) => void;
  notificationPermission: BrowserNotificationPermission;
  onRequestNotificationPermission: () => void;
}

export function WorkOutputConfigurator({
  config,
  columns,
  dirHandle,
  onChange,
  toast,
  agentSettings,
  getConfigValue,
  handleChange,
  notificationPermission,
  onRequestNotificationPermission,
}: WorkOutputConfiguratorProps) {
  const workOutput = { ...DEFAULT_WORK_OUTPUT, ...config.agent.workOutput, boardDigest: { ...DEFAULT_WORK_OUTPUT.boardDigest, ...config.agent.workOutput?.boardDigest } };
  const [instructions, setInstructions] = useState('');
  const [savedInstructions, setSavedInstructions] = useState('');
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  // Load instructions & watch file changes in real-time
  useEffect(() => {
    let cancelled = false;
    setLoadingInstructions(true);

    const loadInst = () => {
      readProjectInstructions(dirHandle)
        .then(text => {
          if (cancelled) return;
          setInstructions(text);
          setSavedInstructions(text);
        })
        .catch(e => toast(`Failed to load .kandown/instructions.md: ${(e as Error).message}`, 'error'))
        .finally(() => {
          if (!cancelled) setLoadingInstructions(false);
        });
    };

    loadInst();

    const unbindConfig = fileWatcher.on('configChanged', () => {
      loadInst();
    });

    const unbindTask = fileWatcher.on('taskChanged', () => {
      // Board digest updates automatically via store columns prop
    });

    return () => {
      cancelled = true;
      unbindConfig();
      unbindTask();
    };
  }, [dirHandle, toast]);

  const previewBlocks = renderWorkPreviewBlocks(workOutput, instructions, columns);
  const preview = renderWorkPreview(workOutput, instructions, columns);
  const estimatedTokens = estimateTokenCount(preview) + (workOutput.baseRulesMode === 'full' && workOutput.includeBaseRules ? 1100 : 0);

  const patch = (partial: Partial<WorkOutputConfig>) => {
    try {
      onChange({ ...workOutput, ...partial });
    } catch (e) {
      toast(`Failed to update setting: ${(e as Error).message}`, 'error');
    }
  };

  const patchDigest = (partial: Partial<WorkOutputConfig['boardDigest']>) => {
    try {
      onChange({
        ...workOutput,
        boardDigest: { ...workOutput.boardDigest, ...partial },
      });
    } catch (e) {
      toast(`Failed to update digest setting: ${(e as Error).message}`, 'error');
    }
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    try {
      await writeProjectInstructions(dirHandle, instructions);
      setSavedInstructions(instructions);
      toast('Saved .kandown/instructions.md', 'success');
    } catch (e) {
      toast(`Failed to save instructions: ${(e as Error).message}`, 'error');
    } finally {
      setSavingInstructions(false);
    }
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(preview).then(() => {
      setCopied(true);
      toast('Copied kandown work output to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      toast(`Failed to copy: ${(err as Error).message}`, 'error');
    });
  };

  const isInstructionsDirty = instructions !== savedInstructions;

  return (
    <div className="grid gap-6 lg:grid-cols-12 items-start">
      {/* Left Column: Options & Controls */}
      <div className="lg:col-span-7 flex flex-col gap-4">

        {/* Intro Overview Card */}
        <div className="relative overflow-hidden rounded-xl border border-border/80 bg-bg-1/90 p-5 shadow-sm backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconTerminal2 size={22} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-fg">Agent instructions (<code className="text-primary font-mono text-[13px]">kandown work</code>)</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
                When an AI agent runs <code className="text-primary font-mono">kandown work</code> in your terminal, Kandown combines 3 layers of context into a single prompt:
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3 text-[12px] font-medium">
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">1</span>
              <span>🟢 Base Rules</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-400">2</span>
              <span>🟡 Project Notes</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sky-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-[11px] font-bold text-sky-400">3</span>
              <span>🔵 Live Board</span>
            </div>
          </div>
        </div>

        {/* STEP 1: Base Rules */}
        <div
          onMouseEnter={() => setHoveredSection('baseRules')}
          onMouseLeave={() => setHoveredSection(null)}
          className={`rounded-xl border bg-bg-1/90 p-5 transition-all duration-300 backdrop-blur ${
            hoveredSection === 'baseRules'
              ? 'border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/5'
              : 'border-border/80 hover:border-border-focus'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[12px] font-bold text-white shadow-md shadow-emerald-500/20">1</span>
              <div>
                <h4 className="text-[14.5px] font-bold text-fg">Step 1: Base Rules</h4>
                <p className="text-[12px] text-fg-muted">How Kandown task management works for agents</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted cursor-pointer hover:text-fg">
              <input
                type="checkbox"
                checked={workOutput.includeBaseRules}
                onChange={e => patch({ includeBaseRules: e.target.checked })}
                className="h-4 w-4 rounded accent-emerald-500"
              />
              <span>Include</span>
            </label>
          </div>

          {workOutput.includeBaseRules && (
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-faint">Rule style & density</span>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {[
                  { value: 'verbose', label: 'Verbose 📜', badge: '~1100 tokens', desc: 'Full reference guide' },
                  { value: 'optimized', label: 'Optimized ⚡', badge: 'Recommended', desc: 'Concise LLM rules' },
                  { value: 'caveman', label: 'Caveman 🦍', badge: '~40 tokens', desc: 'Minimal token rules' },
                ].map(item => {
                  const active =
                    workOutput.baseRulesMode === item.value ||
                    (item.value === 'verbose' && workOutput.baseRulesMode === 'full') ||
                    (item.value === 'optimized' && workOutput.baseRulesMode === 'concise');
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onMouseEnter={() => setHoveredSection('baseRules')}
                      onClick={() => patch({ baseRulesMode: item.value as WorkOutputBaseRulesMode })}
                      className={`relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all duration-200 ${
                        active
                          ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-300 font-semibold shadow-md ring-1 ring-emerald-500/40'
                          : 'border-border/80 bg-bg-2/80 text-fg-dim hover:bg-bg-3 hover:text-fg'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[13px] font-bold">{item.label}</span>
                        {item.badge === 'Recommended' ? (
                          <span className="rounded-full bg-emerald-500/30 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-300">
                            ★ Recommended
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-fg-faint">{item.badge}</span>
                        )}
                      </div>
                      <p className="text-[11px] leading-snug text-fg-muted">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* STEP 2: Project Instructions (.kandown/instructions.md) */}
        <div
          onMouseEnter={() => setHoveredSection('projectInstructions')}
          onMouseLeave={() => setHoveredSection(null)}
          className={`rounded-xl border bg-bg-1/90 p-5 transition-all duration-300 backdrop-blur ${
            hoveredSection === 'projectInstructions'
              ? 'border-amber-500/80 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/5'
              : 'border-border/80 hover:border-border-focus'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-[12px] font-bold text-white shadow-md shadow-amber-500/20">2</span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-[14.5px] font-bold text-fg">Step 2: Project Guidelines</h4>
                  {isInstructionsDirty && (
                    <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10.5px] font-bold text-amber-400">
                      Unsaved changes
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-fg-muted">Custom rules stored in <code className="font-mono text-amber-400/90">.kandown/instructions.md</code></p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted cursor-pointer hover:text-fg">
              <input
                type="checkbox"
                checked={workOutput.includeProjectInstructions}
                onChange={e => patch({ includeProjectInstructions: e.target.checked })}
                className="h-4 w-4 rounded accent-amber-500"
              />
              <span>Include</span>
            </label>
          </div>

          {workOutput.includeProjectInstructions && (
            <div className="mt-4 flex flex-col gap-3">
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    void saveInstructions();
                  }
                }}
                disabled={loadingInstructions}
                placeholder="e.g. Always use pnpm. Write commit messages in English. Run pnpm test before moving tasks to Done..."
                className="min-h-[140px] w-full resize-y rounded-lg border border-border/80 bg-bg-2/90 px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed text-fg outline-none placeholder:text-fg-faint focus:border-amber-500/80 focus:ring-2 focus:ring-amber-500/20 transition-all"
              />

              {/* Quick Preset Rule Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-fg-faint flex items-center gap-1 mr-1">
                  <IconSparkles size={13} className="text-amber-400" /> Quick add:
                </span>
                {[
                  { label: '📦 pnpm', text: 'Use pnpm as the default package manager.' },
                  { label: '🧪 Test rule', text: 'Run pnpm test before marking any task Done.' },
                  { label: '🌳 Git rule', text: 'Write commit messages in English using imperative mood.' },
                  { label: '⚡ Task log', text: 'Update subtasks - [ ] -> - [x] with report: lines in real time.' },
                ].map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      const trimmed = instructions.trim();
                      const nextText = trimmed ? `${trimmed}\n- ${chip.text}` : `- ${chip.text}`;
                      setInstructions(nextText);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition-all hover:bg-amber-500/20 hover:scale-[1.02] active:scale-95"
                  >
                    <IconPlus size={11} />
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-fg-faint">Press <kbd className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">⌘S</kbd> to save</span>
                <button
                  type="button"
                  onClick={saveInstructions}
                  disabled={savingInstructions || !isInstructionsDirty}
                  className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[12.5px] font-bold transition-all ${
                    isInstructionsDirty
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 shadow-md shadow-amber-500/10 active:scale-95'
                      : 'border-border/60 bg-bg-2 text-fg-faint disabled:cursor-default'
                  }`}
                >
                  {savingInstructions ? 'Saving…' : isInstructionsDirty ? 'Save changes' : 'Saved ✓'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* STEP 3: Live Board Digest */}
        <div
          onMouseEnter={() => setHoveredSection('boardDigest')}
          onMouseLeave={() => setHoveredSection(null)}
          className={`rounded-xl border bg-bg-1/90 p-5 transition-all duration-300 backdrop-blur ${
            hoveredSection === 'boardDigest' || ['columnCounts', 'taskList', 'nextActionable'].includes(hoveredSection ?? '')
              ? 'border-sky-500/80 ring-2 ring-sky-500/20 shadow-lg shadow-sky-500/5'
              : 'border-border/80 hover:border-border-focus'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-[12px] font-bold text-white shadow-md shadow-sky-500/20">3</span>
              <div>
                <h4 className="text-[14.5px] font-bold text-fg">Step 3: Live Board State</h4>
                <p className="text-[12px] text-fg-muted">Real-time columns, task list, and next actionable task pick</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted cursor-pointer hover:text-fg">
              <input
                type="checkbox"
                checked={workOutput.includeBoardDigest}
                onChange={e => patch({ includeBoardDigest: e.target.checked })}
                className="h-4 w-4 rounded accent-sky-500"
              />
              <span>Include</span>
            </label>
          </div>

          {workOutput.includeBoardDigest && (
            <div className="mt-4 rounded-lg border border-border/80 bg-bg-2/80 p-3.5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-sky-400/90">Details included in board state</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ['showColumnCounts', 'Column counts', 'columnCounts'],
                  ['showTasks', 'Task list per column', 'taskList'],
                  ['showPriority', 'Priority labels (P1–P4)', 'taskList'],
                  ['showAssignee', 'Assignees (@user)', 'taskList'],
                  ['showBlockedBy', 'Blocked-by dependencies', 'taskList'],
                  ['showNextActionable', 'Next actionable task pick', 'nextActionable'],
                ].map(([key, label, sectionKey]) => (
                  <label
                    key={key}
                    onMouseEnter={() => setHoveredSection(sectionKey)}
                    onMouseLeave={() => setHoveredSection('boardDigest')}
                    className={`flex items-center justify-between gap-3 text-[12.5px] cursor-pointer rounded-lg px-2.5 py-1.5 transition-all ${
                      hoveredSection === sectionKey ? 'bg-sky-500/20 text-sky-200 font-semibold' : 'text-fg-dim hover:text-fg hover:bg-bg-3/60'
                    }`}
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(workOutput.boardDigest[key as keyof WorkOutputConfig['boardDigest']])}
                      onChange={e => patchDigest({ [key]: e.target.checked } as Partial<WorkOutputConfig['boardDigest']>)}
                      className="h-4 w-4 rounded accent-sky-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Advanced Options */}
        <details className="group rounded-xl border border-border/80 bg-bg-1/90 backdrop-blur">
          <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-[13px] font-bold text-fg-dim transition-colors hover:text-fg">
            <span>⚙️ Advanced options (Custom template & CLI settings)</span>
            <span className="text-[11px] text-fg-faint group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="border-t border-border/80 p-5 space-y-4">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg-faint">Output Mode</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[{ value: 'blocks', label: 'Structured Blocks' }, { value: 'raw', label: 'Raw Custom Template' }].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => patch({ mode: option.value as WorkOutputConfig['mode'] })}
                    className={`rounded-lg border px-3.5 py-2 text-left text-[12.5px] font-semibold transition-colors ${
                      workOutput.mode === option.value
                        ? 'border-border-focus bg-bg-3 text-fg shadow-sm'
                        : 'border-border/80 bg-bg-2 text-fg-dim hover:bg-bg-3 hover:text-fg'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {workOutput.mode === 'raw' && (
              <div
                onMouseEnter={() => setHoveredSection('rawTemplate')}
                onMouseLeave={() => setHoveredSection(null)}
                className={`rounded-xl border bg-bg-1 p-3.5 transition-all duration-200 ${
                  hoveredSection === 'rawTemplate'
                    ? 'border-cyan-500/80 ring-2 ring-cyan-500/20 shadow-md'
                    : 'border-border/80'
                }`}
              >
                <h4 className="mb-1 text-[13px] font-bold text-fg">Raw template string</h4>
                <textarea
                  value={workOutput.rawTemplate}
                  onChange={e => patch({ rawTemplate: e.target.value })}
                  className="min-h-[120px] w-full resize-y rounded-lg border border-border/80 bg-bg-2 px-3 py-2 font-mono text-[12px] leading-relaxed text-fg outline-none focus:border-border-focus"
                />
                <span className="mt-1 block text-[11px] text-fg-muted">Variables: <code>{'{{baseRules}}'}</code>, <code>{'{{projectInstructions}}'}</code>, <code>{'{{boardDigest}}'}</code></span>
              </div>
            )}

            {agentSettings.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg-faint">Follow-Up & CLI Suggestions</div>
                <div className="rounded-lg border border-border/80 bg-bg-2 overflow-hidden">
                  {agentSettings.map((setting, index) => (
                    <SettingRow
                      key={setting.key}
                      setting={setting}
                      value={getConfigValue(setting.key)}
                      showSection={false}
                      isLast={index === agentSettings.length - 1}
                      onChange={(newValue) => handleChange(setting, newValue)}
                      nested={Boolean(setting.parentKey)}
                      notificationPermission={notificationPermission}
                      onRequestNotificationPermission={onRequestNotificationPermission}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>

      </div>

      {/* Right Column: Live Output Terminal-style Preview Panel */}
      <div className="lg:col-span-5 lg:sticky lg:top-4 lg:h-[calc(100vh-140px)] flex flex-col">
        <div className="flex flex-col flex-1 overflow-hidden rounded-xl border border-border/80 bg-bg-1/90 shadow-xl backdrop-blur">
          {/* Terminal Panel Header */}
          <div className="flex flex-none flex-col border-b border-border/80 bg-bg-2/90 px-4 py-3 gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-mono text-[12.5px] font-bold text-fg flex items-center gap-1.5">
                  <IconRobot size={16} className="text-primary" /> kandown work
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-bg-3/90 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fg-dim border border-border/50">
                  ~{estimatedTokens} tokens
                </span>
                <button
                  type="button"
                  onClick={handleCopyPreview}
                  className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-bg-1 px-2.5 py-1 text-[12px] font-bold text-fg transition-all hover:bg-bg-3 active:scale-95 shadow-sm"
                  title="Copy markdown prompt context"
                >
                  {copied ? <IconCheck size={14} className="text-success" /> : <IconCopy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            {/* Visual Layer Badges Legend */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-medium pt-1.5 border-t border-border/40">
              <span className="text-fg-faint font-semibold">Layers:</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300 border border-emerald-500/30 font-semibold">🟢 Step 1: Base Rules</span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300 border border-amber-500/30 font-semibold">🟡 Step 2: Project Notes</span>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-300 border border-sky-500/30 font-semibold">🔵 Step 3: Live Board</span>
            </div>
          </div>

          {/* Panel Output Display with Block Highlights */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-bg-2/90 p-3.5 space-y-3 font-mono text-[11.5px] leading-relaxed text-fg selection:bg-primary/20 selection:text-fg">
            {previewBlocks.length === 0 ? (
              <div className="p-6 text-center text-[12.5px] text-fg-faint italic">
                (No section included in output)
              </div>
            ) : (
              previewBlocks.map((block, idx) => {
                const isHovered =
                  hoveredSection === block.id ||
                  (hoveredSection && block.id === 'boardDigest' && ['columnCounts', 'taskList', 'nextActionable'].includes(hoveredSection));
                const activeHoverKey = isHovered ? (hoveredSection ?? block.id) : block.id;
                const theme = COLOR_THEMES[activeHoverKey] ?? COLOR_THEMES.baseRules;

                return (
                  <div
                    key={block.id + idx}
                    onMouseEnter={() => setHoveredSection(block.id)}
                    onMouseLeave={() => setHoveredSection(null)}
                    className={`relative rounded-lg border p-3.5 transition-all duration-300 ${
                      isHovered
                        ? `border-l-4 ${theme.border} ${theme.bg} shadow-lg shadow-black/20`
                        : 'border-transparent hover:bg-bg-3/50'
                    }`}
                  >
                    {isHovered && (
                      <div className="mb-2 flex items-center justify-between border-b border-border/40 pb-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold tracking-wide ${theme.badge}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          {block.label}
                        </span>
                        <span className="text-[10px] font-bold text-fg-faint uppercase font-mono tracking-wider">✦ Section highlighted</span>
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed">
                      {block.content}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
