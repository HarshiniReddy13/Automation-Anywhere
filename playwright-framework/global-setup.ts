import { chromium } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { environment } from './config/environment';

/** Kept in sync with `use.storageState` in playwright.config.ts. */
const STORAGE_STATE_PATH = '.auth/storageState.json';

/**
 * Runs once before the whole suite (regardless of worker count) and signs
 * in exactly one time, saving the authenticated session to disk. Every
 * project then starts each test already logged in via `use.storageState`.
 *
 * This exists because the target app rejects concurrent/rapid-succession
 * logins for one account (its auth JWT carries `multipleLogin: false`).
 * Performing a fresh UI login per test — even serially, with no explicit
 * logout in between — repeatedly collided with the previous test's still
 * technically-live session (~20 min token lifetime) and surfaced as
 * intermittent "nav link never appears" failures with no clear cause.
 * Logging in once for the entire run sidesteps that class of failure
 * entirely instead of retrying/timing-out around it.
 */
export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch({ headless: environment.headless });
  // This context is created manually (not via the test runner's fixtures),
  // so `use.baseURL` from playwright.config.ts isn't applied automatically
  // — LoginPage/BasePage navigate with relative paths, so it must be passed
  // explicitly here or those goto() calls resolve against nothing.
  const context = await browser.newContext({
    baseURL: environment.baseUrl,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);

  // loginPage.open() waits for the login form to actually render before
  // isLoginFormPresent() checks for it. A raw page.goto() doesn't wait for
  // the SPA to mount, so isLoginFormPresent() can run before the form
  // exists yet, wrongly concluding we're already authenticated and
  // skipping login() entirely.
  await loginPage.open();
  if (await loginPage.isLoginFormPresent()) {
    await loginPage.login();
  }
  try {
    await homePage.assertLoaded();
  } catch (e) {
    await page.screenshot({ path: 'test-results/global-setup-failure.png' });
    throw e;
  }

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
