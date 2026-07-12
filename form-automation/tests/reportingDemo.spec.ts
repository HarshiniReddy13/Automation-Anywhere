import { test } from '../fixtures/baseFixture';

/**
 * Demonstrates the custom HTML reporting system end-to-end: step-level
 * detail (before/after screenshots, timing, status) comes entirely from
 * `*WithReport()` wrapper methods on the Page Objects — this spec contains
 * no reporting code of its own. Run it and open the generated file under
 * `reports/` to see the result.
 */
test.describe('Reporting System Demo', () => {
  test(
    'records step-level detail via BasePage wrapper methods',
    {
      annotation: {
        type: 'description',
        description:
          'Sample test proving the custom HTML reporter end-to-end: navigates to Automation via ' +
          '"goToAutomationWithReport()" and opens the Create menu via "assertCreateFormVisibleWithReport()", ' +
          'both wrapper methods that automatically record a before/after screenshot and timing for the report.',
      },
    },
    async ({ loginPage, homePage, automationPage }) => {
    // storageState carries the authenticated session, but Playwright still
    // starts on about:blank — open() navigates in, and since we're already
    // authenticated the app redirects straight past the login form.
    await loginPage.open();
    await homePage.assertLoaded();
    await homePage.goToAutomationWithReport();
    await automationPage.assertCreateFormVisibleWithReport();
  });
});
