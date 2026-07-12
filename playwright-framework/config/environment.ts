import dotenv from 'dotenv';

dotenv.config();

/**
 * Strongly-typed environment configuration.
 *
 * Values are resolved with the following precedence:
 *   1. Process environment variables (.env / CI secrets)
 *   2. Per-environment defaults defined below
 *
 * This keeps secrets out of source control while giving every environment a
 * sensible, self-documenting default.
 */

export type EnvName = 'dev' | 'staging' | 'prod';

export interface AppCredentials {
  readonly username: string;
  readonly password: string;
}

export interface EnvironmentConfig {
  readonly name: EnvName;
  readonly baseUrl: string;
  readonly credentials: AppCredentials;
  readonly defaultTimeout: number;
  readonly actionTimeout: number;
  readonly navigationTimeout: number;
  readonly expectTimeout: number;
  readonly headless: boolean;
}

/** Read an env var, falling back to a default. Throws if required and missing. */
function env(key: string, fallback?: string, required = false): string {
  const value = process.env[key] ?? fallback;
  if (required && (value === undefined || value === '')) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value ?? '';
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

const ENV_DEFAULTS: Record<EnvName, string> = {
  dev: 'https://community.cloud.automationanywhere.digital',
  staging: 'https://staging.cloud.automationanywhere.digital',
  prod: 'https://community.cloud.automationanywhere.digital',
};

const activeEnv = (env('TEST_ENV', 'dev').toLowerCase() as EnvName) || 'dev';
const isHeadless = bool('HEADLESS', true);

/**
 * Resolved configuration for the currently selected environment.
 * Import this everywhere instead of touching process.env directly.
 */
export const environment: EnvironmentConfig = {
  name: activeEnv,
  baseUrl: env('BASE_URL', ENV_DEFAULTS[activeEnv] ?? ENV_DEFAULTS.dev),
  credentials: {
    username: env('AA_USERNAME', ''),
    password: env('AA_PASSWORD', ''),
  },
  defaultTimeout: num('DEFAULT_TIMEOUT', 30_000),
  actionTimeout: num('ACTION_TIMEOUT', 15_000),
  navigationTimeout: num('NAVIGATION_TIMEOUT', 45_000),
  expectTimeout: num('EXPECT_TIMEOUT', 10_000),
  headless: isHeadless,
};

export default environment;
