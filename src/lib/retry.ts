/**
 * @file Retry utility with exponential backoff
 * @description Small, dependency-free helper that retries a fallible async
 * operation a bounded number of times, only when the error is transient.
 *
 * 📖 Used by the store to wrap filesystem writes so that disk-full / quota
 * errors (which may resolve themselves when the user frees space) get a couple
 * of automatic retries before the optimistic update is rolled back.
 *
 * @functions
 *  → withRetry — retry an async operation with exponential backoff
 *
 * @exports withRetry
 * @see src/lib/errors.ts — isRetryableError
 * @see src/lib/store.ts
 */

import { isRetryableError } from './errors';

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default 3. */
  maxAttempts?: number;
  /** Base delay in ms; real delay grows as baseDelay * 2^(attempt-1). Default 500ms. */
  baseDelayMs?: number;
  /**
   * Predicate deciding whether an error is worth retrying. Defaults to
   * {@link isRetryableError} from the error hierarchy.
   */
  retryableCheck?: (error: unknown) => boolean;
}

/**
 * 📖 Retries `operation` until it either succeeds, throws a non-retryable error,
 * or exhausts `maxAttempts`. Delays between attempts use exponential backoff.
 *
 * @returns the resolved value of `operation`
 * @throws the last error if all attempts fail or the error is non-retryable
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    retryableCheck = isRetryableError,
  } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (e) {
      lastError = e;
      // Non-retryable errors bubble up immediately — no point in waiting.
      if (!retryableCheck(e)) throw e;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
