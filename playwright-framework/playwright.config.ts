import { defineConfig, devices } from '@playwright/test';
import { environment } from './config/environment';

/**
 * Playwright Test configuration.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /*
   * Log in exactly once for the whole run and reuse that session (see
   * global-setup.ts) instead of each test performing its own UI login.
   * The target app rejects concurrent/rapid-succession logins for one
   * account (its auth JWT carries `multipleLogin: false`) — even serial,
   * back-to-back UI logins with no explicit logout between tests collided
   * with the previous session's ~20 min token still being technically
   * live. A single shared session removes that failure mode entirely.
   */
  globalSetup: './global-setup.ts',
  /*
   * Still force serial, single-worker execution regardless of CI: with a
   * shared session, two workers acting on the same authenticated context's
   * storage state concurrently would otherwise race on the live single
   * form/rules being built.
   */
  fullyParallel: false,
  workers: 1,
  /* Fail the build on CI if test.only is left in source. */
  forbidOnly: !!process.env.CI,
  /*
   * A single local retry is now safe: with global-setup's shared session,
   * a retry reuses the same already-authenticated storageState rather than
   * performing a fresh UI login, so it can no longer trigger the
   * concurrent/rapid-succession login collisions that were the original
   * reason retries were kept at 0 locally.
   */
  retries: process.env.CI ? 2 : 1,
  /*
   * Global test timeout. Set generously and independently of defaultTimeout:
   * login alone can legitimately take ~150s worst case (2 attempts x up to
   * 45s waiting for the auth response + 30s waiting for the form to close),
   * plus the rest of the E2E flow (drag-drop, save, three rules). A tighter
   * outer timeout would cut the test off before an inner step's own timeout
   * gets a chance to fail with a specific, diagnosable reason.
   */
  timeout: 5 * 60_000,

  /*
   * Reporters: list for console, Playwright's own HTML for humans, JUnit for
   * CI dashboards, and the custom self-contained reporter (reports/) that
   * embeds every screenshot/video/log directly in one portable HTML file.
   */
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['./reporting/CustomHtmlReporter.ts'],
  ],

  /* Shared settings for all projects. */
  use: {
    baseURL: environment.baseUrl,
    headless: environment.headless,
    actionTimeout: environment.actionTimeout,
    navigationTimeout: environment.navigationTimeout,
    /* Populated once by global-setup.ts; every test starts already logged in. */
    storageState: '.auth/storageState.json',
    /*
     * Trace stays failure-only (Playwright's own trace viewer, a separate
     * concern from the custom report). Video is recorded for every test —
     * the custom reporter embeds it as base64 — and Playwright's built-in
     * failure screenshot is kept as a fallback behind StepRecorder's own.
     */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
    viewport: { width: 1600, height: 900 },
    ignoreHTTPSErrors: true,
    testIdAttribute: 'data-testid',
  },

  expect: {
    timeout: environment.expectTimeout,
  },

  /* Cross-browser projects. */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  outputDir: 'test-results/',
});
