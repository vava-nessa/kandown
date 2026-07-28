/**
 * @file Floating theme customizer modal (FABLE_UI + community store)
 * @description Draggable, minimizable, compact panel for editing a KandownTheme
 * JSON. Replaces the v1 centered modal with a four-tab floating editor
 * (Visual / Advanced / JSON / Publish) anchored bottom-right, draggable from
 * the header, collapsible to a small chip, with position persisted across
 * reloads in localStorage.
 *
 * Tabs
 *  - **Visual**: name, id, author; appearance (radius, shadows, density,
 *    motion, glass); HSL tokens with a light/dark switch and a live WCAG
 *    2.1 contrast check on background vs foreground.
 *  - **Advanced**: glass intensity (0-100), border width (0-4px), per-level
 *    shadow overrides, display font override.
 *  - **JSON**: full theme as JSON, with copy + paste-import.
 *  - **Publish**: GitHub username (persisted), Download JSON, Propose on
 *    GitHub (opens a prefilled `github.com/.../new/main/...` URL pointing at
 *    `registry/themes/<id>.json` with the JSON base64-encoded as the
 *    `value=` query parameter — the simplest zero-backend submission flow).
 *
 * 📖 The modal is mounted once at the shell level via ThemeCustomizerLauncher
 * so it can be opened from the skin picker, the Themes settings panel, or any
 * future entry point without coupling.
 *
 * @functions
 *  → ThemeCustomizerModal — floating panel for editing KandownTheme objects
 *
 * @exports ThemeCustomizerModal
 * @see src/components/ThemeCustomizerLauncher.tsx
 * @see src/lib/theme.ts
 * @see src/lib/types.ts
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCheck,
  IconCode,
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconExternalLink,
  IconPalette,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import type { KandownTheme, ThemeAppearance, ThemeTokens } from '../lib/types';

/* ═════════════ Position / size persistence ═════════════ */

const STORAGE_KEY = 'kandown.theme-editor';
const GITHUB_USER_KEY = 'kandown.theme-editor.githubUser';

interface EditorLayout {
  position: { x: number; y: number };
  size: { w: number; h: number };
  isMinimized: boolean;
}

const DEFAULT_LAYOUT: EditorLayout = {
  position: { x: -1, y: -1 }, // -1 means "snap to bottom-right on first render"
  size: { w: 400, h: 580 },
  isMinimized: false,
};

function loadLayout(): EditorLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<EditorLayout>) };
  } catch { /* ignore */ }
  return DEFAULT_LAYOUT;
}

function saveLayout(layout: EditorLayout): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* ignore */ }
}

function loadGithubUser(): string {
  try { return localStorage.getItem(GITHUB_USER_KEY) ?? ''; } catch { return ''; }
}

function saveGithubUser(name: string): void {
  try { if (name) localStorage.setItem(GITHUB_USER_KEY, name); } catch { /* ignore */ }
}

/** 📖 UTF-8 safe base64. The browser's `btoa` only handles latin-1, so we
 * round-trip through `encodeURIComponent` to keep accents / emojis intact. */
function base64EncodeUtf8(input: string): string {
  return btoa(unescape(encodeURIComponent(input)));
}

/* ═════════════ HSL <-> RGB <-> WCAG ═════════════ */

