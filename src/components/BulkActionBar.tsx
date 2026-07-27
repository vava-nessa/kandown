/**
 * @file Floating Bulk Action Bar component
 * @description Appears when one or more tasks are selected in the web UI and
 * behaves like Linear's selection bar: a floating pill at the bottom of the
 * screen that exposes every action that makes sense for a group of tasks —
 * change priority, assign, set a due date, add/remove tags, move column,
 * archive, delete — each behind a small popover picker.
 *
 * 📖 The bar is the single home for bulk actions. Per-row hover buttons were
 * removed from the list/card rows in favour of the Linear checkbox model, so
 * this component is what surfaces those operations once a selection exists.
 * 📖 Metadata actions (priority / assignee / due / tags) keep the selection
 * alive so the user can chain several edits; destructive actions (move /
 * archive / delete) clear the selection as they run.
 * 📖 Pickers are always shown (matching the task drawer, which also renders
 * the priority/assignee/tags/due editors unconditionally) — task data carries
 * these fields regardless of the project's `config.fields.*` flags.
 *
 * @functions
 *  → BulkActionBar — floating action bar at bottom of screen
 *  → Pill — small action button that opens a popover
 *  → Popover — anchored dropdown with an outside-click backdrop
 *
 * @exports BulkActionBar
 * @see src/lib/store.ts (bulkUpdateMetadata, bulkMoveTasks, …)
 * @see src/components/ListRow.tsx
 * @see src/components/Card.tsx
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { AgentGlyph } from './agentIcons';
import { useDetectedAgents } from '../hooks/useDetectedAgents';
import { useStore } from '../lib/store';

/** Which popover (if any) is currently open. Only one at a time. */
type MenuKind = 'priority' | 'assignee' | 'due' | 'tags' | 'move' | null;

const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;

const PRIORITY_STYLES: Record<string, string> = {
  P1: 'text-red-600 dark:text-red-400',
  P2: 'text-amber-600 dark:text-amber-400',
  P3: 'text-blue-600 dark:text-blue-400',
  P4: 'text-fg-muted',
};

const PRIORITY_LABEL_KEY: Record<string, string> = {
  P1: 'drawer.urgentP1',
  P2: 'drawer.highP2',
  P3: 'drawer.mediumP3',
  P4: 'drawer.lowP4',
};

/**
 * 📖 A clickable pill in the bar that toggles its own popover. The popover is
 * rendered as a child so it can be positioned relative to the pill, and a
 * full-screen transparent backdrop closes it on outside click / Esc.
 */
function Pill({
  icon,
  label,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
          active ? 'bg-bg-3 text-fg' : 'text-fg-muted hover:text-fg hover:bg-black/[0.06] dark:hover:bg-white/10'
        }`}
      >
        {icon}
        <span>{label}</span>
        <Icon.ChevronDown size={11} className="opacity-60" />
      </button>
      {children}
    </div>
  );
}

/**
 * 📖 Anchored popover with a transparent full-screen backdrop that closes on
 * outside click and Esc. Content sits just above the bar (bottom-full) so it
 * never overflows the viewport.
 */
function Popover({
  onClose,
  children,
  width = 'w-[220px]',
}: {
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <>
      {/* Transparent backdrop: swallows the first click as a "close". */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className={`absolute bottom-[calc(100%+8px)] left-0 z-[61] ${width} max-w-[92vw] rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        {children}
      </div>
    </>
  );
}

