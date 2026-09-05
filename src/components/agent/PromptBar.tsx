/**
 * @file Prompt bar for the agent chat sidebar
 * @description Auto-sizing textarea plus send/stop controls. Enter sends,
 * Shift+Enter inserts a newline. While a turn is live the send button becomes a
 * stop button; when no session is active the first send starts one (lazily, so
 * "Ask the agent" never kicks off a harness run the user did not ask for);
 * without a daemon the bar is disabled.
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
 *  → PromptBar: message composer with send/stop, mention/skill pickers and
 *    lazy session start
 *
 * @exports PromptBar
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/lib/chat-mentions.ts: the pure token detection this composes
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
  onSend: (text: string, mentionedTaskIds: string[]) => void;
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
}

export function PromptBar({
  disabled,
  turnActive,
  sending,
  onSend,
  onStop,
  onLaunchSkill,
  pickTaskMode,
  pickTaskLabel,
  onPickTask,
  onDismissPickTask,
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
    onSend(trimmed, extractMentionedTaskIds(trimmed));
    setValue('');
    setCaret(0);
    setMenuDismissed(false);
  }, [value, disabled, sending, onSend]);

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
    <div className="relative flex flex-none items-end gap-1.5 border-t border-border bg-bg px-2.5 py-2.5">
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
        className="max-h-[140px] flex-1 resize-none rounded-[8px] border border-border bg-bg-1 px-2.5 py-2 text-[13.5px] leading-snug text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border-focus disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => setSkillsOpen(true)}
        title={t('agentSkills.skillsLabel', 'Skills')}
        aria-label={t('agentSkills.skillsLabel', 'Skills')}
        className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] border border-border bg-bg-1 text-fg-muted transition-colors hover:border-border-focus hover:text-fg"
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
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] border border-border-strong bg-bg-1 text-fg transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
        >
          <IconPlayerStop size={15} stroke={1.8} />
        </button>
      ): (
        <button
          type="button"
          onClick={submit}
          disabled={disabled || sending || !value.trim()}
          title={t('agentChat.send', 'Send')}
          aria-label={t('agentChat.send', 'Send')}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
        >
          <IconArrowUp size={15} stroke={1.8} />
        </button>
      )}
      <SkillsModal open={skillsOpen} onClose={() => setSkillsOpen(false)} />
    </div>
  );
}
