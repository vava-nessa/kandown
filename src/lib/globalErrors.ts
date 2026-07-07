/**
 * @file Global browser error handlers
 * @description Last-resort safety net that catches uncaught JavaScript errors
 * and unhandled promise rejections, logs them, and shows a throttled toast so
 * the user is informed without being spammed.
 *
 * 📖 This module is intentionally tiny and side-effect-only. It must be safe to
 * call before React mounts and must never throw. The store is imported lazily
 * to avoid a circular dependency (store.ts → notifications → ...).
 *
 * 📖 Throttling: at most {@link MAX_TOAST_ERRORS} toasts every
 * {@link ERROR_WINDOW_MS} milliseconds. Repeated identical errors are
 * deduplicated so a tight rejection loop won't flood the UI.
 *
 * @functions
 *  → setupGlobalErrorHandlers — installs window listeners (idempotent)
 *  → getErrorStats           — returns cumulative error counters for debugging
 *
 * @exports setupGlobalErrorHandlers, getErrorStats
 * @see src/main.tsx
 */

const ERROR_WINDOW_MS = 5000;
const MAX_TOAST_ERRORS = 3;
const RESET_INTERVAL_MS = 30_000;

let installed = false;
let errorCount = 0;
let toastCount = 0;
let lastErrorTime = 0;
let lastToastMessage = '';

/**
 * 📖 Decides whether a new error should produce a toast. Combines a time
 * window, an absolute cap, and deduplication of identical messages.
 */
function shouldShowToast(message: string): boolean {
  const now = Date.now();
  if (now - lastErrorTime < ERROR_WINDOW_MS && message === lastToastMessage) return false;
  if (toastCount >= MAX_TOAST_ERRORS) return false;
  lastErrorTime = now;
  lastToastMessage = message;
  toastCount++;
  return true;
}

function showToast(message: string): void {
  // Lazy import keeps the module safe to load before the store exists, and
  // avoids a circular dependency on the store bundle.
  import('./store')
    .then(({ useStore }) => {
      useStore.getState().toast(message, 'warning', 5000);
    })
    .catch(() => {
      // Store unavailable — nothing else we can do, the console log is enough.
    });
}

/**
 * 📖 Installs `window.onerror` and `unhandledrejection` listeners. Idempotent:
 * calling it more than once is a no-op. Safe to call in tests or after a hot
 * reload.
 */
export function setupGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  // 📖 Synchronous errors thrown outside React's render path (event handlers,
  // timeouts, etc.).
  window.addEventListener('error', (event: ErrorEvent) => {
    errorCount++;
    // eslint-disable-next-line no-console
    console.error('[Global] Uncaught error:', event.error ?? event.message);
    if (shouldShowToast(event.message || 'Uncaught error')) {
      showToast('An unexpected error occurred — see console for details');
    }
    // Intentionally do NOT call preventDefault: we still want the browser's
    // default console entry so dev tools keep working.
  });

  // 📖 Unhandled promise rejections — the more common source of silent failures
  // in an async-heavy app.
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    errorCount++;
    const reason = event.reason;
    // eslint-disable-next-line no-console
    console.error('[Global] Unhandled promise rejection:', reason);
    const message = reason instanceof Error ? reason.message : String(reason);
    if (shouldShowToast(message)) {
      showToast('An async operation failed unexpectedly — see console for details');
    }
    // Prevent the browser's default "unhandled rejection" console warning,
    // since we already logged a richer entry above.
    event.preventDefault();
  });

  // 📖 Reset the toast cap periodically so a transient burst at startup doesn't
  // silence the handler for the whole session.
  window.setInterval(() => {
    toastCount = 0;
  }, RESET_INTERVAL_MS);
}

/** 📖 Cumulative counters since page load — handy for diagnostics / debugging. */
export function getErrorStats(): { errorCount: number } {
  return { errorCount };
}
