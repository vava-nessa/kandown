/**
 * @file Kandown Work settings workspace
 * @description Provides the Workflow, Skills, and Kandown Work tabs backed by
 * the same validated workflow packages and exact compiler output as the CLI.
 * Built-ins are immutable, editing first creates a provenance-preserving local
 * fork, and board presets always show status migrations before confirmation.
 *
 * @functions
 *  → WorkOutputConfigurator: render and coordinate the three agent-work tabs
 *
 * @exports WorkOutputConfigurator
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  IconArrowsMaximize,
  IconBook2,
  IconCheck,
  IconChevronDown,
  IconCode,
  IconCopy,
  IconFileText,
  IconGitFork,
  IconLayoutKanban,
  IconPuzzle,
  IconRefresh,
  IconRoute,
  IconSettings,
  IconSparkles,
  IconTemplate,
  IconX,
} from '@tabler/icons-react';
import type {
  BoardTask,
  ColumnAgentMeta,
  ColumnRole,
  KandownConfig,
  WorkflowSelectionConfig,
  WorkOutputConfig,
} from '../../lib/types';
import { DEFAULT_WORK_OUTPUT } from '../../lib/types';
import type { SettingDef } from './schema';
import type { BrowserNotificationPermission } from '../../lib/notifications';
import {
  isServerMode,
  readProjectInstructions,
  serverListWorkflowSkills,
  serverFetchWorkflowRegistry,
  serverInstallStoreWorkflow,
  serverUpdateStoreWorkflow,
  serverLoadWorkflowWorkspace,
  serverWorkflowAction,
  writeProjectInstructions,
  type SkillPayload,
  type WorkflowWorkspacePayload,
  type WorkflowRegistryEntryPayload,
  type WorkflowUpdatePreviewPayload,
} from '../../lib/filesystem';
import { compileKandownWork, estimateTokenCount } from '../../lib/kandown-work';
import { listBuiltinWorkflowPackages } from '../../lib/workflows/builtins';
import { listBuiltinWorkflowSkills } from '../../lib/workflows/builtin-skills';
import { BlockNoteMarkdownEditor } from '../ui/BlockNoteMarkdownEditor';

type TabId = 'workflow' | 'skills' | 'work';
const ROLES: ColumnRole[] = ['backlog', 'ready', 'active', 'review', 'terminal', 'custom'];
const COMMANDS = ['kandown work [task-id]', 'kandown list [--json]', 'kandown show <id>', 'kandown create <title>', 'kandown move <id> <status>', 'kandown assign <id> [agent]', 'kandown commit'];

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

interface MarkdownSectionCardProps {
  content: string;
  description?: string;
  eyebrow: string;
  icon: ReactNode;
  initiallyOpen?: boolean;
  title: string;
}

/**
 * 📖 Keeps long workflow documents easy to scan without falling back to raw
 * Markdown. The editor only mounts while its section is open, which avoids
 * paying the BlockNote rendering cost for every collapsed template at once.
 */
function MarkdownSectionCard({ content, description, eyebrow, icon, initiallyOpen = false, title }: MarkdownSectionCardProps) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors md:px-5 ${open ? 'bg-primary/5' : 'hover:bg-bg-2'}`}
      >
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${open ? 'bg-primary text-primary-foreground' : 'bg-bg-3 text-fg-muted'}`}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{eyebrow}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-sm text-fg">{title}</strong>
            <span className="rounded-full border border-border bg-bg-2 px-2 py-0.5 text-[10px] font-medium text-fg-muted">~{formatCount(estimateTokenCount(content))} tokens</span>
          </span>
          {description && <span className="mt-1.5 block text-xs leading-relaxed text-fg-muted">{description}</span>}
        </span>
        <span className="ml-auto grid size-8 shrink-0 place-items-center text-fg-muted">
          <IconChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="mx-3 mb-3 max-h-[620px] overflow-auto rounded-lg border border-border bg-bg px-4 py-5 md:mx-4 md:px-6">
          <BlockNoteMarkdownEditor value={content} readOnly minHeight="auto" />
        </div>
      )}
    </section>
  );
}

