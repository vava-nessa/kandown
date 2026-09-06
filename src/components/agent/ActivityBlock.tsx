/**
 * @file One activity area per assistant turn, on the shared BeautifulUI parts
 * @description Every assistant turn gets one activity area that updates in
 * place while the turn streams: the reasoning channel renders through the
 * official bui ThinkingState (Reasoning-style prose trace, shimmer header
 * while live, single-line ticker in the collapsed header, auto-collapse on
 * settle) and the tool calls render through the official bui ToolChips
 * (rows appear as they come, the settled header carries the
 * "N tools, X failed" counter). Both components are fed from the event fold
 * (agent-chat-events.ts) at render time: the grouping happens here, the fold
 * stays untouched.
 *
 * 📖 Round 7: replaces the hand-rolled BeautifulUI-restyled panel of rounds
 * 5/6 with the shared src/components/bui copies, driven by their new
 * external-mode props. Round 9: while the turn streams, the live signal is
 * the official 01 Loading State with its animation rotating per turn
 * (Drive/Dots/Orbit) plus the thinking tail ticking beside it; once the turn
 * settles, the collapsed reasoning trace and tool chips take over. Visual
 * patterns from BeautifulUI, https://www.beautifului.dev (MIT).
 *
 * @functions
 *  → toolIcon: maps a fold tool name onto a ToolChips icon key
 *  → toolSteps: builds the ToolChips rows from the fold's tool entries
 *  → thinkingRows: splits the reasoning text into trace lines
 *  → ActivityBlock: the thinking trace + tool chips of one turn
 *
 * @exports ActivityBlock
 * @see src/lib/agent-chat-events.ts: ChatAssistantEntry, the fold output
 * @see src/components/bui/ThinkingState.tsx
 * @see src/components/bui/ToolChips.tsx
 * @see src/components/agent/MessageList.tsx
 */

import { useTranslation } from 'react-i18next';
import type { ToolStep } from '../bui/ToolChips';
import ThinkingState from '../bui/ThinkingState';
import ToolChips from '../bui/ToolChips';
import LoadingState from '../bui/LoadingState';
import { toolExcerpt } from '../../lib/agent-chat-events';
import type { ChatAssistantEntry, ChatToolEntry } from '../../lib/agent-chat-events';

/** 📖 Icon mapping from the brief: write/edit tools write, bash/command run,
 * read/grep read, everything else thinks. Matched case-insensitively on
 * word boundaries so "web_fetch" still reads as a read. */
function toolIcon(toolName: string): ToolStep['icon'] {
  const name = toolName.toLowerCase();
  if (/(^|[^a-z])(write|edit|create|patch|apply)([^a-z]|$)/.test(name)) return 'write';
  if (/(^|[^a-z])(bash|command|run|exec|shell)([^a-z]|$)/.test(name)) return 'run';
  if (/(^|[^a-z])(read|grep|glob|find|list|search|fetch)([^a-z]|$)/.test(name)) return 'read';
  return 'think';
}

/** 📖 Detail lines of one tool row: the fold's summary split into its lines
 * (capped, so a chatty command output cannot blow the row open). Lines that
 * already carry a leading + keep the green "add" tint of the diff language. */
