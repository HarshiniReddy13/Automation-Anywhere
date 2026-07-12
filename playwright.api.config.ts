import { defineConfig } from '@playwright/test';
import { ConfigManager } from './api-automation/utils/ConfigManager';

/**
 * Independent Playwright configuration for the Use Case 2 API automation
 * module. Deliberately separate from `playwright.config.ts` (the UI
 * suite's config): no `globalSetup` (this module authenticates via
 * `AuthenticationApi` itself, and — for the UI Verification Layer below —
 * logs into the UI directly inside its own test.step, not via a shared
 * session), no `storageState`, and no explicit browser `projects` (the
 * implicit default project uses Chromium).
 *
 * Everything this suite depends on lives under `api-automation/` — a
 * single dedicated folder, entirely separate from Use Case 1's
 * `form-automation/` folder — so the two use cases never share a
 * directory, not even incidentally.
 */
const config = ConfigManager.get();

export default defineConfig({
  testDir: './api-automation/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // ApiClient/RetryHelper already retry transient failures internally
  workers: process.env.CI ? 2 : undefined,
  /*
   * Bumped from the original 60s: the UI Verification Layer adds a real
   * browser login + module-iframe load on top of the API steps. Live
   * testing showed the Learning Instances module iframe alone can take
   * 30s+ to render on a slow run, on top of ~5-8s post-login bootstrap —
   * 60s left no margin once that step was added.
   */
  timeout: 180_000,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-api' }],
    ['junit', { outputFile: 'test-results/api-junit.xml' }],
    /*
     * Same custom reporter class Use Case 1 uses (see playwright.config.ts)
     * — added so both use cases feed the single, unified
     * "Automation Anywhere Assignment Report" HTML file. This is shared
     * reporting *infrastructure*, not shared business logic: no page
     * objects, API clients, or test logic are imported from Use Case 1.
     * See CustomHtmlReporter.ts for how two independent `npx playwright
     * test` runs (this config and playwright.config.ts) still end up
     * combined into one HTML file.
     */
    ['./reporting/CustomHtmlReporter.ts'],
  ],

  use: {
    baseURL: config.baseUrl,
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
    /*
     * Added for the UI Verification Layer: after creating a Learning
     * Instance via API, the test also drives a real browser to confirm
     * it's visible in the app's Learning Instances list. `headless` reads
     * the same HEADLESS env var Use Case 1 uses, via ConfigManager's own
     * independent reader (data reuse only, no code coupling).
     */
    headless: config.headless,
    viewport: { width: 1600, height: 900 },
    ignoreHTTPSErrors: true,
    /* So Use Case 2 also gets its own recording (see the "Screen Recording" section of its report). */
    video: 'on',
  },

  outputDir: 'test-results-api/',
});
