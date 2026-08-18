/**
 * @file Task extension surface
 * @description Shared mobile and desktop task-editor section for contributed
 * fields and web panels. Default typed controls persist only the owning
 * `plugins.<extId>.*` namespace; panels load bundled modules on demand inside
 * independent ErrorBoundaries and receive a frozen task plus a scoped API.
 *
 * 📖 Both Drawer and TaskWorkspace mount this exact component after Report.
 * Keeping one surface avoids the previous bug where a field editor was added to
 * the mobile Drawer but tested on the desktop TaskWorkspace route, where Drawer
 * deliberately returns null.
 *
 * @functions
 *  → TaskExtensionSurface: fields followed by collapsible extension panels
 * @exports TaskExtensionSurface
 * @see src/components/ExtensionRuntimeProvider.tsx
 */

import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { useExtensionRuntime } from './ExtensionRuntimeProvider';
import { useStore } from '../lib/store';
import { injectSubtasks } from '../lib/parser';
import { isAllowed } from '../lib/extensions/permissions';
import { readField, setField } from '../lib/extensions/namespace';
import { isServerMode, serverSetExtensionField, writeTaskFile } from '../lib/filesystem';
import type {
  ExtensionFieldDescriptor,
  ExtensionPanelDescriptor,
  TaskLike,
} from '../lib/extensions/types';
import type { ExtensionPanelComponent } from '../lib/extensions/browser-runtime';
import type { TaskFrontmatter } from '../lib/types';

interface TaskExtensionSurfaceProps {
  taskId: string;
  frontmatter: TaskFrontmatter;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function inputValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function FieldControl({
  field,
  value,
  disabled,
  onCommit,
}: {
  field: ExtensionFieldDescriptor;
  value: unknown;
  disabled: boolean;
  onCommit(value: unknown): Promise<void>;
}) {
  const [draft, setDraft] = useState(inputValue(value));
  useEffect(() => setDraft(inputValue(value)), [value]);

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={value === true || value === 'true'}
        disabled={disabled}
        onChange={(event) => { void onCommit(event.target.checked); }}
        className="h-4 w-4 accent-primary"
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          void onCommit(event.target.value);
        }}
        className="h-9 min-w-[180px] rounded-md border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-primary"
      >
        <option value="">None</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  const commitDraft = () => {
    const next = field.type === 'number'
      ? draft === '' ? undefined : Number(draft)
      : draft;
    if (field.type === 'number' && next !== undefined && !Number.isFinite(next)) return;
    void onCommit(next);
  };

  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitDraft();
          event.currentTarget.blur();
        }
      }}
      className="h-9 min-w-[180px] rounded-md border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-primary disabled:opacity-60"
    />
  );
}

function PanelMountReporter({ onSuccess }: { onSuccess(): void }) {
  useEffect(() => onSuccess(), [onSuccess]);
  return null;
}