interface WorkOutputConfiguratorProps {
  config: KandownConfig;
  columns: { name: string; tasks: BoardTask[] }[];
  dirHandle: FileSystemDirectoryHandle | null;
  onChange: (next: WorkOutputConfig) => void;
  onWorkflowChange: (next: WorkflowSelectionConfig) => void;
  onColumnMetaChange: (next: Record<string, ColumnAgentMeta>) => void;
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', durationMs?: number) => void;
  agentSettings: SettingDef[];
  getConfigValue: (key: string) => unknown;
  handleChange: (setting: SettingDef, newValue: unknown) => void;
  notificationPermission: BrowserNotificationPermission;
  onRequestNotificationPermission: () => void;
}

function localWorkspace(config: KandownConfig, columns: { name: string; tasks: BoardTask[] }[], instructions: string): WorkflowWorkspacePayload {
  const packages = listBuiltinWorkflowPackages();
  const selected = packages.find(item => item.manifest.id === config.workflow.active) ?? packages[0];
  if (!selected) throw new Error('No built-in workflow is available.');
  const context = columns.map(column => `- **${column.name}** (${column.tasks.length}): ${column.tasks.map(task => `${task.id} ${task.title}`).join(', ') || 'empty'}`).join('\n');
  const compiled = compileKandownWork({
    detailMode: config.agent.workOutput.detailMode,
    trackingCadence: config.workflow.trackingCadence,
    columns: config.board.columns.map(name => ({ name, meta: config.board.columnMeta[name] ?? { role: 'custom' } })),
    availableCommands: COMMANDS,
    workflow: selected,
    skills: listBuiltinWorkflowSkills().filter(skill => config.workflow.skills.includes(skill.id)),
    projectInstructions: instructions,
    context: { kind: 'board', markdown: context },
  });
  return {
    workflows: packages.map(item => ({ id: item.manifest.id, name: item.manifest.name, version: item.manifest.version, description: item.manifest.description, source: 'built-in', active: item.manifest.id === selected.manifest.id, valid: true, errors: [] })),
    selected,
    preview: compiled.markdown,
    stats: compiled.stats,
    diagnostics: compiled.diagnostics,
    boardPresetPreview: null,
  };
}