function toolDetailLines(tool: ChatToolEntry): ToolStep['detail'] {
  return (tool.summary ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map(text => ({ text, tone: text.startsWith('+') ? ('add' as const) : undefined }));
}

/** 📖 One ToolChips row per fold tool entry: the tool name is the row label,
 * the one-line excerpt (toolExcerpt) is the chip, and the summary lines are
 * the expandable detail. Rows key on the toolCallId so repeated tool names
 * never collide. */
function toolSteps(tools: ChatToolEntry[]): ToolStep[] {
  return tools.map((tool, index) => {
    const icon = toolIcon(tool.toolName);
    return {
      id: tool.toolCallId ?? `${tool.toolName}-${index}`,
      icon,
      label: tool.toolName,
      chip: toolExcerpt(tool) || tool.toolName,
      mono: icon !== 'think',
      detailMono: true,
      detail: toolDetailLines(tool),
    };
  });
}

/** 📖 Reasoning trace rows: the thinking text split into its non-empty lines
 * (latest kept, capped so a runaway channel cannot grow the trace forever). */
function thinkingRows(thinking: string): string[] {
  const rows = thinking.split('\n').map(line => line.trim()).filter(Boolean);
  return rows.slice(-20);
}

/** 📖 The single-line tail ticked in the live header. Cut at a word boundary:
 * a mid-word slice ("roceeding with...") reads like a rendering bug. */
function tickerTail(thinking: string): string {
  const flat = thinking.replace(/\s+/g, ' ').trim();
  if (flat.length <= 110) return flat;
  const tail = flat.slice(-110);
  const cut = tail.indexOf(' ');
  return `... ${cut > 0 ? tail.slice(cut + 1) : tail}`;
}

/** 📖 The 01 Loading State animation rotates per turn (Drive, Dots, Orbit:
 * the Surfer variant loads a remote video and stays gallery-only), so two
 * consecutive turns do not repeat the same motion (vava, round 9). */
export const LOADER_VARIANTS = ['Drive', 'Dots', 'Orbit'] as const;

function loaderVariant(entryId: string): string {
  let hash = 0;
  for (const ch of entryId) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return LOADER_VARIANTS[hash % LOADER_VARIANTS.length];
}

interface ActivityBlockProps {
  entry: ChatAssistantEntry;
}

export function ActivityBlock({ entry }: ActivityBlockProps) {
  const { t } = useTranslation();

  const { thinking, thinkingActive, tools } = entry;
  if (thinking.length === 0 && tools.length === 0 && !thinkingActive) return null;

  const runningTools = tools.filter(tool => !tool.finished).length;
  const failedTools = tools.filter(tool => tool.ok === false).length;
  const okTools = tools.length - runningTools - failedTools;
  const toolsLive = runningTools > 0;
  const header = toolsLive
    ? t('agentChat.toolsSummaryRunning', '{{total}} tools: {{ok}} ok, {{running}} running', { total: tools.length, ok: okTools, running: runningTools })
    : t('agentChat.toolsSummary', '{{total}} tools: {{ok}} ok, {{failed}} failed', { total: tools.length, ok: okTools, failed: failedTools });

  return (
    <div className="mb-1.5 min-w-0">
      {/* 📖 Live phase: the official 01 Loading State carries the "what is the
       * agent doing right now" signal, with the animation rotating per turn
       * and the thinking tail ticking beside it (vava, round 9: the static
       * sparkle read as black on black and the shimmer label never showed).
       * The reasoning trace stays one click away in the settled block below. */}
      {entry.streaming ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <LoadingState
            variant={loaderVariant(entry.id)}
            label={thinkingActive
              ? t('agentChat.thinking', 'Thinking')
              : t('agentChat.working', 'Working...')}
          />
          {thinking.length > 0 && (
            <span className="min-w-0 truncate text-[12px] text-ink-3">{tickerTail(thinking)}</span>
          )}
        </div>
      ) : (
        (thinking.length > 0) && (
          <ThinkingState
            variant="Reasoning"
            rows={thinkingRows(thinking)}
            live={false}
            activeLabel={t('agentChat.thinking', 'Thinking')}
            doneLabel={t('agentChat.thinkingDone', 'Finished thinking')}
          />
        )
      )}
      {/* 📖 Official BeautifulUI 05 Tool Chips (external mode): rows appear
       * as they come while live; settled turns show the failed counter in
       * the header. The block starts collapsed so a streaming turn stays
       * calm: the counter says what happened, the trace is one click away.
       * The demo diff chips section stays out of the chat. */}
      {tools.length > 0 && (
        <ToolChips
          steps={toolSteps(tools)}
          diffs={[]}
          diffLines={{}}
          labels={{ header }}
          live={toolsLive}
          defaultOpen={false}
          demoMinHeight={false}
          className="mt-1"
        />
      )}
    </div>
  );
}
