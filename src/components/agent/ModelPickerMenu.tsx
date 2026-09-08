/**
 * @file Model picker menu (t340, inspired by bb's picker)
 * @description The harness model picker, rebuilt the way bb (getbb) builds
 * its own: a trigger button carrying the provider glyph and the current
 * model, opening an upward menu with a search field on top, a row of
 * provider icon tabs (derived from the `provider/model` id prefixes of the
 * daemon catalog, each tab carrying its model count; a catalog that
 * collapses to a single provider hides the strip entirely, it never
 * renders as an empty bordered band), a "Model" section header sticky at
 * the top of the scrollable list, and a scrollable option list where each
 * row shows the provider glyph, the model name followed by its own
 * trailing "(...)" tag and its provider as subtle qualifiers (so
 * "Claude Opus 4.5 (latest)" and the bare "Claude Opus 4.5" snapshot stay
 * telling apart), a "New" badge for entries released in the last 14 days,
 * and a check mark on the pick. Arrow keys + Enter walk the rows, Esc
 * closes, and a query that matches no model can still be used verbatim
 * as a custom model id (t324 behavior, kept). The persisted pick is pinned
 * as the first catalog row whenever the search or a provider tab would
 * filter it out, so the active model never silently disappears from view.
 *
 * 📖 The old BUI dropdown capped the daemon catalog at 16 entries with no
 * search, which made the pi catalog (hundreds of openrouter models)
 * unusable: vava's "the model picker does not work at all". This component
 * replaces that menu and lists the whole catalog.
 *
 * @functions
 *  → isRecentRelease: true when a release date falls in the last 14 days
 *  → splitModelLabel: bb-style "Name (qualifier)" splitter
 *  → providerOf: provider segment of a catalog id
 *  → ModelPickerMenu: trigger + searchable provider-tabbed model menu
 *  → PickerRow: one rendered option row (base name + split/provider tags)
 *
 * @exports ModelPickerMenu
 * @see src/components/agent/AgentChatSurface.tsx: owns the catalog fetch and
 *  the persisted pick, mounts the picker inside the composer toolbar
 * @see src/components/agentIcons.tsx: the brand glyphs
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconChevronDown, IconSearch } from '@tabler/icons-react';
import { matchAgent } from '../../lib/agent-aliases';
import { AgentGlyph } from '../agentIcons';

/** 📖 One entry of the daemon's model catalog (t324): `id` is the harness
 * model id forwarded verbatim at session start, often `provider/model`. */
export interface ModelEntry {
  id: string;
  name: string;
  release?: string;
  current?: boolean;
}

/** 📖 bb's label splitter: a trailing "(...)" group becomes a subtle tag so
 * "GLM 5.2 (OpenCode Go)" renders as "GLM 5.2" + "OpenCode Go". */
export function splitModelLabel(name: string): { base: string; tag: string | null } {
  const match = /^(.*\S)\s*\(([^()]+)\)$/.exec(name);
  return match ? { base: match[1], tag: match[2] } : { base: name, tag: null };
}

/** 📖 Window under which a release date still earns the "New" badge (bb
 * marks freshly shipped models the same way): two weeks. */
const NEW_MODEL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** 📖 True when a catalog entry's ISO release date falls within the last
 * 14 days, checked against `now` captured at render (the menu is
 * short-lived, so a per-open timestamp is plenty fresh). Entries without a
 * parsable release date never qualify, and a future date still counts:
 * a model that has not officially landed yet is as new as it gets. */
function isRecentRelease(release: string | undefined, now: number): boolean {
  if (!release) return false;
  const date = new Date(release);
  if (Number.isNaN(date.getTime())) return false;
  return now - date.getTime() <= NEW_MODEL_WINDOW_MS;
}

/** 📖 Provider segment of a catalog id: the prefix before the first slash
 * ("openai/gpt-6" → openai, "openrouter/openai/gpt-6" → openrouter). Ids
 * without a slash (claude's "opus", "sonnet") belong to the harness vendor. */
export function providerOf(entry: ModelEntry): string {
  const slash = entry.id.indexOf('/');
  if (slash > 0) return entry.id.slice(0, slash);
  return 'core';
}

