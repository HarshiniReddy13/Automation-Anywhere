import { defineConfig } from '@playwright/test';
import { ConfigManager } from './api-automation/utils/ConfigManager';

const config = ConfigManager.get();

export default defineConfig({
  testDir: './api-automation/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // ApiClient/RetryHelper already retry transient failures internally
  workers: process.env.CI ? 2 : undefined,

  timeout: 180_000,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-api' }],
    ['junit', { outputFile: 'test-results/api-junit.xml' }],

    ['./reporting/CustomHtmlReporter.ts'],
  ],

  use: {
    baseURL: config.baseUrl,
    extraHTTPHeaders: {
      Accept: 'application/json',
    },

    headless: config.headless,
    viewport: { width: 1600, height: 900 },
    ignoreHTTPSErrors: true,
    video: 'on',
  },

  outputDir: 'test-results-api/',
});
