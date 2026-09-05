/**
 * @file Prompt bar for the agent chat sidebar (round 7: official BUI shell)
 * @description The agent chat composer, rebuilt ON the official BeautifulUI
 * PromptBar (src/components/bui/PromptBar.tsx, beautifului.dev, MIT) in its
 * external mode (demo={false}): the BUI component owns the exact visual
 * structure (rounded composer, auto-sizing textarea, @ / slash menus with the
 * gliding highlight, model menu, control row with send/stop squares), while
 * this wrapper owns every kandown behavior:
 *
 *  → caret-tracked @task mentions and /skill tokens through chat-mentions.ts,
 *    fed to the BUI menus as already-filtered rows (tasks cap at 8, the whole
 *    board in pick-task mode); picking an @row commits "@<id> " (done by the
 *    BUI component), picking a /row removes the token and launches the skill
 *    through the same handler the pill buttons use;
 *  → the pick-a-task flow for a task-scoped skill launched without a task
 *    context (menuOverride keeps the menu open until a task is picked or Esc
 *    dismisses);
 *  → send semantics: @mentions are extracted and forwarded as structured ids
 *    so the daemon can inline the integral task files; the visible text is
 *    never rewritten; Enter sends, Shift+Enter inserts a newline; while a
 *    turn is live the send square becomes the stop square;
 *  → the Steer/Queue delivery control for interactive harnesses rides the
 *    BUI control row (leftSlot) and the choice travels on send ('steer'
 *    delivers into the live turn, 'queue' after it);
 *  → the model menu is wired to ChatSidebar's per-harness persisted model
 *    state (empty key = harness default);
 *  → the slim toolbar row inside the composer carries the harness/permission
 *    cluster for the NEXT new conversation;
 *  → lazy session start stays in ChatSidebar: the first send on a sessionless
 *    sidebar starts one.
 *
 * 📖 Round 4/5 behaviors preserved verbatim; round 7 only swaps the rendering
 * shell for the official component. Attachments and dictation are demo-only
 * BUI features and stay out of kandown.
 *
 * @functions
 *  → PromptBar: the official BUI composer wired to kandown behavior
 *
 * @exports PromptBar
 * @see src/components/bui/PromptBar.tsx: the official component (external mode)
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/lib/chat-mentions.ts: the pure token detection this composes
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../lib/store';
import {
  extractMentionedTaskIds,
  findActiveMentionQuery,
  findActiveSlashQuery,
  stripMentionMarkers,
} from '../../lib/chat-mentions';
import { SkillsModal } from './SkillsModal';
import BuiPromptBar, { type PromptBarModel, type PromptBarRow } from '../bui/PromptBar';
import type { ChatSkillButton } from '../../lib/store/types';

interface PromptBarProps {
  disabled: boolean;
  turnActive: boolean;
  sending: boolean;
  /** 📖 Round 4: true when the active session's harness is interactive (pi,
   * ACP). Renders the Steer/Queue control and forwards the choice on send. */
  deliveryEnabled: boolean;
  onSend: (text: string, mentionedTaskIds: string[], delivery?: 'steer' | 'queue') => void;
  onStop: () => void;
  /** Slash-token launches: ChatSidebar wires the same handler the pill
   * buttons use, including the pick-a-task fallback for task-scoped skills. */
  onLaunchSkill: (skill: ChatSkillButton) => void;
  /** 📖 Feature 3: controlled mode asking the user to pick a target task for
   * a task-scoped skill. Rendered as the BUI menu in override mode. */
  pickTaskMode: boolean;
  /** Label of the skill awaiting a task, shown in the pick list heading. */
  pickTaskLabel: string | null;
  /** Called with the picked task id; ChatSidebar then starts the session. */
  onPickTask: (taskId: string) => void;
  /** Esc (or dismiss) out of pick-task mode. */
  onDismissPickTask: () => void;
  /** 📖 Slim control row rendered inside the composer, above the textarea.
   * ChatSidebar mounts the harness/permission cluster here. */
  toolbar?: React.ReactNode;
  /** 📖 Round 7: entries of the BUI model menu (per-harness, Default first). */
  models: PromptBarModel[];
  /** 📖 Round 7: the persisted model pick ("" = harness default). */
  model: string;
  /** 📖 Round 7: forwards a menu pick to ChatSidebar (persists + forwards). */
  onModelChange: (model: string) => void;
}