/** 📖 Provider id → brand glyph when one exists (openai, anthropic, google,
 * deepseek, qwen...); AgentGlyph itself falls back to its generic robot for
 * unknown providers. Always the plain chainable glyph: providers are labels
 * here, not launch targets, so the dashed desktop ring would be noise. */
function ProviderGlyph({ provider, size = 13 }: { provider: string; size?: number }) {
  const match = matchAgent(provider);
  return <AgentGlyph id={match?.id ?? provider} size={size} kind="chainable" />;
}

interface ModelPickerMenuProps {
  /** Full daemon catalog for the selected harness. An empty list keeps the
   * button but the menu only offers the harness default. */
  models: ModelEntry[];
  /** Persisted pick ('' = harness default). */
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** 📖 Provider credited for catalog ids without a slash segment: claude's
   * "opus"/"sonnet" belong to the claude vendor, codex's bare ids to codex.
   * Rows from this provider hide the redundant qualifier tag. */
  fallbackProvider?: string;
}

/** 📖 One rendered row of the option list. `name` is the base label (the
 * trailing "(...)" group stripped); `splitTag` is that stripped group
 * ("latest" in "Claude Opus 4.5 (latest)"), `tag` the provider qualifier.
 * Both render as subtle text after the name, so catalog entries that share
 * a base name stay telling apart. */
interface PickerRow {
  id: string;
  name: string;
  splitTag: string | null;
  tag: string | null;
  current: boolean;
  released: boolean;
  provider: string;
}

