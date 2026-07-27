/**
 * @file Lightweight 3-step onboarding modal
 * @description Quick guide on first launch introducing Kandown features.
 * Mounts only when the project config reports `ui.onboardingCompleted = false`
 * (defaults to false in `DEFAULT_CONFIG`), so each project sees the tour
 * once and never again unless the user re-opens it from Settings.
 *
 * 📖 State strategy. The persistent "have I shown the tour" flag lives in
 * the project config (`config.ui.onboardingCompleted`). The transient
 * "show me right now" flag stays in component state — it is flipped on by
 * (a) the first-render auto-show when the persistent flag is false, and
 * (b) a `kandown:showOnboarding` window event dispatched by the Settings
 * UI button. The demo build still never shows it (nothing to persist).
 *
 * @exports OnboardingTour
 * @see src/components/SettingsPage.tsx
 * @see src/lib/types.ts (KandownConfig.ui.onboardingCompleted)
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IconLayoutBoard, IconSparkles, IconCommand, IconX, IconChevronRight } from '@tabler/icons-react';
import { isDemoMode } from '../lib/filesystem';
import { useStore } from '../lib/store';

const STEPS = [
  {
    icon: IconLayoutBoard,
    title: 'Welcome to Kandown',
    description: 'Your local-first Kanban board backed by plain Markdown files in ./tasks/. Zero database, zero lock-in, versioned with git.',
  },
  {
    icon: IconSparkles,
    title: 'Easy Task Management',
    description: 'Drag & drop tasks between columns, track checklist progress, and use inline syntax like `#tag`, `@assignee`, or `p1` on creation.',
  },
  {
    icon: IconCommand,
    title: 'Keyboard & AI Driven',
    description: 'Press ⌘K / Ctrl+K anytime for the Command Palette. Launch AI agents directly on tasks to automate your workflow.',
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const onboardingCompleted = useStore(s => s.config.ui.onboardingCompleted);
  const updateConfig = useStore(s => s.updateConfig);

  useEffect(() => {
    // 📖 Never in the demo. The demo deliberately persists nothing — so the
    // persistent "completed" flag would never flip to true and the modal
    // would greet every visitor on every reload. The demo's own chrome does
    // the introduction job. Same guard as before, just rewritten around the
    // new project-scoped flag.
    if (isDemoMode()) return;
    if (!onboardingCompleted && !open) {
      setOpen(true);
    }
  }, [onboardingCompleted, open]);

  // 📖 External trigger from the Settings UI ("Re-open onboarding tour"
  // button). The store is locked behind the dependency-gate refactor, so
  // the Settings page dispatches a window event and we react here. Decouples
  // the modal from any specific store action without dragging the modal's
  // open state into a shared slice.
  useEffect(() => {
    const handler = () => {
      if (isDemoMode()) return;
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener('kandown:showOnboarding', handler);
    return () => window.removeEventListener('kandown:showOnboarding', handler);
  }, []);

  const handleClose = () => {
    // 📖 Persist immediately so a refresh before the next config write
    // doesn't resurrect the modal. The merge in `readConfigFileStrict`
    // already defaults a missing key to `false`, so a project that never
    // wrote this flag still gets the tour once.
    void updateConfig(current => ({
      ...current,
      ui: { ...current.ui, onboardingCompleted: true },
    }));
    setOpen(false);
  };

  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      handleClose();
    }
  };

  if (!open) return null;

  const current = STEPS[stepIndex];
  const StepIcon = current.icon;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md rounded-xl border border-border bg-bg-1 p-6 shadow-2xl"
        >
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 text-fg-muted hover:text-fg"
          >
            <IconX size={18} />
          </button>

          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg-2 text-fg">
            <StepIcon size={24} />
          </div>

          <h2 className="mb-2 text-lg font-bold text-fg">{current.title}</h2>
          <p className="mb-6 text-sm text-fg-muted leading-relaxed">{current.description}</p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === stepIndex ? 'w-6 bg-fg' : 'w-1.5 bg-fg-faint'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90 transition-opacity"
            >
              <span>{stepIndex === STEPS.length - 1 ? 'Get Started' : 'Next'}</span>
              <IconChevronRight size={14} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
