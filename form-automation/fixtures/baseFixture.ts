import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { AutomationPage } from '../pages/AutomationPage';
import { FormDesignerPage } from '../pages/FormDesignerPage';
import { RulesBuilderPage } from '../pages/RulesBuilderPage';
import { TEXTBOXES } from '../utils/testData';
import { StepRecorder } from '../../reporting/StepRecorder';

/**
 * Typed fixtures expose ready-to-use Page Objects to every test, so specs never
 * instantiate pages manually. This keeps tests declarative and DRY.
 */
export interface Pages {
  loginPage: LoginPage;
  homePage: HomePage;
  automationPage: AutomationPage;
  formDesignerPage: FormDesignerPage;
  rulesBuilderPage: RulesBuilderPage;
}

/** A logged-in session fixture for tests that don't need to test login itself. */
export interface AuthFixture {
  authenticatedHome: HomePage;
}

export interface ReportingFixtures {
  /**
   * Per-test step/log/screenshot recorder, wired into every Page Object
   * below so their `*WithReport()` wrapper methods (see BasePage) work with
   * zero reporting code in the test itself. Also auto-captures console
   * logs, page errors, network failures, dialogs, and XHR/fetch calls for
   * the whole test — none of that requires opting in either.
   */
  recorder: StepRecorder;
}

export const test = base.extend<Pages & AuthFixture & ReportingFixtures>({
  recorder: async ({ page }, use, testInfo) => {
    const recorder = new StepRecorder(page, testInfo);

    try {
      const version = page.context().browser()?.version();
      if (version) recorder.setBrowserVersion(version);
    } catch {
      /* browser() can be unavailable for some launch modes — non-fatal */
    }

    page.on('console', (msg) => {
      recorder.logConsole({ type: msg.type(), text: msg.text(), timestamp: Date.now() });
    });
    page.on('pageerror', (err) => {
      recorder.logPageError({ message: err.message, stack: err.stack, timestamp: Date.now() });
    });
    page.on('requestfailed', (req) => {
      recorder.logNetworkError({
        url: req.url(),
        method: req.method(),
        failure: req.failure()?.errorText ?? 'unknown',
        timestamp: Date.now(),
      });
    });
    page.on('dialog', async (dialog) => {
      recorder.logDialog({ type: dialog.type(), message: dialog.message(), timestamp: Date.now() });
      await dialog.dismiss().catch(() => undefined);
    });

    // API request/response logging, scoped to XHR/fetch so static assets
    // (scripts, styles, images) don't flood the report.
    const requestStartedAt = new Map<string, number>();
    page.on('request', (req) => {
      if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
        requestStartedAt.set(`${req.method()} ${req.url()}`, Date.now());
      }
    });
    page.on('response', (resp) => {
      void (async () => {
        const req = resp.request();
        if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') return;
        const key = `${req.method()} ${req.url()}`;
        const startedAt = requestStartedAt.get(key) ?? Date.now();
        requestStartedAt.delete(key);

        let requestBody: string | undefined;
        let responseBody: string | undefined;
        try {
          requestBody = req.postData() ?? undefined;
        } catch {
          /* body not always accessible (e.g. streamed) */
        }
        try {
          const contentType = resp.headers()['content-type'] ?? '';
          if (contentType.includes('json') || contentType.includes('text')) {
            responseBody = (await resp.text()).slice(0, 5000);
          }
        } catch {
          /* response may already be consumed/closed */
        }

        recorder.logApiCall({
          method: req.method(),
          url: req.url(),
          requestBody,
          responseBody,
          statusCode: resp.status(),
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          failed: resp.status() >= 400,
        });
      })();
    });

    await use(recorder);

    // A dedicated failure screenshot, on top of whatever the last recorded
    // step's own after-screenshot captured, for tests that fail outside any
    // *WithReport() step (e.g. a raw `expect()` in the test body).
    if (testInfo.status !== testInfo.expectedStatus) {
      try {
        const buffer = await page.screenshot({ type: 'png' });
        await testInfo.attach('shot__failure', { body: buffer, contentType: 'image/png' });
      } catch {
        /* page may already be closed/crashed */
      }
    }

    await recorder.finalize();
  },

  loginPage: async ({ page, recorder }, use) => {
    await use(new LoginPage(page, recorder));
  },
  homePage: async ({ page, recorder }, use) => {
    await use(new HomePage(page, recorder));
  },
  automationPage: async ({ page, recorder }, use) => {
    await use(new AutomationPage(page, recorder));
  },
  formDesignerPage: async ({ page, recorder }, use) => {
    await use(new FormDesignerPage(page, recorder));
  },
  rulesBuilderPage: async ({ page, recorder }, use) => {
    await use(new RulesBuilderPage(page, TEXTBOXES, recorder));
  },

  /**
   * Performs login once and yields a HomePage. Tests that only care about
   * post-login flows can depend on this instead of repeating login steps.
   */
  authenticatedHome: async ({ loginPage, homePage }, use) => {
    await loginPage.open();
    await loginPage.login();
    await homePage.assertLoaded();
    await use(homePage);
  },
});

export { expect } from '@playwright/test';
