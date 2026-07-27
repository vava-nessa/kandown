/**
 * @file 3-step first-visit onboarding modal
 * @description Centered dialog that introduces Kandown the first time a user
 * opens a project, then disappears for good on that project. Triggered
 * automatically when `ui.onboardingCompleted = false` in the project config
 * (default for fresh projects), and re-openable from Settings via the
 * `kandown:showOnboarding` window event.
 *
 * 📖 State strategy. The persistent "have I shown the tour" flag lives in
 * the project config (`config.ui.onboardingCompleted`) so each project
 * remembers independently. The transient "show me right now" flag stays in
 * component state. A `userHasClosed` ref guards the auto-open effect
 * against re-firing after a manual close, since `setOpen(false)` and the
 * async `updateConfig` write otherwise race and can briefly look like
 * "open: false, completed: false" again, re-opening the modal in a flash.
 *
 * 📖 A11y. The modal exposes `role="dialog"`, `aria-modal="true"`,
 * `aria-labelledby` (title) and `aria-describedby` (description). Focus
 * is trapped inside the panel (Tab/Shift+Tab cycle) and restored to the
 * previously-focused element on close. `Escape` and backdrop click both
 * dismiss. A polite live region announces the current step to screen
 * readers without stealing focus.
 *
 * 📖 i18n. Every visible string comes from `useTranslation()` under the
 * `onboarding.*` namespace. Locales fall back to English when a key is
 * missing.
 *
 * @exports OnboardingTour
 * @see src/components/SettingsPage.tsx
 * @see src/lib/types.ts (KandownConfig.ui.onboardingCompleted)
 */

import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { IconLayoutBoard, IconSparkles, IconCommand, IconX, IconChevronRight, IconChevronLeft } from '@tabler/icons-react';
import { isDemoMode } from '../lib/filesystem';
import { useStore } from '../lib/store';

interface Step {
  Icon: typeof IconLayoutBoard;
  titleKey: string;
  descriptionKey: string;
}

const STEPS: Step[] = [
  {
    Icon: IconLayoutBoard,
    titleKey: 'onboarding.step1Title',
    descriptionKey: 'onboarding.step1Desc',
  },
  {
    Icon: IconSparkles,
    titleKey: 'onboarding.step2Title',
    descriptionKey: 'onboarding.step2Desc',
  },
  {
    Icon: IconCommand,
    titleKey: 'onboarding.step3Title',
    descriptionKey: 'onboarding.step3Desc',
  },
];

export function OnboardingTour() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const onboardingCompleted = useStore(s => s.config.ui.onboardingCompleted);
  const configLoaded = useStore(s => s.configLoaded);
  const updateConfig = useStore(s => s.updateConfig);

  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // 📖 Stays true after the user dismisses the modal until either (a) the
  // `kandown:showOnboarding` event reopens it from Settings, or (b) the
  // app remounts. Without this guard, `setOpen(false)` and the async
  // `updateConfig` write can race and the auto-open effect briefly sees
  // `open: false, onboardingCompleted: false` again, re-opening the modal
  // for a single frame.
  const userHasClosedRef = useRef(false);

  const titleId = useId();
  const descriptionId = useId();

  // 📖 Stable close handler so the focus-trap effect below can depend on
  // it without re-running on every parent render. Always persists
  // `onboardingCompleted: true` so a refresh before the next config write
  // doesn't resurrect the modal.
  const handleClose = useCallback(() => {
    userHasClosedRef.current = true;
    void updateConfig(current => ({
      ...current,
      ui: { ...current.ui, onboardingCompleted: true },
    }));
    setOpen(false);
  }, [updateConfig]);

  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      handleClose();
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  // 📖 First-visit auto-show. Only fires when the persistent flag is
  // false AND the user hasn't manually closed it during this mount.
  // `configLoaded` ensures we wait for the real persisted value instead
  // of acting on the `DEFAULT_CONFIG` placeholder (`onboardingCompleted:
  // false`) that the store starts with before `loadConfig()` resolves.
  useEffect(() => {
    if (isDemoMode()) return;
    if (!configLoaded) return;
    if (!onboardingCompleted && !userHasClosedRef.current) {
      setOpen(true);
    }
  }, [onboardingCompleted, configLoaded]);

  // 📖 External trigger from the Settings UI ("Re-open onboarding tour"
  // button). Resets the close guard so the auto-open effect does not
  // immediately close it again on the next render.
  useEffect(() => {
    const handler = () => {
      if (isDemoMode()) return;
      userHasClosedRef.current = false;
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener('kandown:showOnboarding', handler);
    return () => window.removeEventListener('kandown:showOnboarding', handler);
  }, []);

  // 📖 Focus trap + keyboard dismissal. Snap focus to the first focusable
  // element on open, cycle Tab/Shift+Tab inside the panel, restore focus
  // to the previously-focused element on close. `Escape` dismisses.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));

    // 📖 Defer the initial focus to the next tick so the AnimatePresence
    // exit/enter has a chance to mount the panel before we query it.
    const focusTimer = window.setTimeout(() => {
      focusables()[0]?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      // 📖 Restore focus to whatever was focused before the modal opened
      // (typically a body or a Settings button when triggered from there).
      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [open, handleClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="onboarding-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
            aria-hidden="true"
          />
          <motion.div
            key="onboarding-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
            className="fixed inset-0 m-auto h-fit w-[min(480px,92vw)] z-[201] rounded-xl border border-border bg-bg-1 p-6 shadow-2xl flex flex-col"
          >
            <button
              type="button"
              onClick={handleClose}
              aria-label={t('onboarding.close')}
              className="absolute right-4 top-4 text-fg-muted hover:text-fg"
            >
              <IconX size={18} />
            </button>

            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg-2 text-fg">
              {(() => {
                const StepIcon = STEPS[stepIndex].Icon;
                return <StepIcon size={24} aria-hidden="true" />;
              })()}
            </div>

            <h2 id={titleId} className="mb-2 text-lg font-bold text-fg">
              {t(STEPS[stepIndex].titleKey)}
            </h2>
            <p id={descriptionId} className="mb-6 text-sm text-fg-muted leading-relaxed">
              {t(STEPS[stepIndex].descriptionKey)}
            </p>

            {/* 📖 Screen-reader announcement of step transitions. Visually
             * hidden but still in the accessibility tree, with `aria-live`
             * set to `polite` so it does not interrupt the current
             * announcement. */}
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {t('onboarding.stepLabel', { current: stepIndex + 1, total: STEPS.length })}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-1.5" aria-hidden="true">
                {STEPS.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === stepIndex ? 'w-6 bg-fg' : 'w-1.5 bg-fg-faint'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-bg-2 px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-3 transition-colors"
                  >
                    <IconChevronLeft size={14} />
                    <span>{t('onboarding.back')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-1.5 rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90 transition-opacity"
                >
                  <span>{stepIndex === STEPS.length - 1 ? t('onboarding.getStarted') : t('onboarding.next')}</span>
                  <IconChevronRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}