/**
 * @file Visual Theme Editor & Customizer Modal (FABLE_UI)
 * @description Provides a visual editor for creating and tweaking custom JSON
 * themes, adjusting HSL tokens, radius, shadows, glass, motion, and checking live
 * WCAG 2.1 contrast compliance with JSON import/export capabilities.
 *
 * @functions
 *  → ThemeCustomizerModal — modal drawer for editing custom KandownTheme objects
 *
 * @exports ThemeCustomizerModal
 * @see src/lib/theme.ts
 * @see src/lib/types.ts
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  IconAlertTriangle,
  IconCheck,
  IconCode,
  IconCopy,
  IconDeviceFloppy,
  IconPalette,
  IconX,
} from '@tabler/icons-react';
import type { KandownTheme, ThemeAppearance, ThemeTokens } from '../lib/types';
import { THEME_PRESETS } from '../lib/theme';

interface ThemeCustomizerModalProps {
  isOpen: boolean;
  initialTheme: KandownTheme;
  onClose: () => void;
  onSave: (theme: KandownTheme) => void;
}

/** 📖 Helper to parse HSL string ("220 14% 99%" or "220 14% 99% / 0.8") to RGB [0-1] */
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

/** 📖 Calculates relative luminance of an RGB array [0-1] */
function getLuminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/** 📖 Calculates WCAG contrast ratio between two HSL strings */
function getContrastRatio(hsl1: string, hsl2: string): number {
  const l1 = getLuminance(parseHslToRgb(hsl1));
  const l2 = getLuminance(parseHslToRgb(hsl2));
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

export const ThemeCustomizerModal: React.FC<ThemeCustomizerModalProps> = ({
  isOpen,
  initialTheme,
  onClose,
  onSave,
}) => {
  const [theme, setTheme] = useState<KandownTheme>(initialTheme);
  const [activeTab, setActiveTab] = useState<'visual' | 'json'>('visual');
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(initialTheme, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentTokens = theme[mode];
  const contrastRatio = getContrastRatio(currentTokens.background, currentTokens.foreground);
  const isContrastOk = contrastRatio >= 4.5;

  const handleAppearanceChange = <K extends keyof ThemeAppearance>(key: K, value: ThemeAppearance[K]) => {
    setTheme(prev => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        [key]: value,
      },
    }));
  };

  const handleTokenChange = (tokenName: keyof ThemeTokens, value: string) => {
    setTheme(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [tokenName]: value,
      },
    }));
  };

  const handleSave = () => {
    if (activeTab === 'json') {
      try {
        const parsed = JSON.parse(jsonText) as KandownTheme;
        if (!parsed.id || !parsed.name || !parsed.light || !parsed.dark) {
          setJsonError('Theme JSON must contain id, name, light, and dark objects.');
          return;
        }
        onSave({ ...parsed, isCustom: true });
        onClose();
      } catch (err) {
        setJsonError(`Invalid JSON: ${(err as Error).message}`);
      }
    } else {
      onSave({ ...theme, isCustom: true });
      onClose();
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(theme, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
        >
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card/80">
            <div className="flex items-center gap-2">
              <IconPalette className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-lg text-foreground">
                {theme.isCustom ? 'Edit Custom Theme' : 'Customize Theme'}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {/* Tab Switcher */}
              <div className="flex p-0.5 rounded-lg bg-muted text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab('visual')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    activeTab === 'visual' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                  }`}
                >
                  Visual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJsonText(JSON.stringify(theme, null, 2));
                    setActiveTab('json');
                  }}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    activeTab === 'json' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                  }`}
                >
                  JSON
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Meta Inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Theme Name</label>
                <input
                  type="text"
                  value={theme.name}
                  onChange={e => setTheme(t => ({ ...t, name: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Theme ID</label>
                <input
                  type="text"
                  value={theme.id}
                  onChange={e => setTheme(t => ({ ...t, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg bg-background border border-input font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {activeTab === 'visual' ? (
              <>
                {/* Appearance Settings */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <h4 className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                    Appearance & Layout
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Radius */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-foreground">Border Radius</span>
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

                    {/* Shadows */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Shadow Elevation</label>
                      <select
                        value={theme.appearance.shadows}
                        onChange={e => handleAppearanceChange('shadows', e.target.value as ThemeAppearance['shadows'])}
                        className="w-full px-2.5 py-1 text-sm rounded-lg bg-background border border-input text-foreground"
                      >
                        <option value="none">None (Flat)</option>
                        <option value="soft">Soft</option>
                        <option value="elevated">Elevated</option>
                        <option value="dramatic">Dramatic</option>
                      </select>
                    </div>

                    {/* Density */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Density</label>
                      <select
                        value={theme.appearance.density}
                        onChange={e => handleAppearanceChange('density', e.target.value as ThemeAppearance['density'])}
                        className="w-full px-2.5 py-1 text-sm rounded-lg bg-background border border-input text-foreground"
                      >
                        <option value="compact font">Compact</option>
                        <option value="comfortable">Comfortable</option>
                        <option value="relaxed">Relaxed</option>
                      </select>
                    </div>

                    {/* Motion */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Motion & Animations</label>
                      <select
                        value={theme.appearance.motion}
                        onChange={e => handleAppearanceChange('motion', e.target.value as ThemeAppearance['motion'])}
                        className="w-full px-2.5 py-1 text-sm rounded-lg bg-background border border-input text-foreground"
                      >
                        <option value="none">None (Reduced Motion)</option>
                        <option value="subtle">Subtle</option>
                        <option value="playful">Playful</option>
                      </select>
                    </div>
                  </div>

                  {/* Glass Toggle */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="glass-toggle"
                      checked={theme.appearance.glass}
                      onChange={e => handleAppearanceChange('glass', e.target.checked)}
                      className="rounded accent-primary"
                    />
                    <label htmlFor="glass-toggle" className="text-xs font-medium text-foreground cursor-pointer">
                      Enable Glassmorphism & Translucent Backdrop Blur
                    </label>
                  </div>
                </div>

                {/* HSL Token Editor */}
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                      Color Tokens ({mode.toUpperCase()})
                    </h4>

                    {/* Mode Toggle */}
                    <div className="flex p-0.5 rounded-lg bg-muted text-xs">
                      <button
                        type="button"
                        onClick={() => setMode('light')}
                        className={`px-2 py-0.5 rounded-md ${mode === 'light' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                      >
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('dark')}
                        className={`px-2 py-0.5 rounded-md ${mode === 'dark' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>

                  {/* Live WCAG Compliance Warning */}
                  <div
                    className={`flex items-center justify-between p-2.5 rounded-lg text-xs border ${
                      isContrastOk
                        ? 'bg-success/10 border-success/30 text-success'
                        : 'bg-warning/10 border-warning/30 text-warning'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isContrastOk ? (
                        <IconCheck className="w-4 h-4 text-success" />
                      ) : (
                        <IconAlertTriangle className="w-4 h-4 text-warning" />
                      )}
                      <span>
                        WCAG 2.1 Text Contrast Ratio: <strong>{contrastRatio.toFixed(2)}:1</strong>{' '}
                        {isContrastOk ? '(Passes AA)' : '(Warning: < 4.5:1 may be hard to read)'}
                      </span>
                    </div>
                  </div>

                  {/* Token Inputs */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-muted-foreground mb-1 font-mono">--background</label>
                      <input
                        type="text"
                        value={currentTokens.background}
                        onChange={e => handleTokenChange('background', e.target.value)}
                        className="w-full px-2.5 py-1 rounded bg-background border border-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1 font-mono">--foreground</label>
                      <input
                        type="text"
                        value={currentTokens.foreground}
                        onChange={e => handleTokenChange('foreground', e.target.value)}
                        className="w-full px-2.5 py-1 rounded bg-background border border-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1 font-mono">--card</label>
                      <input
                        type="text"
                        value={currentTokens.card}
                        onChange={e => handleTokenChange('card', e.target.value)}
                        className="w-full px-2.5 py-1 rounded bg-background border border-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1 font-mono">--primary</label>
                      <input
                        type="text"
                        value={currentTokens.primary}
                        onChange={e => handleTokenChange('primary', e.target.value)}
                        className="w-full px-2.5 py-1 rounded bg-background border border-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1 font-mono">--border</label>
                      <input
                        type="text"
                        value={currentTokens.border}
                        onChange={e => handleTokenChange('border', e.target.value)}
                        className="w-full px-2.5 py-1 rounded bg-background border border-input font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-muted-foreground mb-1 font-mono">--accent</label>
                      <input
                        type="text"
                        value={currentTokens.accent}
                        onChange={e => handleTokenChange('accent', e.target.value)}
                        className="w-full px-2.5 py-1 rounded bg-background border border-input font-mono"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* JSON Code Tab */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">JSON Definition</span>
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <IconCopy className="w-3.5 h-3.5" />
                    {copied ? 'Copied!' : 'Copy JSON'}
                  </button>
                </div>

                {jsonError && (
                  <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                    {jsonError}
                  </div>
                )}

                <textarea
                  rows={16}
                  value={jsonText}
                  onChange={e => {
                    setJsonText(e.target.value);
                    setJsonError(null);
                  }}
                  className="w-full p-3 font-mono text-xs rounded-xl bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-card/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
            >
              <IconDeviceFloppy className="w-4 h-4" />
              Save & Apply Theme
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