export function ModelPickerMenu({ models, value, onChange, disabled = false, fallbackProvider = '' }: ModelPickerMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState<string>('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 📖 The menu is portaled to document.body with fixed coordinates: the
  // composer container clips absolutely-positioned children (rounded shell),
  // which used to behead the menu. Computed once per open from the button,
  // capped to the space above it so the search header can never escape the
  // viewport (the list scrolls internally).
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; bottom: number; maxHeight: number } | null>(null);

  // 📖 Catalog ids without a slash ("opus", "sonnet") have no provider
  // segment: they belong to the harness vendor itself, so they adopt the
  // fallback provider instead of a meaningless "core" group.
  const effectiveProviderOf = (entry: ModelEntry): string => {
    const id = providerOf(entry);
    return id === 'core' && fallbackProvider ? fallbackProvider : id;
  };

  // 📖 Tab counts are raw catalog facts: how many entries each provider
  // group holds, unaffected by the search query or the active tab. The All
  // tab shows models.length as its total.
  const { providers, providerCounts } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of models) {
      const id = effectiveProviderOf(entry);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return {
      providers: [...counts.keys()].sort((a, b) =>
        (counts.get(b) ?? 0) !== (counts.get(a) ?? 0)
          ? (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
          : a.localeCompare(b)),
      providerCounts: counts,
    };
    // 📖 effectiveProviderOf is a pure function of its deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, fallbackProvider]);

  // 📖 Visible rows: "Harness default" first, then the filtered catalog with
  // the harness's current model floated to the top of its group. Two kinds
  // of subtle qualifier can follow the name: the name's own trailing
  // "(...)" tag (bb's splitter: "Claude Opus 4.5 (latest)" keeps "latest",
  // so it stays distinguishable from the bare "Claude Opus 4.5" snapshot
  // row) and the provider id. The fallback provider's rows hide their
  // provider qualifier ("opus (anthropic)" is noise when the whole picker
  // is already the claude harness), and a name tag identical to the
  // provider id (pi's "Fable 5.1 (anthropic)") renders once, never twice.
  const rows = useMemo<PickerRow[]>(() => {
    const query = search.trim().toLowerCase();
    const nowMs = Date.now();
    const toRow = (entry: ModelEntry): PickerRow => {
      const id = effectiveProviderOf(entry);
      const split = splitModelLabel(entry.name);
      return {
        id: entry.id,
        name: split.base,
        splitTag: split.tag,
        tag: id !== fallbackProvider && id !== split.tag ? id : null,
        current: entry.current ?? false,
        released: isRecentRelease(entry.release, nowMs),
        provider: id,
      };
    };
    const filtered = models.filter(entry => {
      const id = effectiveProviderOf(entry);
      if (provider && id !== provider) return false;
      if (!query) return true;
      return entry.name.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query);
    });
    const sorted = [...filtered].sort((a, b) =>
      a.current === b.current ? a.name.localeCompare(b.name) : a.current ? -1 : 1);
    // 📖 Never lose sight of the active pick: when the persisted selection
    // is filtered out by the search or a provider tab, pin it as the first
    // catalog row so it keeps its check mark in view. Custom ids that are
    // not in the catalog have no row to pin; the custom-row offer below
    // already covers them.
    const pinned = value !== '' && sorted.every(entry => entry.id !== value)
      ? models.filter(entry => entry.id === value).map(toRow)
      : [];
    return [
      { id: '', name: t('agentChat.modelDefault', 'Harness default'), splitTag: null, tag: null, current: false, released: false, provider: '' },
      ...pinned,
      ...sorted.map(toRow),
    ];
    // 📖 effectiveProviderOf is a pure function of its deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, search, provider, value, t, fallbackProvider]);

  // 📖 A query that matches nothing is still a valid model id (t324): offer
  // it verbatim as a custom pick instead of a dead end.
  const exactMatch = rows.some(row => row.id !== '' && row.id.toLowerCase() === search.trim().toLowerCase());
  const customRowId = search.trim() && !exactMatch ? `__custom__${search.trim()}` : null;

  useEffect(() => {
    setActive(0);
  }, [search, provider, open]);

  // 📖 Keyboard walk happens on the search input (it owns focus while the
  // menu is open), exactly like bb's combobox: arrows move, Enter picks,
  // Esc closes.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const total = rows.length + (customRowId ? 1 : 0);
      setActive(current => {
        const next = e.key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + total) % total;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (active < rows.length) {
        pick(rows[active].id);
      } else if (customRowId) {
        pick(search.trim());
      }
    }
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-row-index="${active}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // 📖 Outside click closes, like the rest of kandown's menus. Both the
  // trigger and the portaled menu count as "inside".
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (modelId: string) => {
    onChange(modelId);
    setOpen(false);
    setSearch('');
  };

  const openMenu = () => {
    if (disabled) return;
    setSearch('');
    setProvider('');
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuAnchor({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 6,
        maxHeight: Math.max(200, Math.min(420, rect.top - 16)),
      });
    }
    setOpen(true);
    // 📖 Focus after mount: the search owns the keyboard from the first frame.
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const selectedEntry = models.find(entry => entry.id === value);
  const selectedLabel = value === ''
    ? t('agentChat.modelDefault', 'Harness default')
    : splitModelLabel(selectedEntry?.name ?? value).base;
  const selectedProvider = value === '' ? '' : effectiveProviderOf(selectedEntry ?? { id: value, name: value });

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={disabled}
        title={t('agentChat.modelTitle', 'Model for new chats, empty uses the harness default')}
        className="flex h-7 min-w-0 max-w-[220px] items-center gap-1.5 rounded-md border border-border bg-bg px-2 text-[12px] text-fg transition-colors hover:border-border-strong disabled:opacity-50"
      >
        {selectedProvider !== '' && <ProviderGlyph provider={selectedProvider} size={12} />}
        <span className="min-w-0 truncate font-medium">{selectedLabel}</span>
        <IconChevronDown size={12} stroke={1.8} className="flex-none opacity-50" />
      </button>

      {open && menuAnchor && createPortal(
        <div
          ref={menuRef}
          style={{ left: menuAnchor.left, bottom: menuAnchor.bottom, maxHeight: menuAnchor.maxHeight }}
          className="fixed z-[300] flex w-[340px] flex-col overflow-hidden rounded-[10px] border border-border bg-bg shadow-[0_16px_48px_rgba(0,0,0,0.35)]"
        >
          {/* Search header, bb-style: icon left, combobox input. */}
          <div className="shrink-0 border-b border-border px-1.5 py-1">
            <div className="relative">
              <IconSearch
                size={14}
                stroke={1.8}
                className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-fg-faint"
              />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t('agentChat.modelSearch', 'Search models')}
                aria-label={t('agentChat.modelSearch', 'Search models')}
                role="combobox"
                aria-expanded
                aria-controls="kandown-model-list"
                className="h-7 w-full bg-transparent pl-8 pr-2 text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
              />
            </div>
          </div>
          {/* 📖 Provider icon tabs, only when the catalog genuinely spans
              several providers. The strip must never render empty: a
              single-provider catalog (claude's bare ids all collapse to the
              harness vendor) skips it entirely, and every rendered tab is
              guaranteed visible, a brand glyph (AgentGlyph's generic robot
              for unknown providers) plus its model count. The counts are
              raw catalog facts and do not react to the search query. */}
          {providers.length > 1 && (
            <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-1.5">
              <button
                type="button"
                onClick={() => setProvider('')}
                title={t('agentChat.modelTabCount', {
                  defaultValue: '{{provider}}: {{count}} models',
                  provider: t('agentChat.modelAllProviders', 'All'),
                  count: models.length,
                })}
                className={`relative h-8 px-1.5 text-[11px] text-fg-muted transition-colors hover:text-fg ${
                  provider === '' ? 'text-fg' : ''
                }`}
              >
                {t('agentChat.modelAllProviders', 'All')}
                <span className="align-super text-[9px] leading-none text-fg-faint">{models.length}</span>
                {provider === '' && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-fg" />}
              </button>
              {providers.map(id => {
                const count = providerCounts.get(id) ?? 0;
                // 📖 Same string feeds title and aria-label: sighted users
                // get the tooltip, screen readers get the count too.
                const countLabel = t('agentChat.modelTabCount', {
                  defaultValue: '{{provider}}: {{count}} models',
                  provider: id,
                  count,
                });
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setProvider(id)}
                    title={countLabel}
                    aria-label={countLabel}
                    className={`relative flex h-8 w-8 flex-col items-center justify-center gap-px transition-colors ${
                      provider === id ? 'text-fg' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    <ProviderGlyph provider={id} size={13} />
                    <span className="text-[9px] leading-none text-fg-faint">{count}</span>
                    {provider === id && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-fg" />}
                  </button>
                );
              })}
            </div>
          )}
          {/* Rows */}
          <div ref={listRef} id="kandown-model-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
            {/* Sticky group header: stays pinned while the catalog scrolls
                under it, like the search row above the list. */}
            <p className="sticky top-0 z-10 bg-bg px-2.5 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
              {t('agentChat.modelGroup', 'Model')}
            </p>
            {rows.map((row, index) => {
              const selected = row.id === value;
              return (
                <button
                  key={row.id || '__default__'}
                  type="button"
                  data-row-index={index}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(row.id)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                    index === active ? 'bg-secondary' : ''
                  } ${selected ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
                >
                  {row.provider !== '' && <ProviderGlyph provider={row.provider} size={13} />}
                  <span className="min-w-0 truncate font-medium text-fg" title={row.id}>{row.name}</span>
                  {/* 📖 Qualifiers hug the name, bb-style: the name's own
                      "(...)" tag first, the provider id after it. Both
                      truncate (min-w-0) so a long name never pushes the
                      badges or the check mark out of the row. */}
                  {row.splitTag && (
                    <span className="min-w-0 truncate text-[11px] text-fg-faint">{row.splitTag}</span>
                  )}
                  {row.tag && (
                    <span className="min-w-0 truncate text-[11px] text-fg-faint">{row.tag}</span>
                  )}
                  {row.current && (
                    <span className="flex-none rounded bg-primary/15 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-fg">
                      {t('agentChat.modelCurrentTag', 'Current')}
                    </span>
                  )}
                  {row.released && (
                    <span className="flex-none rounded bg-accent px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-accent-foreground">
                      {t('agentChat.modelNewTag', 'New')}
                    </span>
                  )}
                  {selected && (
                    <IconCheck size={13} stroke={2} className="ml-auto flex-none text-fg" />
                  )}
                </button>
              );
            })}
            {rows.length === 0 && !customRowId && (
              <p className="px-2.5 py-3 text-[12px] text-fg-muted">
                {t('agentChat.modelEmpty', 'No model matches this search.')}
              </p>
            )}
            {customRowId && (
              <button
                type="button"
                data-row-index={rows.length}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActive(rows.length)}
                onClick={() => pick(search.trim())}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                  active === rows.length ? 'bg-secondary' : ''
                } text-fg-muted hover:text-fg`}
              >
                <span className="min-w-0 truncate">
                  {t('agentChat.modelCustomUse', { defaultValue: 'Use "{{query}}" as custom model', query: search.trim() })}
                </span>
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