function LoadedPanel({
  descriptor,
  task,
  onSetField,
}: {
  descriptor: ExtensionPanelDescriptor;
  task: TaskLike;
  onSetField(extId: string, key: string, value: unknown): Promise<void>;
}) {
  const { extensions, loadWebModule, refresh, reportPanelOutcome, revision } = useExtensionRuntime();
  const columns = useStore((state) => state.columns);
  const archivedTasks = useStore((state) => state.archivedTasks);
  const [component, setComponent] = useState<ExtensionPanelComponent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    setLoadError(null);
    void loadWebModule(descriptor.extId, descriptor.entry)
      .then((module) => {
        const candidate = module.panels?.[descriptor.id] ?? module.default;
        if (typeof candidate !== 'function') throw new Error(`web bundle does not export panel "${descriptor.id}"`);
        if (!cancelled) setComponent(() => candidate);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!cancelled) {
          setLoadError(message);
          void reportPanelOutcome(descriptor.extId, 'failure', message);
        }
      });
    return () => { cancelled = true; };
    // 📖 `revision` is in the dependency list on purpose: after a hot reload the
    // entry path is unchanged, so without it the drawer would keep rendering the
    // previous bundle even though the module cache was already dropped.
  }, [descriptor.entry, descriptor.extId, descriptor.id, loadWebModule, reportPanelOutcome, retryNonce, revision, task.id]);

  const onSuccess = useCallback(() => {
    void reportPanelOutcome(descriptor.extId, 'success');
  }, [descriptor.extId, reportPanelOutcome]);

  const api = useMemo(() => Object.freeze({
    readField: (key: string) => {
      const field = extensions
        .find((extension) => extension.id === descriptor.extId)
        ?.fields.find((candidate) => candidate.key === key);
      return field
        ? readField(task.frontmatter, descriptor.extId, key, field.type)
        : undefined;
    },
    readAllTasks: async () => {
      const owner = extensions.find((extension) => extension.id === descriptor.extId);
      if (!isAllowed(owner?.permissions, 'read:tasks')) throw new Error('permission denied: read:tasks');
      return [
        ...columns.flatMap((column) => column.tasks.map((boardTask) => deepFreeze({
          id: boardTask.id,
          frontmatter: structuredClone(boardTask.frontmatter) as Record<string, unknown>,
          plugins: structuredClone(boardTask.frontmatter.plugins) as Record<string, unknown> | undefined,
        }))),
        ...archivedTasks.map((boardTask) => deepFreeze({
          id: boardTask.id,
          frontmatter: structuredClone(boardTask.frontmatter) as Record<string, unknown>,
          plugins: structuredClone(boardTask.frontmatter.plugins) as Record<string, unknown> | undefined,
        })),
      ];
    },
    setField: (key: string, value: unknown) => onSetField(descriptor.extId, key, value),
    refresh,
  }), [archivedTasks, columns, descriptor.extId, extensions, onSetField, refresh, task.frontmatter]);

  if (loadError) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger/10 p-3">
        <div className="text-[12.5px] text-danger">Panel failed to load: {loadError}</div>
        <button type="button" onClick={() => setRetryNonce((current) => current + 1)} className="mt-2 text-[12px] underline underline-offset-2">Retry panel</button>
      </div>
    );
  }
  if (!component) return <div className="text-[12.5px] text-fg-muted">Loading panel…</div>;

  const Panel = component;
  return (
    <ErrorBoundary
      key={`${descriptor.extId}:${descriptor.id}:${task.id}`}
      onError={(error) => { void reportPanelOutcome(descriptor.extId, 'failure', error.message); }}
      fallback={(error, retry) => (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3">
          <div className="text-[12.5px] font-medium text-danger">Panel crashed: {error.message}</div>
          <button type="button" onClick={retry} className="mt-2 text-[12px] underline underline-offset-2">Retry panel</button>
        </div>
      )}
    >
      <Panel task={task} api={api} ui={React} />
      <PanelMountReporter onSuccess={onSuccess} />
    </ErrorBoundary>
  );
}

function ExtensionPanelSection({
  descriptor,
  task,
  onSetField,
}: {
  descriptor: ExtensionPanelDescriptor;
  task: TaskLike;
  onSetField(extId: string, key: string, value: unknown): Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section data-extension-id={descriptor.extId} className="rounded-lg border border-border bg-bg-1/50">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-[11px] text-fg-faint">{collapsed ? '▸' : '▾'}</span>
        <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted">{descriptor.title}</span>
        <span className="ml-auto font-mono text-[10px] text-fg-faint">{descriptor.extId}</span>
      </button>
      {!collapsed && (
        <div className="border-t border-border px-3 py-3">
          <LoadedPanel descriptor={descriptor} task={task} onSetField={onSetField} />
        </div>
      )}
    </section>
  );
}

