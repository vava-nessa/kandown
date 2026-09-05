/**
 * @file Prompt bar for the agent chat sidebar
 * @description BeautifulUI 08 Prompt Bar port, in kandown tokens: one rounded
 * container that holds the whole composer, the auto-sizing textarea on top,
 * the control row under it (delivery choice for interactive harnesses on the
 * left, sparkles + the accent-circle send/stop button on the right) and an
 * optional slim `toolbar` row above the textarea where ChatSidebar mounts the
 * harness/model/permission cluster (they concern the NEXT new conversation).
 * Enter sends, Shift+Enter inserts a newline. While a turn is live the send
 * circle becomes a stop circle; when no session is active the first send
 * starts one (lazily, so "Ask the agent" never kicks off a harness run the
 * user did not ask for); without a daemon the bar is disabled.
 *
 * 📖 Round 4: when the active session runs on an interactive harness (pi, ACP
 * agents), a tiny Steer/Queue segmented control sits inline in the control
 * row and the choice rides along on send as the follow-up's delivery mode
 * ('steer' delivers into the live turn, 'queue' after it). One-shot harnesses
 * hide the control: their follow-ups always resume after the turn.
 *
 * 📖 Round 3 additions, all anchored above the textarea through the shared
 * TaskMentionDropdown: typing `@` opens the task mention picker (ArrowUp/Down
 * move, Enter/Tab select, Esc closes; selecting rewrites the active @token in
 * place), typing `/` opens the chat-skill picker (selecting launches the
 * skill through the same handler the pill buttons use), the sparkles button
 * opens the read-only SkillsModal, and the controlled `pickTaskMode` lets
 * ChatSidebar ask for a target task when a task-scoped skill is launched
 * without a task context. On send, @mentions are extracted and forwarded as
 * structured ids so the daemon can inline the integral task files; the
 * visible text is never rewritten.
 *
 * @functions
 *  → PromptBar: composer with send/stop, mention/skill pickers, toolbar slot
 *    and lazy session start
 *
 * @exports PromptBar
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/lib/chat-mentions.ts: the pure token detection this composes
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconArrowUp, IconPlayerStop, IconSparkles } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import {
  extractMentionedTaskIds,
  findActiveMentionQuery,
  findActiveSlashQuery,
  stripMentionMarkers,
  type MentionQuery,
} from '../../lib/chat-mentions';
import { TaskMentionDropdown, type TaskMentionDropdownItem } from './TaskMentionDropdown';
import { SkillsModal } from './SkillsModal';
import type { ChatSkillButton } from '../../lib/store/types';

/** 📖 How the prompt bar reads the live menu. `kind` decides what selecting a
 * row does; `title` / `emptyLabel` are rendered by TaskMentionDropdown. */
