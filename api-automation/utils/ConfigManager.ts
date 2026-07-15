import dotenv from 'dotenv';

dotenv.config();



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

function readBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

export interface ApiConfig {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  readonly requestTimeoutMs: number;
  readonly maxRetryAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly maxAcceptableResponseTimeMs: number;
  readonly tokenExpiryBufferSeconds: number;
  readonly headless: boolean;
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
        headless: readBool('HEADLESS', true),
      };
    }
    return this.cached;
  }
}

export const ConfigManager = new ConfigManagerImpl();