function parseHslToRgb(hslStr: string): [number, number, number] {
  const clean = hslStr.split('/')[0].trim();
  const parts = clean.split(/\s+/);
  if (parts.length < 3) return [0.5, 0.5, 0.5];

  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1].replace('%', '')) / 100;
  const l = parseFloat(parts[2].replace('%', '')) / 100;

  if (s === 0) return [l, l, l];

  const hue2rgb = (p: number, q: number, t: number) => {
    let tr = t;
    if (tr < 0) tr += 1;
    if (tr > 1) tr -= 1;
    if (tr < 1 / 6) return p + (q - p) * 6 * tr;
    if (tr < 1 / 2) return q;
    if (tr < 2 / 3) return p + (q - p) * (2 / 3 - tr) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function getLuminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hsl1: string, hsl2: string): number {
  const l1 = getLuminance(parseHslToRgb(hsl1));
  const l2 = getLuminance(parseHslToRgb(hsl2));
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

/* ═════════════ Component ═════════════ */

interface ThemeCustomizerModalProps {
  isOpen: boolean;
  initialTheme: KandownTheme;
  onClose: () => void;
  onSave: (theme: KandownTheme) => void;
}

type TabId = 'visual' | 'advanced' | 'json' | 'publish';

export const ThemeCustomizerModal: React.FC<ThemeCustomizerModalProps> = ({
  isOpen,
  initialTheme,
  onClose,
  onSave,
}) => {
  const [layout, setLayout] = useState<EditorLayout>(loadLayout);
  const [theme, setTheme] = useState<KandownTheme>(initialTheme);
  const [activeTab, setActiveTab] = useState<TabId>('visual');
  // 📖 The editor only edits `light` / `dark` token blocks. The `auto`
  // setting (theme mode that follows the OS) is owned by `applyProjectTheme`,
  // not the customizer.
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(initialTheme, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [githubUser, setGithubUser] = useState<string>(loadGithubUser);
  const [proposeCopied, setProposeCopied] = useState(false);

  // 📖 Sync the in-flight theme with the launcher-provided initialTheme. If
  // the launcher re-opens the modal with a different theme (e.g. user clicked
  // "Edit" on a different custom theme), we replace the in-flight state.
  useEffect(() => {
    setTheme(initialTheme);
    setJsonText(JSON.stringify(initialTheme, null, 2));
    setJsonError(null);
  }, [initialTheme]);

  useEffect(() => { saveLayout(layout); }, [layout]);

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);

  const effectivePosition = useMemo(() => {
    if (layout.position.x < 0 || layout.position.y < 0) {
      // 📖 First render: snap to bottom-right corner with a 24 px margin.
      const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const h = typeof window !== 'undefined' ? window.innerHeight : 768;
      return {
        x: Math.max(16, w - layout.size.w - 24),
        y: Math.max(16, h - layout.size.h - 24),
      };
    }
    return layout.position;
  }, [layout.position, layout.size]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // 📖 Only left-button drags move the panel. Ignore clicks on the
    // minimize/close buttons (they have their own handlers with stopPropagation).
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: effectivePosition.x,
      origY: effectivePosition.y,
    };
  }, [effectivePosition.x, effectivePosition.y]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const ref = dragRef.current;
      if (!ref) return;
      const dx = e.clientX - ref.startX;
      const dy = e.clientY - ref.startY;
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 40;
      setLayout(prev => ({
        ...prev,
        position: {
          x: Math.max(0, Math.min(maxX, ref.origX + dx)),
          y: Math.max(0, Math.min(maxY, ref.origY + dy)),
        },
      }));
    };
    const handleUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleAppearanceChange = useCallback(<K extends keyof ThemeAppearance>(key: K, value: ThemeAppearance[K]) => {
    setTheme(prev => ({
      ...prev,
      appearance: { ...prev.appearance, [key]: value },
    }));
  }, []);

  const handleTokenChange = useCallback((tokenName: keyof ThemeTokens, value: string) => {
    setTheme(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [tokenName]: value,
      },
    }));
  }, [mode]);

  const handleSave = useCallback(() => {
    if (activeTab === 'json') {
      try {
        const parsed = JSON.parse(jsonText) as KandownTheme;
        if (!parsed.id || !parsed.name || !parsed.light || !parsed.dark) {
          setJsonError('Theme JSON must contain id, name, light, and dark objects.');
          return;
        }
        onSave({ ...parsed, isCustom: true });
      } catch (err) {
        setJsonError(`Invalid JSON: ${(err as Error).message}`);
      }
      return;
    }
    onSave({ ...theme, isCustom: true });
  }, [activeTab, jsonText, theme, onSave]);

  const handleCopyJson = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(theme, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [theme]);

  const handleDownloadJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.id || 'theme'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [theme]);

  const handleProposeOnGithub = useCallback(() => {
    // 📖 The `value` query parameter on GitHub's new-file page accepts a
    // base64-encoded file body. We embed the current theme JSON so the user
    // lands on a pre-filled create-file page; the PR title defaults to the
    // commit message box, which they fill in.
    const themeWithAuthor = githubUser
      ? { ...theme, author: githubUser.startsWith('@') ? githubUser.slice(1) : githubUser }
      : theme;
    saveGithubUser(githubUser);
    const json = JSON.stringify(themeWithAuthor, null, 2);
    const params = new URLSearchParams({
      filename: `${theme.id}.json`,
      value: base64EncodeUtf8(json),
    });
    const url = `https://github.com/vava-nessa/kandown/new/main/registry/themes?${params.toString()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [theme, githubUser]);

  const handleCopyProposeUrl = useCallback(() => {
    const themeWithAuthor = githubUser
      ? { ...theme, author: githubUser.startsWith('@') ? githubUser.slice(1) : githubUser }
      : theme;
    saveGithubUser(githubUser);
    const json = JSON.stringify(themeWithAuthor, null, 2);
    const params = new URLSearchParams({
      filename: `${theme.id}.json`,
      value: base64EncodeUtf8(json),
    });
    const url = `https://github.com/vava-nessa/kandown/new/main/registry/themes?${params.toString()}`;
    navigator.clipboard.writeText(url);
    setProposeCopied(true);
    setTimeout(() => setProposeCopied(false), 1800);
  }, [theme, githubUser]);

  const currentTokens = theme[mode];
  const contrastRatio = getContrastRatio(currentTokens.background, currentTokens.foreground);
  const isContrastOk = contrastRatio >= 4.5;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        style={{
          position: 'fixed',
          left: effectivePosition.x,
          top: effectivePosition.y,
          width: layout.size.w,
          height: layout.isMinimized ? undefined : layout.size.h,
          zIndex: 9999,
        }}
        className="flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
      >
        {/* Drag header */}
        <div
          ref={headerRef}
          onMouseDown={handleDragStart}
          className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-card/90 select-none"
          style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <IconPalette className="w-4 h-4 text-primary flex-none" />
            <h3 className="font-semibold text-sm text-foreground truncate">
              {theme.name || 'Theme Editor'}
            </h3>
            {theme.isCustom && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">custom</span>}
          </div>

          <div className="flex items-center gap-1 flex-none">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLayout(prev => ({ ...prev, isMinimized: !prev.isMinimized })); }}
              title={layout.isMinimized ? 'Expand' : 'Minimize'}
              className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              {layout.isMinimized ? <IconArrowsMaximize className="w-4 h-4" /> : <IconArrowsMinimize className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              title="Close"
              className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!layout.isMinimized && (
          <>
            {/* Tab bar */}
            <div className="flex p-1 mx-3 mt-2 rounded-lg bg-muted text-xs font-medium">
              {(['visual', 'advanced', 'json', 'publish'] as TabId[]).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-2 py-1 rounded-md transition-colors ${
                    activeTab === tab ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'json' ? <span className="inline-flex items-center gap-1"><IconCode className="w-3 h-3" /> JSON</span> : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {activeTab === 'visual' && (
                <>
                  {/* Meta inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">Name</label>
                      <input
                        type="text"
                        value={theme.name}
                        onChange={e => setTheme(t => ({ ...t, name: e.target.value }))}
                        className="w-full px-2.5 py-1 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">ID</label>
                      <input
                        type="text"
                        value={theme.id}
                        onChange={e => setTheme(t => ({ ...t, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                        className="w-full px-2.5 py-1 text-sm rounded-lg bg-background border border-input font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">Author</label>
                      <input
                        type="text"
                        value={theme.author ?? ''}
                        onChange={e => setTheme(t => ({ ...t, author: e.target.value }))}
                        placeholder="@your-github-username"
                        className="w-full px-2.5 py-1 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Appearance */}
                  <div className="space-y-3 pt-2 border-t border-border">
                    <h4 className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Appearance</h4>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-foreground">Border radius</span>
                        <span className="font-mono text-muted-foreground">{theme.appearance.radius}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={24}
                        value={parseInt(theme.appearance.radius) || 0}
                        onChange={e => handleAppearanceChange('radius', `${e.target.value}px`)}
                        className="w-full accent-primary"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-foreground mb-1">Shadows</label>
                        <select
                          value={theme.appearance.shadows}
                          onChange={e => handleAppearanceChange('shadows', e.target.value as ThemeAppearance['shadows'])}
                          className="w-full px-2 py-1 text-xs rounded-lg bg-background border border-input text-foreground"
                        >
                          <option value="none">None</option>
                          <option value="soft">Soft</option>
                          <option value="elevated">Elevated</option>
                          <option value="dramatic">Dramatic</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-foreground mb-1">Density</label>
                        <select
                          value={theme.appearance.density}
                          onChange={e => handleAppearanceChange('density', e.target.value as ThemeAppearance['density'])}
                          className="w-full px-2 py-1 text-xs rounded-lg bg-background border border-input text-foreground"
                        >
                          <option value="compact">Compact</option>
                          <option value="comfortable">Comfortable</option>
                          <option value="relaxed">Relaxed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-foreground mb-1">Motion</label>
                        <select
                          value={theme.appearance.motion}
                          onChange={e => handleAppearanceChange('motion', e.target.value as ThemeAppearance['motion'])}
                          className="w-full px-2 py-1 text-xs rounded-lg bg-background border border-input text-foreground"
                        >
                          <option value="none">None</option>
                          <option value="subtle">Subtle</option>
                          <option value="playful">Playful</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <input
                          type="checkbox"
                          id="glass-toggle"
                          checked={theme.appearance.glass}
                          onChange={e => handleAppearanceChange('glass', e.target.checked)}
                          className="rounded accent-primary"
                        />
                        <label htmlFor="glass-toggle" className="text-[11px] font-medium text-foreground cursor-pointer">Glass</label>
                      </div>
                    </div>
                  </div>

                  {/* HSL tokens */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Tokens ({mode})</h4>
                      <div className="flex p-0.5 rounded-md bg-muted text-[10px]">
                        <button type="button" onClick={() => setMode('light')} className={`px-1.5 py-0.5 rounded ${mode === 'light' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>Light</button>
                        <button type="button" onClick={() => setMode('dark')} className={`px-1.5 py-0.5 rounded ${mode === 'dark' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>Dark</button>
                      </div>
                    </div>

                    <div className={`flex items-center justify-between p-2 rounded-md text-[11px] border ${
                      isContrastOk ? 'bg-success/10 border-success/30 text-success' : 'bg-warning/10 border-warning/30 text-warning'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {isContrastOk ? <IconCheck className="w-3.5 h-3.5" /> : <IconAlertTriangle className="w-3.5 h-3.5" />}
                        <span>WCAG contrast <strong>{contrastRatio.toFixed(2)}:1</strong></span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {(['background', 'foreground', 'card', 'primary', 'border', 'accent'] as const).map(token => (
                        <div key={token}>
                          <label className="block text-muted-foreground mb-0.5 font-mono">--{token}</label>
                          <input
                            type="text"
                            value={currentTokens[token]}
                            onChange={e => handleTokenChange(token, e.target.value)}
                            className="w-full px-2 py-0.5 rounded bg-background border border-input font-mono text-[10.5px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'advanced' && (
                <>
                  <div className="space-y-3">
                    <h4 className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Advanced appearance</h4>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-foreground">Glass intensity (backdrop blur)</span>
                        <span className="font-mono text-muted-foreground">{theme.appearance.glassIntensity ?? 20}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={60}
                        value={theme.appearance.glassIntensity ?? 20}
                        onChange={e => handleAppearanceChange('glassIntensity', parseInt(e.target.value, 10))}
                        className="w-full accent-primary"
                      />
                      <p className="text-[10.5px] text-muted-foreground mt-1">Applied as <code>--card-blur</code> when Glass is on. Curated themes ship a calibrated value.</p>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-foreground">Border width</span>
                        <span className="font-mono text-muted-foreground">{theme.appearance.borderWidth ?? '1px'}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={1}
                        value={parseInt(theme.appearance.borderWidth ?? '1px') || 0}
                        onChange={e => handleAppearanceChange('borderWidth', `${e.target.value}px`)}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border">
                    <h4 className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Per-level shadows</h4>
                    <p className="text-[10.5px] text-muted-foreground">Override the level-derived shadow for a custom look. Leave blank to use the Shadows preset.</p>
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-0.5 font-mono">--shadow-card</label>
                      <input
                        type="text"
                        value={theme.appearance.shadowCard ?? ''}
                        onChange={e => handleAppearanceChange('shadowCard', e.target.value || undefined)}
                        placeholder="0 1px 2px rgb(0 0 0 / 0.06)"
                        className="w-full px-2 py-1 rounded bg-background border border-input font-mono text-[10.5px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-0.5 font-mono">--shadow-popover</label>
                      <input
                        type="text"
                        value={theme.appearance.shadowPopover ?? ''}
                        onChange={e => handleAppearanceChange('shadowPopover', e.target.value || undefined)}
                        placeholder="0 8px 32px rgb(0 0 0 / 0.15)"
                        className="w-full px-2 py-1 rounded bg-background border border-input font-mono text-[10.5px]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border">
                    <h4 className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Display font</h4>
                    <p className="text-[10.5px] text-muted-foreground">Optional CSS stack for headings and large titles.</p>
                    <input
                      type="text"
                      value={theme.fonts?.display ?? ''}
                      onChange={e => setTheme(t => ({ ...t, fonts: { ...t.fonts, display: e.target.value || undefined } }))}
                      placeholder="'Newsreader', Georgia, serif"
                      className="w-full px-2 py-1 rounded bg-background border border-input font-mono text-[10.5px]"
                    />
                  </div>
                </>
              )}

              {activeTab === 'json' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground font-mono">JSON Definition</span>
                    <button type="button" onClick={handleCopyJson} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <IconCopy className="w-3 h-3" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {jsonError && (
                    <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[11px]">
                      {jsonError}
                    </div>
                  )}
                  <textarea
                    rows={14}
                    value={jsonText}
                    onChange={e => { setJsonText(e.target.value); setJsonError(null); }}
                    className="w-full p-2 font-mono text-[10.5px] rounded-xl bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </>
              )}

              {activeTab === 'publish' && (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">Your GitHub username</label>
                      <input
                        type="text"
                        value={githubUser}
                        onChange={e => setGithubUser(e.target.value)}
                        onBlur={() => saveGithubUser(githubUser)}
                        placeholder="@your-handle"
                        className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <p className="mt-1 text-[10.5px] text-muted-foreground">Stored locally and set as <code>author</code> when you propose this theme.</p>
                    </div>

                    <div className="p-3 rounded-xl bg-bg-2 border border-border space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      <p className="text-foreground font-medium">How submission works</p>
                      <ol className="list-decimal list-inside space-y-1.5">
                        <li><strong>Download</strong> the JSON, or click <strong>Propose on GitHub</strong> below.</li>
                        <li>GitHub opens a "create new file" page with the JSON prefilled.</li>
                        <li>Commit on a new branch; a PR opens against <code>vava-nessa/kandown</code>.</li>
                        <li>After review and merge, your theme appears in the in-app store and on <code>kandown.dev/themes</code>.</li>
                      </ol>
                      <p className="text-[10.5px] text-muted-foreground mt-2">No token, no backend. The "Propose on GitHub" button opens a zero-config PR.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadJson}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-bg-2 hover:bg-bg-3 border border-border text-foreground text-xs font-medium transition-colors"
                      >
                        <IconDownload className="w-4 h-4" /> Download JSON
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyProposeUrl}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-bg-2 hover:bg-bg-3 border border-border text-foreground text-xs font-medium transition-colors"
                      >
                        <IconCopy className="w-4 h-4" /> {proposeCopied ? 'Copied!' : 'Copy URL'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleProposeOnGithub}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold transition-colors shadow-xs"
                    >
                      <IconUpload className="w-4 h-4" /> Propose on GitHub
                      <IconExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </button>

                    <p className="text-[10.5px] text-muted-foreground text-center">
                      Tip: after GitHub opens, you can also add an entry to <code>registry/themes.json</code> in the same PR so the index picks up your theme.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-border flex items-center justify-between bg-card/80">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 text-xs rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
              >
                <IconDeviceFloppy className="w-3.5 h-3.5" />
                Save & Apply
              </button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};