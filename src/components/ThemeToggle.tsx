/**
 * @file Theme switch toggle
 * @description Light/dark mode switcher for the app header. Adapts the
 * design from the demo component (switch variant) to work with the existing
 * Kandown theming system via CSS tokens.
 *
 * @functions
 *  → ThemeToggle — animated sun/moon toggle button
 *
 * @exports ThemeToggle
 * @see src/lib/theme.ts
 * @see src/components/Header.tsx
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useStore } from '../lib/store';
import { cn } from '../lib/utils';
import { Icon } from './Icons';

export function ThemeToggle() {
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const resolvedTheme = config.ui.theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : config.ui.theme;

  const isDark = resolvedTheme === 'dark';

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    void updateConfig(current => ({
      ...current,
      ui: { ...current.ui, theme: nextTheme },
    }));
  };

  return (
    <motion.button
      onClick={toggleTheme}
      className={cn(
        'relative inline-flex items-center rounded-full transition-all duration-300',
        'border border-black/[0.08] dark:border-white/[0.12]',
        'bg-black/[0.05] dark:bg-white/[0.08]',
        'h-8 w-[52px] px-1',
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        className={cn(
          'inline-flex items-center justify-center rounded-full shadow-md',
          isDark ? 'bg-[#1e293b] border border-white/[0.15]' : 'bg-black border border-black/20',
          'h-[26px] w-[26px]'
        )}
        animate={{ x: isDark ? 22 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <motion.div
          key={resolvedTheme}
          initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {isDark ? (
            <Icon.Moon size={13} className="text-sky-300" />
          ) : (
            <Icon.Sun size={13} className="text-amber-400" />
          )}
        </motion.div>
      </motion.div>
    </motion.button>
  );
}
