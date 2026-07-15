import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { AutomationPage } from '../pages/AutomationPage';
import { FormDesignerPage } from '../pages/FormDesignerPage';
import { RulesBuilderPage } from '../pages/RulesBuilderPage';
import { TEXTBOXES } from '../utils/testData';
import { StepRecorder } from '../../reporting/StepRecorder';


export interface Pages {
  loginPage: LoginPage;
  homePage: HomePage;
  automationPage: AutomationPage;
  formDesignerPage: FormDesignerPage;
  rulesBuilderPage: RulesBuilderPage;
}

export interface AuthFixture {
  authenticatedHome: HomePage;
}

export interface ReportingFixtures {

  recorder: StepRecorder;
}

export const test = base.extend<Pages & AuthFixture & ReportingFixtures>({
  recorder: async ({ page }, use, testInfo) => {
    const recorder = new StepRecorder(page, testInfo);

    try {
      const version = page.context().browser()?.version();
      if (version) recorder.setBrowserVersion(version);
    } catch {
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
        }
        try {
          const contentType = resp.headers()['content-type'] ?? '';
          if (contentType.includes('json') || contentType.includes('text')) {
            responseBody = (await resp.text()).slice(0, 5000);
          }
        } catch {
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

    if (testInfo.status !== testInfo.expectedStatus) {
      try {
        const buffer = await page.screenshot({ type: 'png' });
        await testInfo.attach('shot__failure', { body: buffer, contentType: 'image/png' });
      } catch {
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

  authenticatedHome: async ({ loginPage, homePage }, use) => {
    await loginPage.open();
    await loginPage.login();
    await homePage.assertLoaded();
    await use(homePage);
  },
});

export { expect } from '@playwright/test';
