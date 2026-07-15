import { test } from '../fixtures/baseFixture';


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
    await loginPage.open();
    await homePage.assertLoaded();
    await homePage.goToAutomationWithReport();
    await automationPage.assertCreateFormVisibleWithReport();
  });
});
