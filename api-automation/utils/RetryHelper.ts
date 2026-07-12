import { ApiLogger } from './ApiLogger';

/**
 * Anti-flakiness primitives: retry-with-backoff for transient failures, and
 * poll-until for waiting on eventual state instead of a fixed sleep.
 *
 * Nothing here uses a hardcoded, unconditional delay — every wait is either
 * (a) bounded exponential backoff applied only to failures classified as
 * transient, or (b) a poll loop that exits the moment its condition is
 * true, capped by an explicit timeout.
 */

export interface RetryableError {
  /** HTTP status code, if this failure came from an HTTP response. */
  statusCode?: number;
  message?: string;
}

/** Status codes that represent a transient, worth-retrying failure — not a real validation/business error. */
const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  /** Total attempts including the first — e.g. 3 means "try, then retry twice". */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Overrides the default transient-status classification. */
  retryableStatusCodes?: Set<number>;
  /** Custom predicate for whether a given error should be retried; defaults to statusCode-based. */
  isRetryable?: (error: RetryableError) => boolean;
  /** Label used in log output, e.g. "createLearningInstance". */
  label?: string;
}

function defaultIsRetryable(error: RetryableError, retryableStatusCodes: Set<number>): boolean {
  if (error.statusCode !== undefined) {
    return retryableStatusCodes.has(error.statusCode);
  }
  // No status code means a network-level failure (timeout, connection reset, DNS, etc.) — transient by nature.
  return true;
}

/** Exponential backoff with a small random jitter, capped at `maxDelayMs`. */
function computeBackoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelayMs * 0.25;
  return Math.min(exponential + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RetryHelper {
  /**
   * Runs `fn`, retrying with exponential backoff only when the thrown error
   * is classified as transient. Non-transient errors (e.g. a 400 validation
   * failure) surface immediately on the first attempt — retrying a request
   * that's wrong won't make it right.
   */
  static async retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelayMs = 500,
      maxDelayMs = 8_000,
      retryableStatusCodes = DEFAULT_RETRYABLE_STATUS_CODES,
      isRetryable = (e) => defaultIsRetryable(e, retryableStatusCodes),
      label = 'operation',
    } = options;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const retryable = isRetryable(error as RetryableError);
        const isLastAttempt = attempt === maxAttempts;

        if (!retryable) {
          ApiLogger.info(label, `Attempt ${attempt} failed with a non-transient error — not retrying.`);
          throw error;
        }
        if (isLastAttempt) {
          ApiLogger.warn(label, `Attempt ${attempt}/${maxAttempts} failed and no attempts remain.`);
          throw error;
        }

        const delay = computeBackoffMs(attempt, baseDelayMs, maxDelayMs);
        ApiLogger.warn(
          label,
          `Attempt ${attempt}/${maxAttempts} failed (transient) — retrying in ${Math.round(delay)}ms.`
        );
        await sleep(delay);
      }
    }
    // Unreachable given the loop above always returns or throws, but keeps TypeScript satisfied.
    throw lastError;
  }

  /**
   * Polls `check()` until it resolves truthy or `timeoutMs` elapses.
   * Use this instead of a fixed `waitForTimeout` whenever you're waiting
   * for eventual state (e.g. an async processing status to change).
   */
  static async pollUntil(
    check: () => Promise<boolean>,
    options: { timeoutMs?: number; intervalMs?: number; label?: string } = {}
  ): Promise<void> {
    const { timeoutMs = 30_000, intervalMs = 1_000, label = 'poll' } = options;
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt += 1;
      if (await check()) {
        ApiLogger.info(label, `Condition met after ${attempt} check(s).`);
        return;
      }
      await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    }

    throw new Error(`${label}: condition not met within ${timeoutMs}ms (${attempt} checks performed).`);
  }
}
