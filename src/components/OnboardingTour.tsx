/**
 * @file Lightweight 3-step onboarding modal
 * @description Quick guide on first launch introducing Kandown features.
 *
 * @exports OnboardingTour
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IconLayoutBoard, IconSparkles, IconCommand, IconX, IconChevronRight } from '@tabler/icons-react';
import { isDemoMode } from '../lib/filesystem';

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

const ONBOARDING_KEY = 'kandown_onboarding_seen';

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    // 📖 Never in the demo. The "seen" flag is the only thing keeping this modal
    // from being shown twice, and the demo deliberately persists nothing — so it
    // would greet every visitor on every single reload, on top of a page that
    // has already introduced the product. The demo's own chrome does this job.
    if (isDemoMode()) return;
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
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
