/**
 * @file React error boundary
 * @description Catches render-time errors in the child tree and displays a
 * recoverable fallback instead of letting React unmount the whole app to a
 * blank page.
 *
 * 📖 Kandown reads task and config files written by humans and AI agents, so
 * malformed data is a normal operating condition — not a bug. The boundary
 * makes sure one bad task never takes down the entire board. Granular
 * boundaries (around Board, around Drawer) keep unsaved drawer edits safe when
 * the board itself crashes.
 *
 * @functions
 *  → ErrorBoundary            — class component implementing the boundary
 *  → ErrorFallback            — default recoverable UI with Retry / Copy report
 *  → BoardErrorFallback       — compact fallback for the board area only
 *
 * @exports ErrorBoundary, ErrorFallback, BoardErrorFallback
 * @see src/App.tsx
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  children: ReactNode;
  /** Optional custom fallback; receives the current error and a retry callback. */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /** Called for every caught error — useful for logging / telemetry. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 📖 Top-level (or section-level) error boundary. Render stays a plain passthrough
 * until an error is caught, at which point it shows the fallback UI. `retry`
 * resets the state and re-renders the children from scratch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleCopyReport = (): void => {
    const { error, errorInfo } = this.state;
    const report = [
      'Kandown Error Report',
      '====================',
      `Time: ${new Date().toISOString()}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'n/a'}`,
      `Error: ${error?.toString() || 'Unknown'}`,
      `Stack: ${error?.stack || 'No stack trace'}`,
      `Component stack: ${errorInfo?.componentStack || 'No component stack'}`,
    ].join('\n');
    void navigator.clipboard?.writeText(report);
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback(this.state.error ?? new Error('Unknown'), this.handleRetry);
    }
    return (
      <ErrorFallback
        error={this.state.error}
        onRetry={this.handleRetry}
        onCopyReport={this.handleCopyReport}
      />
    );
  }
}

interface FallbackProps {
  error: Error | null;
  onRetry: () => void;
  onCopyReport?: () => void;
  compact?: boolean;
}

/**
 * 📖 Default full-page fallback. Shown when the whole app crashes: offers a
 * Retry button (re-mounts children) and a Copy-report button for debugging.
 */
export function ErrorFallback({ error, onRetry, onCopyReport }: FallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-10 text-center">
      <div className="max-w-lg w-full bg-danger/10 border border-danger/30 rounded-lg p-6 text-left">
        <h2 className="text-xl font-semibold text-danger mb-2">
          {t('errors.boundaryTitle', 'Something went wrong')}
        </h2>
        <p className="text-fg-dim text-[14px] mb-4 leading-relaxed">
          {t('errors.boundaryDesc', 'An unexpected error occurred. The app is still running but this view crashed.')}
        </p>
        {error && (
          <details className="mb-4 p-3 bg-bg-2 rounded text-[12px] font-mono overflow-auto max-h-40">
            <summary className="cursor-pointer font-semibold mb-1">{error.toString()}</summary>
            <pre className="whitespace-pre-wrap break-all mt-2 text-fg-muted">{error.stack ?? ''}</pre>
          </details>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 bg-accent text-white rounded hover:opacity-90 text-[13px] font-medium"
          >
            {t('errors.retry', 'Retry')}
          </button>
          <button
            type="button"
            onClick={onCopyReport}
            className="px-4 py-2 bg-bg-2 text-fg rounded hover:opacity-90 text-[13px] font-medium border border-border"
          >
            {t('errors.copyReport', 'Copy error report')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 📖 Compact inline fallback for board sections. Instead of taking over the
 * whole screen, it renders in place so the drawer and header keep working.
 */
export function BoardErrorFallback({ error, onRetry }: FallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-10 text-center">
      <div className="text-[15px] font-semibold text-danger">
        {t('errors.boardCrashed', 'Board failed to render')}
      </div>
      <div className="text-[12.5px] text-fg-dim max-w-md">
        {error?.message ?? t('errors.unknown', 'Unknown error')}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 bg-accent text-white rounded text-[13px] font-medium hover:opacity-90"
      >
        {t('errors.retry', 'Retry')}
      </button>
    </div>
  );
}