export function TaskExtensionSurface({ taskId, frontmatter }: TaskExtensionSurfaceProps) {
  const { extensions } = useExtensionRuntime();
  const drawerData = useStore((state) => state.drawerData);
  const tasksDirHandle = useStore((state) => state.tasksDirHandle);
  const updateDrawerData = useStore((state) => state.updateDrawerData);
  const reloadBoard = useStore((state) => state.reloadBoard);
  const toast = useStore((state) => state.toast);
  const [saving, setSaving] = useState<Set<string>>(() => new Set());

  const active = useMemo(() => extensions.filter((extension) => extension.health === 'enabled'), [extensions]);
  const fields = useMemo(() => active.flatMap((extension) => extension.fields), [active]);
  const panels = useMemo(() => active.flatMap((extension) => extension.panels), [active]);
  const task = useMemo<TaskLike>(() => {
    const cloned = structuredClone(frontmatter) as Record<string, unknown>;
    return deepFreeze({
      id: taskId,
      frontmatter: cloned,
      plugins: cloned.plugins && typeof cloned.plugins === 'object'
        ? cloned.plugins as Record<string, unknown>
        : undefined,
    });
  }, [frontmatter, taskId]);

  const commitField = useCallback(async (extId: string, key: string, value: unknown) => {
    if (!drawerData) return;
    const descriptor = fields.find((field) => field.extId === extId && field.key === key);
    if (!descriptor) throw new Error(`unknown extension field: ${extId}.${key}`);
    const owner = active.find((extension) => extension.id === extId);
    const permission = `write:field:plugins.${extId}.${key}`;
    if (!isAllowed(owner?.permissions, permission)) throw new Error(`permission denied: ${permission}`);
    const savingKey = `${extId}.${key}`;
    const previous = drawerData.frontmatter;
    const next = setField(previous as Record<string, unknown>, extId, key, value) as TaskFrontmatter;
    setSaving((current) => new Set(current).add(savingKey));
    updateDrawerData((data) => ({ ...data, frontmatter: next }));
    try {
      if (isServerMode()) {
        const result = await serverSetExtensionField(taskId, extId, key, value);
        if (useStore.getState().drawerTaskId === taskId) {
          updateDrawerData((data) => ({
            ...data,
            frontmatter: { ...data.frontmatter, plugins: result.plugins },
          }));
        }
        await reloadBoard();
      } else {
        if (!tasksDirHandle) throw new Error('tasks directory is unavailable');
        await writeTaskFile(
          tasksDirHandle,
          taskId,
          { ...next, id: taskId },
          injectSubtasks(drawerData.body, drawerData.subtasks),
        );
        await reloadBoard();
      }
    } catch (error) {
      if (useStore.getState().drawerTaskId === taskId) {
        updateDrawerData((data) => ({ ...data, frontmatter: previous }));
      }
      toast(`Could not save ${extId}.${key}: ${error instanceof Error ? error.message : String(error)}`, 'error', 8000);
      throw error;
    } finally {
      setSaving((current) => {
        const nextSaving = new Set(current);
        nextSaving.delete(savingKey);
        return nextSaving;
      });
    }
  }, [active, drawerData, fields, reloadBoard, taskId, tasksDirHandle, toast, updateDrawerData]);

  if (fields.length === 0 && panels.length === 0) return null;

  return (
    <>
      {fields.length > 0 && (
        <>
          <div className="h-px bg-border -mx-5" />
          <section>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-3">Extension fields</div>
            <div className="space-y-2.5">
              {fields.map((field) => {
                const value = readField(frontmatter as Record<string, unknown>, field.extId, field.key, field.type);
                const fieldSaving = saving.has(`${field.extId}.${field.key}`);
                return (
                  <label key={`${field.extId}.${field.key}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg-1/40 px-3 py-2.5">
                    <span>
                      <span className="block text-[13px] font-medium text-fg">{field.label}</span>
                      <span className="block font-mono text-[10.5px] text-fg-faint">plugins.{field.extId}.{field.key}{fieldSaving ? ' · saving' : ''}</span>
                    </span>
                    <FieldControl
                      field={field}
                      value={value}
                      disabled={fieldSaving}
                      onCommit={(next) => commitField(field.extId, field.key, next)}
                    />
                  </label>
                );
              })}
            </div>
          </section>
        </>
      )}

      {panels.length > 0 && (
        <>
          <div className="h-px bg-border -mx-5" />
          <section>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted mb-3">Extension panels</div>
            <div className="space-y-2.5">
              {panels.map((panel) => (
                <ExtensionPanelSection
                  key={`${panel.extId}.${panel.id}`}
                  descriptor={panel}
                  task={task}
                  onSetField={commitField}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