export function WorkOutputConfigurator({
  config,
  columns,
  dirHandle,
  onChange,
  onWorkflowChange,
  onColumnMetaChange,
  toast,
}: WorkOutputConfiguratorProps) {
  const [tab, setTab] = useState<TabId>('workflow');
  const [workspace, setWorkspace] = useState<WorkflowWorkspacePayload | null>(null);
  const [skills, setSkills] = useState<SkillPayload[]>([]);
  const [instructions, setInstructions] = useState('');
  const [savedInstructions, setSavedInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [editPath, setEditPath] = useState('');
  const [editContent, setEditContent] = useState('');
  const [registry, setRegistry] = useState<WorkflowRegistryEntryPayload[] | null>(null);
  const [updatePreview, setUpdatePreview] = useState<WorkflowUpdatePreviewPayload | null>(null);
  const [fullPreview, setFullPreview] = useState(false);

  const reload = useCallback(async () => {
    try {
      const text = await readProjectInstructions(dirHandle);
      setInstructions(text);
      setSavedInstructions(text);
      const remote = await serverLoadWorkflowWorkspace();
      setWorkspace(remote ?? localWorkspace(config, columns, text));
      const remoteSkills = await serverListWorkflowSkills();
      setSkills(remote ? remoteSkills : listBuiltinWorkflowSkills().map(skill => {
        const roles = new Set(Object.values(config.board.columnMeta).map(meta => meta.role));
        const missingRole = skill.requiredRoles?.find(role => !roles.has(role));
        const wrongWorkflow = skill.compatibleWorkflows?.length && !skill.compatibleWorkflows.includes(config.workflow.active);
        const compatibilityReason = wrongWorkflow
          ? `Compatible with: ${skill.compatibleWorkflows?.join(', ')}`
          : missingRole
            ? `Requires column role: ${missingRole}`
            : undefined;
        return {
          id: skill.id,
          name: skill.name,
          version: skill.version,
          description: skill.description,
          source: 'built-in' as const,
          active: config.workflow.skills.includes(skill.id),
          content: skill.content,
          compatible: !compatibilityReason,
          ...(compatibilityReason ? { compatibilityReason } : {}),
        };
      }));
    } catch (error) {
      toast(`Failed to load Kandown Work settings: ${(error as Error).message}`, 'error');
    }
  }, [columns, config, dirHandle, toast]);

  useEffect(() => { void reload(); }, [reload]);

  const selected = workspace?.selected;
  const editableFiles = useMemo(() => selected ? [
    selected.protocol,
    ...(selected.guide ? [selected.guide] : []),
    ...selected.taskTemplates.map(template => ({ path: template.file, content: template.content })),
  ] : [], [selected]);

  useEffect(() => {
    const first = editableFiles[0];
    if (!first) return;
    setEditPath(first.path);
    setEditContent(first.content);
  }, [selected?.manifest.id]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await reload(); }
    catch (error) { toast((error as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const activate = (id: string) => run(async () => {
    if (isServerMode()) await serverWorkflowAction('use', { id });
    onWorkflowChange({ ...config.workflow, active: id });
    toast(`Workflow ${id} activated.`, 'success');
  });

  const fork = () => selected && run(async () => {
    if (!isServerMode()) throw new Error('Local workflow editing requires the Kandown daemon.');
    const result = await serverWorkflowAction('fork', { id: selected.manifest.id });
    const workflow = result.workflow as { manifest?: { id?: string } } | undefined;
    const id = workflow?.manifest?.id;
    if (id) onWorkflowChange({ ...config.workflow, active: id });
    toast('Editable local fork created.', 'success');
  });

  const saveEdit = () => selected && run(async () => {
    await serverWorkflowAction('edit', { id: selected.manifest.id, path: editPath, content: editContent });
    toast(`Saved ${editPath}.`, 'success');
  });

  const applyPreset = () => selected && run(async () => {
    await serverWorkflowAction('apply-preset', { id: selected.manifest.id, confirm: true });
    toast('Board preset applied without orphaning tasks.', 'success');
  });

  const openStore = () => run(async () => {
    if (!isServerMode()) throw new Error('The community store requires the Kandown daemon.');
    const result = await serverFetchWorkflowRegistry();
    if (result.error) toast(result.error, 'warning');
    setRegistry(result.entries);
  });

  const install = (entry: WorkflowRegistryEntryPayload) => run(async () => {
    await serverInstallStoreWorkflow(entry);
    toast(`Installed ${entry.name}.`, 'success');
  });

  const previewUpdate = (entry: WorkflowRegistryEntryPayload) => run(async () => {
    const result = await serverUpdateStoreWorkflow(entry, false);
    setUpdatePreview(result.preview ?? null);
  });

  const applyUpdate = (entry: WorkflowRegistryEntryPayload) => run(async () => {
    await serverUpdateStoreWorkflow(entry, true);
    setUpdatePreview(null);
    toast(`Updated ${entry.name} to v${entry.version}.`, 'success');
  });

  const toggleSkill = (id: string) => {
    const active = new Set(config.workflow.skills);
    active.has(id) ? active.delete(id) : active.add(id);
    onWorkflowChange({ ...config.workflow, skills: [...active].sort() });
  };

  const saveInstructions = () => run(async () => {
    await writeProjectInstructions(dirHandle, instructions);
    setSavedInstructions(instructions);
    toast('Saved .kandown/kandown_work.md.', 'success');
  });

  if (!workspace || !selected) return <div className="rounded-lg border border-border bg-bg-1 p-6 text-sm text-fg-muted">Loading Kandown Work…</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-border bg-bg-1 p-1">
        {([
          { id: 'workflow', label: 'Workflow', icon: <IconRoute size={15} /> },
          { id: 'skills', label: 'Skills', icon: <IconPuzzle size={15} /> },
          { id: 'work', label: 'Kandown Work', icon: <IconFileText size={15} /> },
        ] as const).map(({ id, label, icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${tab === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-fg-muted hover:bg-bg-2 hover:text-fg'}`}>{icon}{label}</button>
        ))}
        <button type="button" onClick={() => void reload()} className="ml-auto rounded-md p-2 text-fg-muted hover:bg-bg-2" title="Reload"><IconRefresh size={16} /></button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><IconFileText size={18} /></span><div><strong className="text-sm text-fg">Complete Kandown Work</strong><p className="mt-0.5 text-xs text-fg-muted">~{formatCount(workspace.stats.estimatedTokens)} tokens · {formatCount(workspace.stats.words)} words · {formatCount(workspace.stats.characters)} characters</p></div></div>
        <button type="button" onClick={() => setFullPreview(true)} className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-bg-1 px-3 py-2 text-xs font-medium text-fg shadow-sm hover:bg-bg-2"><IconArrowsMaximize size={15} /> Read everything</button>
      </div>

      {tab === 'workflow' && (
        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <section className="overflow-hidden rounded-xl border border-border bg-bg-1 shadow-sm">
              <div className="border-b border-border bg-bg-2 px-4 py-3">
                <strong className="text-xs text-fg">Workflow library</strong>
                <p className="mt-0.5 text-[11px] text-fg-muted">Choose one operating method.</p>
              </div>
              <div className="p-2">
                {workspace.workflows.map(item => (
                  <button key={item.id} type="button" onClick={() => void activate(item.id)} disabled={busy || !item.valid} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${item.active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-fg hover:bg-bg-2'}`}>
                    <span className={`grid size-8 shrink-0 place-items-center rounded-md ${item.active ? 'bg-primary-foreground/15' : 'bg-bg-3 text-fg-muted'}`}><IconRoute size={16} /></span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-xs">{item.name}</strong><span className={`mt-0.5 block text-[10px] ${item.active ? 'text-primary-foreground/75' : 'text-fg-muted'}`}>v{item.version} · {item.source}</span>{!item.valid && <span className="mt-1 block text-[10px] text-red-400">{item.errors.join('; ')}</span>}</span>
                    {item.active && <IconCheck size={15} className="shrink-0" />}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-bg-1 p-3">
              <button type="button" onClick={() => void openStore()} disabled={busy} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-fg hover:bg-bg-2"><span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary"><IconSparkles size={16} /></span><span><strong className="block text-xs">Community library</strong><span className="text-[10px] text-fg-muted">Browse approved workflows</span></span></button>
              {registry && <div className="mt-2 border-t border-border pt-2">{registry.length === 0 ? <p className="px-2 py-2 text-xs text-fg-muted">No approved workflows published yet.</p> : registry.map(entry => <div key={entry.id} className="rounded-lg px-2 py-2 hover:bg-bg-2"><strong className="text-xs text-fg">{entry.name}</strong><p className="mt-0.5 text-[10px] text-fg-muted">{entry.description}</p><button type="button" onClick={() => void install(entry)} className="mt-1 text-[11px] font-medium text-primary">Install v{entry.version}</button></div>)}</div>}
            </section>
          </div>

          <div className="space-y-4">
            <section className="overflow-hidden rounded-xl border border-primary/25 bg-bg-1 shadow-sm">
              <div className="bg-gradient-to-br from-primary/10 to-bg-1 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><IconRoute size={22} /></span>
                  <div><h3 className="text-lg font-semibold text-fg">{selected.manifest.name}</h3><p className="mt-0.5 text-xs text-fg-muted">{selected.manifest.author} · v{selected.manifest.version}</p></div>
                </div>
                {workspace.workflows.find(item => item.id === selected.manifest.id)?.source !== 'local' && <button type="button" onClick={() => void fork()} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-fg hover:bg-bg-2"><IconGitFork size={14} /> Fork to edit</button>}
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-fg-muted">{selected.manifest.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted"><IconLayoutKanban size={14} /> Required roles</span>
                {selected.manifest.requiredRoles.map(role => <span key={role} className="rounded-full border border-border bg-bg-1 px-2.5 py-1 text-[11px] font-medium text-fg">{role}</span>)}
              </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border bg-bg-2 px-5 py-3 text-[11px] text-fg-muted md:px-6">
                <span><strong className="text-fg">1</strong> protocol</span>
                <span><strong className="text-fg">{selected.guide ? 1 : 0}</strong> guide</span>
                <span><strong className="text-fg">{selected.taskTemplates.length}</strong> templates</span>
                <span><strong className="text-fg">~{formatCount(estimateTokenCount(selected.protocol.content))}</strong> protocol tokens</span>
                {!!selected.manifest.attribution.length && <span className="ml-auto">Inspired by {selected.manifest.attribution.map(item => item.name).join(', ')}</span>}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-bg-1 shadow-sm">
              <div className="flex items-center gap-3 border-b border-border bg-bg-2 px-4 py-3 md:px-5">
                <span className="grid size-8 place-items-center rounded-lg bg-fg text-bg"><IconBook2 size={16} /></span>
                <div>
                  <h4 className="text-sm font-semibold text-fg">Workflow contents</h4>
                  <p className="mt-0.5 text-[11px] text-fg-muted">Open only the section you need.</p>
                </div>
              </div>
              <MarkdownSectionCard
                key={`${selected.manifest.id}-protocol`}
                eyebrow="Workflow protocol"
                title="Protocol"
                description="The operating instructions added to Kandown Work when this workflow is active."
                content={selected.protocol.content}
                icon={<IconFileText size={17} />}
              />
              {selected.guide && (
                <MarkdownSectionCard
                  key={`${selected.manifest.id}-guide`}
                  eyebrow="Guide"
                  title="Workflow guide"
                  description="Background, usage notes, and practical guidance for this workflow."
                  content={selected.guide.content}
                  icon={<IconBook2 size={17} />}
                />
              )}
              {selected.taskTemplates.map(template => (
                <MarkdownSectionCard
                  key={`${selected.manifest.id}-template-${template.id}`}
                  eyebrow={`Task template${template.default ? ' · Default' : ''}`}
                  title={template.name}
                  description={template.description}
                  content={template.content}
                  icon={<IconTemplate size={17} />}
                />
              ))}
            </section>

            {workspace.workflows.find(item => item.id === selected.manifest.id)?.source === 'local' && (
              <details className="group overflow-hidden rounded-xl border border-border bg-bg-1 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-bg-2 md:px-5">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><IconCode size={18} /></span>
                  <span><strong className="block text-sm text-fg">Local workflow editor</strong><span className="mt-0.5 block text-[11px] text-fg-muted">Source and live Markdown preview</span></span>
                  <IconChevronDown size={16} className="ml-auto text-fg-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border p-4 md:p-5">
                <select value={editPath} onChange={event => { const file = editableFiles.find(item => item.path === event.target.value); setEditPath(event.target.value); setEditContent(file?.content ?? ''); }} className="mt-3 w-full rounded-md border border-border bg-bg-2 px-3 py-2 text-sm text-fg">
                  {editableFiles.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}
                </select>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="overflow-hidden rounded-xl border border-border bg-bg">
                    <div className="flex items-center justify-between border-b border-border bg-bg-2 px-4 py-2.5">
                      <strong className="text-xs text-fg">Markdown source</strong>
                      <span className="text-[10px] text-fg-muted">~{formatCount(estimateTokenCount(editContent))} tokens</span>
                    </div>
                    <textarea value={editContent} onChange={event => setEditContent(event.target.value)} rows={20} className="block min-h-[440px] w-full resize-y border-0 bg-bg px-4 py-4 font-mono text-xs leading-relaxed text-fg outline-none" />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border bg-bg">
                    <div className="border-b border-border bg-bg-2 px-4 py-2.5">
                      <strong className="text-xs text-fg">Rendered preview</strong>
                    </div>
                    <div className="max-h-[620px] min-h-[440px] overflow-auto px-4 py-5">
                      <BlockNoteMarkdownEditor value={editContent} readOnly minHeight="auto" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void saveEdit()} disabled={busy} className="mt-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Save validated source</button>
                </div>
              </details>
            )}

            {workspace.workflows.find(item => item.id === selected.manifest.id)?.source === 'store' && (
              <details className="group overflow-hidden rounded-xl border border-border bg-bg-1">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-bg-2 md:px-5"><span className="grid size-8 place-items-center rounded-lg bg-bg-3 text-fg-muted"><IconSettings size={16} /></span><span><strong className="block text-xs text-fg">Store update</strong><span className="text-[10px] text-fg-muted">Review an approved package update</span></span><IconChevronDown size={15} className="ml-auto text-fg-muted transition-transform group-open:rotate-180" /></summary>
                <div className="border-t border-border p-4">
                  {registry?.find(entry => entry.id === selected.manifest.id) ? (
                    <button type="button" onClick={() => void previewUpdate(registry.find(entry => entry.id === selected.manifest.id)!)} disabled={busy} className="rounded-md border border-border px-3 py-2 text-xs text-fg hover:bg-bg-2">Preview approved update</button>
                  ) : <p className="text-xs text-fg-muted">Open the community library to check for updates explicitly.</p>}
                  {updatePreview?.id === selected.manifest.id && <div className="mt-3 rounded-md border border-border bg-bg p-3"><p className="text-xs text-fg-muted">v{updatePreview.currentVersion} to v{updatePreview.nextVersion}</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-fg-muted">{updatePreview.diff}</pre>{updatePreview.changed && <button type="button" onClick={() => { if (window.confirm(`Apply the validated update to v${updatePreview.nextVersion}?`)) void applyUpdate(updatePreview.entry); }} className="mt-3 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Apply this update</button>}</div>}
                </div>
              </details>
            )}

            {selected.boardPreset && workspace.boardPresetPreview && (
              <details className="group overflow-hidden rounded-xl border border-amber-500/30 bg-bg-1">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-amber-500/5 md:px-5"><span className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-400"><IconLayoutKanban size={16} /></span><span><strong className="block text-xs text-fg">Optional board preset</strong><span className="text-[10px] text-fg-muted">Preview column and task migrations</span></span><IconChevronDown size={15} className="ml-auto text-fg-muted transition-transform group-open:rotate-180" /></summary>
                <div className="border-t border-amber-500/20 p-4"><p className="text-xs text-fg-muted">{workspace.boardPresetPreview.currentColumns.join(' → ')} becomes {workspace.boardPresetPreview.targetColumns.join(' → ')}.</p>{workspace.boardPresetPreview.taskMoves.map(move => <p key={move.from} className="mt-1 text-xs text-fg-muted">{move.count} task(s): {move.from} → {move.to}</p>)}{!!workspace.boardPresetPreview.preservedColumns.length && <p className="mt-1 text-xs text-amber-300">Preserved occupied custom columns: {workspace.boardPresetPreview.preservedColumns.join(', ')}</p>}<button type="button" onClick={() => { if (window.confirm('Apply this board preset and migrate the listed task statuses?')) void applyPreset(); }} disabled={busy} className="mt-3 rounded-md border border-amber-500/50 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10">Apply preset with confirmation</button></div>
              </details>
            )}
          </div>
        </div>
      )}

      {tab === 'skills' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-bg-1 p-4"><h3 className="text-sm font-semibold text-fg">Additive skills</h3><p className="mt-1 text-xs text-fg-muted">Skills extend the active workflow. They never replace the immutable Kandown core.</p></div>
          {skills.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-fg-muted">No Markdown skills installed in .kandown/skills or ~/.kandown/skills.</div> : skills.map(skill => (
            <label key={skill.id} className={`flex gap-3 rounded-lg border border-border bg-bg-1 p-4 ${!skill.compatible ? 'opacity-70' : ''}`}>
              <input type="checkbox" checked={config.workflow.skills.includes(skill.id)} disabled={!skill.compatible && !config.workflow.skills.includes(skill.id)} onChange={() => toggleSkill(skill.id)} />
              <span><strong className="text-sm text-fg">{skill.name}</strong><span className="ml-2 text-xs text-fg-muted">v{skill.version} · {skill.source} · ~{formatCount(estimateTokenCount(skill.content))} tokens</span><span className="mt-1 block text-xs text-fg-muted">{skill.description}</span>{skill.compatibilityReason && <span className="mt-2 block text-xs text-amber-300">{skill.compatibilityReason}</span>}<span className="mt-2 block whitespace-pre-wrap text-xs text-fg-muted">{skill.content.slice(0, 420)}</span></span>
            </label>
          ))}
        </div>
      )}

      {tab === 'work' && (
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-bg-1 p-4">
              <h3 className="text-sm font-semibold text-fg">Behavior</h3>
              <label className="mt-3 block text-xs text-fg-muted">Instruction detail</label>
              <div className="mt-1 grid grid-cols-3 gap-1">{(['caveman', 'standard', 'complete'] as const).map(mode => <button key={mode} type="button" onClick={() => onChange({ ...DEFAULT_WORK_OUTPUT, ...config.agent.workOutput, detailMode: mode })} className={`rounded-md border px-2 py-2 text-xs ${config.agent.workOutput.detailMode === mode ? 'border-primary bg-primary/10 text-primary' : 'border-border text-fg-muted'}`}>{mode}</button>)}</div>
              <label className="mt-4 block text-xs text-fg-muted">Task tracking cadence</label>
              <div className="mt-1 grid grid-cols-3 gap-1">{(['live', 'balanced', 'economy'] as const).map(cadence => <button key={cadence} type="button" onClick={() => onWorkflowChange({ ...config.workflow, trackingCadence: cadence })} className={`rounded-md border px-2 py-2 text-xs ${config.workflow.trackingCadence === cadence ? 'border-primary bg-primary/10 text-primary' : 'border-border text-fg-muted'}`}>{cadence}</button>)}</div>
            </section>

            <section className="rounded-lg border border-border bg-bg-1 p-4">
              <h3 className="text-sm font-semibold text-fg">Column semantics</h3>
              <div className="mt-3 space-y-3">{config.board.columns.map(name => {
                const meta = config.board.columnMeta[name] ?? { role: 'custom' as const };
                return <div key={name} className="rounded-md border border-border bg-bg p-3"><strong className="text-xs text-fg">{name}</strong><select value={meta.role} onChange={event => onColumnMetaChange({ ...config.board.columnMeta, [name]: { ...meta, role: event.target.value as ColumnRole } })} className="mt-2 w-full rounded border border-border bg-bg-2 px-2 py-1.5 text-xs text-fg">{ROLES.map(role => <option key={role}>{role}</option>)}</select><textarea value={meta.instructions ?? ''} onChange={event => onColumnMetaChange({ ...config.board.columnMeta, [name]: { ...meta, instructions: event.target.value } })} placeholder="Optional agent instruction" rows={2} className="mt-2 w-full rounded border border-border bg-bg-2 px-2 py-1.5 text-xs text-fg" /></div>;
              })}</div>
            </section>

            <section className="rounded-lg border border-border bg-bg-1 p-4">
              <h3 className="text-sm font-semibold text-fg">Project instructions</h3>
              <p className="mt-1 text-xs text-fg-muted">.kandown/kandown_work.md · ~{formatCount(estimateTokenCount(instructions))} tokens</p>
              <textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={12} className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-fg" />
              <button type="button" onClick={() => void saveInstructions()} disabled={busy || instructions === savedInstructions} className="mt-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">Save instructions</button>
            </section>
          </div>

          <section className="min-w-0 rounded-lg border border-border bg-bg-1 p-4">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-fg">Exact compiler preview</h3><p className="text-xs text-fg-muted">Same output as kandown work · ~{formatCount(workspace.stats.estimatedTokens)} tokens</p></div><div className="flex gap-2"><button type="button" onClick={() => setFullPreview(true)} className="rounded-md border border-border p-2 text-fg-muted hover:bg-bg-2" title="Read everything"><IconArrowsMaximize size={15} /></button><button type="button" onClick={() => { void navigator.clipboard.writeText(workspace.preview); toast('Preview copied.', 'success'); }} className="rounded-md border border-border p-2 text-fg-muted hover:bg-bg-2" title="Copy"><IconCopy size={15} /></button></div></div>
            {!!workspace.diagnostics.length && <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/5 p-3">{workspace.diagnostics.map(item => <p key={`${item.code}-${item.role}`} className="text-xs text-red-300">{item.message}</p>)}</div>}
            <pre className="mt-3 max-h-[900px] overflow-auto whitespace-pre-wrap rounded-md bg-bg p-4 text-xs leading-relaxed text-fg-muted">{workspace.preview}</pre>
          </section>
        </div>
      )}

      {fullPreview && (
        <div role="dialog" aria-modal="true" aria-label="Complete Kandown Work" className="fixed inset-0 z-[100] flex flex-col bg-bg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg-1 px-5 py-4">
            <div><h2 className="text-base font-semibold text-fg">Complete Kandown Work</h2><p className="text-xs text-fg-muted">~{formatCount(workspace.stats.estimatedTokens)} tokens · {formatCount(workspace.stats.words)} words · {formatCount(workspace.stats.characters)} characters · estimate varies by model</p></div>
            <div className="flex gap-2"><button type="button" onClick={() => { void navigator.clipboard.writeText(workspace.preview); toast('Kandown Work copied.', 'success'); }} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-fg hover:bg-bg-2"><IconCopy size={15} /> Copy all</button><button type="button" onClick={() => setFullPreview(false)} className="rounded-md border border-border p-2 text-fg hover:bg-bg-2" aria-label="Close full preview"><IconX size={17} /></button></div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-bg-2 px-4 py-6 md:px-8 md:py-10">
            <article className="mx-auto max-w-4xl rounded-xl border border-border bg-bg-1 px-4 py-6 shadow-sm md:px-10 md:py-10">
              <BlockNoteMarkdownEditor value={workspace.preview} readOnly minHeight="auto" />
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