interface PromptMenu {
  kind: 'mention' | 'skill' | 'pickTask';
  items: TaskMentionDropdownItem[];
  title: string | null;
  emptyLabel: string | null;
}

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
   * a task-scoped skill. Rendered instead of the mention/skill menus. */
  pickTaskMode: boolean;
  /** Label of the skill awaiting a task, shown in the pick list heading. */
  pickTaskLabel: string | null;
  /** Called with the picked task id; ChatSidebar then starts the session. */
  onPickTask: (taskId: string) => void;
  /** Esc (or dismiss) out of pick-task mode. */
  onDismissPickTask: () => void;
  /** 📖 Round 5 (BeautifulUI 08): slim control row rendered inside the
   * rounded container, above the textarea. ChatSidebar mounts the
   * harness/model/permission cluster here so the composer carries the
   * conversation controls the way the catalog composer does. */
  toolbar?: ReactNode;
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
}: PromptBarProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  // 📖 The caret participates in the trigger detection, so it is tracked on
  // every change and every selection move (clicks, arrows).
  const [caret, setCaret] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  // 📖 Esc only dismisses until the text changes again: the token is still in
  // the draft, so retyping or moving back into it reopens the menu.
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  // 📖 Round 4 delivery mode for interactive harnesses. Queue is the default:
  // never interrupting a running turn is the safe choice; steering is a
  // deliberate opt-in.
  const [delivery, setDelivery] = useState<'steer' | 'queue'>('queue');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const columns = useStore(s => s.columns);
  const chatSkills = useStore(s => s.agentChat.chatSkills);

  // 📖 Flat board tasks for the mention and pick-task menus (id + title is
  // all the dropdown needs).
  const boardTasks = useMemo(() => columns.flatMap(column => column.tasks), [columns]);

  // 📖 Auto-size: reset height then grow to the scroll height, capped by CSS
  // max-height so long drafts scroll internally instead of eating the sidebar.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

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

  const mentionItems = useMemo<TaskMentionDropdownItem[]>(
    () => (mentionQuery
      ? filterTasks(mentionQuery.query, 8).map(task => ({
          key: task.id,
          mono: `@${task.id}`,
          label: task.title,
        }))
      : []),
    [mentionQuery, filterTasks],
  );

  const skillItems = useMemo<TaskMentionDropdownItem[]>(
    () => (slashQuery
      ? chatSkills.map(skill => ({
          key: skill.skillId,
          mono: `/${skill.skillId}`,
          label: skill.label,
          interactive: skill.interactive,
        }))
      : []),
    [slashQuery, chatSkills],
  );

  const pickItems = useMemo<TaskMentionDropdownItem[]>(
    () => (pickTaskMode
      ? filterTasks(value.trim(), 50).map(task => ({
          key: task.id,
          mono: task.id,
          label: task.title,
        }))
      : []),
    [pickTaskMode, value, filterTasks],
  );

  const menu = useMemo<PromptMenu | null>(() => {
    if (menuDismissed) return null;
    if (pickTaskMode) {
      return {
        kind: 'pickTask',
        items: pickItems,
        title: t('agentChat.pickTaskTitle', {
          defaultValue: 'Pick the task to run {{skill}} on',
          skill: pickTaskLabel ?? '',
        }),
        emptyLabel: t('agentChat.pickTaskEmpty', { defaultValue: 'No tasks on the board yet' }),
      };
    }
    if (mentionQuery && mentionItems.length > 0) {
      return { kind: 'mention', items: mentionItems, title: null, emptyLabel: null };
    }
    if (slashQuery && skillItems.length > 0) {
      return { kind: 'skill', items: skillItems, title: null, emptyLabel: null };
    }
    return null;
  }, [menuDismissed, pickTaskMode, pickItems, pickTaskLabel, t, mentionQuery, mentionItems, slashQuery, skillItems]);

  // 📖 Keyboard highlight resets whenever the row set changes, so a filter
  // refinement always starts from the top and never points at a gone row.
  const menuSignature = menu ? menu.items.map(item => item.key).join('|') : '';
  useEffect(() => {
    setMenuIndex(0);
  }, [menuSignature, menu?.kind]);

  const updateDraft = useCallback((nextValue: string, nextCaret: number) => {
    setValue(nextValue);
    setCaret(nextCaret);
    setMenuDismissed(false);
  }, []);

  /** 📖 Rewrites exactly the active trigger token (`text.slice(tokenStart,
   * caret)`) with `replacement`, then restores the caret after the commit. */
  const replaceActiveToken = useCallback((replacement: string, query: MentionQuery) => {
    const nextValue = value.slice(0, query.tokenStart) + replacement + value.slice(caret);
    const nextCaret = query.tokenStart + replacement.length;
    setValue(nextValue);
    setCaret(nextCaret);
    setMenuDismissed(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) el.setSelectionRange(nextCaret, nextCaret);
    });
  }, [value, caret]);

  const submit = useCallback(() => {
    // 📖 Mentions stay visible in the message; only the ids travel as data.
    const trimmed = stripMentionMarkers(value.trim());
    if (!trimmed || disabled || sending) return;
    // 📖 The delivery choice only means something on an interactive harness;
    // ChatSidebar keeps the control hidden otherwise, so the param stays
    // undefined there and the runtime keeps its default.
    onSend(trimmed, extractMentionedTaskIds(trimmed), deliveryEnabled ? delivery : undefined);
    setValue('');
    setCaret(0);
    setMenuDismissed(false);
  }, [value, disabled, sending, onSend, deliveryEnabled, delivery]);

  const handleMenuSelect = useCallback((index: number) => {
    if (!menu) return;
    const item = menu.items[index];
    if (!item) return;
    if (menu.kind === 'mention' && mentionQuery) {
      // 📖 Selecting completes the token: "@t2" becomes "@t271 " with a
      // trailing space so the menu closes and the next word starts clean.
      replaceActiveToken(`@${item.key} `, mentionQuery);
      return;
    }
    if (menu.kind === 'skill') {
      const skill = chatSkills.find(entry => entry.skillId === item.key);
      if (!skill) return;
      // 📖 The slash token did its job; remove it so the draft stays clean
      // (or empty when the skill launch opens the pick-task prompt next).
      if (slashQuery) replaceActiveToken('', slashQuery);
      onLaunchSkill(skill);
      return;
    }
    if (menu.kind === 'pickTask') {
      onPickTask(item.key);
    }
  }, [menu, mentionQuery, slashQuery, chatSkills, replaceActiveToken, onLaunchSkill, onPickTask]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && menu.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenuIndex(index => (index + 1) % menu.items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenuIndex(index => (index - 1 + menu.items.length) % menu.items.length);
        return;
      }
      // 📖 Enter and Tab both commit the highlighted row; Enter would
      // otherwise send, which is suspended while a menu is open.
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        handleMenuSelect(menuIndex);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (menu.kind === 'pickTask') {
          onDismissPickTask();
        } else {
          setMenuDismissed(true);
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (turnActive) return;
      submit();
    }
  };

  return (
    // 📖 BeautifulUI 08: the composer lives in ONE rounded container. The
    // dropdown menus anchor to this outer wrapper (bottom-full, above it).
    <div className="relative flex-none border-t border-border bg-bg px-2.5 pb-2.5 pt-2">
      {menu && (
        <TaskMentionDropdown
          title={menu.title}
          items={menu.items}
          activeIndex={menuIndex}
          emptyLabel={menu.emptyLabel}
          onSelect={handleMenuSelect}
          onActiveIndexChange={setMenuIndex}
        />
      )}
      <div className="rounded-[14px] border border-border bg-bg-1 transition-colors focus-within:border-border-focus">
        {toolbar && (
          // 📖 Slim context row inside the container: harness for new chats,
          // model pick, permission mode (ChatSidebar's cluster).
          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2">{toolbar}</div>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={e => updateDraft(e.target.value, e.target.selectionStart ?? 0)}
          onSelect={e => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={handleKeyDown}
          placeholder={disabled
            ? t('agentChat.daemonGuardTitle', 'Agent chat needs the kandown daemon')
           : t('agentChat.placeholder', 'Ask the agent...')}
          className="max-h-[140px] w-full resize-none bg-transparent px-2.5 pb-1 pt-2 text-[13.5px] leading-snug text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
        />
        <div className="flex items-center gap-1.5 px-2 pb-2 pt-0.5">
          {/* 📖 Round 4: steer/queue for interactive harnesses, inline in the
           * control row. Queue is default: steer injects into the live turn
           * (pi: next tool-call boundary; ACP: immediately, the agent
           * arbitrates), queue delivers after the turn. The full delivery
           * explanation rides the buttons' title attributes. */}
          {deliveryEnabled && (
            <div
              role="group"
              aria-label={t('agentChat.deliveryLabel', 'Follow-up delivery')}
              className="flex flex-none items-center rounded-full border border-border bg-bg p-0.5"
            >
              <button
                type="button"
                onClick={() => setDelivery('steer')}
                aria-pressed={delivery === 'steer'}
                title={t('agentChat.deliverySteerTitle', 'Deliver into the live turn (pi: at the next tool-call boundary, ACP agents: immediately)')}
                className={`rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${
                  delivery === 'steer' ? 'bg-bg-2 text-fg' : 'text-fg-muted hover:text-fg'
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
                  delivery === 'queue' ? 'bg-bg-2 text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {t('agentChat.deliveryQueue', 'Queue')}
              </button>
            </div>
          )}
          <span className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => setSkillsOpen(true)}
            title={t('agentSkills.skillsLabel', 'Skills')}
            aria-label={t('agentSkills.skillsLabel', 'Skills')}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg-2 hover:text-fg"
          >
            <IconSparkles size={15} stroke={1.8} />
          </button>
          {turnActive ? (
            <button
              type="button"
              onClick={onStop}
              disabled={disabled}
              title={t('agentChat.stop', 'Stop')}
              aria-label={t('agentChat.stop', 'Stop')}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-border-strong bg-bg text-fg transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
            >
              <IconPlayerStop size={15} stroke={1.8} />
            </button>
          ): (
            // 📖 The accent-circle send button: the catalog composer's one
            // saturated control, everything else stays quiet chrome.
            <button
              type="button"
              onClick={submit}
              disabled={disabled || sending || !value.trim()}
              title={t('agentChat.send', 'Send')}
              aria-label={t('agentChat.send', 'Send')}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
            >
              <IconArrowUp size={15} stroke={1.8} />
            </button>
          )}
        </div>
      </div>
      <SkillsModal open={skillsOpen} onClose={() => setSkillsOpen(false)} />
    </div>
  );
}
