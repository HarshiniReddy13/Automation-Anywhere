import dotenv from 'dotenv';

dotenv.config();

/**
 * Self-contained configuration for the API automation module.
 *
 * Deliberately does NOT import from `config/environment.ts` (the UI
 * framework's config) — Use Case 2 must remain independent of Use Case 1's
 * code. It reads the *same* `.env` file, since both use cases genuinely
 * target the same live Automation Anywhere account/instance, but that's a
 * shared data source, not a code dependency.
 */

function readEnv(key: string, fallback?: string, required = false): string {
  const value = process.env[key] ?? fallback;
  if (required && (value === undefined || value === '')) {
    throw new Error(`ConfigManager: missing required environment variable "${key}"`);
  }
  return value ?? '';
}

function readNum(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface ApiConfig {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  /** Timeout (ms) applied to every individual API call. */
  readonly requestTimeoutMs: number;
  /** Max attempts (including the first) for retryable (transient) failures. */
  readonly maxRetryAttempts: number;
  /** Base delay (ms) for exponential backoff between retries. */
  readonly retryBaseDelayMs: number;
  /** Upper bound (ms) a single retry backoff will ever wait, regardless of attempt count. */
  readonly retryMaxDelayMs: number;
  /** Response-time budget (ms) used by ResponseValidator's performance assertions. */
  readonly maxAcceptableResponseTimeMs: number;
  /** Safety margin (seconds) subtracted from a token's real expiry before treating it as "expired". */
  readonly tokenExpiryBufferSeconds: number;
}

class ConfigManagerImpl {
  private cached: ApiConfig | undefined;

  get(): ApiConfig {
    if (!this.cached) {
      this.cached = {
        baseUrl: readEnv('BASE_URL', 'https://community.cloud.automationanywhere.digital'),
        username: readEnv('AA_USERNAME', '', true),
        password: readEnv('AA_PASSWORD', '', true),
        requestTimeoutMs: readNum('API_REQUEST_TIMEOUT_MS', 30_000),
        maxRetryAttempts: readNum('API_MAX_RETRY_ATTEMPTS', 3),
        retryBaseDelayMs: readNum('API_RETRY_BASE_DELAY_MS', 500),
        retryMaxDelayMs: readNum('API_RETRY_MAX_DELAY_MS', 8_000),
        maxAcceptableResponseTimeMs: readNum('API_MAX_RESPONSE_TIME_MS', 10_000),
        tokenExpiryBufferSeconds: readNum('API_TOKEN_EXPIRY_BUFFER_SECONDS', 60),
      };
    }
    return this.cached;
  }
}

/** Singleton — config is read once per process and reused. */
export const ConfigManager = new ConfigManagerImpl();
