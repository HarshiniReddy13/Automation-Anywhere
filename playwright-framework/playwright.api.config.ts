import { defineConfig } from '@playwright/test';
import { ConfigManager } from './api-automation/utils/ConfigManager';

/**
 * Independent Playwright configuration for the Use Case 2 API automation
 * module. Deliberately separate from `playwright.config.ts` (the UI
 * suite's config): no `globalSetup` (that performs a UI browser login this
 * module doesn't need — it authenticates via `AuthenticationApi` itself),
 * no `storageState`, and no browser `projects` at all — every test here
 * uses Playwright's built-in `request` fixture (an `APIRequestContext`),
 * not a browser page.
 *
 * Everything this suite depends on lives under `api-automation/` — a
 * single dedicated folder, entirely separate from Use Case 1's `pages/`,
 * `fixtures/`, `config/`, and `utils/` — so the two use cases never share a
 * directory, not even incidentally.
 */
const config = ConfigManager.get();

export default defineConfig({
  testDir: './api-automation/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // ApiClient/RetryHelper already retry transient failures internally
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-api' }],
    ['junit', { outputFile: 'test-results/api-junit.xml' }],
  ],

  use: {
    baseURL: config.baseUrl,
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
  },

  outputDir: 'test-results-api/',
});
