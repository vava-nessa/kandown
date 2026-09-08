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
 *  → per-conversation drafts keyed by the `draftKey` prop: every conversation
 *    keeps its own composer text in a module Map mirrored to sessionStorage
 *    (20 most recent keys, empty drafts never stored), so switching or
 *    creating a conversation saves the typed text under the old key and
 *    restores the new key's draft instead of leaking it; sending or clearing
 *    the composer clears only the current key, and unmount saves the live
 *    text;
 *  → lazy session start stays in ChatSidebar: the first send on a sessionless
 *    sidebar starts one.
 *
 * 📖 Round 4/5 behaviors preserved verbatim; round 7 only swaps the rendering
 * shell for the official component. Attachments and dictation are demo-only
 * BUI features and stay out of kandown.
 *
 * @functions
 *  → hydrateDrafts / readDraft / storeDraft / persistDrafts: the
 *    per-conversation draft memory (module Map plus a guarded sessionStorage
 *    mirror, capped to the most recent keys)
 *  → PromptBar: the official BUI composer wired to kandown behavior
 *
 * @exports PromptBar
 * @see src/components/bui/PromptBar.tsx: the official component (external mode)
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/components/agent/AgentChatSurface.tsx: computes draftKey
 * @see src/lib/chat-mentions.ts: the pure token detection this composes
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../lib/store';
import {
  extractMentionedTaskIds,
  findActiveMentionQuery,
  findActiveSlashQuery,
  stripMentionMarkers,
} from '../../lib/chat-mentions';
import { SkillsModal } from './SkillsModal';
import BuiPromptBar, { type PromptBarRow } from '../bui/PromptBar';
import type { ChatSkillButton } from '../../lib/store/types';

/** 📖 sessionStorage key of the per-conversation composer drafts: one JSON
 * snapshot (an array of [draftKey, draft] pairs, oldest first) rewritten on
 * every draft change so a reload restores the typed text. */
const DRAFTS_STORAGE_KEY = 'kandown.agentChat.drafts';

/** 📖 How many conversations keep a draft, in page memory and in storage.
 * Past the cap the least recently typed drafts are dropped, oldest first. */
const DRAFTS_LIMIT = 20;

/** 📖 Page-life draft memory: one composer text per conversation, keyed by
 * the `draftKey` prop (the active session id, or 'draft' before a session
 * exists). This is what makes switching conversations swap the composer text
 * instead of sharing one draft across all of them. Hydrated from
 * sessionStorage once on first touch. */
const draftsByConversation = new Map<string, string>();

/** 📖 One-time hydration guard: sessionStorage is read once, then the Map is
 * the single in-page truth. */
let draftsHydrated = false;

/** 📖 Reads the stored snapshot into the Map. Storage failures (private
 * mode, quota, corrupt JSON) degrade to an empty draft set, never an error:
 * the same guarded pattern AgentChatSurface uses for the model pick. */
function hydrateDrafts(): void {
  if (draftsHydrated) return;
  draftsHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const key: unknown = entry[0];
      const draft: unknown = entry[1];
      // 📖 Empty drafts were never stored, so they are never restored.
      if (typeof key === 'string' && typeof draft === 'string' && draft !== '') {
        draftsByConversation.set(key, draft);
      }
    }
  } catch {
    // 📖 Storage unavailable or corrupt snapshot: drafts start empty.
  }
}

/** 📖 Mirrors the Map to sessionStorage, keeping only the DRAFTS_LIMIT most
 * recent keys (the Map's insertion order is the recency order, see
 * storeDraft). Failures degrade to page-life memory only. */
function persistDrafts(): void {
  try {
    const recent = Array.from(draftsByConversation.entries()).slice(-DRAFTS_LIMIT);
    window.sessionStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // 📖 Storage unavailable: drafts survive conversation switches, not a reload.
  }
}

/** 📖 The draft stored for one conversation key, or the empty string. */
function readDraft(key: string): string {
  hydrateDrafts();
  return draftsByConversation.get(key) ?? '';
}

/** 📖 Stores (or clears) one conversation's draft and mirrors the Map to
 * sessionStorage. An empty draft deletes its entry, so an untouched or fully
 * cleared composer never creates map state. Writing uses delete-then-set so
 * the key moves to the Map tail: the recency cap keeps the conversations the
 * user typed in last. */
