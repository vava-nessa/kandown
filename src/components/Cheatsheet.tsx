/**
 * @file Keyboard shortcuts cheatsheet
 * @description Centered modal that lists every keyboard shortcut in Kandown,
 * grouped by context (Global, Board, Drawer, Command Palette). Opened with
 * `?` (Shift+/) on the board, or via the help entry in the command palette.
 *
 * 📖 The shortcut list lives in one place (`SHORTCUTS` constant below) so it
 * stays the single source of truth. If you add a keybind elsewhere, mirror it
 * here — or refactor to a shared `shortcuts.ts` registry if the list grows.
 *
 * @functions
 *  → Cheatsheet — modal overlay listing all keyboard shortcuts
 *
 * @exports Cheatsheet
 * @see src/lib/store.ts
 * @see src/components/CommandPalette.tsx
 */

import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { Icon } from './Icons';

interface Shortcut {
  /** Keys to display (rendered as kbd chips). Use `+` for chords, `/` for alternates. */
  keys: string[];
  /** i18n key under `cheatsheet.shortcuts.*` */
  descriptionKey: string;
}

interface ShortcutGroup {
  /** i18n key under `cheatsheet.groups.*` */
  titleKey: string;
  shortcuts: Shortcut[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    titleKey: 'global',
    shortcuts: [
      { keys: ['⌘', 'K'], descriptionKey: 'commandPalette' },
      { keys: ['?'], descriptionKey: 'showCheatsheet' },
      { keys: ['⌘', '1'], descriptionKey: 'boardView' },
      { keys: ['⌘', '2'], descriptionKey: 'listView' },
      { keys: ['N'], descriptionKey: 'newTask' },
      { keys: ['R'], descriptionKey: 'reloadBoard' },
      { keys: ['/'], descriptionKey: 'focusSearch' },
      { keys: ['Esc'], descriptionKey: 'closeOverlay' },
    ],
  },
  {
    titleKey: 'drawer',
    shortcuts: [
      { keys: ['⌘', 'S'], descriptionKey: 'saveClose' },
      { keys: ['⌘', '⌫'], descriptionKey: 'deleteTask' },
      { keys: ['Esc'], descriptionKey: 'cancel' },
    ],
  },
  {
    titleKey: 'commandPalette',
    shortcuts: [
      { keys: ['↑', '↓'], descriptionKey: 'navigate' },
      { keys: ['↵'], descriptionKey: 'select' },
      { keys: ['Esc'], descriptionKey: 'close' },
    ],
  },
  {
    titleKey: 'tui',
    shortcuts: [
      { keys: ['H', 'L'], descriptionKey: 'switchColumn' },
      { keys: ['J', 'K'], descriptionKey: 'selectTask' },
      { keys: ['Enter'], descriptionKey: 'openTask' },
      { keys: ['M'], descriptionKey: 'contextMenu' },
      { keys: ['A'], descriptionKey: 'launchAgent' },
      { keys: ['D'], descriptionKey: 'toggleDaemon' },
      { keys: ['Q'], descriptionKey: 'quit' },
    ],
  },
];

function KbdChip({ children }: { children: string }) {
  return <kbd className="kbd">{children}</kbd>;
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[13.5px] text-fg-dim">{label}</span>
      <span className="flex items-center gap-1 flex-shrink-0">
        {keys.map((k, i) => (
          // Join chords with a small `+` separator, alternates with `/` are kept
          // in a single chip (e.g. "J/K") — split on '/' upstream if needed.
          <span key={i} className="flex items-center gap-1">
            <KbdChip>{k}</KbdChip>
            {i < keys.length - 1 && <span className="text-fg-faint text-[11px]">+</span>}
          </span>
        ))}
      </span>
    </div>
  );
}

export function Cheatsheet() {
  const { t } = useTranslation();
  const cheatsheetOpen = useStore(s => s.cheatsheetOpen);
  const setCheatsheetOpen = useStore(s => s.setCheatsheetOpen);

  return (
    <AnimatePresence>
      {cheatsheetOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setCheatsheetOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-[3px] z-[200]"
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('cheatsheet.title')}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
            className="fixed inset-0 m-auto h-fit w-[min(720px,92vw)] max-h-[80vh] z-[201] glass rounded-[10px] shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-12 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Icon.Keyboard size={15} className="text-fg-muted" />
                <h2 className="text-[14.5px] font-semibold text-fg">
                  {t('cheatsheet.title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCheatsheetOpen(false)}
                aria-label={t('cheatsheet.close')}
                className="text-fg-muted hover:text-fg transition-colors"
              >
                <Icon.X size={16} />
              </button>
            </div>

            {/* Body — two-column grid of shortcut groups on wide screens,
                single-column on narrow viewports. Scrolls if content overflows. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 px-5 py-5 overflow-y-auto">
              {SHORTCUTS.map(group => (
                <section key={group.titleKey}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint mb-1.5">
                    {t(`cheatsheet.groups.${group.titleKey}`)}
                  </h3>
                  <div className="flex flex-col divide-y divide-border/40">
                    {group.shortcuts.map((sc, i) => (
                      <ShortcutRow
                        key={i}
                        keys={sc.keys}
                        label={t(`cheatsheet.shortcuts.${sc.descriptionKey}`)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 h-9 border-t border-border text-[12px] text-fg-muted flex-shrink-0">
              <span>{t('cheatsheet.footerHint')}</span>
              <span className="kbd">esc</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
