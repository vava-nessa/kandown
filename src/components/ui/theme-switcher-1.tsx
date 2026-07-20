"use client";

/**
 * @file Animated theme switcher
 * @description Three-option light/system/dark theme selector adapted from the
 * provided shadcn-style component for Kandown's Vite/Zustand theme system.
 *
 * 📖 Kandown is not a Next.js app and does not use `next-themes`; project theme
 * state lives in `.kandown/kandown.json` through the Zustand store. This
 * component keeps the requested visual treatment while persisting `auto`,
 * `light`, and `dark` through the existing config pipeline.
 *
 * @functions
 *  → ThemeOption — renders one radio-style icon button
 *  → ThemeSwitcher — animated theme radio group for auto/light/dark mode
 *
 * @exports ThemeSwitcher
 * @see src/lib/store.ts
 * @see src/lib/theme.ts
 */

import { MonitorIcon, MoonStarIcon, SunIcon } from 'lucide-react';
import { motion } from 'motion/react';
import type { JSX } from 'react';
import React, { useEffect, useId, useState } from 'react';

import { cn } from '../../lib/utils';
import { useStore } from '../../lib/store';
import type { ThemeMode } from '../../lib/types';

interface ThemeOptionConfig {
  icon: JSX.Element;
  value: ThemeMode;
  label: string;
}

function ThemeOption({
  icon,
  value,
  label,
  isActive,
  onClick,
  layoutId,
}: {
  icon: JSX.Element;
  value: ThemeMode;
  label: string;
  isActive?: boolean;
  onClick: (value: ThemeMode) => void;
  layoutId: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex size-8 cursor-default items-center justify-center rounded-full transition-all [&_svg]:size-4',
        isActive
          ? 'text-zinc-950 dark:text-zinc-50'
          : 'text-zinc-400 hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-zinc-50'
      )}
      role="radio"
      aria-checked={isActive}
      aria-label={`Switch to ${label} theme`}
      onClick={() => onClick(value)}
    >
      {icon}

      {isActive && (
        <motion.div
          layoutId={layoutId}
          transition={{ type: 'spring', bounce: 0.3, duration: 0.6 }}
          className="absolute inset-0 rounded-full border border-zinc-200 dark:border-zinc-700"
        />
      )}
    </button>
  );
}

const THEME_OPTIONS: ThemeOptionConfig[] = [
  {
    icon: <MonitorIcon />,
    value: 'auto',
    label: 'system',
  },
  {
    icon: <SunIcon />,
    value: 'light',
    label: 'light',
  },
  {
    icon: <MoonStarIcon />,
    value: 'dark',
    label: 'dark',
  },
];

function ThemeSwitcher({
  value,
  onChange,
  className,
}: {
  value?: ThemeMode;
  onChange?: (value: ThemeMode) => void;
  className?: string;
}) {
  const storeTheme = useStore(s => s.config.ui.theme);
  const updateConfig = useStore(s => s.updateConfig);
  const themeOptionLayoutId = `theme-option-${useId()}`;
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const activeTheme = value ?? storeTheme;
  const setTheme = onChange ?? ((nextTheme: ThemeMode) => {
    void updateConfig(current => ({
      ...current,
      ui: { ...current.ui, theme: nextTheme },
    }));
  });

  if (!isMounted) {
    return <div className={cn('flex h-8 w-24', className)} />;
  }

  return (
    <motion.div
      key={String(isMounted)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'inline-flex items-center overflow-hidden rounded-full bg-white ring-1 ring-zinc-200 ring-inset dark:bg-zinc-950 dark:ring-zinc-700',
        className
      )}
      role="radiogroup"
      aria-label="Theme mode"
    >
      {THEME_OPTIONS.map(option => (
        <ThemeOption
          key={option.value}
          icon={option.icon}
          value={option.value}
          label={option.label}
          isActive={activeTheme === option.value}
          onClick={setTheme}
          layoutId={themeOptionLayoutId}
        />
      ))}
    </motion.div>
  );
}

export { ThemeSwitcher };
