/**
 * @file Kandown error hierarchy
 * @description Typed errors used across the web UI to distinguish failure modes
 * (browser support, permissions, disk full, corruption, parse errors) instead of
 * relying on generic `Error` + string matching.
 *
 * 📖 These error classes are thrown by the filesystem adapter (filesystem.ts),
 * caught by the store (store.ts) and the watcher (watcher.ts), and mapped to
 * user-facing toasts. They are intentionally browser-only — the CLI has its own
 * simpler error handling because Node fs errors already carry a `code` field.
 *
 * @functions
 *  → KandownError          — base class with an optional machine-readable code
 *  → BrowserNotSupportedError — FS Access API missing (Firefox / Safari)
 *  → PermissionDeniedError — handle revoked or access refused by the user
 *  → FileNotFoundError     — expected file is absent (often a benign case)
 *  → DiskFullError         — write failed because of quota / disk full
 *  → CorruptedDataError    — file content could not be parsed
 *  → FileReadError         — task/config read failure with a typed reason code
 *  → isRetryableError      — heuristic for the retry utility
 *  → Result                — discriminated union for fallible operations
 *
 * @exports KandownError, BrowserNotSupportedError, PermissionDeniedError,
 *          FileNotFoundError, DiskFullError, CorruptedDataError, FileReadError,
 *          FileReadErrorCode, isRetryableError, Result
 * @see src/lib/filesystem.ts
 * @see src/lib/retry.ts
 * @see src/lib/store.ts
 */

/**
 * 📖 Base class for every Kandown-specific error. Carries an optional stable
 * `code` string (e.g. `'DISK_FULL'`) so callers can branch without inspecting
 * the human message.
 */
export class KandownError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'KandownError';
  }
}

/** 📖 Raised when the File System Access API is unavailable (Firefox, Safari). */
export class BrowserNotSupportedError extends KandownError {
  constructor(browser: string) {
    super(
      `File System Access API is not supported in ${browser}. Please use Chrome, Edge, Brave, or Opera.`,
      'BROWSER_NOT_SUPPORTED',
    );
    this.name = 'BrowserNotSupportedError';
  }
}

/** 📖 Raised when a stored directory handle can no longer be used. */
export class PermissionDeniedError extends KandownError {
  constructor(context: string) {
    super(`Permission denied: ${context}`, 'PERMISSION_DENIED');
    this.name = 'PermissionDeniedError';
  }
}

/** 📖 Raised when a file expected to exist is absent. Usually benign. */
export class FileNotFoundError extends KandownError {
  constructor(path: string) {
    super(`File not found: ${path}`, 'NOT_FOUND');
    this.name = 'FileNotFoundError';
  }
}

/** 📖 Raised when a write fails because of disk full or storage quota. */
export class DiskFullError extends KandownError {
  constructor(path: string) {
    super(`Disk full or quota exceeded: cannot write to ${path}`, 'DISK_FULL');
    this.name = 'DiskFullError';
  }
}

/** 📖 Raised when a file exists but its content cannot be parsed. */
export class CorruptedDataError extends KandownError {
  constructor(path: string, details?: string) {
    super(`Corrupted data in ${path}${details ? `: ${details}` : ''}`, 'CORRUPTED');
    this.name = 'CorruptedDataError';
  }
}

/** 📖 Machine-readable reason codes for {@link FileReadError}. */
export type FileReadErrorCode =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'DISK_ERROR'
  | 'PARSE_ERROR'
  | 'UNKNOWN';

/**
 * 📖 Granular error for task/config reads. `isFileNotFound` is exposed directly
 * because "file deleted externally" is the one case that should be swallowed
 * silently by callers — every other code should surface a warning.
 */
export class FileReadError extends KandownError {
  constructor(
    message: string,
    public readonly readCode: FileReadErrorCode,
  ) {
    super(message, readCode);
    this.name = 'FileReadError';
  }

  /** Convenience: true when the file is simply absent (not a corruption). */
  get isFileNotFound(): boolean {
    return this.readCode === 'NOT_FOUND';
  }
}

/**
 * 📖 Heuristic used by {@link retry.ts} to decide whether an error is worth
 * retrying. Disk-full / quota errors are retryable because the user might free
 * space between attempts; transient network/timeout errors too. Hard failures
 * (corrupted content, permission denied, not found) are not.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof KandownError) {
    return error.code === 'DISK_FULL';
  }
  if (error instanceof DOMException) {
    return error.name === 'NetworkError' || error.name === 'TimeoutError';
  }
  return false;
}

/**
 * 📖 Discriminated union for operations that can fail without throwing. Used by
 * the `*Strict()` filesystem helpers so callers can pattern-match instead of
 * try/catch.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
