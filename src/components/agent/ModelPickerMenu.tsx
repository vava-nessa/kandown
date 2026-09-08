/**
 * @file Model picker menu (t340, inspired by bb's picker)
 * @description The harness model picker, rebuilt the way bb (getbb) builds
 * its own: a trigger button carrying the provider glyph and the current
 * model, opening an upward menu with a search field on top, a row of
 * provider icon tabs (derived from the `provider/model` id prefixes of the
 * daemon catalog), a "Model" section header and a scrollable option list
 * where each row shows the provider glyph, the model name, its provider as
 * a subtle qualifier and a check mark on the pick. Arrow keys + Enter walk
 * the rows, Esc closes, and a query that matches no model can still be
 * used verbatim as a custom model id (t324 behavior, kept).
 *
 * 📖 The old BUI dropdown capped the daemon catalog at 16 entries with no
 * search, which made the pi catalog (hundreds of openrouter models)
 * unusable: vava's "the model picker does not work at all". This component
 * replaces that menu and lists the whole catalog.
 *
 * @functions
 *  → splitModelLabel: bb-style "Name (qualifier)" splitter
 *  → providerOf: provider segment of a catalog id
 *  → ModelPickerMenu: trigger + searchable provider-tabbed model menu
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

  const providers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of models) {
      const id = effectiveProviderOf(entry);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.keys()].sort((a, b) =>
      (counts.get(b) ?? 0) !== (counts.get(a) ?? 0)
        ? (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
        : a.localeCompare(b));
    // 📖 effectiveProviderOf is a pure function of its deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, fallbackProvider]);

  // 📖 Visible rows: "Harness default" first, then the filtered catalog with
  // the harness's current model floated to the top of its group. The
  // fallback provider's rows hide their qualifier: "opus (anthropic)" would
  // be noise when the whole picker is already the claude harness.
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = models.filter(entry => {
      const id = effectiveProviderOf(entry);
      if (provider && id !== provider) return false;
      if (!query) return true;
      return entry.name.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query);
    });
    const sorted = [...filtered].sort((a, b) =>
      a.current === b.current ? a.name.localeCompare(b.name) : a.current ? -1 : 1);
    return [
      { id: '', name: t('agentChat.modelDefault', 'Harness default'), tag: null as string | null, current: false, provider: '' },
      ...sorted.map(entry => {
        const id = effectiveProviderOf(entry);
        return {
          id: entry.id,
          name: splitModelLabel(entry.name).base,
          tag: id !== fallbackProvider ? id : null,
          current: entry.current ?? false,
          provider: id,
        };
      }),
    ];
    // 📖 effectiveProviderOf is a pure function of its deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, search, provider, t, fallbackProvider]);

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
          {/* Provider icon tabs: only when the catalog spans several. */}
          {providers.length > 1 && (
            <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-1.5">
              <button
                type="button"
                onClick={() => setProvider('')}
                className={`relative h-8 px-1.5 text-[11px] text-fg-muted transition-colors hover:text-fg ${
                  provider === '' ? 'text-fg' : ''
                }`}
              >
                {t('agentChat.modelAllProviders', 'All')}
                {provider === '' && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-fg" />}
              </button>
              {providers.map(id => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProvider(id)}
                  title={id}
                  aria-label={id}
                  className={`relative flex h-8 w-8 items-center justify-center transition-colors ${
                    provider === id ? 'text-fg' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  <ProviderGlyph provider={id} size={14} />
                  {provider === id && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-fg" />}
                </button>
              ))}
            </div>
          )}
          {/* Rows */}
          <div ref={listRef} id="kandown-model-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
            <p className="px-2.5 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
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
                  {row.current && (
                    <span className="flex-none rounded bg-primary/15 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-fg">
                      {t('agentChat.modelCurrentTag', 'Current')}
                    </span>
                  )}
                  {row.tag && (
                    <span className="min-w-0 truncate text-[11px] text-fg-faint">{row.tag}</span>
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
