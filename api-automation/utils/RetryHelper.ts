import { ApiLogger } from './ApiLogger';



export interface RetryableError {
  statusCode?: number;
  message?: string;
}

const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatusCodes?: Set<number>;
  isRetryable?: (error: RetryableError) => boolean;
  label?: string;
}

function defaultIsRetryable(error: RetryableError, retryableStatusCodes: Set<number>): boolean {
  if (error.statusCode !== undefined) {
    return retryableStatusCodes.has(error.statusCode);
  }
  return true;
}

function computeBackoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelayMs * 0.25;
  return Math.min(exponential + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RetryHelper {

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
    throw lastError;
  }


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