function storeDraft(key: string, draft: string): void {
  hydrateDrafts();
  if (draft === '') {
    if (draftsByConversation.delete(key)) persistDrafts();
    return;
  }
  draftsByConversation.delete(key);
  draftsByConversation.set(key, draft);
  while (draftsByConversation.size > DRAFTS_LIMIT) {
    const oldest = draftsByConversation.keys().next();
    if (oldest.done) break;
    draftsByConversation.delete(oldest.value);
  }
  persistDrafts();
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
   * a task-scoped skill. Rendered as the BUI menu in override mode. */
  pickTaskMode: boolean;
  /** Label of the skill awaiting a task, shown in the pick list heading. */
  pickTaskLabel: string | null;
  /** Called with the picked task id; ChatSidebar then starts the session. */
  onPickTask: (taskId: string) => void;
  /** Esc (or dismiss) out of pick-task mode. */
  onDismissPickTask: () => void;
  /** 📖 Slim control row rendered inside the composer, above the textarea.
   * ChatSidebar mounts the harness select, the t340 model picker and the
   * permission chip here. */
  toolbar?: React.ReactNode;
  /** 📖 t337 round 2: hero sizing for the welcome screen (empty conversation):
   * the BUI composer grows (tall), and the bottom-bar chrome (top border,
   * padding) disappears since the composer then floats centered in the page. */
  tall?: boolean;
  /** 📖 Per-conversation draft identity: the active session id, or a stable
   * key for the conversation that has no session yet ('draft'). A key change
   * swaps the composer text (save the old conversation's draft, restore this
   * one's), so text never leaks between conversations. */
  draftKey: string;
  /** 📖 t337 round 5: prompt seed for a conversation whose harness never
   * registered. When the swap loads an EMPTY stored draft for that key, the
   * seed text becomes the composer content instead (the index kept the
   * original prompt). One-shot per key+nonce, and it never overwrites text
   * the user already typed. */
  seed?: { key: string; text: string; nonce: number };
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
  tall = false,
  draftKey,
  seed,
}: PromptBarProps) {
  const { t } = useTranslation();
  // 📖 The caret participates in the trigger detection, so it is tracked on
  // every change (and selection move, reported back by the BUI component).
  // The draft is per conversation: it starts from the draftKey's stored text
  // (a reload restores it through the sessionStorage mirror) and every
  // change writes back under the same key.
  const [value, setValue] = useState(() => readDraft(draftKey));
  const [caret, setCaret] = useState(value.length);
  // 📖 Draft-swap bookkeeping: which conversation's text the composer
  // currently holds, and that text. Refs because the save-and-load swap, the
  // write-through on typing and the unmount save must all read the live
  // values without depending on render timing.
  const draftKeyRef = useRef(draftKey);
  const draftValueRef = useRef(value);

  // 📖 REGRESSION GUARD (draft leak): `value` is ONE conversation's draft and
  // must never surface in a DIFFERENT conversation. Both a session switch
  // (activeSessionId changes) and a new conversation (newConversation resets
  // activeSessionId to null, so the key falls back to 'draft') change
  // draftKey, and this effect swaps the composer text accordingly. Do not
  // simplify it back to a plain useState('') shared by every conversation:
  // that shared single draft is exactly the leak this fixes.
  useEffect(() => {
    const previousKey = draftKeyRef.current;
    if (previousKey === draftKey) return;
    // 📖 Save the typed text under the conversation it belongs to (an empty
    // composer stores nothing), then restore the new conversation's draft.
    storeDraft(previousKey, draftValueRef.current);
    const restored = readDraft(draftKey);
    draftKeyRef.current = draftKey;
    draftValueRef.current = restored;
    setValue(restored);
    // 📖 The caret lands at the end of the restored text, matching where a
    // programmatic value swap leaves the textarea selection, so the @mention
    // caret tracking resumes from a consistent state.
    setCaret(restored.length);
  }, [draftKey]);

  // 📖 Unmounting (shell closed, view switched away) still saves the live
  // draft: the refs carry the last values, no render needed.
  useEffect(() => () => {
    storeDraft(draftKeyRef.current, draftValueRef.current);
  }, []);

  // 📖 t337 round 5: prompt restore for a conversation whose harness never
  // registered. Fires once per seed version, only while that conversation's
  // key is the one on screen, and never overwrites a draft the user already
  // has: an intentional clear is respected, a lost prompt comes back.
  const lastSeedRef = useRef<{ key: string; nonce: number } | null>(null);
  useEffect(() => {
    if (!seed || !seed.text) return;
    const last = lastSeedRef.current;
    if (last && last.key === seed.key && last.nonce >= seed.nonce) return;
    lastSeedRef.current = { key: seed.key, nonce: seed.nonce };
    if (seed.key !== draftKeyRef.current) return;
    if (readDraft(seed.key)) return;
    storeDraft(seed.key, seed.text);
    draftValueRef.current = seed.text;
    setValue(seed.text);
    setCaret(seed.text.length);
  }, [seed]);
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
    // semantics ride in through the props below. Tall (welcome) mode drops
    // the bottom-bar chrome: the composer is a centered page element there.
    <div className={tall
      ? 'relative flex-none'
      : 'relative flex-none border-t border-border bg-bg px-2.5 pb-2.5 pt-2'}
    >
      <BuiPromptBar
        demo={false}
        tall={tall}
        value={value}
        onValueChange={(nextValue, nextCaret) => {
          // 📖 Write-through: every change updates this conversation's draft
          // in the map and its storage mirror. The empty case is what clears
          // the entry: the BUI component commits onValueChange('', caret)
          // right after onSend, so BOTH send paths (Enter and the send
          // square) and a manual full clear wipe only the CURRENT key's
          // draft, never another conversation's.
          draftValueRef.current = nextValue;
          storeDraft(draftKeyRef.current, nextValue);
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
        // 📖 t340: the BUI model menu is retired (its 16-entry cap made the
        // big pi catalog unusable); the model picker moved into the toolbar
        // as ModelPickerMenu, so the BUI control row renders no model button.
        models={[]}
        labels={{
          send: t('agentChat.send', 'Send'),
          stop: t('agentChat.stop', 'Stop'),
          model: t('agentChat.modelTitle', 'Model for new chats, empty uses the harness default'),
          customModel: t('agentChat.modelCustom', 'Custom model...'),
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