export function BulkActionBar() {
  const { t } = useTranslation();
  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const clearTaskSelection = useStore(s => s.clearTaskSelection);
  const setTaskSelection = useStore(s => s.setTaskSelection);
  const columns = useStore(s => s.columns);
  const config = useStore(s => s.config);
  const bulkMoveTasks = useStore(s => s.bulkMoveTasks);
  const bulkDeleteTasks = useStore(s => s.bulkDeleteTasks);
  const bulkArchiveTasks = useStore(s => s.bulkArchiveTasks);
  const bulkUpdateMetadata = useStore(s => s.bulkUpdateMetadata);

  const [openMenu, setOpenMenu] = useState<MenuKind>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Assignee autocomplete
  const [assigneeText, setAssigneeText] = useState('');
  // Tags add/remove
  const [tagMode, setTagMode] = useState<'add' | 'remove'>('add');
  const [tagText, setTagText] = useState('');

  // 📖 Existing assignees + tags across the whole board, used to power the
  // autocomplete in the pickers. Computed from the live columns so newly
  // created values appear without a reload.
  const existingAssignees = useMemo(() => {
    const set = new Set<string>();
    for (const col of columns) {
      for (const task of col.tasks) {
        if (task.assignee) set.add(task.assignee);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [columns]);

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const col of columns) {
      for (const task of col.tasks) {
        for (const tag of task.tags ?? []) set.add(tag);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [columns]);

  // 📖 Detected AI agents from the backend — only installed ones are offered as
  // one-click assignees (detection = `which`, run server-side). MUST sit above
  // the early `return null` so the hook count is stable across renders.
  const detectedAgents = useDetectedAgents();
  const installedAgents = useMemo(
    () => detectedAgents.filter(a => a.installed),
    [detectedAgents],
  );

  if (!selectedTaskIds || selectedTaskIds.length === 0) return null;

  const count = selectedTaskIds.length;

  const closeMenu = () => setOpenMenu(null);

  const handlePriority = (priority: string) => {
    void bulkUpdateMetadata({ priority });
    closeMenu();
  };

  const handleAssignee = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    void bulkUpdateMetadata({ assignee: clean });
    setAssigneeText('');
    closeMenu();
  };

  const handleDue = (value: string) => {
    void bulkUpdateMetadata({ due: value });
    closeMenu();
  };

  const handleTag = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    void bulkUpdateMetadata({ tags: tagMode === 'add' ? { add: [clean] } : { remove: [clean] } });
    setTagText('');
    closeMenu();
  };

  const handleArchive = () => {
    void bulkArchiveTasks(selectedTaskIds);
  };

  // 📖 Clears the `assignee` field on every selected task. Idempotent: applying
  // it to a task with no assignee is a no-op (the file write still happens, but
  // `bulkUpdateMetadata`'s strict-read short-circuits if the file is missing).
  // Keeping selection alive so a follow-up re-assign in the same batch feels
  // cheap, matching how every other field-edit pill behaves.
  const handleUnassign = () => {
    void bulkUpdateMetadata({ assignee: '' });
  };

  const handleDelete = () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    void bulkDeleteTasks(selectedTaskIds);
    setDeleteArmed(false);
  };

  const handleSelectAll = () => {
    const allIds = columns.flatMap(col => col.tasks.map(task => task.id));
    setTaskSelection(allIds);
  };

  const toggle = (kind: MenuKind) => () => {
    setDeleteArmed(false);
    setOpenMenu(open => (open === kind ? null : kind));
    setAssigneeText('');
    setTagText('');
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-200 max-w-[94vw]">
      {/* Count badge */}
      <span className="text-xs font-semibold text-fg px-2 py-1 rounded-md bg-primary/15 text-primary tabular-nums whitespace-nowrap">
        {count} {count === 1 ? t('bulk.selectedOne') : t('bulk.selectedMany')}
      </span>

      <div className="h-5 w-px bg-border" />

      {/* Action pickers — always shown, matching the task drawer. */}
      <div className="flex items-center gap-0.5 flex-wrap">
        <Pill
          icon={<Icon.Flag size={13} />}
          label={t('bulk.priority')}
          active={openMenu === 'priority'}
          onClick={toggle('priority')}
        >
          {openMenu === 'priority' && (
            <Popover onClose={closeMenu}>
              <div className="py-1">
                {PRIORITIES.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePriority(p)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-bg-3 ${PRIORITY_STYLES[p]}`}
                  >
                    <span className="font-mono font-bold w-6">{p}</span>
                    <span className="text-fg-dim">{t(PRIORITY_LABEL_KEY[p])}</span>
                  </button>
                ))}
                <div className="my-1 border-t border-border/60" />
                <button
                  type="button"
                  onClick={() => handlePriority('')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left text-fg-muted hover:bg-bg-3"
                >
                  <span className="w-6 text-center">—</span>
                  {t('drawer.noPriority')}
                </button>
              </div>
            </Popover>
          )}
        </Pill>

        <Pill
          icon={<Icon.User size={13} />}
          label={t('bulk.assignee')}
          active={openMenu === 'assignee'}
          onClick={toggle('assignee')}
        >
          {openMenu === 'assignee' && (
            <Popover onClose={closeMenu}>
              <div className="p-2">
                <input
                  autoFocus
                  type="text"
                  value={assigneeText}
                  onChange={e => setAssigneeText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAssignee(assigneeText);
                    }
                  }}
                  placeholder={t('drawer.assigneePlaceholder')}
                  className="w-full bg-transparent border border-border rounded-md px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                />
                {installedAgents.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 border-b border-border pb-1.5">
                    {installedAgents.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleAssignee(a.id)}
                        title={`${a.name} (${a.bin})${a.preferred ? ' · preferred' : ''}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[12px] hover:bg-bg-3"
                      >
                        <AgentGlyph id={a.id} size={13} />
                        <span className="text-fg-dim">{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-1 max-h-[180px] overflow-y-auto">
                  {existingAssignees
                    .filter(a => !assigneeText || a.toLowerCase().includes(assigneeText.toLowerCase()))
                    .slice(0, 12)
                    .map(a => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => handleAssignee(a)}
                        className="w-full text-left px-2 py-1 text-[13px] text-fg-dim hover:bg-bg-3 rounded"
                      >
                        @{a}
                      </button>
                    ))}
                  {assigneeText.trim() && !existingAssignees.includes(assigneeText.trim()) && (
                    <button
                      type="button"
                      onClick={() => handleAssignee(assigneeText)}
                      className="w-full text-left px-2 py-1 text-[13px] text-primary hover:bg-bg-3 rounded"
                    >
                      {t('bulk.assignNew', { name: assigneeText.trim() })}
                    </button>
                  )}
                </div>
              </div>
            </Popover>
          )}
        </Pill>

        <Pill
          icon={<Icon.Calendar size={13} />}
          label={t('bulk.dueDate')}
          active={openMenu === 'due'}
          onClick={toggle('due')}
        >
          {openMenu === 'due' && (
            <Popover onClose={closeMenu} width="w-[200px]">
              <div className="p-2">
                <input
                  autoFocus
                  type="date"
                  onChange={e => handleDue(e.target.value)}
                  className="w-full bg-transparent border border-border rounded-md px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => handleDue('')}
                  className="mt-1 w-full text-left px-2 py-1 text-[13px] text-fg-muted hover:bg-bg-3 rounded"
                >
                  {t('bulk.clearDue')}
                </button>
              </div>
            </Popover>
          )}
        </Pill>

        <Pill
          icon={<Icon.Tag size={13} />}
          label={t('bulk.tags')}
          active={openMenu === 'tags'}
          onClick={toggle('tags')}
        >
          {openMenu === 'tags' && (
            <Popover onClose={closeMenu}>
              <div className="p-2">
                {/* Add / Remove toggle */}
                <div className="flex gap-1 mb-2 p-0.5 bg-bg-3 rounded-md">
                  <button
                    type="button"
                    onClick={() => setTagMode('add')}
                    className={`flex-1 px-2 py-1 text-[12px] rounded ${tagMode === 'add' ? 'bg-card text-fg shadow-sm' : 'text-fg-muted'}`}
                  >
                    + {t('bulk.add')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTagMode('remove')}
                    className={`flex-1 px-2 py-1 text-[12px] rounded ${tagMode === 'remove' ? 'bg-card text-fg shadow-sm' : 'text-fg-muted'}`}
                  >
                    − {t('bulk.remove')}
                  </button>
                </div>
                <input
                  autoFocus
                  type="text"
                  value={tagText}
                  onChange={e => setTagText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTag(tagText);
                    }
                  }}
                  placeholder={t('bulk.tagPlaceholder')}
                  className="w-full bg-transparent border border-border rounded-md px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                />
                <div className="mt-1 max-h-[150px] overflow-y-auto">
                  {existingTags
                    .filter(tag => !tagText || tag.toLowerCase().includes(tagText.toLowerCase()))
                    .slice(0, 12)
                    .map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleTag(tag)}
                        className="w-full text-left px-2 py-1 text-[13px] text-fg-dim hover:bg-bg-3 rounded"
                      >
                        #{tag}
                      </button>
                    ))}
                  {tagMode === 'add' && tagText.trim() && !existingTags.includes(tagText.trim()) && (
                    <button
                      type="button"
                      onClick={() => handleTag(tagText)}
                      className="w-full text-left px-2 py-1 text-[13px] text-primary hover:bg-bg-3 rounded"
                    >
                      {t('bulk.addTag', { name: tagText.trim() })}
                    </button>
                  )}
                </div>
              </div>
            </Popover>
          )}
        </Pill>

        <Pill
          icon={<Icon.Arrow size={13} />}
          label={t('bulk.move')}
          active={openMenu === 'move'}
          onClick={toggle('move')}
        >
          {openMenu === 'move' && (
            <Popover onClose={closeMenu} width="w-[200px]">
              <div className="py-1 max-h-[260px] overflow-y-auto">
                {config.board.columns.map(col => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => {
                      closeMenu();
                      void bulkMoveTasks(col);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[13px] text-fg-dim hover:bg-bg-3"
                  >
                    {col}
                  </button>
                ))}
              </div>
            </Popover>
          )}
        </Pill>
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Direct actions (single-target, non-confirming) */}
      <button
        type="button"
        onClick={handleUnassign}
        title={t('bulk.unassign')}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-fg-muted hover:text-fg hover:bg-black/[0.06] dark:hover:bg-white/10 rounded-md transition-colors"
      >
        <Icon.UserMinus size={13} />
        {t('bulk.unassign')}
      </button>
      <button
        type="button"
        onClick={handleArchive}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-fg-muted hover:text-fg hover:bg-black/[0.06] dark:hover:bg-white/10 rounded-md transition-colors"
      >
        <Icon.Archive size={13} />
        {t('bulk.archive')}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        onBlur={() => setDeleteArmed(false)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
          deleteArmed
            ? 'bg-red-500 text-white'
            : 'text-red-500 hover:bg-red-500/10'
        }`}
      >
        <Icon.Trash size={13} />
        {deleteArmed ? t('bulk.confirmDelete') : t('bulk.delete')}
      </button>

      <div className="h-5 w-px bg-border" />

      {/* Select all + clear */}
      <button
        type="button"
        onClick={handleSelectAll}
        className="px-2 py-1 text-xs font-medium text-fg-muted hover:text-fg hover:bg-black/[0.06] dark:hover:bg-white/10 rounded-md transition-colors whitespace-nowrap"
        title={t('bulk.selectAll')}
      >
        {t('bulk.selectAll')}
      </button>
      <button
        type="button"
        onClick={clearTaskSelection}
        className="p-1 text-fg-muted hover:text-fg hover:bg-black/[0.06] dark:hover:bg-white/10 rounded-md transition-colors"
        title={t('bulk.clear')}
        aria-label={t('bulk.clear')}
      >
        <Icon.X size={14} />
      </button>
    </div>
  );
}