export function PromptBar({
  disabled,
  turnActive,
  sending,
  deliveryEnabled,
  onSend,
  onStop,
  onLaunchSkill,
  pickTaskMode,
  pickTaskLabel,
  onPickTask,
  onDismissPickTask,
  toolbar,
  models,
  model,
  onModelChange,
}: PromptBarProps) {
  const { t } = useTranslation();
  // 📖 The caret participates in the trigger detection, so it is tracked on
  // every change (and selection move, reported back by the BUI component).
  const [value, setValue] = useState('');
  const [caret, setCaret] = useState(0);
  // 📖 Round 4 delivery mode for interactive harnesses. Queue is the default:
  // never interrupting a running turn is the safe choice; steering is a
  // deliberate opt-in.
  const [delivery, setDelivery] = useState<'steer' | 'queue'>('queue');
  const [skillsOpen, setSkillsOpen] = useState(false);

  const columns = useStore(s => s.columns);
  const chatSkills = useStore(s => s.agentChat.chatSkills);

  // 📖 Flat board tasks for the mention and pick-task menus (id + title is
  // all the rows need).
  const boardTasks = useMemo(() => columns.flatMap(column => column.tasks), [columns]);

  const mentionQuery = useMemo(
    () => (pickTaskMode ? null : findActiveMentionQuery(value, caret)),
    [value, caret, pickTaskMode],
  );
  const slashQuery = useMemo(
    () => (pickTaskMode ? null : findActiveSlashQuery(value, caret)),
    [value, caret, pickTaskMode],
  );

  // 📖 Case-insensitive filter over id or title, capped so a 300-task board
  // cannot render 300 rows (pick-task mode gets a taller cap because it lists
  // the whole board with the draft as an optional filter).
  const filterTasks = useCallback((needle: string, cap: number) => {
    const query = needle.toLowerCase();
    const matches: Array<{ id: string; title: string }> = [];
    for (const task of boardTasks) {
      if (query
        && !task.id.toLowerCase().includes(query)
        && !task.title.toLowerCase().includes(query)) continue;
      matches.push({ id: task.id, title: task.title });
      if (matches.length >= cap) break;
    }
    return matches;
  }, [boardTasks]);

  const mentionRows = useMemo<PromptBarRow[]>(
    () => (mentionQuery
      ? filterTasks(mentionQuery.query, 8).map(task => ({
          key: task.id,
          name: task.id,
          desc: task.title,
        }))
      : []),
    [mentionQuery, filterTasks],
  );

  const slashRows = useMemo<PromptBarRow[]>(
    () => (slashQuery
      ? chatSkills.map(skill => ({
          key: skill.skillId,
          name: `/${skill.skillId}`,
          desc: skill.label,
          interactive: skill.interactive,
        }))
      : []),
    [slashQuery, chatSkills],
  );

  const pickRows = useMemo<PromptBarRow[]>(
    () => (pickTaskMode
      ? filterTasks(value.trim(), 50).map(task => ({
          key: task.id,
          name: task.id,
          desc: task.title,
        }))
      : []),
    [pickTaskMode, value, filterTasks],
  );

  // 📖 The @ menu carries either the mention matches or, in pick-task mode,
  // the whole-board list; the / menu carries the skill rows. The BUI
  // component resets its keyboard highlight when the menu or its rows change,
  // which is exactly the round 3 "start from the top on refinement" rule.
  const atRows = pickTaskMode ? pickRows : mentionRows;

  const submit = useCallback((text: string) => {
    // 📖 Mentions stay visible in the message; only the ids travel as data.
    const trimmed = stripMentionMarkers(text.trim());
    if (!trimmed || disabled || sending) return;
    // 📖 The delivery choice only means something on an interactive harness;
    // ChatSidebar keeps the control hidden otherwise, so the param stays
    // undefined there and the runtime keeps its default.
    onSend(trimmed, extractMentionedTaskIds(trimmed), deliveryEnabled ? delivery : undefined);
  }, [disabled, sending, onSend, deliveryEnabled, delivery]);

  const handlePickAt = useCallback((row: PromptBarRow) => {
    // 📖 In pick-task mode a pick launches the parked skill; in mention mode
    // the BUI component already committed "@id " into the draft.
    if (pickTaskMode) onPickTask(row.key);
  }, [pickTaskMode, onPickTask]);

  const handlePickSlash = useCallback((row: PromptBarRow) => {
    const skill = chatSkills.find(entry => entry.skillId === row.key);
    if (!skill) return;
    onLaunchSkill(skill);
  }, [chatSkills, onLaunchSkill]);

  const placeholder = disabled
    ? t('agentChat.daemonGuardTitle', 'Agent chat needs the kandown daemon')
    : t('agentChat.placeholder', 'Ask the agent...');

  const pickHeading = pickTaskMode
    ? t('agentChat.pickTaskTitle', {
        defaultValue: 'Pick the task to run {{skill}} on',
        skill: pickTaskLabel ?? '',
      })
    : undefined;

  return (
    // 📖 Official BeautifulUI 08 PromptBar in external mode: it owns the draft
    // surface, the menus, the model menu and the send/stop squares; kandown
    // semantics ride in through the props below.
    <div className="relative flex-none border-t border-border bg-bg px-2.5 pb-2.5 pt-2">
      <BuiPromptBar
        demo={false}
        value={value}
        onValueChange={(nextValue, nextCaret) => {
          setValue(nextValue);
          setCaret(nextCaret);
        }}
        onCaretChange={setCaret}
        atRows={atRows}
        slashRows={slashRows}
        onPickAt={handlePickAt}
        onPickSlash={handlePickSlash}
        onSend={submit}
        disabled={disabled}
        sendDisabled={sending}
        turnActive={turnActive}
        onStop={onStop}
        onSkillClick={() => setSkillsOpen(true)}
        leftSlot={deliveryEnabled ? (
          <div
            role="group"
            aria-label={t('agentChat.deliveryLabel', 'Follow-up delivery')}
            className="flex items-center rounded-full border border-line bg-surface p-0.5"
          >
            <button
              type="button"
              onClick={() => setDelivery('steer')}
              aria-pressed={delivery === 'steer'}
              title={t('agentChat.deliverySteerTitle', 'Deliver into the live turn (pi: at the next tool-call boundary, ACP agents: immediately)')}
              className={`rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${
                delivery === 'steer' ? 'bg-hover-2 text-ink' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {t('agentChat.deliverySteer', 'Steer')}
            </button>
            <button
              type="button"
              onClick={() => setDelivery('queue')}
              aria-pressed={delivery === 'queue'}
              title={t('agentChat.deliveryQueueTitle', 'Deliver after the current turn completes')}
              className={`rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${
                delivery === 'queue' ? 'bg-hover-2 text-ink' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {t('agentChat.deliveryQueue', 'Queue')}
            </button>
          </div>
        ) : undefined}
        toolbar={toolbar}
        menuHeading={pickHeading}
        menuOverride={pickTaskMode}
        onDismissMenu={pickTaskMode ? onDismissPickTask : undefined}
        placeholder={placeholder}
        models={models}
        model={model}
        onModelChange={onModelChange}
        labels={{
          send: t('agentChat.send', 'Send'),
          stop: t('agentChat.stop', 'Stop'),
          model: t('agentChat.modelTitle', 'Model for new chats, empty uses the harness default'),
          sources: t('agentChat.atMenuButton', 'Browse tasks'),
          skills: t('agentSkills.skillsLabel', 'Skills'),
          atHint: t('agentChat.menuHintAt', 'Type to match tasks'),
          slashHint: t('agentChat.menuHintSlash', 'Type to match skills'),
          interactive: t('agentSkills.interactiveBadge', 'Interactive'),
        }}
      />
      <SkillsModal open={skillsOpen} onClose={() => setSkillsOpen(false)} />
    </div>
  );
}
