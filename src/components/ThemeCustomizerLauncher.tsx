/**
 * @file Theme customizer launcher
 * @description Mounts one floating ThemeCustomizerModal at the app shell
 * (App.tsx) so the editor is reachable from anywhere: the skin picker's
 * "Create Custom Theme" and "Edit" actions, the Themes settings panel's
 * "Open editor" button, and any future entry point. Listens for the
 * `kandown:open-customizer` window event with a payload of
 * `{ theme?: KandownTheme }` and opens the modal with that theme. Without a
 * theme, the modal starts from a fresh custom copy of the house theme.
 *
 * 📖 The launcher exists because the modal used to live only inside the skin
 * picker (ThemeGalleryPicker), which meant opening it from a settings page
 * required navigating to appearance first. Now the modal is a singleton at
 * the shell level and the picker just dispatches an event.
 *
 * @see src/components/ThemeCustomizerModal.tsx
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { THEME_PRESETS, registerCustomThemes, applyProjectTheme } from '../lib/theme';
import { ThemeCustomizerModal } from './ThemeCustomizerModal';
import type { KandownTheme } from '../lib/types';

export function ThemeCustomizerLauncher() {
  const [open, setOpen] = useState(false);
  const [initialTheme, setInitialTheme] = useState<KandownTheme | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ theme?: KandownTheme }>).detail;
      if (detail?.theme) {
        setInitialTheme({ ...detail.theme });
      } else {
        // 📖 No theme provided: spawn a fresh custom theme based on the house
        // theme so the editor has something to mutate. `id` is unique per
        // create so multiple drafts can coexist until the user saves.
        const base = THEME_PRESETS[0];
        const id = `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
        setInitialTheme({
          ...base,
          id,
          name: 'My Custom Theme',
          author: 'You',
          description: 'Custom theme defined in kandown.json',
          isCustom: true,
        });
      }
      setOpen(true);
    };
    window.addEventListener('kandown:open-customizer', handler);
    return () => window.removeEventListener('kandown:open-customizer', handler);
  }, []);

  // 📖 Mirror of `ThemeGalleryPicker.handleSaveCustomTheme` — lifted here so
  // the launcher can save without coupling to the picker. Adds or replaces the
  // theme in `config.ui.customThemes`, registers it with the theme engine, and
  // applies it live.
  const handleSave = useCallback((savedTheme: KandownTheme) => {
    useStore.getState().updateConfig(cfg => {
      const existing = cfg.ui.customThemes || [];
      const idx = existing.findIndex(t => t.id === savedTheme.id);
      const nextCustoms = idx >= 0
        ? [...existing.slice(0, idx), savedTheme, ...existing.slice(idx + 1)]
        : [...existing, savedTheme];
      registerCustomThemes(nextCustoms);
      applyProjectTheme(cfg.ui.theme, savedTheme.id, cfg.ui.font, cfg.ui.background);
      return {
        ...cfg,
        ui: {
          ...cfg.ui,
          skin: savedTheme.id,
          customThemes: nextCustoms,
        },
      };
    });
    setOpen(false);
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  if (!open || !initialTheme) return null;
  return <ThemeCustomizerModal isOpen={open} initialTheme={initialTheme} onClose={handleClose} onSave={handleSave} />;
}