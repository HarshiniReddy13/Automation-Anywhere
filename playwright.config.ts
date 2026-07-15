import { defineConfig, devices } from '@playwright/test';
import { environment } from './form-automation/config/environment';


export default defineConfig({
  testDir: './form-automation/tests',

  globalSetup: './form-automation/global-setup.ts',
 
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 1,

  timeout: 5 * 60_000,


  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['./reporting/CustomHtmlReporter.ts'],
  ],

  use: {
    baseURL: environment.baseUrl,
    headless: environment.headless,
    actionTimeout: environment.actionTimeout,
    navigationTimeout: environment.navigationTimeout,

    storageState: '.auth/storageState.json',

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
